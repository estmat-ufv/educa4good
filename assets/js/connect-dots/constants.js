/* Educa4Good — Ligar os Pontos
   Constantes compartilhadas. A folha é desenhada em milímetros: o SVG final
   usa width="210mm" viewBox="0 0 210 297", então 1 unidade = 1 mm e a
   impressão sai na escala correta em qualquer navegador. */

export const MM_PER_PT = 25.4 / 72;
export const PX_PER_MM = 96 / 25.4;

export const PAPER = {
  A4: {
    portrait: { w: 210, h: 297 },
    landscape: { w: 297, h: 210 }
  }
};

/** Limites de arquivo e de processamento. */
export const LIMITS = {
  maxFileBytes: 12 * 1024 * 1024,
  warnFileBytes: 4 * 1024 * 1024,
  /** Maior dimensão da cópia de trabalho usada na análise raster. */
  rasterAnalysisMax: 1800,
  /** Abaixo disto a imagem não tem detalhe suficiente. */
  minImageSide: 24,
  minPointCount: 4,
  maxPointCount: 200
};

/** Tolerância de achatamento de curvas, em unidades do documento. */
export const FLATTEN_TOLERANCE = 0.08;

/** Valores iniciais pensados para crianças em fase de alfabetização. */
export const DEFAULT_SETTINGS = {
  pointCount: 30,
  pointRadius: 1.1,
  labelFontSize: 3.6,
  pointColor: "#1f5180",
  labelColor: "#1f5180",
  guideColor: "#c2d1de",
  guideWidth: 0.3,
  showGuideLines: false,
  showOriginalImage: false,
  originalOpacity: 0.18,
  samplingMode: "uniform",
  pageSize: "A4",
  orientation: "portrait",
  margin: 14,
  /** Tema visual, espelhando pacotes/educa4good_temas.sty. */
  theme: "classico",
  /** Modo de impressão: "cor" ou "pb" (equivale a [pretoebranco] no LaTeX). */
  colorMode: "cor",
  /** Margem tracejada para a criança recortar e colar no caderno. */
  cutMargin: false,
  cutMarginInset: 6,
  title: "Ligar os pontos",
  showFields: true,
  fieldName: true,
  fieldDate: true,
  fieldClass: true,
  fieldTeacher: false,
  showInspiration: true,
  inspirationSize: 34,
  inspirationPosition: "bottom-right",
  numbering: "continuous",
  startNumber: 1
};

/** Faixas aceitas pelos controles; usadas também pelo validador. */
export const SETTING_RANGES = {
  pointCount: { min: LIMITS.minPointCount, max: LIMITS.maxPointCount },
  pointRadius: { min: 0.4, max: 3 },
  labelFontSize: { min: 2, max: 9 },
  guideWidth: { min: 0.1, max: 1.5 },
  margin: { min: 5, max: 30 },
  originalOpacity: { min: 0.05, max: 0.6 },
  inspirationSize: { min: 15, max: 70 },
  startNumber: { min: 0, max: 500 },
  cutMarginInset: { min: 3, max: 15 }
};

/** DPI oferecidos na exportação PNG. */
export const EXPORT_DPI = [150, 300];

export const MODES = {
  SVG: "svg",
  RASTER: "raster",
  MANUAL: "manual"
};

export const STEPS = [
  { id: "upload", label: "Enviar" },
  { id: "mode", label: "Modo" },
  { id: "select", label: "Selecionar" },
  { id: "edit", label: "Editar" },
  { id: "points", label: "Pontos" },
  { id: "review", label: "Revisar" },
  { id: "export", label: "Exportar" }
];

export const SVG_NS = "http://www.w3.org/2000/svg";
export const XLINK_NS = "http://www.w3.org/1999/xlink";
