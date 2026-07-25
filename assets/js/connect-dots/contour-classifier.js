/* Educa4Good — Ligar os Pontos
   Classificação dos contornos candidatos.

   O gerador antigo pegava o contorno de MAIOR ÁREA e seguia adiante. Era a
   causa principal dos resultados errados: moldura de digitalização, sombra de
   fundo e mancha grande venciam a figura.

   Aqui cada candidato recebe uma pontuação a partir de vários sinais
   independentes — área, perímetro, posição, contato com a borda, proporção,
   buracos, preenchimento e complexidade — e ganha marcações legíveis. A
   pontuação apenas ORDENA e DESTACA o mais provável; quem confirma é o
   usuário.

   Função pura: nada de OpenCV, nada de DOM. */

/** Marcações possíveis, com o texto mostrado na interface. */
export const FLAGS = {
  frame: { code: "frame", severity: "error", label: "Coincide com a borda da imagem (é a moldura)" },
  wholeImage: { code: "whole-image", severity: "warning", label: "Ocupa quase toda a imagem" },
  touchesBorder: { code: "touches-border", severity: "warning", label: "Encosta na borda da imagem" },
  tiny: { code: "tiny", severity: "warning", label: "Área muito pequena" },
  short: { code: "short", severity: "warning", label: "Perímetro curto demais" },
  noisy: { code: "noisy", severity: "warning", label: "Contorno muito irregular (possível ruído)" },
  sliver: { code: "sliver", severity: "warning", label: "Formato muito alongado" },
  manyHoles: { code: "many-holes", severity: "warning", label: "Muitos buracos internos" },
  hollow: { code: "hollow", severity: "info", label: "Pouco preenchido em relação à caixa" },
  inside: { code: "inside", severity: "info", label: "Detalhe interno de outro contorno" },
  doubleEdge: {
    code: "double-edge",
    severity: "warning",
    label: "Borda interna do mesmo traço — escolher junto com a externa duplica os pontos"
  }
};

function bump(value, peak, spread) {
  if (!(value > 0) || !(peak > 0)) return 0;
  const ratio = Math.log(value / peak) / spread;
  return Math.exp(-0.5 * ratio * ratio);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * @typedef {Object} ContourDescriptor
 * @property {{x:number,y:number}[]} points
 * @property {number} area área do contorno em px²
 * @property {number} perimeter
 * @property {{x:number,y:number,w:number,h:number}} bounds
 * @property {number} holes quantidade de filhos na hierarquia
 * @property {number} borderContact fração de pontos encostados na borda (0..1)
 * @property {number} [parent] índice do contorno pai, -1 se externo
 */

/**
 * @param {ContourDescriptor[]} descriptors
 * @param {{w: number, h: number}} image
 * @param {{minAreaRatio?: number}} [options]
 * @returns {object[]} candidatos ordenados por pontuação decrescente
 */
export function classifyContours(descriptors, image, options = {}) {
  const imageArea = Math.max(1, image.w * image.h);
  const imagePerimeter = 2 * (image.w + image.h);
  const diagonal = Math.hypot(image.w, image.h) || 1;
  const center = { x: image.w / 2, y: image.h / 2 };
  const minAreaRatio = options.minAreaRatio ?? 0.002;

  const scored = descriptors.map((d, index) => {
    const areaRatio = d.area / imageArea;
    const bboxArea = Math.max(1e-6, d.bounds.w * d.bounds.h);
    const bboxRatio = bboxArea / imageArea;
    const fill = clamp01(d.area / bboxArea);
    const aspect = d.bounds.h > 0 ? d.bounds.w / d.bounds.h : 0;
    const slimness = Math.min(aspect, aspect > 0 ? 1 / aspect : 0);
    const complexity = d.area > 0 ? (d.perimeter * d.perimeter) / (4 * Math.PI * d.area) : Infinity;
    const contourCenter = { x: d.bounds.x + d.bounds.w / 2, y: d.bounds.y + d.bounds.h / 2 };
    const offCenter = Math.hypot(contourCenter.x - center.x, contourCenter.y - center.y) / (diagonal / 2);
    const perimeterRatio = d.perimeter / imagePerimeter;
    const borderContact = clamp01(d.borderContact || 0);

    const flags = [];

    // --- Moldura: caixa cobre quase toda a imagem E o traço vive na borda.
    const frameLike = bboxRatio > 0.9 && borderContact > 0.35;
    if (frameLike) flags.push(FLAGS.frame);
    else if (bboxRatio > 0.94) flags.push(FLAGS.wholeImage);
    if (!frameLike && borderContact > 0.12) flags.push(FLAGS.touchesBorder);

    if (areaRatio < minAreaRatio) flags.push(FLAGS.tiny);
    if (perimeterRatio < 0.08) flags.push(FLAGS.short);
    if (complexity > 28) flags.push(FLAGS.noisy);
    if (slimness < 0.08) flags.push(FLAGS.sliver);
    if (d.holes > 12) flags.push(FLAGS.manyHoles);
    if (fill < 0.18) flags.push(FLAGS.hollow);
    if ((d.parent ?? -1) >= 0) flags.push(FLAGS.inside);

    // Num desenho de contorno, o findContours devolve a borda EXTERNA e a
    // INTERNA do mesmo traço. A interna é filha da externa e tem quase a mesma
    // área. Escolher as duas cria pares de pontos colados na folha inteira.
    const parentDescriptor = (d.parent ?? -1) >= 0 ? descriptors[d.parent] : null;
    const doubleEdge =
      parentDescriptor && parentDescriptor.area > 0 && d.area / parentDescriptor.area > 0.7;
    if (doubleEdge) flags.push(FLAGS.doubleEdge);

    // --- Sinais normalizados (0..1).
    const signals = {
      // Figura típica ocupa entre 5% e 60% do quadro; o pico fica em 25%.
      area: bump(areaRatio, 0.25, 1.05),
      // Perímetro relevante em relação ao quadro.
      perimeter: clamp01(perimeterRatio / 0.55),
      // Figura desenhada tende a ficar centralizada.
      centrality: clamp01(1 - offCenter),
      // Longe da borda é melhor.
      borderDistance: 1 - borderContact,
      // Nem fio de cabelo, nem faixa.
      proportion: clamp01(slimness / 0.45),
      // Silhueta cheia é mais confiável que casca fina.
      fill: clamp01(fill / 0.7),
      // Complexidade moderada: nem círculo puro, nem serrilha de ruído.
      smoothness: bump(complexity, 2.2, 1.15),
      // Um ou dois buracos (olhos, janelas) são normais.
      holes: d.holes <= 3 ? 1 : clamp01(1 - (d.holes - 3) / 15)
    };

    const weights = {
      area: 0.2,
      perimeter: 0.18,
      centrality: 0.12,
      borderDistance: 0.18,
      proportion: 0.1,
      fill: 0.08,
      smoothness: 0.09,
      holes: 0.05
    };

    let score = 0;
    for (const key of Object.keys(weights)) score += weights[key] * signals[key];

    // Penalidades multiplicativas: uma moldura nunca deve liderar a lista.
    if (frameLike) score *= 0.05;
    if (areaRatio < minAreaRatio) score *= 0.25;
    if (complexity > 28) score *= 0.5;
    if (slimness < 0.08) score *= 0.6;
    if ((d.parent ?? -1) >= 0) score *= 0.75;
    if (doubleEdge) score *= 0.4;

    return {
      index,
      doubleEdge: Boolean(doubleEdge),
      points: d.points,
      area: d.area,
      perimeter: d.perimeter,
      bounds: d.bounds,
      holes: d.holes,
      parent: d.parent ?? -1,
      closed: d.closed !== false,
      metrics: {
        areaRatio,
        bboxRatio,
        fill,
        aspect,
        slimness,
        complexity,
        offCenter,
        perimeterRatio,
        borderContact
      },
      signals,
      flags,
      frameLike,
      nearFrame: !frameLike && borderContact > 0.12,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((candidate, rank) => ({
    ...candidate,
    rank,
    likely: rank === 0 && candidate.score > 0.32 && !candidate.frameLike
  }));
}

/**
 * Resumo honesto do que a classificação conseguiu concluir. Serve para a
 * interface dizer se pode destacar uma sugestão ou se deve pedir o modo manual.
 */
export function summarizeCandidates(candidates) {
  if (!candidates.length) {
    return {
      confident: false,
      message:
        "Nenhum contorno utilizável foi encontrado. Ajuste o limiar, tente outra " +
        "imagem ou use o traçado manual."
    };
  }
  const best = candidates[0];
  const second = candidates[1];
  const margin = second ? best.score - second.score : best.score;

  if (best.frameLike) {
    return {
      confident: false,
      message:
        "O contorno mais forte é a moldura da imagem, não a figura. Recorte a " +
        "imagem, ajuste o limiar ou use o traçado manual."
    };
  }
  if (!best.likely) {
    return {
      confident: false,
      message:
        "Nenhum candidato ficou claramente melhor. Confira a lista e selecione " +
        "você mesmo, ou use o traçado manual."
    };
  }
  if (margin < 0.05 && second) {
    return {
      confident: false,
      message:
        "Dois candidatos ficaram praticamente empatados. Compare os dois antes de seguir."
    };
  }
  return {
    confident: true,
    message: `Sugestão: candidato ${best.rank + 1}. Confirme antes de continuar.`
  };
}
