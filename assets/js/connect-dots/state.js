/* Educa4Good — Ligar os Pontos
   Estado central explícito.

   Todo o estado serializável mora em um único objeto e só muda por `update()`.
   Objetos que não podem ser clonados (imagem, canvas, SVG sanitizado, cena do
   Paper.js) ficam em `assets`, fora do histórico de desfazer. */

import { DEFAULT_SETTINGS, MODES } from "./constants.js";

/**
 * @typedef {Object} ConnectDotsState
 * @property {{type: ""|"svg"|"raster", filename: string, width: number, height: number, bytes: number}} source
 * @property {""|"svg"|"raster"|"manual"} mode
 * @property {string} step
 * @property {import("./path-normalizer.js").ActivityPath[]} paths
 * @property {object[]} points
 * @property {object[]} segments
 * @property {number[]} hiddenSegments índices `from` de segmentos ocultados
 * @property {object} settings
 * @property {object} raster parâmetros de binarização e candidatos
 * @property {{valid: boolean, errors: object[], warnings: object[], acknowledged: string[]}} validation
 * @property {{busy: boolean, message: string, messageType: string}} ui
 */

export function createInitialState() {
  return {
    source: { type: "", filename: "", width: 0, height: 0, bytes: 0 },
    mode: "",
    step: "upload",
    paths: [],
    points: [],
    segments: [],
    /** Pares de números cuja ligação não deve aparecer, ex.: [[12, 13]]. */
    hiddenPairs: [],
    /** pathId → frações (0..1) escolhidas à mão; substitui a amostragem. */
    pathSamples: {},
    /** pointId → deslocamento do ponto, em mm da folha. */
    pointOffsets: {},
    /** pointId → deslocamento do número, em mm da folha. */
    labelOffsets: {},
    settings: { ...DEFAULT_SETTINGS },
    raster: {
      threshold: 128,
      thresholdMode: "otsu",
      blockSize: 25,
      constant: 5,
      invert: false,
      open: 0,
      close: 1,
      denoise: 1,
      minAreaRatio: 0.002,
      candidates: [],
      selectedCandidates: [],
      preview: "contours",
      analysisSize: { w: 0, h: 0 },
      scaleToSource: 1
    },
    validation: { valid: false, errors: [], warnings: [], acknowledged: [] },
    ui: { busy: false, message: "", messageType: "" }
  };
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createStore() {
  let state = createInitialState();
  /** Recursos não serializáveis; nunca entram no histórico. */
  const assets = {
    image: null,
    canvas: null,
    sanitizedSvg: null,
    originalFile: null,
    originalText: "",
    analysisCanvas: null
  };
  const listeners = new Set();
  const past = [];
  const future = [];
  const HISTORY_LIMIT = 60;
  let notifyDepth = 0;

  function notify(reason) {
    if (notifyDepth > 0) return;
    for (const listener of Array.from(listeners)) listener(state, reason);
  }

  return {
    getState: () => state,
    getAssets: () => assets,

    setAsset(key, value) {
      assets[key] = value;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * @param {(draft: ConnectDotsState) => void|ConnectDotsState} mutator
     * @param {{history?: boolean, reason?: string, silent?: boolean}} [options]
     */
    update(mutator, options = {}) {
      if (options.history) {
        past.push(clone(state));
        if (past.length > HISTORY_LIMIT) past.shift();
        future.length = 0;
      }
      const draft = clone(state);
      const result = mutator(draft);
      state = result || draft;
      if (!options.silent) notify(options.reason || "update");
      return state;
    },

    /** Agrupa várias atualizações em uma única notificação. */
    batch(fn) {
      notifyDepth += 1;
      try {
        fn();
      } finally {
        notifyDepth -= 1;
      }
      notify("batch");
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    undo() {
      if (!past.length) return false;
      future.push(clone(state));
      state = past.pop();
      notify("undo");
      return true;
    },

    redo() {
      if (!future.length) return false;
      past.push(clone(state));
      state = future.pop();
      notify("redo");
      return true;
    },

    /** Reinício completo, inclusive dos recursos carregados. */
    reset() {
      past.length = 0;
      future.length = 0;
      state = createInitialState();
      for (const key of Object.keys(assets)) assets[key] = key === "originalText" ? "" : null;
      notify("reset");
      return state;
    },

    /** Guarda um ponto de retorno sem alterar o estado. */
    checkpoint() {
      past.push(clone(state));
      if (past.length > HISTORY_LIMIT) past.shift();
      future.length = 0;
    }
  };
}

export { MODES };
