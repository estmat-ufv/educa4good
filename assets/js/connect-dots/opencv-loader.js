/* Educa4Good — Ligar os Pontos
   Carregamento do OpenCV.js com versão FIXA.

   Nenhuma URL com "latest". A ordem de tentativa é:
     1. cópia local em assets/vendor/opencv/ (funciona offline, se existir);
     2. jsDelivr, versão pinada;
     3. unpkg, versão pinada.

   O opencv.js tem 11,4 MB — grande demais para versionar no repositório do
   site. Por isso a CDN pinada é o caminho normal e o vendor local é o
   fallback opcional documentado em docs/ligar_os_pontos_arquitetura.md. */

export const OPENCV_VERSION = "4.11.0";
export const OPENCV_PACKAGE = "@techstark/opencv-js@4.11.0-release.1";

const VENDOR_PATH = `../../vendor/opencv/opencv-${OPENCV_VERSION}.js`;

/** URLs absolutas, na ordem de tentativa. */
export function openCvSourceUrls() {
  return [
    new URL(VENDOR_PATH, import.meta.url).href,
    `https://cdn.jsdelivr.net/npm/${OPENCV_PACKAGE}/dist/opencv.js`,
    `https://unpkg.com/${OPENCV_PACKAGE}/dist/opencv.js`
  ];
}

export function extractorUrl() {
  return new URL("./contour-extractor.js", import.meta.url).href;
}

export function workerUrl() {
  return new URL("./raster-worker.js", import.meta.url).href;
}

let pageLoad = null;

/**
 * O build 4.11 publica uma Promise no global `cv`; builds anteriores expõem o
 * namespace e sinalizam por `onRuntimeInitialized`. As duas formas são aceitas.
 */
function resolveCv() {
  const candidate = window.cv;
  if (!candidate) return Promise.reject(new Error("OpenCV.js carregou sem expor 'cv'."));
  if (typeof candidate.then === "function") return Promise.resolve(candidate);
  if (candidate.Mat) return Promise.resolve(candidate);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("O OpenCV.js não terminou de iniciar.")),
      60000
    );
    candidate.onRuntimeInitialized = () => {
      clearTimeout(timer);
      resolve(candidate);
    };
  });
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(src);
    script.onerror = () => {
      script.remove();
      reject(new Error(`Falha ao carregar ${src}`));
    };
    document.head.appendChild(script);
  });
}

/** Carrega o OpenCV na thread principal (caminho alternativo ao Worker). */
export function loadOpenCvInPage(onProgress) {
  if (pageLoad) return pageLoad;
  pageLoad = (async () => {
    const sources = openCvSourceUrls();
    let lastError = null;
    for (const src of sources) {
      try {
        if (onProgress) onProgress(`Carregando OpenCV.js…`);
        await injectScript(src);
        const cv = await resolveCv();
        await injectScript(extractorUrl());
        return { cv, source: src };
      } catch (error) {
        lastError = error;
      }
    }
    pageLoad = null;
    throw lastError || new Error("Não foi possível carregar o OpenCV.js.");
  })();
  return pageLoad;
}
