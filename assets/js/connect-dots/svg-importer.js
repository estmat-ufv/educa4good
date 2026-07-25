/* Educa4Good — Ligar os Pontos
   Modo 1: SVG exato.

   Converte os elementos geométricos do SVG já sanitizado em descritores de
   caminho com as transformações acumuladas aplicadas. A conversão de formas
   em `d` é pura (testável no Node); a travessia da árvore precisa do DOM. */

import { IDENTITY, multiply, parseTransform } from "./util/geometry.js";
import { normalizePaths } from "./path-normalizer.js";
import { DEFAULT_SETTINGS } from "./constants.js";

const UNIT_TO_PX = {
  "": 1, px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96,
  q: 96 / 101.6
};

/** Lê um comprimento SVG. Porcentagens devolvem null (dependem do viewport). */
export function parseLength(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = /^(-?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([a-z%]*)$/i.exec(text);
  if (!match) return null;
  const number = parseFloat(match[1]);
  if (!Number.isFinite(number)) return null;
  const unit = match[2].toLowerCase();
  if (unit === "%") return null;
  const factor = UNIT_TO_PX[unit];
  return factor === undefined ? null : number * factor;
}

function numbers(text) {
  return String(text || "")
    .match(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite) || [];
}

function num(attrs, name, fallback = 0) {
  const value = parseFloat(attrs[name]);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Converte uma forma primitiva em dados de caminho.
 * Função pura: recebe `{type, attrs}` e devolve `{d, closed}` ou null.
 *
 * @param {{type: string, attrs: Record<string,string>}} shape
 */
export function shapeToPathData(shape) {
  const { type } = shape;
  const attrs = shape.attrs || {};

  if (type === "path") {
    const d = String(attrs.d || "").trim();
    if (!d) return null;
    return { d, closed: /z\s*$/i.test(d) };
  }

  if (type === "circle") {
    const r = num(attrs, "r");
    if (!(r > 0)) return null;
    const cx = num(attrs, "cx");
    const cy = num(attrs, "cy");
    return { d: ellipsePath(cx, cy, r, r), closed: true };
  }

  if (type === "ellipse") {
    const rx = num(attrs, "rx", num(attrs, "ry"));
    const ry = num(attrs, "ry", num(attrs, "rx"));
    if (!(rx > 0) || !(ry > 0)) return null;
    return { d: ellipsePath(num(attrs, "cx"), num(attrs, "cy"), rx, ry), closed: true };
  }

  if (type === "rect") {
    const w = num(attrs, "width");
    const h = num(attrs, "height");
    if (!(w > 0) || !(h > 0)) return null;
    const x = num(attrs, "x");
    const y = num(attrs, "y");
    let rx = attrs.rx !== undefined ? num(attrs, "rx") : num(attrs, "ry");
    let ry = attrs.ry !== undefined ? num(attrs, "ry") : num(attrs, "rx");
    rx = Math.min(Math.max(rx, 0), w / 2);
    ry = Math.min(Math.max(ry, 0), h / 2);
    return { d: rectPath(x, y, w, h, rx, ry), closed: true };
  }

  if (type === "line") {
    const x1 = num(attrs, "x1");
    const y1 = num(attrs, "y1");
    const x2 = num(attrs, "x2");
    const y2 = num(attrs, "y2");
    if (x1 === x2 && y1 === y2) return null;
    return { d: `M${x1} ${y1} L${x2} ${y2}`, closed: false };
  }

  if (type === "polygon" || type === "polyline") {
    const coords = numbers(attrs.points);
    if (coords.length < 4) return null;
    const parts = [`M${coords[0]} ${coords[1]}`];
    for (let i = 2; i + 1 < coords.length; i += 2) parts.push(`L${coords[i]} ${coords[i + 1]}`);
    const closed = type === "polygon";
    if (closed) parts.push("Z");
    return { d: parts.join(" "), closed };
  }

  return null;
}

function ellipsePath(cx, cy, rx, ry) {
  return (
    `M${cx - rx} ${cy} ` +
    `A${rx} ${ry} 0 0 1 ${cx} ${cy - ry} ` +
    `A${rx} ${ry} 0 0 1 ${cx + rx} ${cy} ` +
    `A${rx} ${ry} 0 0 1 ${cx} ${cy + ry} ` +
    `A${rx} ${ry} 0 0 1 ${cx - rx} ${cy} Z`
  );
}

function rectPath(x, y, w, h, rx, ry) {
  if (rx <= 0 || ry <= 0) {
    return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
  }
  return (
    `M${x + rx} ${y} L${x + w - rx} ${y} ` +
    `A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} ` +
    `L${x + w} ${y + h - ry} ` +
    `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} ` +
    `L${x + rx} ${y + h} ` +
    `A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} ` +
    `L${x} ${y + ry} ` +
    `A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`
  );
}

const GEOMETRY_TAGS = new Set(["path", "circle", "ellipse", "rect", "line", "polygon", "polyline"]);

function attributesOf(element) {
  const out = {};
  for (const attr of Array.from(element.attributes || [])) {
    out[attr.name.replace(/^.*:/, "")] = attr.value;
  }
  return out;
}

function isHidden(attrs) {
  if ((attrs.display || "").trim() === "none") return true;
  if ((attrs.visibility || "").trim() === "hidden") return true;
  const style = String(attrs.style || "");
  return /display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style);
}

/**
 * Coleta descritores brutos, na ordem do documento, com a matriz acumulada.
 * @param {SVGSVGElement} root SVG já sanitizado
 */
export function collectShapes(root) {
  const shapes = [];
  const hiddenCount = { value: 0 };

  const walk = (node, matrix) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const tag = (child.localName || "").toLowerCase();
      const attrs = attributesOf(child);
      const local = multiply(matrix, parseTransform(attrs.transform));

      if (tag === "g") {
        if (isHidden(attrs)) {
          hiddenCount.value += 1;
          continue;
        }
        walk(child, local);
        continue;
      }
      if (!GEOMETRY_TAGS.has(tag)) continue;
      if (isHidden(attrs)) {
        hiddenCount.value += 1;
        continue;
      }
      const converted = shapeToPathData({ type: tag, attrs });
      if (!converted) continue;
      shapes.push({
        d: converted.d,
        closed: converted.closed,
        matrix: local,
        tag,
        label: attrs.id ? `${tag} #${attrs.id}` : tag
      });
    }
  };

  walk(root, IDENTITY);
  return { shapes, hiddenCount: hiddenCount.value };
}

/** Retângulo do viewBox, ou null. */
export function readViewBox(root) {
  const coords = numbers(root.getAttribute("viewBox"));
  if (coords.length < 4 || !(coords[2] > 0) || !(coords[3] > 0)) return null;
  return { x: coords[0], y: coords[1], w: coords[2], h: coords[3] };
}

/**
 * Importa a geometria de um SVG sanitizado.
 *
 * @param {SVGSVGElement} root
 * @param {{pointBudget?: number}} [options] total de pontos previsto, usado
 *   para decidir quantos caminhos vêm marcados por padrão
 * @returns {{paths: import("./path-normalizer.js").ActivityPath[], viewBox: object,
 *   hiddenCount: number, backgrounds: number, deselected: number}}
 */
export function importSvg(root, options = {}) {
  const pointBudget = options.pointBudget || DEFAULT_SETTINGS.pointCount;
  const { shapes, hiddenCount } = collectShapes(root);
  const viewBox =
    readViewBox(root) || {
      x: 0,
      y: 0,
      w: parseLength(root.getAttribute("width")) || 0,
      h: parseLength(root.getAttribute("height")) || 0
    };

  const imported = normalizePaths(
    shapes.map((shape, index) => ({
      d: shape.d,
      matrix: shape.matrix,
      closed: shape.closed,
      source: "svg",
      label: `${index + 1}. ${shape.label}`,
      idPrefix: "svg"
    }))
  );

  const marked = markBackgrounds(imported, viewBox);
  const paths = applyDefaultSelection(marked, pointBudget);
  return {
    paths,
    viewBox,
    hiddenCount,
    backgrounds: paths.filter((p) => p.nearFrame).length,
    deselected: paths.filter((p) => !p.selected && !p.nearFrame).length
  };
}

/** Pontos mínimos para uma forma ainda ser reconhecível na folha. */
const MIN_POINTS_PER_PATH = 8;

/**
 * Seleção inicial de caminhos.
 *
 * Ilustrações reais chegam com dezenas de formas: contorno, manchas, olhos,
 * detalhes. Marcar todas por padrão reparte o orçamento de pontos entre elas e
 * o resultado é uma folha com três pontos por forma — espaçamento visualmente
 * irregular, detalhes decorativos consumindo pontos que faltam ao contorno, e
 * formas sobrando sem ponto nenhum.
 *
 * Então vêm marcados apenas os maiores caminhos que cabem no orçamento. Isto
 * NÃO é uma escolha silenciosa: a lista mostra todos, com o tamanho de cada um,
 * e a interface diz quantos deixou de fora. É um padrão, não uma decisão.
 */
export function applyDefaultSelection(paths, pointBudget = DEFAULT_SETTINGS.pointCount) {
  const candidates = paths.filter((p) => p.selected !== false && !p.nearFrame);
  if (candidates.length <= 1) return paths;

  const maxPaths = Math.max(1, Math.floor(pointBudget / MIN_POINTS_PER_PATH));
  if (candidates.length <= maxPaths) return paths;

  const longest = Math.max(...candidates.map((p) => p.metrics.length));
  const keep = new Set(
    candidates
      .filter((p) => p.metrics.length >= longest * 0.1)
      .sort((a, b) => b.metrics.length - a.metrics.length)
      .slice(0, maxPaths)
      .map((p) => p.id)
  );

  return paths.map((path) =>
    path.nearFrame || keep.has(path.id) ? path : { ...path, selected: false }
  );
}

/**
 * Um retângulo simples que cobre o viewBox inteiro é fundo de arquivo, não
 * figura — e era exatamente o tipo de forma que o gerador antigo escolhia por
 * ser "a maior". Aqui ele é marcado e vem DESMARCADO; se o usuário insistir em
 * usá-lo, o validador emite alerta.
 */
export function markBackgrounds(paths, viewBox) {
  const viewArea = (viewBox?.w || 0) * (viewBox?.h || 0);
  if (!(viewArea > 0)) return paths;

  return paths.map((path) => {
    const b = path.metrics.bounds;
    const coverage = (b.w * b.h) / viewArea;
    const simple = path.metrics.vertexCount <= 8;
    if (coverage >= 0.92 && simple && path.closed) {
      return {
        ...path,
        selected: false,
        nearFrame: true,
        label: `${path.label} — fundo do arquivo`
      };
    }
    return path;
  });
}
