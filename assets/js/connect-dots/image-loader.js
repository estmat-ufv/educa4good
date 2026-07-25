/* Educa4Good — Ligar os Pontos
   Carregamento local de arquivos.

   Nada sai do navegador: o arquivo é lido com FileReader/createImageBitmap e
   permanece em memória. Não há fetch, upload, nem API externa. */

import { LIMITS } from "./constants.js";

const RASTER_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const SVG_TYPES = ["image/svg+xml", "text/xml", "application/xml"];

/** @returns {"svg"|"raster"|""} */
export function detectKind(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  if (SVG_TYPES.includes(type) || name.endsWith(".svg")) return "svg";
  if (RASTER_TYPES.includes(type)) return "raster";
  if (/\.(png|jpe?g|webp)$/.test(name)) return "raster";
  return "";
}

/** @returns {{ok: boolean, error?: string, warning?: string, kind?: string}} */
export function validateFile(file) {
  if (!file) return { ok: false, error: "Escolha um arquivo para continuar." };
  if (file.size > LIMITS.maxFileBytes) {
    return {
      ok: false,
      error: `O arquivo tem ${(file.size / 1048576).toFixed(1)} MB. O limite é ${
        LIMITS.maxFileBytes / 1048576
      } MB.`
    };
  }
  const kind = detectKind(file);
  if (!kind) {
    return {
      ok: false,
      error: "Formato não aceito. Use SVG, PNG, JPEG/JPG ou WebP."
    };
  }
  const warning =
    file.size > LIMITS.warnFileBytes
      ? "Arquivo grande: a análise pode levar alguns segundos."
      : undefined;
  return { ok: true, kind, warning };
}

export function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsText(file);
  });
}

export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/**
 * Decodifica um raster respeitando a orientação EXIF e a transparência.
 * `createImageBitmap` com `imageOrientation: "from-image"` é o caminho
 * correto; onde ele não existe caímos para <img>, que os navegadores atuais
 * também já orientam.
 */
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* segue para o caminho alternativo */
    }
  }
  const dataUrl = await readAsDataUrl(file);
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível abrir esta imagem."));
    image.src = dataUrl;
  });
}

function sizeOf(decoded) {
  return {
    w: decoded.width || decoded.naturalWidth || 0,
    h: decoded.height || decoded.naturalHeight || 0
  };
}

function drawTo(decoded, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Este navegador não conseguiu preparar a imagem.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function hasTransparency(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      transparent += 1;
      if (transparent > data.length / 400) return true;
    }
  }
  return false;
}

/**
 * Prepara a cópia de trabalho para análise.
 *
 * O arquivo original continua guardado para a exportação; a análise usa uma
 * cópia reduzida (no máximo `LIMITS.rasterAnalysisMax` px no maior lado) e a
 * escala de volta é registrada em `scaleToSource`.
 *
 * @returns {Promise<object>}
 */
export async function loadRaster(file) {
  const decoded = await decode(file);
  const { w, h } = sizeOf(decoded);
  if (w < LIMITS.minImageSide || h < LIMITS.minImageSide) {
    throw new Error("A imagem é pequena demais para gerar pontos com qualidade.");
  }

  const longest = Math.max(w, h);
  const factor = longest > LIMITS.rasterAnalysisMax ? LIMITS.rasterAnalysisMax / longest : 1;
  const analysisCanvas = drawTo(decoded, w * factor, h * factor);
  const alpha = hasTransparency(analysisCanvas);

  // Miniatura leve para embutir na folha como imagem de inspiração.
  const previewFactor = Math.min(1, 700 / longest);
  const previewCanvas = drawTo(decoded, w * previewFactor, h * previewFactor);
  const previewDataUrl = alpha
    ? previewCanvas.toDataURL("image/png")
    : previewCanvas.toDataURL("image/jpeg", 0.86);

  if (typeof decoded.close === "function") decoded.close();

  return {
    width: w,
    height: h,
    analysisCanvas,
    analysisSize: { w: analysisCanvas.width, h: analysisCanvas.height },
    scaleToSource: analysisCanvas.width > 0 ? w / analysisCanvas.width : 1,
    hasAlpha: alpha,
    previewDataUrl,
    downscaled: factor < 1
  };
}

/** Extrai o ImageData da cópia de trabalho, pronto para o OpenCV. */
export function analysisImageData(analysisCanvas) {
  const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });
  return ctx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
}
