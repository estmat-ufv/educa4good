/* Educa4Good — Ligar os Pontos
   Fachada do processamento raster.

   Tenta sempre o Web Worker primeiro, para que a interface não congele. Se o
   Worker não estiver disponível (navegador antigo, política de segurança,
   file://), cai para a thread principal de forma assíncrona, cedendo o controle
   antes e depois do trabalho pesado para que o estado "processando" apareça. */

import { openCvSourceUrls, extractorUrl, workerUrl, loadOpenCvInPage } from "./opencv-loader.js";
import { pointsToPathData } from "./path-geometry.js";
import { normalizePaths } from "./path-normalizer.js";

function nextFrame() {
  return new Promise((resolve) =>
    typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 0)
  );
}

export function createRasterPipeline() {
  let worker = null;
  let ready = null;
  let mode = "";
  let requestSeq = 0;
  let inlineCv = null;
  const pending = new Map();

  function startWorker() {
    return new Promise((resolve, reject) => {
      let instance;
      try {
        instance = new Worker(workerUrl());
      } catch (error) {
        reject(error);
        return;
      }
      const timer = setTimeout(() => {
        instance.terminate();
        reject(new Error("O Worker do OpenCV não respondeu."));
      }, 120000);

      instance.onmessage = (event) => {
        const message = event.data || {};
        if (message.type === "ready") {
          clearTimeout(timer);
          worker = instance;
          mode = "worker";
          instance.onmessage = handleWorkerMessage;
          resolve({ mode });
          return;
        }
        if (message.type === "error" && message.requestId === undefined) {
          clearTimeout(timer);
          instance.terminate();
          reject(new Error(message.message || "Falha ao iniciar o Worker."));
        }
      };
      instance.onerror = (event) => {
        clearTimeout(timer);
        instance.terminate();
        reject(new Error(event.message || "Falha ao iniciar o Worker do OpenCV."));
      };

      instance.postMessage({
        type: "init",
        opencvUrls: openCvSourceUrls(),
        extractorUrl: extractorUrl()
      });
    });
  }

  function handleWorkerMessage(event) {
    const message = event.data || {};
    const entry = pending.get(message.requestId);
    if (!entry) return;

    if (message.type === "progress") {
      if (entry.onProgress) entry.onProgress(message.stage);
      return;
    }
    if (message.type === "result") {
      pending.delete(message.requestId);
      entry.resolve({
        contours: message.contours,
        binary: {
          width: message.binary.width,
          height: message.binary.height,
          data: new Uint8ClampedArray(message.binary.buffer)
        },
        threshold: message.threshold
      });
      return;
    }
    if (message.type === "error") {
      pending.delete(message.requestId);
      entry.reject(new Error(message.message || "Falha ao processar a imagem."));
    }
  }

  return {
    get mode() {
      return mode;
    },

    /**
     * Garante que há um caminho de processamento disponível.
     * @param {(text: string) => void} [onProgress]
     */
    ensureReady(onProgress) {
      if (ready) return ready;
      ready = (async () => {
        if (typeof Worker === "function") {
          try {
            if (onProgress) onProgress("Preparando o processamento…");
            return await startWorker();
          } catch (error) {
            // Segue para o caminho em thread principal, registrando o motivo.
            console.warn("[ligar-os-pontos] Worker indisponível:", error.message);
          }
        }
        if (onProgress) onProgress("Carregando OpenCV.js…");
        const loaded = await loadOpenCvInPage(onProgress);
        inlineCv = loaded.cv;
        mode = "inline";
        return { mode };
      })();
      return ready;
    },

    /**
     * @param {ImageData} imageData
     * @param {object} params
     * @param {(stage: string) => void} [onProgress]
     */
    async extract(imageData, params, onProgress) {
      await this.ensureReady(onProgress);
      requestSeq += 1;
      const requestId = requestSeq;

      if (mode === "worker" && worker) {
        // Cópia do buffer: o original continua servindo às prévias.
        const copy = new Uint8ClampedArray(imageData.data);
        return await new Promise((resolve, reject) => {
          pending.set(requestId, { resolve, reject, onProgress });
          worker.postMessage(
            {
              type: "extract",
              requestId,
              image: { width: imageData.width, height: imageData.height, buffer: copy.buffer },
              params
            },
            [copy.buffer]
          );
        });
      }

      if (onProgress) onProgress("binarizando");
      await nextFrame();
      const extractor = window.CdContourExtractor;
      if (!extractor || !inlineCv) throw new Error("O extrator de contornos não foi carregado.");
      const result = extractor.extractContours(inlineCv, imageData, params);
      await nextFrame();
      return result;
    },

    cancel() {
      for (const [requestId, entry] of pending) {
        if (worker) worker.postMessage({ type: "cancel", requestId });
        entry.reject(new Error("Processamento cancelado."));
      }
      pending.clear();
    },

    terminate() {
      this.cancel();
      if (worker) worker.terminate();
      worker = null;
      ready = null;
      mode = "";
    }
  };
}

/**
 * Converte candidatos confirmados pelo usuário em caminhos da atividade,
 * mapeando as coordenadas da cópia de análise de volta para a imagem original.
 *
 * @param {object[]} candidates candidatos selecionados
 * @param {number} scaleToSource fator análise → original
 */
export function candidatesToPaths(candidates, scaleToSource) {
  const scale = Number.isFinite(scaleToSource) && scaleToSource > 0 ? scaleToSource : 1;
  const out = [];

  // Cada candidato é normalizado isoladamente para que as marcações do
  // classificador (moldura, encosta na borda) sigam com o caminho certo — são
  // elas que fazem o validador recusar uma moldura.
  candidates.forEach((candidate) => {
    const points = candidate.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const closed = candidate.closed !== false;
    const normalized = normalizePaths(
      [
        {
          d: pointsToPathData(points, closed),
          closed,
          source: "raster",
          label: `Contorno ${candidate.rank + 1}`,
          idPrefix: "raster"
        }
      ],
      { minSegment: 0.4, minLength: 8 }
    );
    for (const path of normalized) {
      out.push({
        ...path,
        frameLike: candidate.frameLike || false,
        nearFrame: candidate.nearFrame || false
      });
    }
  });

  return out.map((path, index) => ({ ...path, order: index }));
}
