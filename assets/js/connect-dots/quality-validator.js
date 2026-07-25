/* Educa4Good — Ligar os Pontos
   Validação obrigatória antes de exportar.

   Erro crítico bloqueia a exportação. Aviso exige confirmação explícita do
   usuário. Nenhum resultado duvidoso sai daqui em silêncio.

   Função pura: recebe o plano da folha já calculado e devolve o laudo. */

import { LIMITS } from "./constants.js";
import { distance, overlapArea } from "./util/geometry.js";

const MESSAGES = {
  crowded:
    "Esta figura não comporta a quantidade solicitada com boa legibilidade. " +
    "Reduza o número de pontos ou diminua o tamanho dos rótulos.",
  unreliable:
    "Não foi possível confirmar um caminho confiável. Selecione outro contorno " +
    "ou utilize o modo manual."
};

function issue(code, message, detail) {
  return detail === undefined ? { code, message } : { code, message, detail };
}

/** Luminância relativa (WCAG) de uma cor #rgb/#rrggbb; null se não reconhecer. */
export function relativeLuminance(color) {
  const text = String(color || "").trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  let rgb;
  if (short) rgb = [short[1], short[2], short[3]].map((h) => parseInt(h + h, 16));
  else if (long) rgb = [long[1], long[2], long[3]].map((h) => parseInt(h, 16));
  else return null;

  const channels = rgb.map((value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * @param {object} plan
 * @param {object} plan.state estado central
 * @param {object[]} plan.points pontos em coordenadas da folha (mm)
 * @param {object[]} plan.segments
 * @param {object[]} plan.paths caminhos em coordenadas da folha
 * @param {object} plan.labelLayout resultado de layoutLabels()
 * @param {{x,y,w,h}} plan.area área útil de desenho
 * @param {{w,h}} plan.page folha
 * @param {number} plan.scale escala aplicada da origem para a folha
 * @returns {{valid: boolean, errors: object[], warnings: object[]}}
 */
export function validateWorksheet(plan) {
  const errors = [];
  const warnings = [];
  const { state, points, segments, paths, labelLayout, area, page, scale } = plan;
  const settings = state.settings;

  // ---------------------------------------------------------------- fonte
  if (!state.source.type) {
    errors.push(issue("no-source", "Nenhuma imagem foi carregada."));
    return { valid: false, errors, warnings };
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    errors.push(issue("invalid-scale", "A escala calculada é inválida. Reinicie a atividade."));
  }

  // -------------------------------------------------------------- caminhos
  const selected = paths.filter((p) => p.selected);
  if (!selected.length) {
    errors.push(issue("no-path", "Selecione ao menos um caminho para gerar a atividade."));
  }

  const orders = selected.map((p) => p.order);
  if (new Set(orders).size !== orders.length) {
    errors.push(issue("inconsistent-order", "Há caminhos com a mesma posição na ordem. Reordene a lista."));
  }

  const minPathLength = Math.max(12, settings.pointRadius * 12);
  for (const path of selected) {
    if (!path.metrics || !(path.metrics.length > 0) || path.metrics.vertexCount < 2) {
      errors.push(issue("empty-path", `O caminho "${path.label}" está vazio.`, path.id));
      continue;
    }
    if (path.metrics.length < minPathLength) {
      errors.push(
        issue(
          "path-too-short",
          `O caminho "${path.label}" é curto demais para virar atividade (${path.metrics.length.toFixed(1)} mm).`,
          path.id
        )
      );
    }
    const b = path.metrics.bounds;
    const tolerance = 0.5;
    if (
      b.x < area.x - tolerance ||
      b.y < area.y - tolerance ||
      b.x + b.w > area.x + area.w + tolerance ||
      b.y + b.h > area.y + area.h + tolerance
    ) {
      errors.push(
        issue("path-outside", `O caminho "${path.label}" sai da área útil da folha.`, path.id)
      );
    }
    // Fragmentação: muitos vértices para pouquíssimo comprimento indica
    // contorno de ruído, não desenho.
    const densidade = path.metrics.vertexCount / Math.max(path.metrics.length, 1e-6);
    if (path.metrics.vertexCount > 40 && densidade > 12) {
      warnings.push(
        issue(
          "fragmented",
          `O caminho "${path.label}" parece muito fragmentado (possível ruído). ${MESSAGES.unreliable}`,
          path.id
        )
      );
    }
  }

  // ---------------------------------------------------- contorno de moldura
  for (const path of selected) {
    if (path.frameLike) {
      errors.push(
        issue(
          "frame-contour",
          `O caminho "${path.label}" coincide com a borda da imagem: é a moldura, não a figura. ${MESSAGES.unreliable}`,
          path.id
        )
      );
    } else if (path.nearFrame) {
      warnings.push(
        issue(
          "near-frame",
          `O caminho "${path.label}" encosta na borda da imagem e pode ser uma moldura.`,
          path.id
        )
      );
    }
  }

  // ---------------------------------------------------------------- pontos
  if (points.length < LIMITS.minPointCount) {
    errors.push(
      issue(
        "too-few-points",
        `A atividade tem apenas ${points.length} ponto(s). O mínimo é ${LIMITS.minPointCount}.`
      )
    );
  }

  const outsidePoints = points.filter(
    (p) =>
      p.x < area.x - 0.5 ||
      p.y < area.y - 0.5 ||
      p.x > area.x + area.w + 0.5 ||
      p.y > area.y + area.h + 0.5
  );
  if (outsidePoints.length) {
    errors.push(
      issue("point-outside", `${outsidePoints.length} ponto(s) estão fora da área útil da folha.`)
    );
  }

  // Distância mínima: abaixo disso a criança não distingue os pontos.
  const minDistance = Math.max(settings.pointRadius * 2.8, 2.2);
  let tooClose = 0;
  let closest = Infinity;
  const lengths = [];
  /** Comprimentos agrupados por caminho: caminhos têm escalas diferentes. */
  const lengthsByPath = new Map();
  for (const segment of segments) {
    const a = points[segment.from];
    const b = points[segment.to];
    if (!a || !b) continue;
    const d = distance(a, b);
    lengths.push(d);
    if (!lengthsByPath.has(a.pathId)) lengthsByPath.set(a.pathId, []);
    lengthsByPath.get(a.pathId).push(d);
    if (d < minDistance) {
      tooClose += 1;
      closest = Math.min(closest, d);
    }
  }
  if (tooClose > 0) {
    const share = tooClose / Math.max(lengths.length, 1);
    const text =
      `${tooClose} par(es) de pontos consecutivos estão a menos de ` +
      `${minDistance.toFixed(1)} mm (menor: ${closest.toFixed(1)} mm).`;
    if (share > 0.15) {
      errors.push(issue("points-too-close", `${text} ${MESSAGES.crowded}`));
    } else {
      warnings.push(issue("points-too-close", text));
    }
  }

  // Pontos quase coincidentes entre caminhos DIFERENTES.
  // Sem esta checagem, escolher a borda externa e a interna do mesmo traço
  // produz pares de pontos colados espalhados pela folha — uma atividade
  // impossível de resolver que passava como válida, porque nenhum segmento
  // liga esses pares.
  const overlapping = countOverlappingPoints(points, minDistance);
  if (overlapping.pairs > 0) {
    const text =
      `${overlapping.pairs} par(es) de pontos de caminhos diferentes estão ` +
      `praticamente no mesmo lugar (menor distância: ${overlapping.closest.toFixed(1)} mm). ` +
      "Isso costuma acontecer quando a borda externa e a borda interna do mesmo " +
      "traço são escolhidas juntas: mantenha apenas uma delas.";
    if (overlapping.pairs >= points.length * 0.1) {
      errors.push(issue("points-overlapping", text));
    } else {
      warnings.push(issue("points-overlapping", text));
    }
  }

  // Saltos: um segmento muito maior que a mediana DO PRÓPRIO CAMINHO costuma
  // indicar que o traçado pulou de uma parte da figura para outra. A mediana
  // global daria falso positivo sempre que a folha tem um caminho grande e
  // outros pequenos.
  let jumps = 0;
  for (const list of lengthsByPath.values()) {
    if (list.length <= 4) continue;
    const sorted = list.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 1e-6;
    jumps += list.filter((d) => d > median * 5).length;
  }
  if (jumps > 0) {
    warnings.push(
      issue(
        "long-jump",
        `${jumps} ligação(ões) são muito mais longas que as vizinhas do mesmo caminho: ` +
          "confira se a ordem dos pontos faz sentido."
      )
    );
  }

  // ------------------------------------------- conexões indevidas (defensivo)
  const crossing = segments.filter((segment) => {
    const a = points[segment.from];
    const b = points[segment.to];
    return a && b && a.pathId !== b.pathId;
  });
  if (crossing.length) {
    errors.push(
      issue(
        "cross-path-segment",
        `${crossing.length} ligação(ões) unem caminhos diferentes. Caminhos separados nunca devem ser ligados.`
      )
    );
  }

  // --------------------------------------------------------------- rótulos
  if (labelLayout) {
    if (labelLayout.outside.length) {
      errors.push(
        issue(
          "label-outside",
          `${labelLayout.outside.length} número(s) não cabem na folha. ${MESSAGES.crowded}`
        )
      );
    }
    const labelArea = Math.max(
      settings.labelFontSize * settings.labelFontSize * 0.62,
      1e-6
    );
    let severe = 0;
    const rects = labelLayout.labels.map((l) => l.rect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (overlapArea(rects[i], rects[j]) > labelArea * 0.25) severe += 1;
      }
    }
    if (severe > 0) {
      errors.push(
        issue(
          "label-overlap",
          `${severe} par(es) de números se sobrepõem de forma grave. ${MESSAGES.crowded}`
        )
      );
    } else if (labelLayout.collisions.length) {
      warnings.push(
        issue(
          "label-tight",
          `${labelLayout.collisions.length} número(s) ficaram apertados. Confira a prévia antes de imprimir.`
        )
      );
    }
  }

  // ------------------------------- avisos vindos da própria amostragem
  const sampling = plan.warnings || [];
  if (sampling.length) {
    const starved = sampling.filter((text) => text.includes("ficou sem pontos")).length;
    if (starved > 0) {
      const message =
        `${starved} caminho(s) selecionado(s) ficaram sem nenhum ponto: ` +
        `${points.length} pontos não bastam para ${selected.length} caminhos. ` +
        "Aumente o total de pontos ou desmarque os caminhos menores.";
      // Metade ou mais dos caminhos vazios é resultado sem sentido pedagógico.
      if (starved >= selected.length / 2) errors.push(issue("starved-paths", message));
      else warnings.push(issue("starved-paths", message));
    }
    for (const text of sampling.filter((t) => !t.includes("ficou sem pontos"))) {
      warnings.push(issue("sampling", text));
    }
  }

  // ------------------------------------- legibilidade na impressão em cinza
  for (const [key, name] of [["pointColor", "dos pontos"], ["labelColor", "dos números"]]) {
    const luminance = relativeLuminance(settings[key]);
    if (luminance !== null && luminance > 0.62) {
      warnings.push(
        issue(
          "low-contrast",
          `A cor ${name} é clara demais e pode desaparecer na impressão em preto e branco.`,
          key
        )
      );
    }
  }

  // ------------------------------------------------- confirmação do contorno
  if (state.mode === "raster" && !state.raster.selectedCandidates.length && !selected.length) {
    errors.push(issue("no-contour-confirmed", MESSAGES.unreliable));
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Conta pares de pontos de caminhos diferentes mais próximos que `minDistance`.
 * Usa uma grade espacial para não custar O(n²) com muitos pontos.
 */
function countOverlappingPoints(points, minDistance) {
  const cell = Math.max(minDistance, 1e-6);
  const grid = new Map();
  let pairs = 0;
  let closest = Infinity;

  for (const point of points) {
    const cx = Math.floor(point.x / cell);
    const cy = Math.floor(point.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${cx + dx}:${cy + dy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other.pathId === point.pathId) continue;
          const d = distance(point, other);
          if (d < minDistance) {
            pairs += 1;
            closest = Math.min(closest, d);
          }
        }
      }
    }
    const key = `${cx}:${cy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(point);
  }
  return { pairs, closest: Number.isFinite(closest) ? closest : 0 };
}

export { MESSAGES as VALIDATION_MESSAGES };
