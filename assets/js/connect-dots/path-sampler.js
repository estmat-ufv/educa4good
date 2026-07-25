/* Educa4Good — Ligar os Pontos
   Amostragem dos pontos ao longo do comprimento real do caminho.

   Os pontos NUNCA saem dos nós originais do SVG: eles são obtidos por
   comprimento de arco através do medidor (nativo no navegador). */

import { LIMITS } from "./constants.js";
import { createMeasurer } from "./path-measure.js";

/**
 * Posições de amostragem, em comprimento de arco, para um único caminho.
 *
 * @param {object} measurer medidor com getTotalLength/getPointAtLength
 * @param {object} options
 * @param {number} options.count quantidade de pontos
 * @param {boolean} options.closed
 * @param {"forward"|"reverse"} [options.direction]
 * @param {number} [options.startOffset] fração 0..1 do comprimento
 * @param {"uniform"|"adaptive"} [options.mode]
 * @returns {number[]} comprimentos crescentes no espaço do medidor
 */
export function samplePositions(measurer, options) {
  const total = measurer.getTotalLength();
  const count = Math.max(1, Math.floor(options.count));
  if (total <= 0 || count < 1) return [];

  const base =
    options.mode === "adaptive"
      ? adaptivePositions(measurer, total, count, options.closed)
      : uniformPositions(total, count, options.closed);

  const reverse = options.direction === "reverse";
  const offset = options.closed ? (options.startOffset || 0) * total : 0;

  return base.map((length) => {
    let value = reverse ? total - length : length;
    value += reverse ? -offset : offset;
    if (options.closed) {
      value = ((value % total) + total) % total;
    } else {
      value = Math.min(total, Math.max(0, value));
    }
    return value;
  });
}

function uniformPositions(total, count, closed) {
  const out = [];
  if (closed) {
    // Caminho fechado: o primeiro ponto não é duplicado no fim.
    const step = total / count;
    for (let i = 0; i < count; i++) out.push(i * step);
    return out;
  }
  if (count === 1) return [0];
  const step = total / (count - 1);
  for (let i = 0; i < count; i++) out.push(Math.min(total, i * step));
  return out;
}

/** Peso máximo de um trecho curvo em relação a um trecho reto. */
const ADAPTIVE_STRENGTH = 3;

/**
 * Referência de curvatura adimensional. Para uma circunferência,
 * curvatura × comprimento total = (1/R) × 2πR = 2π, independentemente do
 * tamanho — é o que torna a medida invariante à escala.
 */
const ADAPTIVE_REFERENCE = 2 * Math.PI;

/**
 * Amostragem adaptativa: mais pontos onde a curvatura é alta, menos nos
 * trechos quase retos, mantendo exatamente a quantidade pedida.
 *
 * O sinal usado é a curvatura local (radianos por unidade de comprimento),
 * normalizada pelo comprimento total. Medir apenas o ângulo entre tangentes
 * vizinhas não serve: numa curva suave amostrada de perto o ângulo tende a
 * zero, e a adaptação simplesmente não acontecia.
 */
function adaptivePositions(measurer, total, count, closed) {
  const samples = Math.max(240, count * 12);
  const step = total / samples;
  const density = new Array(samples + 1).fill(1);

  for (let i = 0; i <= samples; i++) {
    const at = i * step;
    const before = Math.max(0, at - step);
    const after = Math.min(total, at + step);
    const span = after - before;
    if (span <= 0) continue;
    const prev = measurer.getTangentAtLength(before);
    const next = measurer.getTangentAtLength(after);
    const dot = Math.min(1, Math.max(-1, prev.x * next.x + prev.y * next.y));
    const turn = Math.acos(dot); // 0 em reta, π em inversão
    const curvature = turn / span; // ≈ 1/R
    const normalized = Math.min(1, (curvature * total) / ADAPTIVE_REFERENCE);
    density[i] = 1 + ADAPTIVE_STRENGTH * normalized;
  }

  // Suavização leve para não criar aglomerados em ruído pontual.
  const smoothed = density.map((_, i) => {
    const a = density[Math.max(0, i - 1)];
    const b = density[i];
    const c = density[Math.min(samples, i + 1)];
    return (a + 2 * b + c) / 4;
  });

  const cumulative = [0];
  for (let i = 1; i <= samples; i++) {
    cumulative.push(cumulative[i - 1] + ((smoothed[i - 1] + smoothed[i]) / 2) * step);
  }
  const weighted = cumulative[samples];
  if (!(weighted > 0)) return uniformPositions(total, count, closed);

  const targets = uniformPositions(weighted, count, closed);
  return targets.map((target) => invertCumulative(cumulative, target, step, total));
}

function invertCumulative(cumulative, target, step, total) {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] <= target) low = mid;
    else high = mid;
  }
  const span = cumulative[high] - cumulative[low];
  const t = span > 0 ? (target - cumulative[low]) / span : 0;
  return Math.min(total, (low + t) * step);
}

/**
 * Reparte `total` pontos entre os caminhos, proporcionalmente ao comprimento,
 * respeitando um mínimo por caminho. A soma devolvida é exatamente `total`
 * quando isso é possível.
 */
export function allocatePointCounts(paths, total, minPerPath = 3) {
  if (!paths.length) return [];
  const floor = Math.max(2, minPerPath);
  if (total < floor * paths.length) {
    // Não cabe o mínimo em todos: distribui o que dá, do maior para o menor.
    const counts = new Array(paths.length).fill(0);
    const order = paths
      .map((p, i) => i)
      .sort((a, b) => paths[b].metrics.length - paths[a].metrics.length);
    let left = total;
    for (const index of order) {
      const take = Math.min(floor, left);
      counts[index] = take;
      left -= take;
      if (left <= 0) break;
    }
    return counts;
  }

  const lengths = paths.map((p) => Math.max(p.metrics.length, 1e-6));
  const sum = lengths.reduce((a, b) => a + b, 0);
  const counts = lengths.map((len) => Math.max(floor, Math.round((total * len) / sum)));

  let used = counts.reduce((a, b) => a + b, 0);
  const byLength = paths.map((_, i) => i).sort((a, b) => lengths[b] - lengths[a]);
  let guard = 0;
  while (used !== total && guard < 10000) {
    if (used < total) {
      for (const i of byLength) {
        if (used === total) break;
        counts[i] += 1;
        used += 1;
      }
    } else {
      for (const i of byLength.slice().reverse()) {
        if (used === total) break;
        if (counts[i] > floor) {
          counts[i] -= 1;
          used -= 1;
        }
      }
      // Todos no mínimo e ainda sobra: interrompe para não travar.
      if (counts.every((c) => c <= floor)) break;
    }
    guard += 1;
  }
  return counts;
}

/**
 * Gera a sequência completa de pontos da atividade.
 *
 * @param {import("./path-normalizer.js").ActivityPath[]} paths já ordenados
 * @param {object} settings
 * @param {{pathSamples?: Record<string, number[]>}} [overrides]
 *   `pathSamples[pathId]` é uma lista de frações (0..1) do comprimento do
 *   caminho. Quando existe, ela substitui a amostragem automática — é assim
 *   que a exclusão e a inserção manual de pontos ficam registradas.
 * @returns {{points: object[], segments: object[], warnings: string[]}}
 */
export function samplePaths(paths, settings, overrides = {}) {
  const selected = paths
    .filter((p) => p.selected)
    .slice()
    .sort((a, b) => a.order - b.order);

  if (!selected.length) return { points: [], segments: [], warnings: [] };

  const totalRequested = Math.min(
    LIMITS.maxPointCount,
    Math.max(LIMITS.minPointCount, Math.floor(settings.pointCount))
  );
  const manual = overrides.pathSamples || {};
  // Caminhos com lista manual não entram no rateio automático.
  const automatic = selected.filter((path) => !Array.isArray(manual[path.id]));
  const automaticTotal = Math.max(
    0,
    totalRequested -
      selected.reduce(
        (sum, path) => sum + (Array.isArray(manual[path.id]) ? manual[path.id].length : 0),
        0
      )
  );
  const automaticCounts = allocatePointCounts(automatic, automaticTotal);
  const counts = new Map();
  automatic.forEach((path, index) => counts.set(path.id, automaticCounts[index]));

  const warnings = [];
  const points = [];
  const segments = [];
  const startNumber = Number.isFinite(settings.startNumber) ? settings.startNumber : 1;
  let running = startNumber;

  selected.forEach((path, pathIndex) => {
    const manualFractions = Array.isArray(manual[path.id]) ? manual[path.id] : null;
    const count = manualFractions ? manualFractions.length : counts.get(path.id) || 0;
    if (!count) {
      warnings.push(`O caminho "${path.label}" ficou sem pontos: aumente o total.`);
      return;
    }
    const measurer = createMeasurer(path.svgPathData, { closed: path.closed });
    const positions = manualFractions
      ? manualFractions.map((fraction) =>
          Math.min(measurer.getTotalLength(), Math.max(0, fraction * measurer.getTotalLength()))
        )
      : samplePositions(measurer, {
          count,
          closed: path.closed,
          direction: path.direction,
          startOffset: path.startOffset,
          mode: settings.samplingMode
        });

    const first = points.length;
    const total = measurer.getTotalLength() || 1;
    positions.forEach((length, i) => {
      const p = measurer.getPointAtLength(length);
      const tangent = measurer.getTangentAtLength(length);
      points.push({
        id: `${path.id}:${i}`,
        pathId: path.id,
        pathIndex,
        indexInPath: i,
        index: points.length,
        number: settings.numbering === "perPath" ? startNumber + i : running + i,
        x: p.x,
        y: p.y,
        tangent: path.direction === "reverse" ? { x: -tangent.x, y: -tangent.y } : tangent,
        arcLength: length,
        // Fração usada pelas edições manuais de ponto (excluir/inserir).
        arcFraction: length / total,
        manual: Boolean(manualFractions),
        labelOffset: null
      });
    });
    if (settings.numbering !== "perPath") running += count;
    if (measurer.dispose) measurer.dispose();

    // Segmentos-guia: só dentro do mesmo caminho. Nunca entre caminhos.
    const last = points.length - 1;
    for (let i = first; i < last; i++) {
      segments.push({ from: i, to: i + 1, pathId: path.id });
    }
    if (path.closed && points.length - first > 2) {
      segments.push({ from: last, to: first, pathId: path.id, closing: true });
    }
  });

  return { points, segments, warnings };
}

/**
 * Lista das interrupções resultantes: pares de números consecutivos que NÃO
 * são ligados porque pertencem a caminhos diferentes.
 */
export function describeBreaks(points) {
  const breaks = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].pathId !== points[i - 1].pathId) {
      breaks.push({ from: points[i - 1].number, to: points[i].number });
    }
  }
  return breaks;
}
