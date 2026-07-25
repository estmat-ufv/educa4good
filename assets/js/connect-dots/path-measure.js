/* Educa4Good — Ligar os Pontos
   Medição de caminhos.

   No navegador usamos obrigatoriamente as APIs nativas do SVG
   (`getTotalLength()` e `getPointAtLength()`), como exige a especificação da
   atividade. Fora do navegador — nos testes em Node — o mesmo contrato é
   atendido por um medidor de polilinha construído a partir do achatamento
   puro em `path-geometry.js`.

   Os dois medidores expõem exatamente a mesma interface:
     { kind, getTotalLength(), getPointAtLength(l), getTangentAtLength(l) } */

import { SVG_NS } from "./constants.js";
import { parsePath, flattenCommands, toleranceFor } from "./path-geometry.js";
import { distance } from "./util/geometry.js";

let scratchSvg = null;

function hasSvgSupport() {
  return (
    typeof document !== "undefined" &&
    typeof document.createElementNS === "function" &&
    typeof SVGPathElement !== "undefined" &&
    typeof SVGPathElement.prototype.getPointAtLength === "function"
  );
}

/**
 * As medidas nativas só são confiáveis quando o elemento pertence ao
 * documento; por isso mantemos um SVG oculto, fora do fluxo e fora da
 * árvore de acessibilidade.
 */
function getScratchSvg() {
  if (scratchSvg && scratchSvg.isConnected) return scratchSvg;
  scratchSvg = document.createElementNS(SVG_NS, "svg");
  scratchSvg.setAttribute("aria-hidden", "true");
  scratchSvg.setAttribute("focusable", "false");
  scratchSvg.setAttribute("width", "0");
  scratchSvg.setAttribute("height", "0");
  scratchSvg.style.cssText =
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden";
  document.body.appendChild(scratchSvg);
  return scratchSvg;
}

function createNativeMeasurer(pathData) {
  const svg = getScratchSvg();
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathData);
  svg.appendChild(path);

  let total = 0;
  try {
    total = path.getTotalLength();
  } catch {
    total = 0;
  }
  if (!Number.isFinite(total) || total <= 0) {
    svg.removeChild(path);
    return null;
  }

  const epsilon = Math.min(0.25, Math.max(total / 5000, 1e-4));

  return {
    kind: "native",
    getTotalLength: () => total,
    getPointAtLength(length) {
      const clamped = Math.min(total, Math.max(0, length));
      const p = path.getPointAtLength(clamped);
      return { x: p.x, y: p.y };
    },
    getTangentAtLength(length) {
      const a = this.getPointAtLength(Math.max(0, length - epsilon));
      const b = this.getPointAtLength(Math.min(total, length + epsilon));
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    },
    dispose() {
      if (path.parentNode) path.parentNode.removeChild(path);
    }
  };
}

/** Medidor sobre uma polilinha já pronta. Também é a base do modo manual. */
export function createPolylineMeasurer(points, closed) {
  const pts = closed && points.length > 1 ? points.concat([points[0]]) : points.slice();
  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += distance(pts[i - 1], pts[i]);
    cumulative.push(total);
  }

  function locate(length) {
    const target = Math.min(total, Math.max(0, length));
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high - 1) {
      const mid = (low + high) >> 1;
      if (cumulative[mid] <= target) low = mid;
      else high = mid;
    }
    const segLength = cumulative[high] - cumulative[low];
    const t = segLength > 0 ? (target - cumulative[low]) / segLength : 0;
    return { low, high, t };
  }

  return {
    kind: "polyline",
    getTotalLength: () => total,
    getPointAtLength(length) {
      if (!pts.length) return { x: 0, y: 0 };
      if (pts.length === 1 || total === 0) return { x: pts[0].x, y: pts[0].y };
      const { low, high, t } = locate(length);
      const a = pts[low];
      const b = pts[high];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    },
    getTangentAtLength(length) {
      if (pts.length < 2 || total === 0) return { x: 1, y: 0 };
      const { low, high } = locate(length);
      const a = pts[low];
      const b = pts[high];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    },
    dispose() {}
  };
}

/**
 * Cria o medidor adequado ao ambiente.
 * @param {string} pathData atributo `d`
 * @param {{closed?: boolean, forcePolyline?: boolean}} [options]
 */
export function createMeasurer(pathData, options = {}) {
  if (!options.forcePolyline && hasSvgSupport()) {
    const native = createNativeMeasurer(pathData);
    if (native) return native;
  }
  const commands = parsePath(pathData);
  // Tolerância proporcional: o medidor de reserva precisa ser preciso tanto
  // num viewBox de 1 unidade quanto num de milhares.
  const subpaths = flattenCommands(commands, options.tolerance ?? toleranceFor(commands, 0.00008));
  if (!subpaths.length) return createPolylineMeasurer([], false);
  // Um descritor de caminho da atividade sempre tem um único subcaminho;
  // se vier mais de um, medimos o mais longo e sinalizamos pela fonte.
  let chosen = subpaths[0];
  if (subpaths.length > 1) {
    let best = -1;
    for (const sub of subpaths) {
      let len = 0;
      for (let i = 1; i < sub.points.length; i++) len += distance(sub.points[i - 1], sub.points[i]);
      if (len > best) {
        best = len;
        chosen = sub;
      }
    }
  }
  const closed = options.closed !== undefined ? options.closed : chosen.closed;
  return createPolylineMeasurer(chosen.points, closed);
}
