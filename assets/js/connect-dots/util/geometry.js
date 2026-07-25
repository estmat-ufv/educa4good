/* Educa4Good — Ligar os Pontos
   Geometria elementar. Funções puras, sem DOM, cobertas por testes. */

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Matriz afim no formato SVG: [a c e; b d f; 0 0 1]. */
export const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiply(m1, m2) {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f
  };
}

export function applyMatrix(m, x, y) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/**
 * Lê um atributo `transform` do SVG. Aceita a lista completa de primitivas
 * (matrix, translate, scale, rotate, skewX, skewY) encadeadas.
 */
export function parseTransform(text) {
  let matrix = IDENTITY;
  if (!text) return matrix;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let found;
  while ((found = re.exec(text)) !== null) {
    const name = found[1];
    const args = found[2]
      .split(/[\s,]+/)
      .map((v) => parseFloat(v))
      .filter((v) => Number.isFinite(v));
    matrix = multiply(matrix, primitiveToMatrix(name, args));
  }
  return matrix;
}

function primitiveToMatrix(name, args) {
  switch (name) {
    case "matrix":
      if (args.length < 6) return IDENTITY;
      return { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
    case "translate":
      return { a: 1, b: 0, c: 0, d: 1, e: args[0] || 0, f: args.length > 1 ? args[1] : 0 };
    case "scale": {
      const sx = args.length ? args[0] : 1;
      const sy = args.length > 1 ? args[1] : sx;
      return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
    }
    case "rotate": {
      const rad = ((args[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotation = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      if (args.length < 3) return rotation;
      const cx = args[1];
      const cy = args[2];
      return multiply(
        multiply({ a: 1, b: 0, c: 0, d: 1, e: cx, f: cy }, rotation),
        { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy }
      );
    }
    case "skewX":
      return { a: 1, b: 0, c: Math.tan(((args[0] || 0) * Math.PI) / 180), d: 1, e: 0, f: 0 };
    case "skewY":
      return { a: 1, b: Math.tan(((args[0] || 0) * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
    default:
      return IDENTITY;
  }
}

export function boundsOfPoints(points) {
  if (!points || !points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function unionBounds(list) {
  const valid = (list || []).filter(Boolean);
  if (!valid.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of valid) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Área com sinal: positiva no sentido horário em coordenadas de tela (y para baixo). */
export function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(points) {
  return Math.abs(signedArea(points));
}

export function polygonCentroid(points) {
  const area = signedArea(points);
  if (Math.abs(area) < 1e-9) {
    const b = boundsOfPoints(points);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function polylineLength(points, closed) {
  let total = 0;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    total += distance(points[i], points[(i + 1) % points.length]);
  }
  return total;
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function rectsOverlap(a, b, padding = 0) {
  return !(
    a.x + a.w + padding <= b.x ||
    b.x + b.w + padding <= a.x ||
    a.y + a.h + padding <= b.y ||
    b.y + b.h + padding <= a.y
  );
}

/** Área da interseção entre dois retângulos; 0 quando não se tocam. */
export function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
