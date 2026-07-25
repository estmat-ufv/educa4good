/* Educa4Good — Ligar os Pontos
   Montagem do plano da folha e do SVG final.

   A folha é escrita em milímetros (viewBox = tamanho real do papel), então a
   impressão sai na escala correta e o PNG pode ser gerado em qualquer DPI a
   partir do MESMO SVG — sem rasterizar o canvas de edição.

   `buildWorksheetPlan()` e `renderWorksheetSvg()` são puros: recebem estado e
   devolvem dados/string. Isso é o que permite testá-los no Node. */

import { PAPER } from "./constants.js";
import { fitMatrix, pathsBounds, transformPaths } from "./path-normalizer.js";
import { samplePaths, describeBreaks } from "./path-sampler.js";
import { layoutLabels } from "./label-layout.js";
import { applyMatrix } from "./util/geometry.js";

const FONT_STACK = "Nunito, 'Segoe UI', system-ui, sans-serif";

export function escapeXml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

/** Geometria da folha: margens, cabeçalho, faixa de inspiração e área de desenho. */
export function computeSheetLayout(settings) {
  const paper = (PAPER[settings.pageSize] || PAPER.A4)[settings.orientation] || PAPER.A4.portrait;
  const margin = settings.margin;
  const content = {
    x: margin,
    y: margin,
    w: Math.max(10, paper.w - margin * 2),
    h: Math.max(10, paper.h - margin * 2)
  };

  const titleSize = 7.2;
  const fieldSize = 3.4;
  const headerHeight = titleSize + 3 + (settings.showFields ? fieldSize + 5 : 0);
  const footerHeight = 5;

  let bandHeight = 0;
  let bandAtTop = false;
  if (settings.showInspiration) {
    bandHeight = settings.inspirationSize + 4;
    bandAtTop = String(settings.inspirationPosition || "").startsWith("top");
  }

  const drawTop = content.y + headerHeight + (bandAtTop ? bandHeight : 0);
  const drawBottom = content.y + content.h - footerHeight - (bandAtTop ? 0 : bandHeight);

  const drawing = {
    x: content.x,
    y: drawTop,
    w: content.w,
    h: Math.max(10, drawBottom - drawTop)
  };

  let inspiration = null;
  if (bandHeight > 0) {
    const size = settings.inspirationSize;
    const right = String(settings.inspirationPosition || "").endsWith("left") ? false : true;
    inspiration = {
      x: right ? content.x + content.w - size : content.x,
      y: bandAtTop ? content.y + headerHeight : drawBottom + 4,
      w: size,
      h: size
    };
  }

  return {
    paper,
    margin,
    content,
    drawing,
    inspiration,
    titleSize,
    fieldSize,
    headerHeight,
    footerHeight
  };
}

/**
 * Calcula tudo que a folha precisa: encaixe, pontos, rótulos e interrupções.
 *
 * @param {object} state estado central
 * @param {{sourcePreview?: object}} [extra]
 */
export function buildWorksheetPlan(state, extra = {}) {
  const settings = state.settings;
  const sheet = computeSheetLayout(settings);
  const sourceBounds = pathsBounds(state.paths, true);

  // Os números fazem parte da atividade: se o traçado encostar na área útil,
  // os rótulos das extremidades não têm para onde ir e acabam por dentro da
  // figura. Por isso o encaixe reserva uma faixa proporcional ao tamanho do
  // número — "ocupar a maior área possível" vale para pontos MAIS números.
  const allowance = Math.max(
    0,
    Math.min(
      Math.min(sheet.drawing.w, sheet.drawing.h) * 0.2,
      settings.labelFontSize * 1.7 + settings.pointRadius * 2
    )
  );
  const fitBox = {
    x: sheet.drawing.x + allowance,
    y: sheet.drawing.y + allowance,
    w: Math.max(5, sheet.drawing.w - allowance * 2),
    h: Math.max(5, sheet.drawing.h - allowance * 2)
  };
  const matrix = fitMatrix(sourceBounds, fitBox);
  const scale = matrix.a;

  const placedPaths = transformPaths(state.paths, matrix).map((path, index) => ({
    ...path,
    // Marcas de moldura vêm do classificador e seguem com o caminho.
    frameLike: state.paths[index]?.frameLike || false,
    nearFrame: state.paths[index]?.nearFrame || false
  }));

  const sampled = samplePaths(placedPaths, settings, { pathSamples: state.pathSamples });
  const points = sampled.points;

  // Ajustes manuais guardados no estado: primeiro o ponto, depois o número.
  const pointOffsets = state.pointOffsets || {};
  const labelOffsets = state.labelOffsets || {};
  for (const point of points) {
    const moved = pointOffsets[point.id];
    if (moved) {
      point.x += moved.dx;
      point.y += moved.dy;
      point.moved = true;
    }
    const label = labelOffsets[point.id];
    if (label) point.labelOffset = label;
  }

  const centroids = new Map(placedPaths.map((p) => [p.id, p.metrics.centroid]));
  const hidden = new Set(
    (state.hiddenPairs || []).map((pair) => `${pair[0]}-${pair[1]}`)
  );
  const segments = sampled.segments.filter((segment) => {
    const a = points[segment.from];
    const b = points[segment.to];
    if (!a || !b) return false;
    return !hidden.has(`${a.number}-${b.number}`) && !hidden.has(`${b.number}-${a.number}`);
  });

  const labelLayout = layoutLabels(points, sampled.segments, centroids, {
    fontSize: settings.labelFontSize,
    pointRadius: settings.pointRadius,
    area: {
      x: sheet.content.x - 1,
      y: sheet.content.y + sheet.headerHeight - 2,
      w: sheet.content.w + 2,
      h: sheet.drawing.y + sheet.drawing.h + 2 - (sheet.content.y + sheet.headerHeight - 2)
    },
    minGap: settings.labelFontSize * 0.14
  });

  return {
    state,
    sheet,
    page: sheet.paper,
    area: sheet.drawing,
    fitBox,
    labelAllowance: allowance,
    paths: placedPaths,
    points,
    segments,
    allSegments: sampled.segments,
    labelLayout,
    breaks: describeBreaks(points),
    warnings: sampled.warnings,
    matrix,
    scale,
    sourceBounds,
    sourcePreview: extra.sourcePreview || null
  };
}

/** Texto da linha de identificação. */
function fieldParts(settings) {
  const parts = [];
  if (settings.fieldName) parts.push({ label: "Nome", flex: 3 });
  if (settings.fieldDate) parts.push({ label: "Data", flex: 1.2 });
  if (settings.fieldClass) parts.push({ label: "Turma", flex: 1.4 });
  if (settings.fieldTeacher) parts.push({ label: "Professor(a)", flex: 2 });
  return parts;
}

/**
 * Gera o SVG completo da folha.
 * @param {object} plan resultado de buildWorksheetPlan()
 * @param {{interactive?: boolean}} [options]
 * @returns {string}
 */
export function renderWorksheetSvg(plan, options = {}) {
  const { sheet, page, points, segments, labelLayout, paths } = plan;
  const settings = plan.state.settings;
  const interactive = options.interactive === true;
  const out = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ` +
      `width="${page.w}mm" height="${page.h}mm" viewBox="0 0 ${page.w} ${page.h}" ` +
      `role="img" aria-label="${escapeXml(settings.title || "Ligar os pontos")}" ` +
      `data-educa4good="ligar-os-pontos">`
  );
  out.push(
    `<title>${escapeXml(settings.title || "Ligar os pontos")} — Educa4Good</title>`
  );
  out.push(`<rect x="0" y="0" width="${page.w}" height="${page.h}" fill="#ffffff"/>`);

  // ------------------------------------------------------------- cabeçalho
  const titleY = sheet.content.y + sheet.titleSize * 0.82;
  out.push(
    `<text x="${round(page.w / 2)}" y="${round(titleY)}" text-anchor="middle" ` +
      `font-family="${FONT_STACK}" font-size="${sheet.titleSize}" font-weight="800" ` +
      `fill="#1f5180">${escapeXml(settings.title || "Ligar os pontos")}</text>`
  );

  if (settings.showFields) {
    const parts = fieldParts(settings);
    if (parts.length) {
      const y = sheet.content.y + sheet.titleSize + 3 + sheet.fieldSize;
      const gap = 4;
      const totalFlex = parts.reduce((a, p) => a + p.flex, 0);
      const usable = sheet.content.w - gap * (parts.length - 1);
      let x = sheet.content.x;
      out.push(`<g font-family="${FONT_STACK}" font-size="${sheet.fieldSize}" fill="#51667a">`);
      for (const part of parts) {
        const width = (usable * part.flex) / totalFlex;
        const labelWidth = part.label.length * sheet.fieldSize * 0.56 + 2;
        out.push(
          `<text x="${round(x)}" y="${round(y)}" font-weight="700">${escapeXml(part.label)}:</text>`
        );
        out.push(
          `<line x1="${round(x + labelWidth)}" y1="${round(y + 0.8)}" ` +
            `x2="${round(x + width)}" y2="${round(y + 0.8)}" ` +
            `stroke="#b7cadb" stroke-width="0.3"/>`
        );
        x += width + gap;
      }
      out.push("</g>");
    }
  }

  // ------------------------------------------------- imagem original (fundo)
  if (settings.showOriginalImage && plan.sourcePreview) {
    out.push(renderSourcePreview(plan, sheet.drawing, settings.originalOpacity, "background"));
  }

  // ------------------------------------------------------------ linhas-guia
  if (settings.showGuideLines && settings.guideWidth > 0) {
    const d = segments
      .map((segment) => {
        const a = points[segment.from];
        const b = points[segment.to];
        if (!a || !b) return "";
        return `M${round(a.x)} ${round(a.y)} L${round(b.x)} ${round(b.y)}`;
      })
      .filter(Boolean)
      .join(" ");
    if (d) {
      out.push(
        `<path data-layer="guides" d="${d}" fill="none" ` +
          `stroke="${escapeXml(settings.guideColor)}" stroke-width="${settings.guideWidth}" ` +
          `stroke-linecap="round" stroke-dasharray="${round(settings.guideWidth * 4)} ${round(
            settings.guideWidth * 4
          )}"/>`
      );
    }
  }

  // ----------------------------------------------------------------- pontos
  out.push(`<g data-layer="dots" fill="${escapeXml(settings.pointColor)}">`);
  points.forEach((point, index) => {
    const attrs = interactive ? ` data-point-index="${index}" class="cd-dot"` : "";
    out.push(
      `<circle${attrs} cx="${round(point.x)}" cy="${round(point.y)}" r="${settings.pointRadius}"/>`
    );
  });
  out.push("</g>");

  // ---------------------------------------------------------------- números
  out.push(
    `<g data-layer="labels" font-family="${FONT_STACK}" ` +
      `font-size="${settings.labelFontSize}" font-weight="700" ` +
      `fill="${escapeXml(settings.labelColor)}" text-anchor="middle">`
  );
  labelLayout.labels.forEach((label, index) => {
    const point = points[index];
    if (!point) return;
    const attrs = interactive ? ` data-label-index="${index}" class="cd-label"` : "";
    out.push(
      `<text${attrs} x="${round(label.x)}" y="${round(
        label.y + settings.labelFontSize * 0.355
      )}">${escapeXml(point.number)}</text>`
    );
  });
  out.push("</g>");

  // ------------------------------------------------------------- inspiração
  if (sheet.inspiration && plan.sourcePreview) {
    out.push(
      `<g data-layer="inspiration">` +
        `<rect x="${round(sheet.inspiration.x)}" y="${round(sheet.inspiration.y)}" ` +
        `width="${round(sheet.inspiration.w)}" height="${round(sheet.inspiration.h)}" ` +
        `fill="none" stroke="#dde7f0" stroke-width="0.25" rx="1.5"/>` +
        renderSourcePreview(plan, inset(sheet.inspiration, 1.4), 1, "inspiration") +
        `</g>`
    );
  }

  // ----------------------------------------------------------------- marca
  const brandY = sheet.content.y + sheet.content.h - 0.6;
  out.push(
    `<text x="${round(sheet.content.x)}" y="${round(brandY)}" ` +
      `font-family="${FONT_STACK}" font-size="2.9" font-weight="700" fill="#8aa0b4">Educa4Good</text>`
  );
  const breakNote = plan.breaks.length
    ? `Não ligue: ${plan.breaks.map((b) => `${b.from}–${b.to}`).join(", ")}`
    : `${points.length} pontos`;
  out.push(
    `<text x="${round(sheet.content.x + sheet.content.w)}" y="${round(brandY)}" ` +
      `text-anchor="end" font-family="${FONT_STACK}" font-size="2.6" fill="#8aa0b4">` +
      `${escapeXml(breakNote)}</text>`
  );

  out.push("</svg>");
  return out.join("");
}

function inset(rect, amount) {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    w: Math.max(1, rect.w - amount * 2),
    h: Math.max(1, rect.h - amount * 2)
  };
}

/**
 * A pré-visualização da origem é embutida no próprio SVG: imagem raster como
 * data URL, ou a geometria vetorial como caminhos. Nada aponta para fora.
 */
function renderSourcePreview(plan, box, opacity, role) {
  const preview = plan.sourcePreview;
  if (!preview) return "";

  if (preview.kind === "image" && preview.href) {
    return (
      `<image data-layer="source-${role}" href="${escapeXml(preview.href)}" ` +
      `x="${round(box.x)}" y="${round(box.y)}" width="${round(box.w)}" height="${round(box.h)}" ` +
      `preserveAspectRatio="xMidYMid meet" opacity="${round(opacity, 3)}"/>`
    );
  }

  if (preview.kind === "geometry" && preview.paths && preview.paths.length) {
    const bounds = preview.bounds;
    if (!bounds || !(bounds.w > 0) || !(bounds.h > 0)) return "";
    const scale = Math.min(box.w / bounds.w, box.h / bounds.h);
    const dx = box.x + (box.w - bounds.w * scale) / 2 - bounds.x * scale;
    const dy = box.y + (box.h - bounds.h * scale) / 2 - bounds.y * scale;
    const strokeWidth = round(Math.max(0.12, 0.35 / Math.max(scale, 1e-6)), 3);
    const body = preview.paths
      .map((d) => `<path d="${escapeXml(d)}"/>`)
      .join("");
    return (
      `<g data-layer="source-${role}" opacity="${round(opacity, 3)}" ` +
      `transform="translate(${round(dx, 3)} ${round(dy, 3)}) scale(${round(scale, 5)})" ` +
      `fill="none" stroke="#7f95a8" stroke-width="${strokeWidth}">${body}</g>`
    );
  }
  return "";
}

/** Pré-visualização da origem a partir do estado e dos recursos carregados. */
export function buildSourcePreview(state, assets) {
  if (state.source.type === "raster" && assets.previewDataUrl) {
    return { kind: "image", href: assets.previewDataUrl };
  }
  if (state.source.type === "svg" && state.paths.length) {
    const bounds = pathsBounds(state.paths, false);
    return {
      kind: "geometry",
      bounds,
      paths: state.paths.map((p) => p.svgPathData)
    };
  }
  return null;
}

export { applyMatrix };
