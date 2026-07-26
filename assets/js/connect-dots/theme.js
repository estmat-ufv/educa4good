/* Educa4Good — Ligar os Pontos
   Temas visuais da folha.

   Espelha o sistema de temas do LaTeX (`pacotes/educa4good_temas.sty`) para
   que a folha gerada no navegador saia com a mesma cara dos PDFs do projeto.
   As cores abaixo são as MESMAS do `.sty`, já resolvidas: onde o LaTeX escreve
   `EditorialAzul!7`, aqui está a mistura com branco correspondente.

   Modo cor/preto e branco segue a opção `[pretoebranco]` do pacote base: no
   modo P&B tudo vira preto e cinza, independentemente das cores escolhidas.
   É modo de IMPRESSÃO, não edição de paleta. */

/** Cores cruas, iguais às do educa4good_temas.sty. */
const RAW = {
  educaAzul: "#2b6ca3",
  educaLaranja: "#e88b33",
  editorialAzul: "#185896",
  editorialDourado: "#f2b72a",
  sofTurquesa: "#2a8e9f",
  sofVerde: "#568a3e",
  sofVerdeClaro: "#f0f8e8",
  cadAzul: "#195291",
  cadLaranja: "#f18525",
  cadLinha: "#c9e1f0",
  cadMargem: "#f09499"
};

/**
 * @typedef {Object} ThemePalette
 * @property {string} title cor do título
 * @property {string} rule régua de destaque sob o título
 * @property {string} fieldLabel rótulo dos campos de identificação
 * @property {string} fieldLine linha para preencher
 * @property {string} dot cor dos pontos
 * @property {string} label cor dos números
 * @property {string} guide linha-guia entre os pontos
 * @property {string} brand assinatura no rodapé
 * @property {string} tint fundo suave do cabeçalho
 * @property {string} [ruled] linhas da folha pautada (tema caderno)
 * @property {string} [marginLine] margem vertical (tema caderno)
 */

export const THEMES = {
  classico: {
    id: "classico",
    name: "Clássico",
    hint: "O visual original do projeto.",
    chrome: "plain",
    palette: {
      title: RAW.educaAzul,
      rule: RAW.educaLaranja,
      fieldLabel: "#51667a",
      fieldLine: "#b7cadb",
      dot: "#1f5180",
      label: "#1f5180",
      guide: "#c2d1de",
      brand: "#8aa0b4",
      tint: "#eef3f8"
    }
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    hint: "Azul e dourado, régua fina sob o título.",
    chrome: "rule",
    palette: {
      title: RAW.editorialAzul,
      rule: RAW.editorialDourado,
      fieldLabel: "#5f6871",
      fieldLine: "#b7bbbf",
      dot: RAW.editorialAzul,
      label: RAW.editorialAzul,
      guide: "#cfd3d7",
      brand: "#8d959d",
      tint: "#eff3f8"
    }
  },
  infantil: {
    id: "infantil",
    name: "Infantil",
    hint: "Verde e turquesa, moldura arredondada.",
    chrome: "frame",
    palette: {
      title: RAW.sofTurquesa,
      rule: RAW.sofVerde,
      fieldLabel: "#4d6b52",
      fieldLine: "#bcdaaf",
      dot: RAW.sofTurquesa,
      label: RAW.sofTurquesa,
      guide: "#cfe6c4",
      brand: "#89a883",
      tint: RAW.sofVerdeClaro
    }
  },
  caderno: {
    id: "caderno",
    name: "Caderno escolar",
    hint: "Folha pautada, margem e furos.",
    chrome: "ruled",
    palette: {
      title: RAW.cadAzul,
      rule: RAW.cadLaranja,
      fieldLabel: "#3f5a7a",
      fieldLine: RAW.cadLinha,
      dot: RAW.cadAzul,
      label: RAW.cadAzul,
      guide: "#bcd6e8",
      brand: "#7f9bb5",
      tint: "#f1f7fb",
      ruled: RAW.cadLinha,
      marginLine: RAW.cadMargem
    }
  }
};

export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = "classico";

/** Paleta em preto e branco, equivalente ao `[pretoebranco]` do LaTeX. */
const BW_PALETTE = {
  title: "#000000",
  rule: "#000000",
  fieldLabel: "#000000",
  fieldLine: "#8c8c8c",
  dot: "#000000",
  label: "#000000",
  guide: "#a6a6a6",
  brand: "#6b6b6b",
  tint: "#f2f2f2",
  ruled: "#c6c6c6",
  marginLine: "#b9b9b9"
};

/**
 * Paleta efetiva da folha.
 *
 * @param {string} themeId
 * @param {"cor"|"pb"} colorMode
 * @param {{dot?: string, label?: string, guide?: string}} [overrides]
 *   cores escolhidas à mão pelo usuário; ignoradas em preto e branco
 * @returns {{theme: object, palette: ThemePalette, chrome: string, bw: boolean}}
 */
export function resolveTheme(themeId, colorMode = "cor", overrides = {}) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME];
  const bw = colorMode === "pb";

  if (bw) {
    return { theme, palette: { ...BW_PALETTE }, chrome: theme.chrome, bw: true };
  }

  const palette = { ...theme.palette };
  for (const key of ["dot", "label", "guide"]) {
    if (overrides[key]) palette[key] = overrides[key];
  }
  return { theme, palette, chrome: theme.chrome, bw: false };
}

/** Geometria da folha pautada do tema caderno, em milímetros. */
export const RULED_SHEET = {
  firstLine: 20.5,
  lineStep: 7,
  leftInset: 14,
  rightInset: 8,
  marginX: 21.5,
  marginTop: 10,
  marginBottom: 10,
  holeX: 11.2,
  holeFirstY: 30,
  holeStep: 31.5,
  holeRadius: 0.85
};

/** Margem tracejada de recorte. */
export const CUT_MARGIN = {
  defaultInset: 6,
  minInset: 3,
  maxInset: 15,
  /** Folga entre o tracejado e o conteúdo, para a tesoura não cortar nada. */
  clearance: 4,
  dash: [3, 2.2],
  width: 0.35
};
