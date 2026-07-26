/* Educa4Good - Caca-palavras (client-side, sem dependencias).
   As palavras digitadas ficam no navegador e nao sao enviadas a servidores. */
(function (scope) {
  "use strict";

  var MAX_WORDS = 10;
  var MIN_GRID = 10;
  var MAX_GRID = 18;
  var FILL_LETTERS = "AAAAAAAAAEEEEEEEEEOOOOOOIIIIISSSSRRRRNNNNTTTTCCCLLLLDDDDMMMMUUUUPPPVGBFQHJXZ";

  var PRESETS = {
    natureza: {
      title: "Caça-palavras da natureza",
      words: ["ARVORE", "RIO", "FLOR", "SOL", "CHUVA", "TERRA", "SEMENTE", "FOLHA"]
    },
    leitura: {
      title: "Caça-palavras da leitura",
      words: ["LIVRO", "CONTO", "LETRA", "RIMA", "FRASE", "POEMA", "TEXTO", "PAGINA"]
    },
    gentileza: {
      title: "Caça-palavras da convivência",
      words: ["AMIZADE", "RESPEITO", "CUIDADO", "ESCUTA", "AJUDA", "SORRISO", "PARTILHA"]
    }
  };

  var DIRECTIONS = {
    facil: [
      { dr: 0, dc: 1, name: "horizontal para a direita" },
      { dr: 1, dc: 0, name: "vertical para baixo" }
    ],
    medio: [
      { dr: 0, dc: 1, name: "horizontal para a direita" },
      { dr: 1, dc: 0, name: "vertical para baixo" },
      { dr: 1, dc: 1, name: "diagonal para baixo" },
      { dr: 1, dc: -1, name: "diagonal para baixo" }
    ],
    desafio: [
      { dr: 0, dc: 1, name: "horizontal para a direita" },
      { dr: 0, dc: -1, name: "horizontal invertida" },
      { dr: 1, dc: 0, name: "vertical para baixo" },
      { dr: -1, dc: 0, name: "vertical invertida" },
      { dr: 1, dc: 1, name: "diagonal para baixo" },
      { dr: 1, dc: -1, name: "diagonal para baixo" },
      { dr: -1, dc: 1, name: "diagonal invertida" },
      { dr: -1, dc: -1, name: "diagonal invertida" }
    ]
  };

  var dom = {};
  var state = {
    generated: null
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setMessage(text, type) {
    if (!dom.message) return;
    dom.message.textContent = text || "";
    dom.message.classList.toggle("is-error", type === "error");
    dom.message.classList.toggle("is-ok", type === "ok");
  }

  function setStatus(text, type) {
    if (!dom.status) return;
    dom.status.textContent = text || "";
    dom.status.classList.toggle("is-error", type === "error");
    dom.status.classList.toggle("is-ok", type === "ok");
  }

  function normalizeWord(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function rawEntries() {
    return String(dom.words.value || "")
      .replace(/\r/g, "\n")
      .split(/[\n,;]+/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function updateCounter() {
    var count = rawEntries().length;
    dom.wordCount.textContent = String(Math.min(count, MAX_WORDS));
    dom.wordLimit.textContent = String(MAX_WORDS);
    dom.counter.classList.toggle("is-error", count > MAX_WORDS);
  }

  function parseWords() {
    var entries = rawEntries();
    var errors = [];
    var warnings = [];
    var seen = new Set();
    var words = [];

    if (entries.length > MAX_WORDS) {
      errors.push("Use no máximo " + MAX_WORDS + " palavras. Você informou " + entries.length + ".");
    }

    entries.slice(0, MAX_WORDS).forEach(function (entry) {
      var grid = normalizeWord(entry);
      if (!grid) {
        errors.push("A palavra \"" + entry + "\" não tem letras ou números suficientes.");
        return;
      }
      if (grid.length < 2) {
        errors.push("\"" + entry + "\" é curta demais. Use palavras com pelo menos 2 letras.");
        return;
      }
      if (grid.length > MAX_GRID) {
        errors.push("\"" + entry + "\" tem " + grid.length + " letras. O limite é " + MAX_GRID + ".");
        return;
      }
      if (seen.has(grid)) {
        warnings.push("Palavra repetida ignorada: " + grid + ".");
        return;
      }
      seen.add(grid);
      words.push({
        original: entry,
        grid: grid,
        label: grid
      });
    });

    if (!words.length) {
      errors.push("Digite pelo menos uma palavra para montar o caça-palavras.");
    }

    return {
      words: words,
      errors: errors,
      warnings: warnings
    };
  }

  function getConfig() {
    return {
      title: (dom.title.value || "Caça-palavras").trim(),
      level: DIRECTIONS[dom.level.value] ? dom.level.value : "medio",
      size: dom.size.value,
      child: dom.child.value.trim(),
      date: dom.date.value.trim(),
      klass: dom.klass.value.trim(),
      includeAnswer: dom.answer.checked,
      // Padrao visual do projeto, compartilhado por todos os geradores.
      theme: dom.theme ? dom.theme.value : "classico",
      colorMode: dom.colorMode ? dom.colorMode.value : "cor",
      cutMargin: dom.cutMargin ? dom.cutMargin.checked : false,
      cutInset: dom.cutInset ? Number(dom.cutInset.value) : 6,
      showSchool: dom.showSchool ? dom.showSchool.checked : true,
      schoolName: dom.schoolName ? dom.schoolName.value.trim() : "",
      teacherName: dom.teacher ? dom.teacher.value.trim() : "",
      year: dom.year ? dom.year.value.trim() : ""
    };
  }

  /* Cabecalho no padrao \BandaEscola + \CamposIdentificacao. O titulo fica
     no <h2> que ja existe na pagina, para o gabarito poder acrescentar o
     sufixo "- gabarito". */
  function headerHtml(config) {
    if (!scope.Educa4GoodSheet) return metaHtml(config);
    return scope.Educa4GoodSheet.headerHtml({
      showSchool: config.showSchool,
      schoolName: config.schoolName,
      showFields: true,
      className: config.klass,
      teacherName: config.teacherName,
      year: config.year
    });
  }

  /* Publica a paleta do layout nas duas folhas e liga a margem de recorte. */
  function applyTheme(config) {
    if (!scope.Educa4GoodSheet) return;
    var resolved = scope.Educa4GoodSheet.resolve(config.theme, config.colorMode);
    var pages = [dom.activityPage, dom.answerPage];
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      if (!page) continue;
      page.classList.add("e4g-sheet");
      scope.Educa4GoodSheet.applyCssVariables(page, resolved);
      page.classList.toggle("has-cut-margin", !!config.cutMargin);
      page.style.setProperty("--e4g-cut-inset", config.cutInset + "mm");
    }
  }

  function directionText(level) {
    if (level === "facil") {
      return "Encontre as palavras na horizontal e na vertical.";
    }
    if (level === "desafio") {
      return "Encontre as palavras em todas as direções: horizontal, vertical, diagonal e invertida.";
    }
    return "Encontre as palavras na horizontal, vertical e diagonal.";
  }

  function suggestSize(words) {
    var total = words.reduce(function (sum, word) { return sum + word.grid.length; }, 0);
    var longest = words.reduce(function (max, word) { return Math.max(max, word.grid.length); }, 0);
    var size = Math.ceil(Math.sqrt(total * 2.2 + words.length * 5));
    size = Math.max(size, longest + 1, MIN_GRID);
    if (words.length >= 8) size = Math.max(size, 14);
    if (total >= 86) size = Math.max(size, 16);
    if (total >= 124) size = Math.max(size, 18);
    return clamp(size, MIN_GRID, MAX_GRID);
  }

  function emptyGrid(size) {
    return Array.from({ length: size * size }, function () { return ""; });
  }

  function gridIndex(row, col, size) {
    return row * size + col;
  }

  function fits(row, col, word, direction, size) {
    var endRow = row + direction.dr * (word.length - 1);
    var endCol = col + direction.dc * (word.length - 1);
    return endRow >= 0 && endRow < size && endCol >= 0 && endCol < size;
  }

  function placementChoices(grid, size, word, directions) {
    var choices = [];
    directions.forEach(function (direction) {
      for (var row = 0; row < size; row++) {
        for (var col = 0; col < size; col++) {
          if (!fits(row, col, word.grid, direction, size)) continue;
          var ok = true;
          for (var i = 0; i < word.grid.length; i++) {
            var r = row + direction.dr * i;
            var c = col + direction.dc * i;
            var current = grid[gridIndex(r, c, size)];
            if (current && current !== word.grid[i]) {
              ok = false;
              break;
            }
          }
          if (ok) {
            choices.push({
              row: row,
              col: col,
              direction: direction
            });
          }
        }
      }
    });
    return choices;
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function placeWord(grid, size, word, choice) {
    for (var i = 0; i < word.grid.length; i++) {
      var row = choice.row + choice.direction.dr * i;
      var col = choice.col + choice.direction.dc * i;
      grid[gridIndex(row, col, size)] = word.grid[i];
    }
    return {
      word: word,
      row: choice.row,
      col: choice.col,
      dr: choice.direction.dr,
      dc: choice.direction.dc,
      directionName: choice.direction.name
    };
  }

  function attemptPlacement(words, size, level) {
    var grid = emptyGrid(size);
    var placements = [];
    var directions = DIRECTIONS[level] || DIRECTIONS.medio;
    var ordered = words.slice().sort(function (a, b) {
      return b.grid.length - a.grid.length || a.grid.localeCompare(b.grid);
    });

    for (var i = 0; i < ordered.length; i++) {
      var choices = placementChoices(grid, size, ordered[i], directions);
      if (!choices.length) return null;
      placements.push(placeWord(grid, size, ordered[i], randomItem(choices)));
    }

    for (var cell = 0; cell < grid.length; cell++) {
      if (!grid[cell]) grid[cell] = FILL_LETTERS[Math.floor(Math.random() * FILL_LETTERS.length)];
    }

    placements.sort(function (a, b) {
      return words.indexOf(a.word) - words.indexOf(b.word);
    });

    return {
      size: size,
      grid: grid,
      placements: placements
    };
  }

  function buildPuzzle(words, config) {
    var fixedSize = config.size === "auto" ? 0 : parseInt(config.size, 10);
    var startSize = fixedSize || suggestSize(words);
    var endSize = fixedSize || MAX_GRID;
    var longest = words.reduce(function (max, word) { return Math.max(max, word.grid.length); }, 0);

    if (fixedSize && longest > fixedSize) {
      throw new Error("A maior palavra tem " + longest + " letras. Escolha uma grade maior ou use tamanho automático.");
    }

    for (var size = startSize; size <= endSize; size++) {
      for (var attempt = 0; attempt < 90; attempt++) {
        var generated = attemptPlacement(words, size, config.level);
        if (generated) {
          generated.words = words;
          return generated;
        }
      }
    }

    throw new Error("Não consegui encaixar todas as palavras nessa configuração. Tente uma grade maior ou um nível com mais direções.");
  }

  function hitCells(generated) {
    var hits = new Set();
    generated.placements.forEach(function (placement) {
      for (var i = 0; i < placement.word.grid.length; i++) {
        var row = placement.row + placement.dr * i;
        var col = placement.col + placement.dc * i;
        hits.add(gridIndex(row, col, generated.size));
      }
    });
    return hits;
  }

  function gridHtml(generated, answer) {
    var hits = answer ? hitCells(generated) : new Set();
    var html = '<div class="ws-grid' + (answer ? " ws-grid--answer" : "") + '" style="--ws-size:' + generated.size + '" aria-label="Grade do caça-palavras">';
    generated.grid.forEach(function (letter, index) {
      html += '<span' + (hits.has(index) ? ' class="is-hit"' : "") + ">" + escapeHtml(letter) + "</span>";
    });
    html += "</div>";
    return html;
  }

  function wordBankHtml(words) {
    return '<h3>Banco de palavras</h3><ol class="ws__word-list">' +
      words.map(function (word) { return "<li>" + escapeHtml(word.label) + "</li>"; }).join("") +
      "</ol>";
  }

  function metaHtml(config) {
    return [
      "Nome: " + (config.child || "____________________________"),
      "Data: " + (config.date || "____/____/______"),
      "Turma: " + (config.klass || "____________")
    ].map(function (item) {
      return "<span>" + escapeHtml(item) + "</span>";
    }).join("");
  }

  function answerListHtml(generated) {
    return '<ol class="ws__answer-list">' + generated.placements.map(function (placement) {
      var start = "linha " + (placement.row + 1) + ", coluna " + (placement.col + 1);
      return "<li><strong>" + escapeHtml(placement.word.label) + ":</strong> " +
        escapeHtml(start + ", " + placement.directionName) + ".</li>";
    }).join("") + "</ol>";
  }

  function footerText(generated) {
    return "Educa4Good - atividade A4 pronta para imprimir. Palavras sem acentos na grade para facilitar a leitura.";
  }

  function renderGenerated() {
    if (!state.generated) return;
    var config = getConfig();
    var generated = state.generated;
    var title = config.title || "Caça-palavras";
    var instruction = directionText(config.level);

    applyTheme(config);
    dom.activityMeta.classList.add("e4g-host");
    dom.answerMeta.classList.add("e4g-host");
    dom.activityMeta.innerHTML = headerHtml(config);
    dom.answerMeta.innerHTML = headerHtml(config);
    dom.activityTitle.textContent = title;
    dom.answerTitle.textContent = title + " - gabarito";
    dom.activityInstruction.textContent = instruction;
    dom.answerInstruction.textContent = "Confira as posições das palavras destacadas.";
    dom.activityGrid.innerHTML = gridHtml(generated, false);
    dom.answerGrid.innerHTML = gridHtml(generated, true);
    dom.wordBank.innerHTML = wordBankHtml(generated.words);
    dom.answerList.innerHTML = answerListHtml(generated);
    dom.activityFooter.textContent = footerText(generated);
    dom.answerFooter.textContent = "Gabarito do professor - " + generated.size + " x " + generated.size + ".";
    dom.answerPage.hidden = !config.includeAnswer;
  }

  function generatePuzzle() {
    updateCounter();
    var parsed = parseWords();
    var config = getConfig();

    if (parsed.errors.length) {
      state.generated = null;
      setMessage(parsed.errors.join(" "), "error");
      setStatus("Revise as palavras para gerar a atividade.", "error");
      dom.print.disabled = true;
      dom.shuffle.disabled = true;
      return false;
    }

    try {
      state.generated = buildPuzzle(parsed.words, config);
      renderGenerated();
      var note = parsed.warnings.length ? " " + parsed.warnings.join(" ") : "";
      setMessage("Tudo pronto: " + parsed.words.length + " palavra(s) na lista." + note, "ok");
      setStatus("Caça-palavras gerado em grade " + state.generated.size + " x " + state.generated.size + ".", "ok");
      dom.print.disabled = false;
      dom.shuffle.disabled = false;
      return true;
    } catch (error) {
      state.generated = null;
      setMessage(error.message || "Não foi possível gerar o caça-palavras.", "error");
      setStatus("Ajuste o tamanho da grade ou o nível de dificuldade.", "error");
      dom.print.disabled = true;
      dom.shuffle.disabled = true;
      return false;
    }
  }

  function printPuzzle() {
    if (!state.generated && !generatePuzzle()) return;
    renderGenerated();
    window.setTimeout(function () { window.print(); }, 40);
  }

  function applyPreset(name) {
    var preset = PRESETS[name];
    if (!preset) return;
    dom.title.value = preset.title;
    dom.words.value = preset.words.join("\n");
    dom.size.value = "auto";
    dom.level.value = name === "gentileza" ? "medio" : "facil";
    updateCounter();
    generatePuzzle();
  }

  function bindEvents() {
    dom.words.addEventListener("input", updateCounter);
    dom.generate.addEventListener("click", generatePuzzle);
    dom.shuffle.addEventListener("click", generatePuzzle);
    dom.print.addEventListener("click", printPuzzle);

    [dom.title, dom.child, dom.date, dom.klass, dom.answer,
     dom.theme, dom.colorMode, dom.cutMargin, dom.cutInset,
     dom.showSchool, dom.schoolName, dom.teacher, dom.year
    ].forEach(function (element) {
      if (!element) return;
      element.addEventListener("input", renderGenerated);
      element.addEventListener("change", renderGenerated);
    });

    document.querySelectorAll("[data-ws-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyPreset(button.getAttribute("data-ws-preset"));
      });
    });
  }

  function init() {
    if (!byId("caca-palavras")) return;

    dom.words = byId("ws-words");
    dom.wordCount = byId("ws-word-count");
    dom.wordLimit = byId("ws-word-limit");
    dom.counter = byId("ws-counter");
    dom.message = byId("ws-message");
    dom.status = byId("ws-status");
    dom.title = byId("ws-title");
    dom.level = byId("ws-level");
    dom.size = byId("ws-size");
    dom.child = byId("ws-child");
    dom.date = byId("ws-date");
    dom.klass = byId("ws-class");
    dom.answer = byId("ws-answer");
    dom.generate = byId("ws-generate");
    dom.shuffle = byId("ws-shuffle");
    dom.print = byId("ws-print");
    dom.theme = byId("ws-theme");
    dom.colorMode = byId("ws-color-mode");
    dom.cutMargin = byId("ws-cut-margin");
    dom.cutInset = byId("ws-cut-inset");
    dom.showSchool = byId("ws-show-school");
    dom.schoolName = byId("ws-school-name");
    dom.teacher = byId("ws-teacher");
    dom.year = byId("ws-year");
    dom.activityPage = byId("ws-activity-page");
    dom.answerPage = byId("ws-answer-page");
    dom.activityMeta = byId("ws-activity-meta");
    dom.answerMeta = byId("ws-answer-meta");
    dom.activityTitle = byId("ws-activity-title");
    dom.answerTitle = byId("ws-answer-title");
    dom.activityInstruction = byId("ws-activity-instruction");
    dom.answerInstruction = byId("ws-answer-instruction");
    dom.activityGrid = byId("ws-activity-grid");
    dom.answerGrid = byId("ws-answer-grid");
    dom.wordBank = byId("ws-word-bank");
    dom.answerList = byId("ws-answer-list");
    dom.activityFooter = byId("ws-activity-footer");
    dom.answerFooter = byId("ws-answer-footer");
    dom.answerPage = byId("ws-answer-page");

    updateCounter();
    bindEvents();
    generatePuzzle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof self !== "undefined" ? self : this);
