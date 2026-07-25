/* Educa4Good — Ligar os Pontos
   Web Worker de processamento raster.

   Script CLÁSSICO: `importScripts()` não coexiste com ES Modules, e o
   opencv.js distribuído é UMD. Todo o peso do OpenCV fica aqui para que a
   interface nunca congele.

   Protocolo de mensagens:
     → { type: "init", opencvUrls: string[], extractorUrl: string }
     ← { type: "ready", version } | { type: "error", message }
     → { type: "extract", requestId, image: {width,height,buffer}, params }
     ← { type: "progress", requestId, stage }
     ← { type: "result", requestId, contours, binary, threshold }
     → { type: "cancel", requestId }                                        */

/* global importScripts, CdContourExtractor */

"use strict";

var cvReady = null;
var cancelled = Object.create(null);

function loadScripts(urls) {
  var lastError = null;
  for (var i = 0; i < urls.length; i++) {
    try {
      importScripts(urls[i]);
      return urls[i];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Nenhuma fonte do OpenCV.js pôde ser carregada.");
}

/**
 * O opencv.js 4.11 exporta uma Promise no global `cv`; versões anteriores
 * expõem o namespace e avisam por `onRuntimeInitialized`. Aceitamos as duas
 * formas para não ficar preso a um único build.
 */
function resolveCv() {
  var candidate = self.cv;
  if (!candidate) return Promise.reject(new Error("OpenCV.js carregou sem expor 'cv'."));
  if (typeof candidate.then === "function") return Promise.resolve(candidate);
  if (candidate.Mat) return Promise.resolve(candidate);
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error("O OpenCV.js não terminou de iniciar."));
    }, 60000);
    candidate.onRuntimeInitialized = function () {
      clearTimeout(timer);
      resolve(candidate);
    };
  });
}

function init(message) {
  if (cvReady) return cvReady;
  cvReady = new Promise(function (resolve, reject) {
    try {
      loadScripts(message.opencvUrls);
      importScripts(message.extractorUrl);
    } catch (error) {
      reject(error);
      return;
    }
    resolveCv().then(resolve, reject);
  });
  return cvReady;
}

self.onmessage = function (event) {
  var message = event.data || {};

  if (message.type === "init") {
    init(message).then(
      function (cv) {
        self.postMessage({
          type: "ready",
          version: cv.CV_VERSION || ""
        });
      },
      function (error) {
        self.postMessage({ type: "error", message: String(error && error.message ? error.message : error) });
      }
    );
    return;
  }

  if (message.type === "cancel") {
    cancelled[message.requestId] = true;
    return;
  }

  if (message.type === "extract") {
    if (!cvReady) {
      self.postMessage({
        type: "error",
        requestId: message.requestId,
        message: "O OpenCV.js ainda não foi iniciado."
      });
      return;
    }
    cvReady.then(
      function (cv) {
        if (cancelled[message.requestId]) {
          delete cancelled[message.requestId];
          return;
        }
        self.postMessage({ type: "progress", requestId: message.requestId, stage: "binarizando" });
        try {
          var imageData = {
            width: message.image.width,
            height: message.image.height,
            data: new Uint8ClampedArray(message.image.buffer)
          };
          var result = CdContourExtractor.extractContours(cv, imageData, message.params || {});
          if (cancelled[message.requestId]) {
            delete cancelled[message.requestId];
            return;
          }
          self.postMessage(
            {
              type: "result",
              requestId: message.requestId,
              contours: result.contours,
              binary: {
                width: result.binary.width,
                height: result.binary.height,
                buffer: result.binary.data.buffer
              },
              threshold: result.threshold
            },
            [result.binary.data.buffer]
          );
        } catch (error) {
          self.postMessage({
            type: "error",
            requestId: message.requestId,
            message: String(error && error.message ? error.message : error)
          });
        }
      },
      function (error) {
        self.postMessage({
          type: "error",
          requestId: message.requestId,
          message: String(error && error.message ? error.message : error)
        });
      }
    );
  }
};
