/* Educa4Good — Ligar os Pontos
   Exportação PNG.

   O PNG é sempre gerado a partir do SVG FINAL da folha, nunca do canvas de
   edição: o mesmo arquivo que vai para a impressora é o que é rasterizado. */

import { withPixelSize, svgToDataUrl } from "./svg-exporter.js";

const MM_PER_INCH = 25.4;

/**
 * @param {string} svgMarkup SVG final da folha (dimensões em mm)
 * @param {{widthMm: number, heightMm: number, dpi: number}} options
 * @returns {Promise<Blob>}
 */
export async function svgToPngBlob(svgMarkup, options) {
  const dpi = Math.max(72, Math.min(600, options.dpi || 150));
  const widthPx = Math.round((options.widthMm / MM_PER_INCH) * dpi);
  const heightPx = Math.round((options.heightMm / MM_PER_INCH) * dpi);

  const sized = withPixelSize(svgMarkup, widthPx, heightPx);
  const image = await loadImage(svgToDataUrl(sized));

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não conseguiu preparar o PNG.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.drawImage(image, 0, 0, widthPx, heightPx);

  return await canvasToBlob(canvas);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "sync";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Não foi possível rasterizar a folha. Tente exportar em SVG."));
    image.src = src;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("Este navegador não suporta exportar PNG."));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível gerar o PNG."));
    }, "image/png");
  });
}
