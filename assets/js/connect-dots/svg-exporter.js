/* Educa4Good — Ligar os Pontos
   Exportação SVG. É o formato principal: nada é rasterizado. */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';

export function toStandaloneSvg(svgMarkup) {
  return XML_HEADER + svgMarkup;
}

/** Nome de arquivo seguro derivado do título. */
export function suggestFileName(title, extension) {
  const base = String(title || "ligar-os-pontos")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "ligar-os-pontos"}.${extension}`;
}

export function svgToBlob(svgMarkup) {
  return new Blob([toStandaloneSvg(svgMarkup)], { type: "image/svg+xml;charset=utf-8" });
}

/**
 * Troca as dimensões físicas por pixels, mantendo o viewBox. Usado para
 * rasterizar o SVG final em um DPI escolhido.
 */
export function withPixelSize(svgMarkup, widthPx, heightPx) {
  return svgMarkup
    .replace(/(<svg\b[^>]*?)\swidth="[^"]*"/, "$1")
    .replace(/(<svg\b[^>]*?)\sheight="[^"]*"/, "$1")
    .replace(/<svg\b/, `<svg width="${Math.round(widthPx)}" height="${Math.round(heightPx)}"`);
}

export function svgToDataUrl(svgMarkup) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
}

/** Dispara o download de um Blob sem depender de bibliotecas. */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
