/* Educa4Good - Jogo da memoria (client-side, sem dependencias).
   As imagens e palavras escolhidas ficam no navegador e nao sao enviadas. */
(function () {
  "use strict";

  var MAX_ITEMS = 5;
  var MAX_FILE_SIZE = 8 * 1024 * 1024;
  var DEFAULT_WORDS = ["SOL", "LUA", "CASA", "FLOR", "LIVRO"];

  var dom = {};
  var state = {
    images: [],
    generated: []
  };

  function byId(id) {
    return document.getElementById(id);
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

  function mode() {
    var checked = document.querySelector('input[name="mg-mode"]:checked');
    return checked ? checked.value : "words";
  }

  function cleanFileName(name) {
    return String(name || "Imagem")
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 32) || "Imagem";
  }

  function rawWords() {
    return String(dom.words.value || "")
      .replace(/\r/g, "\n")
      .split(/[\n,;]+/)
      .map(function (item) { return item.replace(/\s+/g, " ").trim(); })
      .filter(Boolean);
  }

  function updateCounter() {
    var count = mode() === "images" ? state.images.length : rawWords().length;
    dom.itemCount.textContent = String(Math.min(count, MAX_ITEMS));
    dom.itemLimit.textContent = String(MAX_ITEMS);
    dom.counter.classList.toggle("is-error", count > MAX_ITEMS);
  }

  function getConfig() {
    return {
      title: (dom.title.value || "Jogo da memória").trim(),
      child: dom.child.value.trim(),
      date: dom.date.value.trim(),
      klass: dom.klass.value.trim(),
      shuffle: dom.shuffle.checked,
      showPairNumbers: dom.pairNumbers.checked
    };
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

  function shuffle(items) {
    var copy = items.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function parseWords() {
    var entries = rawWords();
    var errors = [];
    var seen = new Set();
    var items = [];

    if (entries.length > MAX_ITEMS) {
      errors.push("Use no máximo " + MAX_ITEMS + " palavras. Você informou " + entries.length + ".");
    }

    entries.slice(0, MAX_ITEMS).forEach(function (entry) {
      var label = entry.toLocaleUpperCase("pt-BR");
      if (label.length > 28) {
        errors.push("\"" + entry + "\" é longa demais. Use até 28 caracteres.");
        return;
      }
      var key = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (seen.has(key)) {
        errors.push("A palavra \"" + entry + "\" aparece repetida.");
        return;
      }
      seen.add(key);
      items.push({
        type: "word",
        label: label
      });
    });

    if (!items.length) {
      errors.push("Digite pelo menos uma palavra para gerar as cartas.");
    }

    return { items: items, errors: errors };
  }

  function parseImages() {
    var errors = [];
    if (!state.images.length) {
      errors.push("Escolha pelo menos uma imagem para gerar as cartas.");
    }
    if (state.images.length > MAX_ITEMS) {
      errors.push("Use no máximo " + MAX_ITEMS + " imagens. Você informou " + state.images.length + ".");
    }
    return {
      items: state.images.slice(0, MAX_ITEMS).map(function (image) {
        return {
          type: "image",
          label: image.label,
          dataUrl: image.dataUrl
        };
      }),
      errors: errors
    };
  }

  function makePairs(items, config) {
    var cards = [];
    items.forEach(function (item, index) {
      cards.push(Object.assign({}, item, { pair: index + 1, copy: "A" }));
      cards.push(Object.assign({}, item, { pair: index + 1, copy: "B" }));
    });
    return config.shuffle ? shuffle(cards) : cards;
  }

  function cardHtml(card, config) {
    var pair = config.showPairNumbers ? '<span class="mg-card__pair">' + card.pair + "</span>" : "";
    if (card.type === "image") {
      return '<article class="mg-card mg-card--image">' +
        pair +
        '<img class="mg-card__image" src="' + card.dataUrl + '" alt="' + escapeHtml(card.label) + '">' +
        '<span class="mg-card__caption">' + escapeHtml(card.label) + "</span>" +
        "</article>";
    }
    return '<article class="mg-card mg-card--word">' +
      pair +
      '<strong class="mg-card__word">' + escapeHtml(card.label) + "</strong>" +
      "</article>";
  }

  function renderCards() {
    var config = getConfig();
    dom.pageTitle.textContent = config.title || "Jogo da memória";
    dom.meta.innerHTML = metaHtml(config);

    if (!state.generated.length) {
      dom.cards.style.setProperty("--mg-card-rows", "1");
      dom.cards.innerHTML = '<div class="mg__placeholder"><div class="mg__mini-cards" aria-hidden="true"><span>1A</span><span>1B</span><span>2A</span><span>2B</span><span>3A</span><span>3B</span></div><p>Escolha imagens ou palavras e gere as cartas.</p></div>';
      dom.print.disabled = true;
      dom.newOrder.disabled = true;
      return;
    }

    dom.cards.style.setProperty("--mg-card-rows", String(Math.ceil(state.generated.length / 2)));
    dom.cards.innerHTML = state.generated.map(function (card) {
      return cardHtml(card, config);
    }).join("");
    dom.footer.textContent = "Recorte nas linhas pontilhadas. Embaralhe as cartas viradas para baixo e encontre os pares.";
    dom.print.disabled = false;
    dom.newOrder.disabled = false;
  }

  function generateCards() {
    updateCounter();
    var selectedMode = mode();
    var parsed = selectedMode === "images" ? parseImages() : parseWords();
    var config = getConfig();

    if (parsed.errors.length) {
      state.generated = [];
      setMessage(parsed.errors.join(" "), "error");
      setStatus("Revise os itens para gerar a folha.", "error");
      renderCards();
      return false;
    }

    state.generated = makePairs(parsed.items, config);
    renderCards();
    setMessage("Tudo pronto: " + parsed.items.length + " par(es), " + state.generated.length + " cartas.", "ok");
    setStatus("Folha A4 gerada com " + state.generated.length + " cartas para recortar.", "ok");
    return true;
  }

  function readImageFiles(files) {
    var selected = Array.prototype.slice.call(files || []);
    var errors = [];

    if (selected.length > MAX_ITEMS) {
      errors.push("Use no máximo " + MAX_ITEMS + " imagens. Carreguei as " + MAX_ITEMS + " primeiras.");
      selected = selected.slice(0, MAX_ITEMS);
    }

    if (!selected.length) {
      state.images = [];
      updateThumbs();
      updateCounter();
      return;
    }

    var pending = selected.length;
    var loaded = [];

    selected.forEach(function (file, index) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(file.name + " é grande demais. Use imagens de até 8 MB.");
        pending--;
        if (!pending) finish();
        return;
      }
      if (file.type && file.type.indexOf("image/") !== 0) {
        errors.push(file.name + " não parece ser uma imagem.");
        pending--;
        if (!pending) finish();
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        loaded[index] = {
          label: cleanFileName(file.name),
          dataUrl: String(reader.result || "")
        };
        pending--;
        if (!pending) finish();
      };
      reader.onerror = function () {
        errors.push("Não foi possível ler " + file.name + ".");
        pending--;
        if (!pending) finish();
      };
      reader.readAsDataURL(file);
    });

    function finish() {
      state.images = loaded.filter(Boolean);
      updateThumbs();
      updateCounter();
      if (errors.length) {
        setMessage(errors.join(" "), "error");
      } else {
        setMessage("Imagens carregadas. Clique em Gerar jogo.", "ok");
      }
      if (state.images.length) generateCards();
    }
  }

  function updateThumbs() {
    if (!state.images.length) {
      dom.thumbs.innerHTML = "";
      return;
    }
    dom.thumbs.innerHTML = state.images.map(function (image) {
      return '<img src="' + image.dataUrl + '" alt="' + escapeHtml(image.label) + '">';
    }).join("");
  }

  function setMode(value) {
    dom.upload.hidden = value !== "images";
    dom.wordsPanel.hidden = value !== "words";
    updateCounter();
    if (value === "words") {
      generateCards();
    } else {
      state.generated = [];
      renderCards();
      setStatus("Escolha até 5 imagens para gerar a folha.", "");
      setMessage("", "");
    }
  }

  function printCards() {
    if (!state.generated.length && !generateCards()) return;
    renderCards();
    window.setTimeout(function () { window.print(); }, 40);
  }

  function bindEvents() {
    document.querySelectorAll('input[name="mg-mode"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (radio.checked) setMode(radio.value);
      });
    });

    dom.file.addEventListener("change", function () {
      readImageFiles(dom.file.files);
    });
    dom.words.addEventListener("input", updateCounter);
    dom.generate.addEventListener("click", generateCards);
    dom.newOrder.addEventListener("click", generateCards);
    dom.print.addEventListener("click", printCards);

    [dom.title, dom.child, dom.date, dom.klass, dom.shuffle, dom.pairNumbers].forEach(function (element) {
      element.addEventListener("input", renderCards);
      element.addEventListener("change", renderCards);
    });
  }

  function init() {
    if (!byId("jogo-da-memoria")) return;

    dom.upload = byId("mg-upload-panel");
    dom.wordsPanel = byId("mg-words-panel");
    dom.file = byId("mg-file");
    dom.words = byId("mg-words");
    dom.thumbs = byId("mg-thumbs");
    dom.itemCount = byId("mg-item-count");
    dom.itemLimit = byId("mg-item-limit");
    dom.counter = byId("mg-counter");
    dom.message = byId("mg-message");
    dom.status = byId("mg-status");
    dom.title = byId("mg-title");
    dom.child = byId("mg-child");
    dom.date = byId("mg-date");
    dom.klass = byId("mg-class");
    dom.shuffle = byId("mg-shuffle");
    dom.pairNumbers = byId("mg-pair-numbers");
    dom.generate = byId("mg-generate");
    dom.newOrder = byId("mg-new-order");
    dom.print = byId("mg-print");
    dom.pageTitle = byId("mg-page-title");
    dom.meta = byId("mg-meta");
    dom.cards = byId("mg-cards");
    dom.footer = byId("mg-footer");

    dom.words.value = DEFAULT_WORDS.join("\n");
    updateCounter();
    bindEvents();
    setMode(mode());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
