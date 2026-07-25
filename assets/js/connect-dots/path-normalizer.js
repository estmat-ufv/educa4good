/* Educa4Good — Ligar os Pontos
   Normalização dos caminhos antes da amostragem.

   Regra inegociável: caminhos permanecem separados. Um `d` com vários
   subcaminhos (vários "M") vira vários caminhos independentes — o fim de um
   nunca é ligado ao início de outro. */

import { FLATTEN_TOLERANCE } from "./constants.js";
import {
  parsePath,
  transformCommands,
  serializeCommands,
  flattenCommands,
  cleanPolyline,
  toleranceFor
} from "./path-geometry.js";
import {
  boundsOfPoints,
  polygonCentroid,
  polylineLength,
  unionBounds,
  multiply,
  IDENTITY,
  distance
} from "./util/geometry.js";

let idCounter = 0;

export function nextPathId(prefix = "path") {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Reinicia o contador — usado apenas nos testes, para ids determinísticos. */
export function resetPathIds() {
  idCounter = 0;
}

/**
 * Um caminho da atividade.
 * @typedef {Object} ActivityPath
 * @property {string} id
 * @property {string} label rótulo mostrado na interface
 * @property {boolean} selected
 * @property {boolean} closed
 * @property {"forward"|"reverse"} direction
 * @property {number} order
 * @property {boolean} breakAfter
 * @property {string} svgPathData geometria exata, já com transforms aplicadas
 * @property {number} startOffset fração de 0 a 1 do comprimento total
 * @property {string} source "svg" | "raster" | "manual"
 * @property {{length:number,bounds:object,centroid:object,vertexCount:number}} metrics
 */

/**
 * Converte um descritor bruto em um ou mais caminhos normalizados.
 *
 * @param {{d: string, matrix?: object, source?: string, label?: string, closed?: boolean}} raw
 * @param {{minSegment?: number, minLength?: number, tolerance?: number}} [options]
 * @returns {ActivityPath[]}
 */
export function normalizePath(raw, options = {}) {
  const commands = parsePath(raw.d);
  if (!commands.length) return [];
  const matrix = raw.matrix || IDENTITY;
  const placed = transformCommands(commands, matrix);

  // A tolerância acompanha o tamanho da geometria já posicionada.
  const tolerance = options.tolerance ?? toleranceFor(placed);
  const minSegment = options.minSegment ?? tolerance / 4;
  const minLength = options.minLength ?? tolerance * 8;

  // 1. Separar subcaminhos preservando os comandos exatos de cada um.
  const groups = splitSubpaths(placed);
  const out = [];

  for (const group of groups) {
    const flat = flattenCommands(group.commands, tolerance);
    if (!flat.length) continue;
    const polyline = cleanPolyline(flat[0].points, group.closed, minSegment);
    if (polyline.length < 2) continue;

    const length = polylineLength(polyline, group.closed);
    if (length < minLength) continue;

    const bounds = boundsOfPoints(polyline);
    const centroid = group.closed
      ? polygonCentroid(polyline)
      : { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };

    out.push({
      id: nextPathId(raw.idPrefix || "path"),
      label: raw.label || "",
      selected: raw.selected !== false,
      closed: raw.closed !== undefined ? raw.closed : group.closed,
      direction: raw.direction || "forward",
      order: out.length,
      breakAfter: false,
      svgPathData: serializeCommands(group.commands),
      startOffset: 0,
      source: raw.source || "svg",
      metrics: {
        length,
        bounds,
        centroid,
        vertexCount: polyline.length
      }
    });
  }
  return out;
}

/** Normaliza uma lista e renumera a ordem de forma estável. */
export function normalizePaths(rawList, options = {}) {
  const out = [];
  for (const raw of rawList || []) {
    for (const path of normalizePath(raw, options)) out.push(path);
  }
  return out.map((path, index) => ({
    ...path,
    order: index,
    label: path.label || `Caminho ${index + 1}`
  }));
}

function splitSubpaths(commands) {
  const groups = [];
  let current = null;
  for (const cmd of commands) {
    if (cmd.type === "M") {
      current = { commands: [cmd], closed: false };
      groups.push(current);
    } else if (!current) {
      current = { commands: [{ type: "M", x: 0, y: 0 }, cmd], closed: false };
      groups.push(current);
    } else if (cmd.type === "Z") {
      current.closed = true;
      current.commands.push(cmd);
      current = null;
    } else {
      current.commands.push(cmd);
    }
  }
  return groups.filter((g) => g.commands.length > 1);
}

/** Caixa que envolve todos os caminhos selecionados (ou todos, se nenhum). */
export function pathsBounds(paths, onlySelected = true) {
  const list = onlySelected ? paths.filter((p) => p.selected) : paths;
  return unionBounds(list.map((p) => p.metrics.bounds));
}

/**
 * Matriz que encaixa a caixa `bounds` dentro de `box`, preservando a
 * proporção e centralizando. Devolve identidade quando não há o que encaixar.
 */
export function fitMatrix(bounds, box) {
  if (!bounds || bounds.w <= 0 || bounds.h <= 0) return IDENTITY;
  const scale = Math.min(box.w / bounds.w, box.h / bounds.h);
  const offsetX = box.x + (box.w - bounds.w * scale) / 2 - bounds.x * scale;
  const offsetY = box.y + (box.h - bounds.h * scale) / 2 - bounds.y * scale;
  return { a: scale, b: 0, c: 0, d: scale, e: offsetX, f: offsetY };
}

/** Aplica uma matriz a um caminho já normalizado, recalculando as métricas. */
export function transformPath(path, matrix, tolerance) {
  const commands = transformCommands(parsePath(path.svgPathData), matrix);
  const flat = flattenCommands(commands, tolerance ?? toleranceFor(commands));
  const polyline = flat.length ? flat[0].points : [];
  const bounds = boundsOfPoints(polyline) || { x: 0, y: 0, w: 0, h: 0 };
  return {
    ...path,
    svgPathData: serializeCommands(commands),
    metrics: {
      length: polylineLength(polyline, path.closed),
      bounds,
      centroid: path.closed
        ? polygonCentroid(polyline)
        : { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 },
      vertexCount: polyline.length
    }
  };
}

export function transformPaths(paths, matrix, tolerance) {
  return paths.map((p) => transformPath(p, matrix, tolerance));
}

export { multiply as composeMatrix, distance };
