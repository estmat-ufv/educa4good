/* Educa4Good — Complete o Desenho (client-side, sem dependências).
   A imagem escolhida é lida localmente e processada em canvas no navegador.
   Nenhum arquivo é enviado, armazenado ou passado para APIs externas.

   A folha inteira (cabeçalho, campos, figura, grade e rodapé) é desenhada
   num canvas em milímetros, do tamanho exato da área útil de uma A4. Assim a
   pré-visualização e a impressão são a mesma imagem e a atividade sempre cabe
   em uma página só. */
(function () {
  "use strict";

  var MAX_FILE_SIZE = 12 * 1024 * 1024;
  var WORK_MAX = 1400;        // px: imagem de trabalho (evita canvas gigante)
  var EDGE_MAX = 820;         // px: resolução da detecção de bordas
  var PX_PER_MM = 7;          // ~178 dpi na folha impressa
  var PREVIEW_PX_PER_MM = 4;  // vista "original": só tela, não imprime
  var MIN_BLOB_RATIO = 0.00004;  // manchinhas soltas: some com respingo, não com traço
  var FONT = 'Nunito, "Segoe UI", system-ui, sans-serif';
  var EXAMPLE_SRC = "../assets/images/tools/exemplo-borboleta.svg";

  // Área útil da A4 com margem de 10 mm (o @page cuida das margens).
  var SHEET = {
    portrait: { w: 190, h: 277 },
    landscape: { w: 277, h: 190 }
  };

  var GRID_MM = { nenhuma: 0, grande: 20, media: 14, pequena: 9 };

  var COLORS = {
    primary: "#2b6ca3",
    primaryDark: "#1f5180",
    primarySoft: "#eaf1f8",
    pill: "#c9dceb",
    accent: "#f7cd58",
    text: "#223344",
    textSoft: "#51667a",
    border: "#dde7f0",
    line: "#bfcfdd",
    grid: "#cfdce8",
    axis: "#7d95aa",
    frame: "#c8d6e2"
  };

  var TITLES = [
    "Complete o desenho",
    "Complete a outra metade",
    "Desenhe a parte que está faltando",
    "Complete a figura",
    "Complete usando a simetria"
  ];

  var dom = {};
  var state = {
    image: null,        // imagem de trabalho (canvas)
    fileName: "",
    styled: null,       // canvas já processado (estilo escolhido)
    styledKey: "",
    ready: false,
    fontsReady: false,
    view: "activity",
    dragging: false,
    dragFrom: null,
    strokes: [],
    stroke: null,
    drawing: false,
    instructionTouched: false,
    renderTimer: 0
  };

  function byId(id) { return document.getElementById(id); }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function clampFloat(v, min, max, fallback) {
    var n = parseFloat(v);
    if (!isFinite(n)) n = fallback;
    return clamp(n, min, max);
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

  // ------------------------------------------------------------------
  // Leitura da imagem
  // ------------------------------------------------------------------
  function validateFile(file) {
    if (!file) return "Escolha uma imagem para continuar.";
    if (file.size > MAX_FILE_SIZE) return "A imagem é grande demais. Use um arquivo de até 12 MB.";
    if (file.type && file.type.indexOf("image/") !== 0) {
      return "Este arquivo não parece ser uma imagem. Tente PNG, JPG, JPEG ou WebP.";
    }
    return "";
  }

  function handleFile(file) {
    var error = validateFile(file);
    if (error) {
      setMessage(error, "error");
      return;
    }
    // createImageBitmap respeita a orientação EXIF das fotos de celular.
    if (window.createImageBitmap && window.Promise) {
      window.createImageBitmap(file, { imageOrientation: "from-image" })
        .then(function (bitmap) { adoptImage(bitmap, file.name || "imagem"); })
        .catch(function () { readWithFileReader(file); });
      return;
    }
    readWithFileReader(file);
  }

  function readWithFileReader(file) {
    var reader = new FileReader();
    reader.onload = function () {
      loadFromUrl(String(reader.result || ""), file.name || "imagem");
    };
    reader.onerror = function () {
      setMessage("Não foi possível ler o arquivo. Tente outra imagem.", "error");
    };
    reader.readAsDataURL(file);
  }

  function loadFromUrl(url, fileName) {
    var img = new Image();
    img.onload = function () { adoptImage(img, fileName); };
    img.onerror = function () {
      setMessage("Não foi possível abrir essa imagem. Tente PNG, JPG, JPEG ou WebP.", "error");
    };
    img.src = url;
  }

  // Corta a moldura vazia em volta do desenho para a figura sair grande na
  // folha. Só recorta se a borda for mesmo uniforme (clip-art com fundo branco,
  // PNG achatado); fotos que preenchem o quadro ficam intactas.
  function trimBorders(canvas) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width, h = canvas.height;
    var d = ctx.getImageData(0, 0, w, h).data;
    var bg = [d[0], d[1], d[2]];
    var tol = 20;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    var x, y, p;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        p = (y * w + x) * 4;
        if (Math.abs(d[p] - bg[0]) > tol || Math.abs(d[p + 1] - bg[1]) > tol ||
            Math.abs(d[p + 2] - bg[2]) > tol) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return canvas;

    var cw = maxX - minX + 1;
    var ch = maxY - minY + 1;
    if (cw < w * 0.12 || ch < h * 0.12) return canvas;      // recorte suspeito
    if (cw > w * 0.94 && ch > h * 0.94) return canvas;      // já está justo

    var pad = Math.round(Math.max(cw, ch) * 0.03);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    cw = Math.min(w - minX, cw + pad * 2);
    ch = Math.min(h - minY, ch + pad * 2);

    var out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    var octx = out.getContext("2d");
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, cw, ch);
    octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return out;
  }

  // Reduz a imagem para o tamanho de trabalho e a achata sobre branco
  // (PNG transparente vira fundo branco, do jeito que sai na impressão).
  function adoptImage(source, fileName) {
    var sw = source.width || source.naturalWidth;
    var sh = source.height || source.naturalHeight;
    if (!sw || !sh || sw < 24 || sh < 24) {
      setMessage("A imagem é pequena demais para virar uma atividade.", "error");
      return;
    }

    var scale = Math.min(WORK_MAX / sw, WORK_MAX / sh, 1);
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(32, Math.round(sw * scale));
    canvas.height = Math.max(32, Math.round(sh * scale));
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (source.close) source.close();

    state.source = canvas;              // imagem enviada, sem cortes
    state.image = trimBorders(canvas);  // usada na atividade
    state.fileName = fileName;
    state.styled = null;
    state.styledKey = "";
    state.ready = true;
    resetFraming();
    clearStrokes();

    if (dom.orientation.value === "auto") syncAutoOrientation();
    setMessage("Imagem carregada. Ajuste o enquadramento e gere a atividade.", "ok");
    renderAll();
  }

  function loadExample() {
    var img = new Image();
    img.onload = function () { adoptImage(img, "borboleta"); };
    img.onerror = function () {
      setMessage("Não foi possível carregar a imagem de exemplo.", "error");
    };
    img.src = EXAMPLE_SRC;
  }

  // ------------------------------------------------------------------
  // Processamento: cinza, contorno
  // ------------------------------------------------------------------
  function grayscaleCanvas(src) {
    var canvas = document.createElement("canvas");
    canvas.width = src.width;
    canvas.height = src.height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(src, 0, 0);
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var d = data.data;
    for (var i = 0; i < d.length; i += 4) {
      var g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  // Média móvel separável: duas passadas aproximam bem um blur gaussiano.
  function boxBlur(gray, w, h, radius) {
    if (radius < 1) return gray;
    var tmp = new Float32Array(gray.length);
    var out = new Float32Array(gray.length);
    var span = radius * 2 + 1;
    var x, y, i, sum;

    for (y = 0; y < h; y++) {
      sum = 0;
      for (i = -radius; i <= radius; i++) sum += gray[y * w + clamp(i, 0, w - 1)];
      for (x = 0; x < w; x++) {
        tmp[y * w + x] = sum / span;
        sum -= gray[y * w + clamp(x - radius, 0, w - 1)];
        sum += gray[y * w + clamp(x + radius + 1, 0, w - 1)];
      }
    }
    for (x = 0; x < w; x++) {
      sum = 0;
      for (i = -radius; i <= radius; i++) sum += tmp[clamp(i, 0, h - 1) * w + x];
      for (y = 0; y < h; y++) {
        out[y * w + x] = sum / span;
        sum -= tmp[clamp(y - radius, 0, h - 1) * w + x];
        sum += tmp[clamp(y + radius + 1, 0, h - 1) * w + x];
      }
    }
    return out;
  }

  // Remove manchinhas soltas (ruído de fotografia) do mapa de bordas.
  function removeSmallBlobs(mask, w, h, minArea) {
    var seen = new Uint8Array(w * h);
    var stack = new Int32Array(w * h);
    var comp = new Int32Array(w * h);
    var i, top, idx, size, k, nx, ny, n;
    var dx = [1, -1, 0, 0, 1, 1, -1, -1];
    var dy = [0, 0, 1, -1, 1, -1, 1, -1];

    for (i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      top = 0; size = 0;
      stack[top++] = i;
      seen[i] = 1;
      while (top > 0) {
        idx = stack[--top];
        comp[size++] = idx;
        for (k = 0; k < 8; k++) {
          nx = (idx % w) + dx[k];
          ny = ((idx / w) | 0) + dy[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          n = ny * w + nx;
          if (mask[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
        }
      }
      if (size < minArea) {
        for (k = 0; k < size; k++) mask[comp[k]] = 0;
      }
    }
    return mask;
  }

  // Contorno: cinza -> blur -> Sobel -> limiar por percentil -> limpeza.
  function edgeCanvas(src, soft) {
    var scale = Math.min(EDGE_MAX / src.width, EDGE_MAX / src.height, 1);
    var w = Math.max(32, Math.round(src.width * scale));
    var h = Math.max(32, Math.round(src.height * scale));

    var small = document.createElement("canvas");
    small.width = w; small.height = h;
    var sctx = small.getContext("2d");
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, w, h);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(src, 0, 0, w, h);

    var img = sctx.getImageData(0, 0, w, h);
    var d = img.data;
    var gray = new Float32Array(w * h);
    var i, p;
    for (i = 0, p = 0; p < d.length; i++, p += 4) {
      gray[i] = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
    }

    gray = boxBlur(gray, w, h, soft ? 2 : 1);
    gray = boxBlur(gray, w, h, 1);

    var mag = new Float32Array(w * h);
    var maxMag = 0;
    var x, y, gx, gy, o;
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        o = y * w + x;
        gx = -gray[o - w - 1] - 2 * gray[o - 1] - gray[o + w - 1]
             + gray[o - w + 1] + 2 * gray[o + 1] + gray[o + w + 1];
        gy = -gray[o - w - 1] - 2 * gray[o - w] - gray[o - w + 1]
             + gray[o + w - 1] + 2 * gray[o + w] + gray[o + w + 1];
        mag[o] = Math.sqrt(gx * gx + gy * gy);
        if (mag[o] > maxMag) maxMag = mag[o];
      }
    }
    if (maxMag <= 0) maxMag = 1;

    // Limiar adaptativo: mantém só a fatia mais forte das bordas.
    var keep = soft ? 0.085 : 0.115;
    var hist = new Int32Array(257);
    for (i = 0; i < mag.length; i++) hist[(mag[i] / maxMag * 256) | 0]++;
    var target = Math.round(mag.length * keep);
    var acc = 0, bin = 256;
    while (bin > 0 && acc < target) { acc += hist[bin]; bin--; }
    var threshold = Math.max(maxMag * 0.055, (bin / 256) * maxMag);

    var mask = new Uint8Array(w * h);
    var alpha = new Float32Array(w * h);
    var soften = threshold * 0.85 || 1;
    for (i = 0; i < mag.length; i++) {
      var a = (mag[i] - threshold) / soften;
      if (a > 0) {
        alpha[i] = a > 1 ? 1 : a;
        if (alpha[i] > 0.22) mask[i] = 1;
      }
    }
    removeSmallBlobs(mask, w, h, Math.max(8, Math.round(w * h * MIN_BLOB_RATIO)));

    var ink = soft ? [86, 102, 118] : [31, 51, 71];
    var strength = soft ? 0.85 : 1;
    var out = sctx.createImageData(w, h);
    var od = out.data;
    for (i = 0, p = 0; i < alpha.length; i++, p += 4) {
      var v = mask[i] ? alpha[i] * strength : 0;
      od[p] = 255 + (ink[0] - 255) * v;
      od[p + 1] = 255 + (ink[1] - 255) * v;
      od[p + 2] = 255 + (ink[2] - 255) * v;
      od[p + 3] = 255;
    }
    sctx.putImageData(out, 0, 0);

    // Volta ao tamanho de trabalho com suavização: linhas macias, sem serrilha.
    var big = document.createElement("canvas");
    big.width = src.width; big.height = src.height;
    var bctx = big.getContext("2d");
    bctx.fillStyle = "#ffffff";
    bctx.fillRect(0, 0, big.width, big.height);
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bctx.drawImage(small, 0, 0, big.width, big.height);
    return big;
  }

  function styledCanvas(style) {
    if (!state.image) return null;
    if (state.styled && state.styledKey === style) return state.styled;
    var out;
    if (style === "cinza") out = grayscaleCanvas(state.image);
    else if (style === "contorno") out = edgeCanvas(state.image, false);
    else if (style === "contorno-suave") out = edgeCanvas(state.image, true);
    else out = state.image;
    state.styled = out;
    state.styledKey = style;
    return out;
  }

  // ------------------------------------------------------------------
  // Configuração
  // ------------------------------------------------------------------
  function orientationFor(value) {
    if (value === "landscape" || value === "portrait") return value;
    if (!state.image) return "portrait";
    return state.image.width / state.image.height > 1.25 ? "landscape" : "portrait";
  }

  function syncAutoOrientation() {
    if (!dom.orientationHint) return;
    var auto = orientationFor("auto");
    dom.orientationHint.textContent = auto === "landscape"
      ? "Automático: esta imagem fica melhor em paisagem."
      : "Automático: esta imagem fica melhor em retrato.";
  }

  function defaultInstruction(cfg) {
    var base = cfg.mirror
      ? "Observe atentamente a metade da figura e complete o outro lado usando a simetria."
      : "Observe a parte visível da figura e desenhe a parte que está faltando.";
    if (cfg.gridMm > 0) base += " Use os quadrados da grade como referência.";
    return base;
  }

  function getConfig() {
    var titleChoice = dom.titlePreset.value;
    var title = titleChoice === "custom"
      ? (dom.titleCustom.value || TITLES[0]).trim()
      : titleChoice;
    var gridKey = dom.grid.value;
    var cfg = {
      side: dom.side.value,
      mirror: dom.mode.value === "simetria",
      style: dom.style.value,
      gridMm: GRID_MM[gridKey] || 0,
      axis: dom.axis.value,
      dots: dom.dots.checked,
      hint: dom.hint.checked,
      orientation: orientationFor(dom.orientation.value),
      title: title || TITLES[0],
      child: dom.child.value.trim(),
      date: dom.date.value.trim(),
      zoom: clampFloat(dom.zoom.value, 1, 3, 1),
      panX: state.panX || 0,
      panY: state.panY || 0
    };
    cfg.instruction = (dom.instruction.value || "").trim() || defaultInstruction(cfg);
    return cfg;
  }

  function applyLevel(level) {
    if (level === "facil") {
      dom.grid.value = "grande";
      dom.axis.value = "tracejada";
      dom.style.value = "contorno";
      dom.dots.checked = true;
    } else if (level === "medio") {
      dom.grid.value = "media";
      dom.axis.value = "tracejada";
      dom.style.value = "contorno";
      dom.dots.checked = false;
    } else {
      dom.grid.value = "nenhuma";
      dom.axis.value = "tracejada";
      dom.style.value = "contorno-suave";
      dom.dots.checked = false;
    }
    dom.hint.checked = false;
    refreshInstruction();
    renderAll();
  }

  function refreshInstruction() {
    if (state.instructionTouched) return;
    dom.instruction.value = defaultInstruction(getConfig());
  }

  function resetFraming() {
    state.panX = 0;
    state.panY = 0;
    dom.zoom.value = "1";
    updateZoomLabel();
  }

  function updateZoomLabel() {
    if (dom.zoomOutput) {
      dom.zoomOutput.textContent =
        Number(dom.zoom.value).toFixed(2).replace(/\.?0+$/, "") + "x";
    }
  }

  // ------------------------------------------------------------------
  // Desenho da folha (tudo em milímetros)
  // ------------------------------------------------------------------
  function roundRectPath(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function setFont(ctx, weight, mm) {
    ctx.font = weight + " " + (mm).toFixed(2) + "px " + FONT;
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    var words = String(text || "").split(/\s+/);
    var lines = [];
    var current = "";
    words.forEach(function (word) {
      var candidate = current ? current + " " + word : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, "") + "…";
    }
    return lines;
  }

  // Retângulos das metades visível e oculta (e a linha do eixo).
  function splitGeometry(box, side) {
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2;
    if (side === "esquerda") {
      return { hidden: { x: box.x, y: box.y, w: box.w / 2, h: box.h },
               visible: { x: cx, y: box.y, w: box.w / 2, h: box.h },
               axis: { x1: cx, y1: box.y, x2: cx, y2: box.y + box.h }, vertical: true };
    }
    if (side === "cima") {
      return { hidden: { x: box.x, y: box.y, w: box.w, h: box.h / 2 },
               visible: { x: box.x, y: cy, w: box.w, h: box.h / 2 },
               axis: { x1: box.x, y1: cy, x2: box.x + box.w, y2: cy }, vertical: false };
    }
    if (side === "baixo") {
      return { hidden: { x: box.x, y: cy, w: box.w, h: box.h / 2 },
               visible: { x: box.x, y: box.y, w: box.w, h: box.h / 2 },
               axis: { x1: box.x, y1: cy, x2: box.x + box.w, y2: cy }, vertical: false };
    }
    if (side === "diagonal") {
      return { diagonal: true, hidden: null, visible: null,
               axis: { x1: box.x, y1: box.y + box.h, x2: box.x + box.w, y2: box.y } };
    }
    return { hidden: { x: cx, y: box.y, w: box.w / 2, h: box.h },
             visible: { x: box.x, y: box.y, w: box.w / 2, h: box.h },
             axis: { x1: cx, y1: box.y, x2: cx, y2: box.y + box.h }, vertical: true };
  }

  function clipHalf(ctx, box, side, which) {
    var geo = splitGeometry(box, side);
    ctx.beginPath();
    if (geo.diagonal) {
      // Triângulo abaixo/acima da diagonal (canto inferior esquerdo visível).
      if (which === "visible") {
        ctx.moveTo(box.x, box.y);
        ctx.lineTo(box.x + box.w, box.y + box.h);
        ctx.lineTo(box.x, box.y + box.h);
      } else {
        ctx.moveTo(box.x, box.y);
        ctx.lineTo(box.x + box.w, box.y);
        ctx.lineTo(box.x + box.w, box.y + box.h);
      }
      ctx.closePath();
    } else {
      var r = which === "visible" ? geo.visible : geo.hidden;
      ctx.rect(r.x, r.y, r.w, r.h);
    }
    ctx.clip();
  }

  function frameRect(box, img, cfg) {
    var fit = Math.min(box.w / img.width, box.h / img.height);
    var s = fit * cfg.zoom;
    var w = img.width * s;
    var h = img.height * s;
    return {
      x: box.x + (box.w - w) / 2 + cfg.panX * box.w,
      y: box.y + (box.h - h) / 2 + cfg.panY * box.h,
      w: w, h: h
    };
  }

  function mirrorTransform(ctx, box, side) {
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2;
    if (side === "cima" || side === "baixo") {
      ctx.translate(0, 2 * cy);
      ctx.scale(1, -1);
    } else {
      ctx.translate(2 * cx, 0);
      ctx.scale(-1, 1);
    }
  }

  function drawGrid(ctx, box, cfg) {
    if (!cfg.gridMm) return;
    var step = cfg.gridMm;
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    // Ancorado no centro: os quadrados coincidem dos dois lados do eixo.
    for (var x = cx; x <= box.x + box.w; x += step) { ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); }
    for (var x2 = cx - step; x2 >= box.x; x2 -= step) { ctx.moveTo(x2, box.y); ctx.lineTo(x2, box.y + box.h); }
    for (var y = cy; y <= box.y + box.h; y += step) { ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); }
    for (var y2 = cy - step; y2 >= box.y; y2 -= step) { ctx.moveTo(box.x, y2); ctx.lineTo(box.x + box.w, y2); }
    ctx.stroke();
    ctx.restore();
  }

  function drawAxis(ctx, box, cfg) {
    if (cfg.axis === "nenhuma") return;
    var geo = splitGeometry(box, cfg.side);
    ctx.save();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 0.4;
    ctx.lineCap = "round";
    if (cfg.axis === "tracejada") ctx.setLineDash([2.2, 2]);
    ctx.beginPath();
    ctx.moveTo(geo.axis.x1, geo.axis.y1);
    ctx.lineTo(geo.axis.x2, geo.axis.y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawDots(ctx, box, cfg) {
    if (!cfg.dots) return;
    var geo = splitGeometry(box, cfg.side);
    var step = cfg.gridMm || Math.min(box.w, box.h) / 5;
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2;
    ctx.save();
    ctx.fillStyle = COLORS.axis;

    // Marcas ao longo do eixo: mostram onde a figura começa.
    var along = geo.vertical === false ? "x" : "y";
    var from = along === "y" ? cy : cx;
    var start = along === "y" ? box.y : box.x;
    var end = along === "y" ? box.y + box.h : box.x + box.w;
    for (var t = from; t <= end; t += step) tick(t);
    for (var t2 = from - step; t2 >= start; t2 -= step) tick(t2);

    function tick(v) {
      ctx.beginPath();
      if (along === "y") ctx.arc(geo.axis.x1, v, 0.65, 0, Math.PI * 2);
      else ctx.arc(v, geo.axis.y1, 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pontinhos discretos nos cruzamentos da grade, só na área vazia.
    if (geo.hidden && cfg.gridMm) {
      ctx.globalAlpha = 0.55;
      for (var gx = cx; gx <= box.x + box.w; gx += step) dotsColumn(gx);
      for (var gx2 = cx - step; gx2 >= box.x; gx2 -= step) dotsColumn(gx2);
    }

    function dotsColumn(gx) {
      for (var gy = cy; gy <= box.y + box.h; gy += step) dot(gx, gy);
      for (var gy2 = cy - step; gy2 >= box.y; gy2 -= step) dot(gx, gy2);
    }

    function dot(px, py) {
      var h = geo.hidden;
      if (px < h.x - 0.01 || px > h.x + h.w + 0.01 || py < h.y - 0.01 || py > h.y + h.h + 0.01) return;
      ctx.beginPath();
      ctx.arc(px, py, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Figura: metade visível + (opcional) pista suave ou solução na outra metade.
  function drawFigure(ctx, box, cfg, kind) {
    var img = styledCanvas(cfg.style);
    if (!img) return;
    var rect = frameRect(box, img, cfg);

    if (kind === "original") {
      // Vista "Original": a imagem enviada inteira, sem recorte nem zoom —
      // serve para conferir que nada importante foi perdido no caminho.
      var src = state.source || state.image;
      var full = frameRect(box, src, { zoom: 1, panX: 0, panY: 0 });
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      ctx.drawImage(src, full.x, full.y, full.w, full.h);
      ctx.restore();
      return;
    }

    // Metade visível.
    ctx.save();
    clipHalf(ctx, box, cfg.side, "visible");
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    var showFull = kind === "solution";
    var showHint = kind === "activity" && cfg.hint;
    if (!showFull && !showHint) return;

    // Espelho só faz sentido nos quatro cortes retos.
    var useMirror = cfg.mirror && cfg.side !== "diagonal";
    ctx.save();
    clipHalf(ctx, box, cfg.side, "hidden");
    ctx.globalAlpha = showFull ? 1 : 0.16;
    if (useMirror) {
      ctx.save();
      mirrorTransform(ctx, box, cfg.side);
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    } else {
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();
  }

  function drawHeader(ctx, sheet, cfg, kind) {
    var y = 0;
    // marca + nome
    if (state.mark && state.mark.complete && state.mark.naturalWidth) {
      ctx.drawImage(state.mark, 0, y, 9, 9);
    }
    ctx.fillStyle = COLORS.primary;
    setFont(ctx, "900", 4.6);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Educa4Good", 11, y + 4.6);

    // pastilha
    var label = kind === "solution" ? "GABARITO" : "COMPLETE O DESENHO";
    setFont(ctx, "800", 2.9);
    var tw = ctx.measureText(label).width;
    var pw = tw + 6;
    var px = sheet.w - pw;
    ctx.fillStyle = kind === "solution" ? COLORS.accent : COLORS.primarySoft;
    roundRectPath(ctx, px, y + 0.6, pw, 6.4, 3.2);
    ctx.fill();
    ctx.strokeStyle = kind === "solution" ? "#e8a020" : COLORS.pill;
    ctx.lineWidth = 0.3;
    ctx.stroke();
    ctx.fillStyle = kind === "solution" ? "#4a3608" : COLORS.primaryDark;
    ctx.textAlign = "center";
    ctx.fillText(label, px + pw / 2, y + 3.9);
    return y + 11;
  }

  function drawMeta(ctx, sheet, cfg, y) {
    var gap = 4;
    var wide = (sheet.w - gap) * 0.62;
    var narrow = sheet.w - gap - wide;
    setFont(ctx, "800", 3.2);
    ctx.fillStyle = COLORS.textSoft;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Nome: " + (cfg.child || ""), 0, y + 3.4);
    ctx.fillText("Data: " + (cfg.date || "______ / ______ / __________"), wide + gap, y + 3.4);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(0, y + 4.6); ctx.lineTo(wide, y + 4.6);
    ctx.moveTo(wide + gap, y + 4.6); ctx.lineTo(sheet.w, y + 4.6);
    ctx.stroke();
    return y + 8;
  }

  function drawTitleBlock(ctx, sheet, cfg, kind, y) {
    var title = kind === "solution" ? cfg.title + " — gabarito" : cfg.title;
    ctx.fillStyle = COLORS.primaryDark;
    setFont(ctx, "900", 7);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    var lines = wrapLines(ctx, title.toUpperCase(), sheet.w, 2);
    lines.forEach(function (line, i) {
      ctx.fillText(line, sheet.w / 2, y + 6.4 + i * 8);
    });
    y += 4 + lines.length * 8;

    var instruction = kind === "solution"
      ? "Folha de conferência: a figura completa aparece inteira."
      : (kind === "original" ? "Imagem enviada, sem cortes — só para conferir o enquadramento."
                             : cfg.instruction);
    ctx.fillStyle = COLORS.textSoft;
    setFont(ctx, "600", 3.6);
    var ilines = wrapLines(ctx, instruction, sheet.w - 10, 2);
    ilines.forEach(function (line, i) {
      ctx.fillText(line, sheet.w / 2, y + 3.4 + i * 4.6);
    });
    return y + 2 + ilines.length * 4.6;
  }

  function drawFooter(ctx, sheet, cfg, kind) {
    ctx.fillStyle = COLORS.textSoft;
    setFont(ctx, "600", 2.7);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    var extra = kind === "solution" ? "Gabarito — não entregar junto com a atividade." :
      (cfg.mirror ? "Complete por simetria." : "Continue o desenho.");
    ctx.fillText("Educa4Good — " + extra, 0, sheet.h - 1.4);
    ctx.textAlign = "right";
    ctx.fillText("educa4good", sheet.w, sheet.h - 1.4);
  }

  function drawSheet(canvas, kind, scale) {
    var cfg = getConfig();
    var sheet = SHEET[cfg.orientation];
    var ppm = scale || PX_PER_MM;
    canvas.width = Math.round(sheet.w * ppm);
    canvas.height = Math.round(sheet.h * ppm);
    canvas.style.aspectRatio = sheet.w + " / " + sheet.h;

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ppm, 0, 0, ppm, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sheet.w, sheet.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    var y = drawHeader(ctx, sheet, cfg, kind);
    y = drawMeta(ctx, sheet, cfg, y);
    y = drawTitleBlock(ctx, sheet, cfg, kind, y);

    var footerSpace = 6;
    var box = { x: 0, y: y + 2, w: sheet.w, h: sheet.h - y - 2 - footerSpace };

    // Moldura discreta da área de desenho.
    ctx.save();
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, box.x, box.y, box.w, box.h, 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.frame;
    ctx.lineWidth = 0.35;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, box.x, box.y, box.w, box.h, 2);
    ctx.clip();
    var inner = { x: box.x + 3, y: box.y + 3, w: box.w - 6, h: box.h - 6 };
    if (state.image) {
      drawFigure(ctx, inner, cfg, kind);
      if (kind !== "original") {
        drawGrid(ctx, inner, cfg);
        drawAxis(ctx, inner, cfg);
        drawDots(ctx, inner, cfg);
      }
    } else {
      ctx.fillStyle = COLORS.textSoft;
      setFont(ctx, "800", 4);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Escolha uma imagem para montar a atividade.",
                   box.x + box.w / 2, box.y + box.h / 2);
    }
    ctx.restore();

    drawFooter(ctx, sheet, cfg, kind);
    return { sheet: sheet, box: box };
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function renderAll() {
    if (!dom.activity) return;
    drawSheet(dom.activity, "activity");
    drawSheet(dom.solution, "solution");
    drawSheet(dom.original, "original", PREVIEW_PX_PER_MM);
    syncOverlay();
    redrawStrokes();
    updatePrintPageStyle();
    syncAutoOrientation();

    var cfg = getConfig();
    if (state.image) {
      setStatus("Atividade pronta em A4 " +
        (cfg.orientation === "landscape" ? "paisagem" : "retrato") + ": " +
        sideLabel(cfg.side) + ", " +
        (cfg.mirror ? "completar por simetria" : "continuar o desenho") + ".", "ok");
    } else {
      setStatus("Envie uma imagem ou use o exemplo para começar.", "");
    }
  }

  function scheduleRender() {
    window.clearTimeout(state.renderTimer);
    state.renderTimer = window.setTimeout(renderAll, 120);
  }

  function sideLabel(side) {
    if (side === "esquerda") return "esconde a metade esquerda";
    if (side === "cima") return "esconde a metade de cima";
    if (side === "baixo") return "esconde a metade de baixo";
    if (side === "diagonal") return "esconde a metade na diagonal";
    return "esconde a metade direita";
  }

  function setView(view) {
    state.view = view;
    dom.stage.setAttribute("data-view", view);
    Array.prototype.forEach.call(dom.viewButtons, function (btn) {
      var on = btn.getAttribute("data-cd-view") === view;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // ------------------------------------------------------------------
  // Desenhar na tela (opcional)
  // ------------------------------------------------------------------
  function syncOverlay() {
    if (!dom.overlay) return;
    dom.overlay.width = dom.activity.width;
    dom.overlay.height = dom.activity.height;
    dom.overlay.style.aspectRatio = dom.activity.style.aspectRatio;
  }

  function clearStrokes() {
    state.strokes = [];
    state.stroke = null;
    redrawStrokes();
  }

  function redrawStrokes() {
    if (!dom.overlay) return;
    var ctx = dom.overlay.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, dom.overlay.width, dom.overlay.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    state.strokes.forEach(function (stroke) {
      if (stroke.points.length < 2) return;
      ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
      ctx.strokeStyle = stroke.erase ? "rgba(0,0,0,1)" : "#2b6ca3";
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (var i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
    ctx.globalCompositeOperation = "source-over";
  }

  function pointerPos(event, canvas) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * canvas.width,
      y: (event.clientY - rect.top) / rect.height * canvas.height
    };
  }

  function startPointer(event) {
    if (!state.image) return;
    if (state.drawing) {
      var width = clampFloat(dom.penSize.value, 1, 12, 4) * (dom.activity.width / 900);
      state.stroke = {
        points: [pointerPos(event, dom.overlay)],
        width: Math.max(1.5, width),
        erase: dom.tool.value === "borracha"
      };
      state.strokes.push(state.stroke);
      dom.overlay.setPointerCapture && dom.overlay.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    // Sem o modo desenho, arrastar move o enquadramento.
    state.dragging = true;
    state.dragFrom = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
    dom.stage.classList.add("is-dragging");
    event.currentTarget.setPointerCapture && event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointer(event) {
    if (state.stroke) {
      state.stroke.points.push(pointerPos(event, dom.overlay));
      redrawStrokes();
      event.preventDefault();
      return;
    }
    if (!state.dragging || !state.dragFrom) return;
    var rect = dom.activity.getBoundingClientRect();
    if (!rect.width) return;
    state.panX = clamp(state.dragFrom.panX + (event.clientX - state.dragFrom.x) / rect.width, -0.5, 0.5);
    state.panY = clamp(state.dragFrom.panY + (event.clientY - state.dragFrom.y) / rect.height, -0.5, 0.5);
    scheduleRender();
  }

  function endPointer() {
    state.stroke = null;
    if (state.dragging) {
      state.dragging = false;
      dom.stage.classList.remove("is-dragging");
      renderAll();
    }
  }

  function setDrawing(on) {
    state.drawing = !!on;
    dom.stage.classList.toggle("is-drawing", state.drawing);
    dom.drawTools.hidden = !state.drawing;
    dom.drawToggle.setAttribute("aria-pressed", state.drawing ? "true" : "false");
    dom.drawToggle.textContent = state.drawing ? "Sair do modo desenho" : "Desenhar na tela";
    dom.frameHint.hidden = state.drawing;
  }

  // ------------------------------------------------------------------
  // Impressão
  // ------------------------------------------------------------------
  function updatePrintPageStyle() {
    var cfg = getConfig();
    var style = byId("cd-print-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "cd-print-style";
      document.head.appendChild(style);
    }
    style.textContent = "@page { size: A4 " +
      (cfg.orientation === "landscape" ? "landscape" : "portrait") + "; margin: 10mm; }";
  }

  function printSheet(which) {
    if (!state.image) {
      setMessage("Escolha uma imagem antes de imprimir.", "error");
      return;
    }
    renderAll();
    dom.printArea.classList.toggle("is-solution", which === "solution");
    window.setTimeout(function () { window.print(); }, 60);
  }

  function resetAll() {
    state.image = null;
    state.source = null;
    state.styled = null;
    state.styledKey = "";
    state.ready = false;
    state.instructionTouched = false;
    dom.file.value = "";
    dom.side.value = "direita";
    dom.mode.value = "simetria";
    dom.style.value = "contorno";
    dom.grid.value = "media";
    dom.axis.value = "tracejada";
    dom.dots.checked = false;
    dom.hint.checked = false;
    dom.orientation.value = "auto";
    dom.titlePreset.value = TITLES[0];
    dom.titleCustom.value = "";
    dom.child.value = "";
    dom.date.value = "";
    dom.level.value = "medio";
    resetFraming();
    clearStrokes();
    setDrawing(false);
    syncCustomTitle();
    refreshInstruction();
    setView("activity");
    setMessage("", "");
    renderAll();
  }

  function syncCustomTitle() {
    dom.titleCustomField.hidden = dom.titlePreset.value !== "custom";
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function bindEvents() {
    dom.file.addEventListener("change", function () {
      if (dom.file.files && dom.file.files[0]) handleFile(dom.file.files[0]);
    });
    dom.example.addEventListener("click", loadExample);
    dom.reset.addEventListener("click", resetAll);

    [dom.side, dom.mode, dom.style, dom.grid, dom.axis, dom.orientation].forEach(function (el) {
      el.addEventListener("change", function () {
        if (el === dom.style) { state.styled = null; state.styledKey = ""; }
        refreshInstruction();
        renderAll();
      });
    });
    [dom.dots, dom.hint].forEach(function (el) {
      el.addEventListener("change", renderAll);
    });
    dom.level.addEventListener("change", function () { applyLevel(dom.level.value); });

    dom.swap.addEventListener("click", function () {
      var order = ["direita", "esquerda", "baixo", "cima"];
      var i = order.indexOf(dom.side.value);
      dom.side.value = order[(i + 1) % order.length];
      refreshInstruction();
      renderAll();
    });

    dom.zoom.addEventListener("input", function () { updateZoomLabel(); scheduleRender(); });
    dom.center.addEventListener("click", function () {
      state.panX = 0; state.panY = 0; renderAll();
    });
    dom.resetFrame.addEventListener("click", function () { resetFraming(); renderAll(); });

    dom.titlePreset.addEventListener("change", function () { syncCustomTitle(); renderAll(); });
    [dom.titleCustom, dom.child, dom.date].forEach(function (el) {
      el.addEventListener("input", scheduleRender);
    });
    dom.instruction.addEventListener("input", function () {
      state.instructionTouched = dom.instruction.value.trim().length > 0;
      scheduleRender();
    });
    dom.instructionReset.addEventListener("click", function () {
      state.instructionTouched = false;
      dom.instruction.value = defaultInstruction(getConfig());
      renderAll();
    });

    Array.prototype.forEach.call(dom.viewButtons, function (btn) {
      btn.addEventListener("click", function () { setView(btn.getAttribute("data-cd-view")); });
    });

    dom.printActivity.addEventListener("click", function () { printSheet("activity"); });
    dom.printSolution.addEventListener("click", function () { printSheet("solution"); });

    dom.drawToggle.addEventListener("click", function () { setDrawing(!state.drawing); });
    dom.undo.addEventListener("click", function () { state.strokes.pop(); redrawStrokes(); });
    dom.clear.addEventListener("click", clearStrokes);

    dom.overlay.addEventListener("pointerdown", startPointer);
    dom.overlay.addEventListener("pointermove", movePointer);
    dom.overlay.addEventListener("pointerup", endPointer);
    dom.overlay.addEventListener("pointercancel", endPointer);
    dom.overlay.addEventListener("pointerleave", endPointer);
  }

  function init() {
    if (!byId("complete-o-desenho")) return;

    dom.file = byId("cd-file");
    dom.example = byId("cd-example");
    dom.reset = byId("cd-reset");
    dom.message = byId("cd-message");
    dom.status = byId("cd-status");
    dom.side = byId("cd-side");
    dom.mode = byId("cd-mode");
    dom.style = byId("cd-style");
    dom.grid = byId("cd-grid");
    dom.axis = byId("cd-axis");
    dom.dots = byId("cd-dots");
    dom.hint = byId("cd-hint");
    dom.level = byId("cd-level");
    dom.orientation = byId("cd-orientation");
    dom.orientationHint = byId("cd-orientation-hint");
    dom.zoom = byId("cd-zoom");
    dom.zoomOutput = byId("cd-zoom-output");
    dom.center = byId("cd-center");
    dom.resetFrame = byId("cd-reset-frame");
    dom.swap = byId("cd-swap");
    dom.titlePreset = byId("cd-title");
    dom.titleCustom = byId("cd-title-custom");
    dom.titleCustomField = byId("cd-title-custom-field");
    dom.child = byId("cd-child");
    dom.date = byId("cd-date");
    dom.instruction = byId("cd-instruction");
    dom.instructionReset = byId("cd-instruction-reset");
    dom.stage = byId("cd-stage");
    dom.activity = byId("cd-activity");
    dom.solution = byId("cd-solution");
    dom.original = byId("cd-original");
    dom.overlay = byId("cd-overlay");
    dom.printArea = byId("cd-print-area");
    dom.printActivity = byId("cd-print");
    dom.printSolution = byId("cd-print-solution");
    dom.drawToggle = byId("cd-draw-toggle");
    dom.drawTools = byId("cd-draw-tools");
    dom.tool = byId("cd-tool");
    dom.penSize = byId("cd-pen-size");
    dom.undo = byId("cd-undo");
    dom.clear = byId("cd-clear");
    dom.frameHint = byId("cd-frame-hint");
    dom.viewButtons = document.querySelectorAll("[data-cd-view]");

    state.mark = new Image();
    state.mark.onload = renderAll;
    state.mark.src = "../assets/images/brand/mark.svg";

    resetFraming();
    syncCustomTitle();
    setDrawing(false);
    setView("activity");
    refreshInstruction();
    bindEvents();
    renderAll();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        state.fontsReady = true;
        renderAll();
      });
    }
    loadExample();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
