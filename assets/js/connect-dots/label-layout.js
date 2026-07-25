/* Educa4Good — Ligar os Pontos
   Posicionamento dos números.

   Um número nunca é colocado "em cima da linha e pronto". Para cada ponto
   calculamos a tangente local, a normal, o lado externo em relação ao
   centroide do caminho, e testamos candidatos em ordem até achar um livre de
   colisões com outros rótulos, com os pontos, com o traçado e com os limites
   da folha. Se nenhum candidato serve, o ponto é devolvido marcado — quem
   decide o que fazer é o validador, não este módulo.

   Função pura: nada de DOM. */

import { rectsOverlap, overlapArea, distance } from "./util/geometry.js";

/** Largura aproximada de um número, em unidades da folha (mm). */
export function estimateLabelWidth(text, fontSize) {
  return String(text).length * fontSize * 0.6 + fontSize * 0.18;
}

function rectFor(cx, cy, text, fontSize) {
  const w = estimateLabelWidth(text, fontSize);
  const h = fontSize * 1.02;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function rotate(vector, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

/** Distância de um ponto ao segmento AB. */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + dx * t, y: a.y + dy * t });
}

const ANGLE_STEPS = [0, 0.42, -0.42, 0.85, -0.85, 1.3, -1.3, Math.PI];
const DISTANCE_STEPS = [1, 1.45, 1.95, 2.6];

/**
 * @param {object[]} points pontos já mapeados para a folha
 * @param {object[]} segments pares {from,to} de índices ligados
 * @param {Map<string,{x:number,y:number}>} centroids centroide por pathId
 * @param {object} options
 * @param {number} options.fontSize
 * @param {number} options.pointRadius
 * @param {{x:number,y:number,w:number,h:number}} options.area retângulo permitido
 * @param {number} [options.minGap] folga mínima entre rótulos
 * @returns {{labels: object[], collisions: number[], outside: number[], worstOverlap: number}}
 */
export function layoutLabels(points, segments, centroids, options) {
  const fontSize = options.fontSize;
  const pointRadius = options.pointRadius;
  const area = options.area;
  const minGap = options.minGap ?? fontSize * 0.12;
  const baseDistance = pointRadius + fontSize * 0.72 + fontSize * 0.16;

  const placed = [];
  const labels = [];
  const collisions = [];
  const outside = [];
  let worstOverlap = 0;

  const neighbourSegments = new Map();
  for (const segment of segments || []) {
    if (!neighbourSegments.has(segment.from)) neighbourSegments.set(segment.from, []);
    if (!neighbourSegments.has(segment.to)) neighbourSegments.set(segment.to, []);
    neighbourSegments.get(segment.from).push(segment);
    neighbourSegments.get(segment.to).push(segment);
  }

  points.forEach((point, index) => {
    const text = String(point.number);

    // 1. Posição manual tem prioridade absoluta e não é reavaliada.
    if (point.labelOffset) {
      const cx = point.x + point.labelOffset.dx;
      const cy = point.y + point.labelOffset.dy;
      const rect = rectFor(cx, cy, text, fontSize);
      const isOutside = !containedIn(rect, area);
      if (isOutside) outside.push(index);
      labels.push({ index, x: cx, y: cy, rect, manual: true, collision: false });
      placed.push(rect);
      return;
    }

    // 2. Normal local; lado externo definido pelo centroide do caminho.
    const tangent = point.tangent || { x: 1, y: 0 };
    let normal = { x: -tangent.y, y: tangent.x };
    const centroid = centroids.get(point.pathId);
    if (centroid) {
      const away = { x: point.x - centroid.x, y: point.y - centroid.y };
      if (normal.x * away.x + normal.y * away.y < 0) {
        normal = { x: -normal.x, y: -normal.y };
      }
    }

    let best = null;
    for (const factor of DISTANCE_STEPS) {
      for (const angle of ANGLE_STEPS) {
        const direction = rotate(normal, angle);
        const offset = baseDistance * factor;
        const cx = point.x + direction.x * offset;
        const cy = point.y + direction.y * offset;
        const rect = rectFor(cx, cy, text, fontSize);

        if (!containedIn(rect, area)) continue;

        const score = collisionScore(rect, cx, cy, {
          placed,
          points,
          index,
          pointRadius,
          minGap,
          segments: neighbourSegments,
          fontSize
        });

        if (score === 0) {
          best = { cx, cy, rect, score: 0 };
          break;
        }
        if (!best || score < best.score) best = { cx, cy, rect, score };
      }
      if (best && best.score === 0) break;
    }

    if (!best) {
      // Nenhum candidato caiu dentro da área: fica junto ao ponto e é
      // reportado como fora dos limites.
      const cx = point.x + normal.x * baseDistance;
      const cy = point.y + normal.y * baseDistance;
      const rect = rectFor(cx, cy, text, fontSize);
      outside.push(index);
      labels.push({ index, x: cx, y: cy, rect, manual: false, collision: true });
      placed.push(rect);
      return;
    }

    if (best.score > 0) {
      collisions.push(index);
      worstOverlap = Math.max(worstOverlap, best.score);
    }
    labels.push({
      index,
      x: best.cx,
      y: best.cy,
      rect: best.rect,
      manual: false,
      collision: best.score > 0
    });
    placed.push(best.rect);
  });

  return { labels, collisions, outside, worstOverlap };
}

function containedIn(rect, area) {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rect.x + rect.w <= area.x + area.w &&
    rect.y + rect.h <= area.y + area.h
  );
}

function collisionScore(rect, cx, cy, context) {
  const { placed, points, index, pointRadius, minGap, segments, fontSize } = context;
  let score = 0;

  // Colisão com rótulos já posicionados.
  for (const other of placed) {
    if (rectsOverlap(rect, other, minGap)) {
      score += overlapArea(rect, other) + minGap * minGap;
    }
  }

  // Colisão com qualquer ponto (o próprio inclusive não deve ser coberto).
  const reach = Math.hypot(rect.w, rect.h) / 2 + pointRadius + minGap;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (Math.abs(p.x - cx) > reach || Math.abs(p.y - cy) > reach) continue;
    const disc = {
      x: p.x - pointRadius - minGap,
      y: p.y - pointRadius - minGap,
      w: (pointRadius + minGap) * 2,
      h: (pointRadius + minGap) * 2
    };
    if (rectsOverlap(rect, disc)) score += overlapArea(rect, disc) + 1;
  }

  // Colisão com os dois segmentos que chegam ao ponto: evita número sobre a linha.
  const touching = segments.get(index) || [];
  for (const segment of touching) {
    const a = points[segment.from];
    const b = points[segment.to];
    if (!a || !b) continue;
    const gap = distanceToSegment({ x: cx, y: cy }, a, b);
    const needed = Math.min(rect.w, rect.h) / 2 + minGap;
    if (gap < needed) score += (needed - gap) * fontSize;
  }

  return score;
}

/**
 * Converte os rótulos calculados de volta em deslocamentos relativos ao ponto,
 * que é o formato guardado no estado (`point.labelOffset`).
 */
export function labelsToOffsets(points, labels) {
  return labels.map((label, i) => ({
    dx: label.x - points[i].x,
    dy: label.y - points[i].y
  }));
}
