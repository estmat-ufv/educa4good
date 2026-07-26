/* Educa4Good — padrão visual das folhas de atividade.
   =====================================================================
   Módulo COMPARTILHADO por todos os geradores do site. Script clássico de
   propósito: os geradores antigos (caça-palavras, jogo da memória, colorir
   por números, encontre as diferenças, complete o desenho) são IIFE em ES5 e
   carregam por <script src>. Quem já usa ES Modules importa o mesmo padrão de
   `connect-dots/theme.js`, que espelha estas cores.

   O que este arquivo garante, para QUALQUER atividade:

     1. os quatro layouts do projeto — Clássico, Editorial, Infantil e
        Caderno escolar — com as cores de `pacotes/educa4good_temas.sty`;
     2. impressão colorida ou preto e branco, equivalente à opção
        `[pretoebranco]` do `pacotes/educa4good.sty`;
     3. o cabeçalho no padrão `\BandaEscola` + `\CamposIdentificacao`:
        escola em linha própria, Nome sozinho, Data + Turma na mesma linha,
        Professor(a) + Ano na mesma linha;
     4. margem tracejada para a criança recortar e colar no caderno.

   Uso típico num gerador em HTML/CSS:

     var tema = Educa4GoodSheet.resolve(config.tema, config.modoCor);
     Educa4GoodSheet.applyCssVariables(elementoDaFolha, tema);
     folha.innerHTML = Educa4GoodSheet.headerHtml(config) + conteudo;

   Num gerador em canvas, use `tema.palette` para escolher as cores antes de
   desenhar, e `Educa4GoodSheet.cutMarginRect()` para o retângulo de recorte.
   ===================================================================== */

(function (scope) {
  "use strict";

  /* Cores cruas, iguais às de pacotes/educa4good_temas.sty. */
  var THEMES = {
    classico: {
      id: "classico", name: "Clássico",
      hint: "O visual original do projeto.",
      chrome: "plain",
      palette: {
        title: "#2b6ca3", rule: "#e88b33", fieldLabel: "#51667a",
        fieldLine: "#b7cadb", ink: "#1f5180", accent: "#e88b33",
        brand: "#8aa0b4", tint: "#eef3f8", line: "#dde7f0"
      }
    },
    editorial: {
      id: "editorial", name: "Editorial",
      hint: "Azul e dourado, régua fina sob o título.",
      chrome: "rule",
      palette: {
        title: "#185896", rule: "#f2b72a", fieldLabel: "#5f6871",
        fieldLine: "#b7bbbf", ink: "#185896", accent: "#f2b72a",
        brand: "#8d959d", tint: "#eff3f8", line: "#d6dade"
      }
    },
    infantil: {
      id: "infantil", name: "Infantil",
      hint: "Verde e turquesa, moldura arredondada.",
      chrome: "frame",
      palette: {
        title: "#2a8e9f", rule: "#568a3e", fieldLabel: "#4d6b52",
        fieldLine: "#bcdaaf", ink: "#2a8e9f", accent: "#ef932d",
        brand: "#89a883", tint: "#f0f8e8", line: "#cfe6c4"
      }
    },
    caderno: {
      id: "caderno", name: "Caderno escolar",
      hint: "Folha pautada, margem e furos.",
      chrome: "ruled",
      palette: {
        title: "#195291", rule: "#f18525", fieldLabel: "#3f5a7a",
        fieldLine: "#c9e1f0", ink: "#195291", accent: "#f18525",
        brand: "#7f9bb5", tint: "#f1f7fb", line: "#c9e1f0",
        ruled: "#c9e1f0", marginLine: "#f09499"
      }
    }
  };

  var BW = {
    title: "#000000", rule: "#000000", fieldLabel: "#000000",
    fieldLine: "#8c8c8c", ink: "#000000", accent: "#000000",
    brand: "#6b6b6b", tint: "#f2f2f2", line: "#bdbdbd",
    ruled: "#c6c6c6", marginLine: "#b9b9b9"
  };

  var CUT = { defaultInset: 6, minInset: 3, maxInset: 15, clearance: 4, dash: "3 2.2", width: 0.35 };

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /**
   * Paleta efetiva. Em preto e branco tudo vira preto e cinza — é modo de
   * IMPRESSÃO, não edição de paleta.
   */
  function resolve(themeId, colorMode) {
    var theme = THEMES[themeId] || THEMES.classico;
    var bw = colorMode === "pb";
    var palette = {};
    var source = bw ? BW : theme.palette;
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) palette[key] = source[key];
    }
    return { theme: theme, palette: palette, chrome: theme.chrome, bw: bw };
  }

  /**
   * A paleta como texto de `style`, para geradores que montam a folha por
   * concatenação de HTML (jogo da memória) em vez de manipular elementos.
   */
  function cssVariablesText(resolved, extra) {
    var p = resolved.palette;
    var out = [];
    for (var key in p) {
      if (Object.prototype.hasOwnProperty.call(p, key)) out.push("--e4g-" + key + ":" + p[key]);
    }
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out.push(k + ":" + extra[k]);
      }
    }
    return out.join(";");
  }

  /** Classes e atributos da folha, para o mesmo caso de concatenação. */
  function sheetAttrs(resolved, cutOn) {
    return 'class="e4g-sheet' + (cutOn ? " has-cut-margin" : "") + '"' +
      ' data-e4g-theme="' + resolved.theme.id + '"' +
      ' data-e4g-mode="' + (resolved.bw ? "pb" : "cor") + '"';
  }

  /** Publica a paleta como custom properties, para o CSS do gerador usar. */
  function applyCssVariables(element, resolved) {
    if (!element) return;
    var p = resolved.palette;
    for (var key in p) {
      if (Object.prototype.hasOwnProperty.call(p, key)) {
        element.style.setProperty("--e4g-" + key, p[key]);
      }
    }
    element.setAttribute("data-e4g-theme", resolved.theme.id);
    element.setAttribute("data-e4g-mode", resolved.bw ? "pb" : "cor");
  }

  /**
   * Cabeçalho no padrão do projeto. Campo preenchido sai impresso; campo
   * vazio sai como linha para preencher à mão — regra do `\educa@campo`.
   *
   * @param {object} c escola, turma, professor, ano, titulo e os liga/desliga
   */
  function headerHtml(c) {
    c = c || {};
    var out = [];
    var campo = function (rotulo, valor) {
      return '<span class="e4g-field"><b>' + escapeHtml(rotulo) + "</b>" +
        (valor ? '<span class="e4g-value">' + escapeHtml(valor) + "</span>"
               : '<span class="e4g-blank"></span>') + "</span>";
    };

    if (c.showSchool !== false) {
      out.push('<div class="e4g-school">' +
        (c.schoolName ? escapeHtml(c.schoolName)
                      : '<span class="e4g-field"><b>Escola:</b><span class="e4g-blank"></span></span>') +
        "</div>");
    }

    if (c.showFields !== false) {
      var linhas = [];
      if (c.fieldName !== false) linhas.push('<div class="e4g-row">' + campo("Nome:", "") + "</div>");
      if (c.fieldDate !== false || c.fieldClass !== false) {
        linhas.push('<div class="e4g-row e4g-row--split">' +
          (c.fieldDate !== false
            ? '<span class="e4g-field"><b>Data:</b><span class="e4g-date">' +
              '<i></i>/<i></i>/<i class="is-wide"></i></span></span>' : "<span></span>") +
          (c.fieldClass !== false ? campo("Turma:", c.className) : "<span></span>") + "</div>");
      }
      if (c.fieldTeacher !== false || c.fieldYear !== false) {
        linhas.push('<div class="e4g-row e4g-row--split">' +
          (c.fieldTeacher !== false ? campo("Professor(a):", c.teacherName) : "<span></span>") +
          (c.fieldYear !== false ? campo("Ano:", c.year) : "<span></span>") + "</div>");
      }
      if (linhas.length) out.push('<div class="e4g-fields">' + linhas.join("") + "</div>");
    }

    if (c.title) out.push('<h2 class="e4g-title">' + escapeHtml(c.title) + "</h2>");
    return '<header class="e4g-header">' + out.join("") + "</header>";
  }

  /**
   * Retângulo de recorte em milímetros, para quem desenha a folha em SVG ou
   * canvas. Sem glifo de tesoura: depende de fonte instalada e a legenda perto
   * da borda cai na faixa que a impressora não imprime.
   */
  /* `inset || padrão` trocaria um 0 legítimo pelo padrão; o 0 tem de ser
     limitado ao mínimo, não ignorado. */
  function clampInset(inset) {
    var i = inset === undefined || inset === null || isNaN(inset) ? CUT.defaultInset : Number(inset);
    return Math.min(CUT.maxInset, Math.max(CUT.minInset, i));
  }

  function cutMarginRect(pageW, pageH, inset) {
    var i = clampInset(inset);
    return { x: i, y: i, w: pageW - i * 2, h: pageH - i * 2, dash: CUT.dash, width: CUT.width };
  }

  /** Margem mínima do conteúdo quando há recorte: a tesoura não pode cortar nada. */
  function contentMargin(margin, cutOn, inset) {
    if (!cutOn) return margin;
    return Math.max(margin, clampInset(inset) + CUT.clearance);
  }

  /** `<option>`s dos quatro layouts, para o seletor de cada gerador. */
  function themeOptionsHtml(selected) {
    var out = [];
    for (var id in THEMES) {
      if (!Object.prototype.hasOwnProperty.call(THEMES, id)) continue;
      out.push('<option value="' + id + '"' + (id === selected ? " selected" : "") + ">" +
        escapeHtml(THEMES[id].name) + "</option>");
    }
    return out.join("");
  }

  scope.Educa4GoodSheet = {
    THEMES: THEMES,
    THEME_IDS: Object.keys(THEMES),
    CUT: CUT,
    resolve: resolve,
    applyCssVariables: applyCssVariables,
    cssVariablesText: cssVariablesText,
    sheetAttrs: sheetAttrs,
    headerHtml: headerHtml,
    cutMarginRect: cutMarginRect,
    contentMargin: contentMargin,
    themeOptionsHtml: themeOptionsHtml,
    escapeHtml: escapeHtml
  };
})(typeof self !== "undefined" ? self : this);
