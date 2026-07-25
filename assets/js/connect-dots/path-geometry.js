/* Educa4Good — Ligar os Pontos
   Leitura, transformação e achatamento de dados de caminho SVG.

   Tudo aqui é JavaScript puro: nenhum acesso ao DOM. É o que permite testar a
   geometria no Node e é a base do medidor de reserva usado quando as APIs
   nativas do SVG não estão disponíveis. */

import { FLATTEN_TOLERANCE } from "./constants.js";
import { applyMatrix, distance } from "./util/geometry.js";

const NUMBER_RE = /-?\d*\.?\d+(?:[eE][+-]?\d+)?/g;
const COMMAND_RE = /[MmZzLlHhVvCcSsQqTtAa]/;

const ARGS_PER_COMMAND = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0
};

/**
 * Converte um atributo `d` em comandos absolutos normalizados.
 * A saída contém apenas M, L, C e Z — arcos e curvas quadráticas são
 * convertidos em cúbicas para que qualquer transformação afim possa ser
 * aplicada exatamente aos pontos de controle.
 */
export function parsePath(d) {
  const tokens = tokenize(String(d || ""));
  const out = [];
  let current = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let lastControl = null;
  let lastQuadControl = null;
  let previousType = "";

  for (const token of tokens) {
    const type = token.command.toUpperCase();
    const relative = token.command !== type;
    const args = token.args;
    const step = ARGS_PER_COMMAND[type];

    if (type === "Z") {
      out.push({ type: "Z" });
      current = { x: start.x, y: start.y };
      lastControl = null;
      lastQuadControl = null;
      previousType = "Z";
      continue;
    }
    if (!step || args.length < step) continue;

    for (let i = 0; i + step <= args.length; i += step) {
      const a = args.slice(i, i + step);
      // Coordenadas repetidas depois de um M implícito viram L (regra do SVG).
      const effective = type === "M" && i > 0 ? "L" : type;

      switch (effective) {
        case "M": {
          const p = absolutePoint(a[0], a[1], current, relative);
          out.push({ type: "M", x: p.x, y: p.y });
          current = p;
          start = { x: p.x, y: p.y };
          lastControl = null;
          lastQuadControl = null;
          break;
        }
        case "L": {
          const p = absolutePoint(a[0], a[1], current, relative);
          out.push({ type: "L", x: p.x, y: p.y });
          current = p;
          lastControl = null;
          lastQuadControl = null;
          break;
        }
        case "H": {
          const x = relative ? current.x + a[0] : a[0];
          out.push({ type: "L", x, y: current.y });
          current = { x, y: current.y };
          lastControl = null;
          lastQuadControl = null;
          break;
        }
        case "V": {
          const y = relative ? current.y + a[0] : a[0];
          out.push({ type: "L", x: current.x, y });
          current = { x: current.x, y };
          lastControl = null;
          lastQuadControl = null;
          break;
        }
        case "C": {
          const c1 = absolutePoint(a[0], a[1], current, relative);
          const c2 = absolutePoint(a[2], a[3], current, relative);
          const p = absolutePoint(a[4], a[5], current, relative);
          out.push({ type: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y });
          current = p;
          lastControl = c2;
          lastQuadControl = null;
          break;
        }
        case "S": {
          const reflected = reflect(current, lastControl, previousType, ["C", "S"]);
          const c2 = absolutePoint(a[0], a[1], current, relative);
          const p = absolutePoint(a[2], a[3], current, relative);
          out.push({ type: "C", x1: reflected.x, y1: reflected.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y });
          current = p;
          lastControl = c2;
          lastQuadControl = null;
          break;
        }
        case "Q": {
          const q = absolutePoint(a[0], a[1], current, relative);
          const p = absolutePoint(a[2], a[3], current, relative);
          out.push(quadToCubic(current, q, p));
          current = p;
          lastQuadControl = q;
          lastControl = null;
          break;
        }
        case "T": {
          const q = reflect(current, lastQuadControl, previousType, ["Q", "T"]);
          const p = absolutePoint(a[0], a[1], current, relative);
          out.push(quadToCubic(current, q, p));
          current = p;
          lastQuadControl = q;
          lastControl = null;
          break;
        }
        case "A": {
          const p = absolutePoint(a[5], a[6], current, relative);
          const curves = arcToCubic(current, p, a[0], a[1], a[2], a[3], a[4]);
          for (const c of curves) out.push(c);
          current = p;
          lastControl = null;
          lastQuadControl = null;
          break;
        }
        default:
          break;
      }
      previousType = effective;
    }
    previousType = type === "M" ? "L" : type;
  }
  return out;
}

function tokenize(d) {
  const tokens = [];
  let i = 0;
  while (i < d.length) {
    const ch = d[i];
    if (!COMMAND_RE.test(ch)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < d.length && !COMMAND_RE.test(d[j])) j++;
    const body = d.slice(i + 1, j);
    tokens.push({ command: ch, args: readNumbers(ch, body) });
    i = j;
  }
  return tokens;
}

/**
 * O comando A usa flags de um dígito que podem vir coladas ("1050 0 1 ...").
 * Por isso ele tem um leitor próprio; os demais aceitam a varredura simples.
 */
function readNumbers(command, body) {
  if (command !== "a" && command !== "A") {
    return (body.match(NUMBER_RE) || []).map(Number);
  }
  const args = [];
  let i = 0;
  const isDigit = (c) => c >= "0" && c <= "9";
  while (i < body.length) {
    const c = body[i];
    if (c === " " || c === "," || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    const slot = args.length % 7;
    if (slot === 3 || slot === 4) {
      if (!isDigit(c)) {
        i++;
        continue;
      }
      args.push(Number(c));
      i++;
      continue;
    }
    NUMBER_RE.lastIndex = i;
    const match = NUMBER_RE.exec(body);
    if (!match || match.index !== i) {
      i++;
      continue;
    }
    args.push(Number(match[0]));
    i = match.index + match[0].length;
  }
  NUMBER_RE.lastIndex = 0;
  return args;
}

function absolutePoint(x, y, current, relative) {
  return relative ? { x: current.x + x, y: current.y + y } : { x, y };
}

function reflect(current, control, previousType, allowed) {
  if (!control || !allowed.includes(previousType)) {
    return { x: current.x, y: current.y };
  }
  return { x: 2 * current.x - control.x, y: 2 * current.y - control.y };
}

function quadToCubic(p0, q, p) {
  return {
    type: "C",
    x1: p0.x + (2 / 3) * (q.x - p0.x),
    y1: p0.y + (2 / 3) * (q.y - p0.y),
    x2: p.x + (2 / 3) * (q.x - p.x),
    y2: p.y + (2 / 3) * (q.y - p.y),
    x: p.x,
    y: p.y
  };
}

/** Conversão elíptica → cúbicas (parametrização por centro, spec SVG F.6.5). */
export function arcToCubic(p0, p1, rxIn, ryIn, angleDeg, largeArc, sweep) {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    return [{ type: "C", x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, x: p1.x, y: p1.y }];
  }
  const phi = ((angleDeg || 0) * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const sign = largeArc !== sweep ? 1 : -1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const factor = sign * Math.sqrt(Math.max(0, numerator) / (denominator || 1e-12));
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;

  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angleBetween(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / segments;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const out = [];
  let theta = theta1;
  let start = { x: p0.x, y: p0.y };

  for (let i = 0; i < segments; i++) {
    const next = theta + step;
    const end = ellipsePoint(cx, cy, rx, ry, cosPhi, sinPhi, next);
    const d1 = ellipseDerivative(rx, ry, cosPhi, sinPhi, theta);
    const d2 = ellipseDerivative(rx, ry, cosPhi, sinPhi, next);
    out.push({
      type: "C",
      x1: start.x + alpha * d1.x,
      y1: start.y + alpha * d1.y,
      x2: end.x - alpha * d2.x,
      y2: end.y - alpha * d2.y,
      x: end.x,
      y: end.y
    });
    theta = next;
    start = end;
  }
  if (out.length) {
    out[out.length - 1].x = p1.x;
    out[out.length - 1].y = p1.y;
  }
  return out;
}

function ellipsePoint(cx, cy, rx, ry, cosPhi, sinPhi, theta) {
  const x = rx * Math.cos(theta);
  const y = ry * Math.sin(theta);
  return { x: cosPhi * x - sinPhi * y + cx, y: sinPhi * x + cosPhi * y + cy };
}

function ellipseDerivative(rx, ry, cosPhi, sinPhi, theta) {
  const dx = -rx * Math.sin(theta);
  const dy = ry * Math.cos(theta);
  return { x: cosPhi * dx - sinPhi * dy, y: sinPhi * dx + cosPhi * dy };
}

function angleBetween(ux, uy, vx, vy) {
  const dot = ux * vx + uy * vy;
  const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)) || 1e-12;
  let angle = Math.acos(Math.min(1, Math.max(-1, dot / len)));
  if (ux * vy - uy * vx < 0) angle = -angle;
  return angle;
}

/** Aplica uma matriz afim a comandos já normalizados. Exato para M/L/C. */
export function transformCommands(commands, matrix) {
  return commands.map((cmd) => {
    if (cmd.type === "Z") return { type: "Z" };
    if (cmd.type === "C") {
      const c1 = applyMatrix(matrix, cmd.x1, cmd.y1);
      const c2 = applyMatrix(matrix, cmd.x2, cmd.y2);
      const p = applyMatrix(matrix, cmd.x, cmd.y);
      return { type: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y };
    }
    const p = applyMatrix(matrix, cmd.x, cmd.y);
    return { type: cmd.type, x: p.x, y: p.y };
  });
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function serializeCommands(commands, digits = 3) {
  const parts = [];
  for (const cmd of commands) {
    if (cmd.type === "Z") {
      parts.push("Z");
    } else if (cmd.type === "C") {
      parts.push(
        `C${round(cmd.x1, digits)} ${round(cmd.y1, digits)} ${round(cmd.x2, digits)} ` +
          `${round(cmd.y2, digits)} ${round(cmd.x, digits)} ${round(cmd.y, digits)}`
      );
    } else {
      parts.push(`${cmd.type}${round(cmd.x, digits)} ${round(cmd.y, digits)}`);
    }
  }
  return parts.join(" ");
}

/** Converte uma lista de pontos em `d`, opcionalmente fechando o traçado. */
export function pointsToPathData(points, closed, digits = 3) {
  if (!points || !points.length) return "";
  const parts = [`M${round(points[0].x, digits)} ${round(points[0].y, digits)}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L${round(points[i].x, digits)} ${round(points[i].y, digits)}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function flattenCubic(p0, cmd, tolerance, out, depth = 0) {
  const p3 = { x: cmd.x, y: cmd.y };
  const p1 = { x: cmd.x1, y: cmd.y1 };
  const p2 = { x: cmd.x2, y: cmd.y2 };
  if (depth > 18 || isFlat(p0, p1, p2, p3, tolerance)) {
    out.push(p3);
    return;
  }
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const center = mid(p012, p123);
  flattenCubic(p0, { x1: p01.x, y1: p01.y, x2: p012.x, y2: p012.y, x: center.x, y: center.y }, tolerance, out, depth + 1);
  flattenCubic(center, { x1: p123.x, y1: p123.y, x2: p23.x, y2: p23.y, x: p3.x, y: p3.y }, tolerance, out, depth + 1);
}

function isFlat(p0, p1, p2, p3, tolerance) {
  const ux = 3 * p1.x - 2 * p0.x - p3.x;
  const uy = 3 * p1.y - 2 * p0.y - p3.y;
  const vx = 3 * p2.x - p0.x - 2 * p3.x;
  const vy = 3 * p2.y - p0.y - 2 * p3.y;
  const max = Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy);
  return max <= 16 * tolerance * tolerance;
}

/**
 * Achata comandos em subcaminhos de polilinha.
 * @returns {{points: {x:number,y:number}[], closed: boolean}[]}
 */
export function flattenCommands(commands, tolerance = FLATTEN_TOLERANCE) {
  const subpaths = [];
  let current = null;
  let cursor = { x: 0, y: 0 };
  let subStart = { x: 0, y: 0 };

  const ensure = () => {
    if (!current) {
      current = { points: [{ x: cursor.x, y: cursor.y }], closed: false };
      subpaths.push(current);
    }
    return current;
  };

  for (const cmd of commands) {
    if (cmd.type === "M") {
      current = { points: [{ x: cmd.x, y: cmd.y }], closed: false };
      subpaths.push(current);
      cursor = { x: cmd.x, y: cmd.y };
      subStart = { x: cmd.x, y: cmd.y };
    } else if (cmd.type === "L") {
      ensure().points.push({ x: cmd.x, y: cmd.y });
      cursor = { x: cmd.x, y: cmd.y };
    } else if (cmd.type === "C") {
      const target = ensure();
      flattenCubic(cursor, cmd, tolerance, target.points);
      cursor = { x: cmd.x, y: cmd.y };
    } else if (cmd.type === "Z") {
      if (current) {
        current.closed = true;
        cursor = { x: subStart.x, y: subStart.y };
      }
      current = null;
    }
  }
  return subpaths.filter((sub) => sub.points.length > 1);
}

/** Caixa que envolve todos os pontos de controle. Barata e suficiente. */
export function commandsBounds(commands) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const cmd of commands) {
    if (cmd.type === "Z") continue;
    if (cmd.type === "C") {
      visit(cmd.x1, cmd.y1);
      visit(cmd.x2, cmd.y2);
    }
    visit(cmd.x, cmd.y);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Tolerância de achatamento proporcional ao tamanho da própria geometria.
 *
 * Uma tolerância fixa erra nos dois extremos: num SVG com `viewBox="0 0 1 1"`
 * ela achataria tudo em duas retas, e numa figura de milhares de unidades
 * gastaria pontos à toa. Ligar a tolerância à diagonal resolve os dois casos.
 */
export function toleranceFor(commands, factor = 0.0006) {
  const bounds = commandsBounds(commands);
  if (!bounds) return FLATTEN_TOLERANCE;
  const diagonal = Math.hypot(bounds.w, bounds.h);
  return diagonal > 0 ? Math.max(1e-9, diagonal * factor) : FLATTEN_TOLERANCE;
}

/** Atalho: `d` → subcaminhos achatados, com tolerância proporcional. */
export function flattenPathData(d, tolerance) {
  const commands = parsePath(d);
  return flattenCommands(commands, tolerance ?? toleranceFor(commands));
}

/**
 * Remove pontos repetidos e segmentos curtos demais para influenciar o
 * traçado. Mantém sempre as extremidades.
 */
export function cleanPolyline(points, closed, minSegment = 1e-4) {
  if (!points.length) return [];
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (distance(out[out.length - 1], points[i]) >= minSegment) out.push(points[i]);
  }
  if (closed && out.length > 2 && distance(out[0], out[out.length - 1]) < minSegment) {
    out.pop();
  }
  return out;
}
