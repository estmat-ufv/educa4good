/* Educa4Good - Encontre as Diferencas (client-side, sem dependencias).
   A imagem escolhida fica no navegador e nao e enviada para servidores. */
(function () {
  "use strict";

  var MAX_FILE_SIZE = 12 * 1024 * 1024;
  var MAX_SIDE = 1000;
  var COLORS = ["#f0b429", "#3e8e58", "#d66d8c", "#2b6ca3", "#7b6bd6"];
  var TYPES = ["add-shape", "tint", "erase", "flip", "brighten", "stripe", "zoom"];

  var dom = {};
  var state = {
    sourceCanvas: null,
    modifiedCanvas: null,
    sourceDataUrl: "",
    modifiedDataUrl: "",
    answerDataUrl: "",
    diffs: [],
    found: {},
    showSolution: false,
    ready: false,
    sourceName: "Demonstração"
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

  function getConfig() {
    return {
      title: (dom.title.value || "Encontre as diferenças").trim(),
      count: Math.max(3, Math.min(10, parseInt(dom.count.value, 10) || 5)),
      child: dom.child.value.trim(),
      date: dom.date.value.trim(),
      klass: dom.klass.value.trim()
    };
  }

  function makeCanvas(w, h) {
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    return canvas;
  }

  function cloneCanvas(source) {
    var out = makeCanvas(source.width, source.height);
    out.getContext("2d").drawImage(source, 0, 0);
    return out;
  }

  function fitImageToCanvas(img) {
    var naturalW = img.naturalWidth || img.width;
    var naturalH = img.naturalHeight || img.height;
    var scale = Math.min(1, MAX_SIDE / Math.max(naturalW, naturalH));
    if (Math.max(naturalW, naturalH) < 460) {
      scale = Math.min(2, 460 / Math.max(naturalW, naturalH));
    }
    var out = makeCanvas(naturalW * scale, naturalH * scale);
    var ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, out.width, out.height);
    return out;
  }

  function mulberry32(seed) {
    return function () {
      var t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    var radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function rectsTouch(a, b, pad) {
    return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
      a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
  }

  function chooseRegions(count, w, h, rng) {
    var minSide = Math.min(w, h);
    var target = count <= 3 ? 0.18 : count <= 5 ? 0.145 : count <= 7 ? 0.12 : 0.098;
    var margin = Math.max(24, minSide * 0.075);
    var minDistance = minSide * (count <= 3 ? 0.24 : count <= 5 ? 0.18 : 0.13);
    var pad = minSide * 0.035;
    var regions = [];
    var attempts = 0;

    while (regions.length < count && attempts < 6000) {
      attempts++;
      var rw = minSide * target * (0.78 + rng() * 0.58);
      var rh = rw * (0.72 + rng() * 0.62);
      if (rng() > 0.55) {
        var temp = rw;
        rw = rh;
        rh = temp;
      }
      rw = Math.min(rw, w - margin * 2);
      rh = Math.min(rh, h - margin * 2);
      if (rw < 22 || rh < 22) continue;

      var x = margin + rng() * Math.max(1, w - margin * 2 - rw);
      var y = margin + rng() * Math.max(1, h - margin * 2 - rh);
      var candidate = {
        x: x,
        y: y,
        w: rw,
        h: rh,
        cx: x + rw / 2,
        cy: y + rh / 2,
        r: Math.max(rw, rh) * 0.68,
        type: TYPES[(regions.length + Math.floor(rng() * TYPES.length)) % TYPES.length]
      };
      var ok = regions.every(function (other) {
        var dx = candidate.cx - other.cx;
        var dy = candidate.cy - other.cy;
        return Math.sqrt(dx * dx + dy * dy) > minDistance && !rectsTouch(candidate, other, pad);
      });
      if (ok) regions.push(candidate);
    }

    while (regions.length < count) {
      var fallback = regions.length;
      var cols = Math.ceil(Math.sqrt(count));
      var rows = Math.ceil(count / cols);
      var cellW = (w - margin * 2) / cols;
      var cellH = (h - margin * 2) / rows;
      var col = fallback % cols;
      var row = Math.floor(fallback / cols);
      var fw = Math.min(cellW * 0.48, minSide * target);
      var fh = Math.min(cellH * 0.48, minSide * target * 0.78);
      regions.push({
        x: margin + col * cellW + (cellW - fw) / 2,
        y: margin + row * cellH + (cellH - fh) / 2,
        w: fw,
        h: fh,
        cx: margin + col * cellW + cellW / 2,
        cy: margin + row * cellH + cellH / 2,
        r: Math.max(fw, fh) * 0.78,
        type: TYPES[fallback % TYPES.length]
      });
    }
    return regions;
  }

  function averageColor(canvas, x, y, w, h) {
    var ctx = canvas.getContext("2d");
    var sx = Math.max(0, Math.floor(x));
    var sy = Math.max(0, Math.floor(y));
    var sw = Math.max(1, Math.min(canvas.width - sx, Math.floor(w)));
    var sh = Math.max(1, Math.min(canvas.height - sy, Math.floor(h)));
    var data = ctx.getImageData(sx, sy, sw, sh).data;
    var step = Math.max(4, Math.floor(data.length / 900));
    var r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < data.length; i += step - (step % 4)) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (!n) return "rgb(245,248,251)";
    return "rgb(" + Math.round(r / n) + "," + Math.round(g / n) + "," + Math.round(b / n) + ")";
  }

  function drawStar(ctx, cx, cy, outer, inner) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var radius = i % 2 ? inner : outer;
      var x = cx + Math.cos(a) * radius;
      var y = cy + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function applyDifference(ctx, source, diff, index, rng) {
    var x = diff.x, y = diff.y, w = diff.w, h = diff.h;
    var color = COLORS[index % COLORS.length];
    var radius = Math.max(8, Math.min(w, h) * 0.18);
    ctx.save();

    if (diff.type === "flip") {
      roundedRect(ctx, x, y, w, h, radius);
      ctx.clip();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.72)";
      ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.04);
      roundedRect(ctx, x + 2, y + 2, w - 4, h - 4, radius);
      ctx.stroke();
      ctx.restore();
      return;
    }

    roundedRect(ctx, x, y, w, h, radius);
    ctx.clip();

    if (diff.type === "erase") {
      ctx.fillStyle = averageColor(source, Math.max(0, x - w * 0.55), Math.max(0, y - h * 0.55), w * 2.1, h * 2.1);
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    } else if (diff.type === "tint") {
      ctx.globalAlpha = 0.52;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#ffffff";
      for (var tx = x - h; tx < x + w + h; tx += Math.max(10, w / 6)) {
        ctx.fillRect(tx, y, Math.max(4, w / 24), h);
      }
      ctx.globalAlpha = 1;
    } else if (diff.type === "brighten") {
      ctx.globalAlpha = 0.46;
      ctx.fillStyle = rng() > 0.5 ? "#ffffff" : "#20384d";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    } else if (diff.type === "stripe") {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color;
      var stripe = Math.max(6, Math.min(w, h) / 6);
      for (var s = -h; s < w + h; s += stripe * 2.1) {
        ctx.save();
        ctx.translate(x + s, y);
        ctx.rotate(Math.PI / 7);
        ctx.fillRect(0, 0, stripe, h * 2.2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } else if (diff.type === "zoom") {
      var inset = Math.min(w, h) * 0.16;
      ctx.drawImage(source, x + inset, y + inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2), x, y, w, h);
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = color;
      if (index % 3 === 0) {
        drawStar(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.44, Math.min(w, h) * 0.21);
        ctx.fill();
      } else if (index % 3 === 1) {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w * 0.38, h * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + h * 0.1);
        ctx.lineTo(x + w * 0.9, y + h / 2);
        ctx.lineTo(x + w / 2, y + h * 0.9);
        ctx.lineTo(x + w * 0.1, y + h / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.88)";
      ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.08);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawMarker(ctx, diff, index, mode) {
    var isSolution = mode === "solution";
    var color = isSolution ? "#d64c6a" : "#3e8e58";
    var label = isSolution ? String(index + 1) : "✓";
    var line = Math.max(3, Math.min(ctx.canvas.width, ctx.canvas.height) * 0.006);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = line;
    ctx.setLineDash([line * 2.6, line * 1.6]);
    ctx.beginPath();
    ctx.ellipse(diff.cx, diff.cy, diff.r, diff.r * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = color;
    ctx.lineWidth = line * 0.75;
    ctx.beginPath();
    ctx.arc(diff.cx, diff.cy, Math.max(12, line * 3.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "900 " + Math.max(16, line * 4.2) + "px Nunito, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, diff.cx, diff.cy + 1);
    ctx.restore();
  }

  function renderCanvases() {
    if (!state.sourceCanvas || !state.modifiedCanvas) return;
    [dom.canvasOriginal, dom.canvasModified].forEach(function (canvas) {
      canvas.width = state.sourceCanvas.width;
      canvas.height = state.sourceCanvas.height;
    });

    var originalCtx = dom.canvasOriginal.getContext("2d");
    var modifiedCtx = dom.canvasModified.getContext("2d");
    originalCtx.drawImage(state.sourceCanvas, 0, 0);
    modifiedCtx.drawImage(state.modifiedCanvas, 0, 0);

    state.diffs.forEach(function (diff, index) {
      if (state.found[index] || state.showSolution) {
        drawMarker(originalCtx, diff, index, state.showSolution ? "solution" : "found");
        drawMarker(modifiedCtx, diff, index, state.showSolution ? "solution" : "found");
      }
    });
  }

  function makeAnswerDataUrl() {
    if (!state.modifiedCanvas) return "";
    var out = cloneCanvas(state.modifiedCanvas);
    var ctx = out.getContext("2d");
    state.diffs.forEach(function (diff, index) {
      drawMarker(ctx, diff, index, "solution");
    });
    return out.toDataURL("image/png");
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

  function updatePrintAssets() {
    if (!state.sourceCanvas || !state.modifiedCanvas) return;
    var config = getConfig();
    state.sourceDataUrl = state.sourceCanvas.toDataURL("image/png");
    state.modifiedDataUrl = state.modifiedCanvas.toDataURL("image/png");
    state.answerDataUrl = makeAnswerDataUrl();

    dom.printMeta.innerHTML = metaHtml(config);
    dom.answerMeta.innerHTML = metaHtml(config);
    dom.printTitle.textContent = config.title || "Encontre as diferenças";
    dom.answerTitle.textContent = "Gabarito — " + (config.title || "Encontre as diferenças");
    dom.printCount.textContent = String(state.diffs.length || config.count);
    dom.printOriginal.src = state.sourceDataUrl;
    dom.printModified.src = state.modifiedDataUrl;
    dom.answerImg.src = state.answerDataUrl;
  }

  function foundCount() {
    return Object.keys(state.found).length;
  }

  function updateScore() {
    dom.found.textContent = String(foundCount());
    dom.total.textContent = String(state.diffs.length || getConfig().count);
  }

  function setButtons(enabled) {
    dom.regenerate.disabled = !enabled;
    dom.solution.disabled = !enabled;
    dom.reset.disabled = !enabled;
    dom.print.disabled = !enabled;
    dom.printAnswer.disabled = !enabled;
  }

  function generateActivity() {
    if (!state.sourceCanvas) {
      setMessage("Escolha uma imagem ou use uma demonstração para começar.", "error");
      return false;
    }

    var config = getConfig();
    var seed = Date.now() ^ Math.floor(Math.random() * 0x7fffffff);
    var rng = mulberry32(seed);
    state.modifiedCanvas = cloneCanvas(state.sourceCanvas);
    state.diffs = chooseRegions(config.count, state.sourceCanvas.width, state.sourceCanvas.height, rng);
    var ctx = state.modifiedCanvas.getContext("2d");
    state.diffs.forEach(function (diff, index) {
      applyDifference(ctx, state.sourceCanvas, diff, index, rng);
    });
    state.found = {};
    state.showSolution = false;
    state.ready = true;

    renderCanvases();
    updateScore();
    updatePrintAssets();
    setButtons(true);
    dom.solution.textContent = "◎ Mostrar solução";
    setMessage("Atividade criada com " + state.diffs.length + " diferenças.", "ok");
    setStatus("Clique ou toque nas diferenças em qualquer uma das imagens.", "ok");
    return true;
  }

  function canvasPoint(canvas, event) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height)
    };
  }

  function findHit(point) {
    for (var i = 0; i < state.diffs.length; i++) {
      if (state.found[i]) continue;
      var diff = state.diffs[i];
      var dx = point.x - diff.cx;
      var dy = point.y - diff.cy;
      if (Math.sqrt(dx * dx + dy * dy) <= diff.r) return i;
    }
    return -1;
  }

  function onCanvasClick(event) {
    if (!state.ready) return;
    var hit = findHit(canvasPoint(event.currentTarget, event));
    if (hit === -1) {
      setStatus("Essa tentativa não marcou uma diferença. Observe os detalhes e tente de novo.", "");
      return;
    }
    state.found[hit] = true;
    renderCanvases();
    updateScore();
    var totalFound = foundCount();
    if (totalFound === state.diffs.length) {
      setStatus("Parabéns! Você encontrou todas as diferenças!", "ok");
    } else {
      setStatus("Boa! Diferença " + totalFound + " de " + state.diffs.length + " encontrada.", "ok");
    }
  }

  function resetGame() {
    if (!state.ready) return;
    state.found = {};
    state.showSolution = false;
    dom.solution.textContent = "◎ Mostrar solução";
    renderCanvases();
    updateScore();
    setStatus("Jogo reiniciado. Encontre as diferenças nas duas imagens.", "");
  }

  function toggleSolution() {
    if (!state.ready) return;
    state.showSolution = !state.showSolution;
    dom.solution.textContent = state.showSolution ? "◎ Ocultar solução" : "◎ Mostrar solução";
    renderCanvases();
    setStatus(state.showSolution ? "Solução visível nas duas imagens." : "Solução ocultada.", "");
  }

  function printActivity() {
    if (!state.ready && !generateActivity()) return;
    updatePrintAssets();
    document.body.classList.remove("diff-print-answer-only");
    window.setTimeout(function () { window.print(); }, 50);
  }

  function printAnswer() {
    if (!state.ready && !generateActivity()) return;
    updatePrintAssets();
    document.body.classList.add("diff-print-answer-only");
    window.setTimeout(function () { window.print(); }, 50);
  }

  function setSourceCanvas(canvas, name) {
    state.sourceCanvas = cloneCanvas(canvas);
    state.sourceName = name || "Imagem escolhida";
    state.sourceDataUrl = state.sourceCanvas.toDataURL("image/png");
    dom.originalImg.src = state.sourceDataUrl;
    dom.originalFig.hidden = false;
    setMessage("Imagem carregada. Clique em Criar atividade para gerar as diferenças.", "ok");
    generateActivity();
  }

  function handleImageFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setMessage("Essa imagem é grande demais. Use um arquivo de até 12 MB.", "error");
      return;
    }
    if (file.type && file.type.indexOf("image/") !== 0) {
      setMessage("O arquivo escolhido não parece ser uma imagem.", "error");
      return;
    }

    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      setSourceCanvas(fitImageToCanvas(img), file.name || "Imagem escolhida");
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setMessage("Não foi possível ler essa imagem. Tente PNG, JPG ou WebP.", "error");
    };
    img.src = url;
  }

  function drawDemo(kind) {
    var canvas = makeCanvas(920, 620);
    var ctx = canvas.getContext("2d");
    if (kind === "classroom") {
      ctx.fillStyle = "#eef5fb";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#d9e9f5";
      ctx.fillRect(0, 0, canvas.width, 180);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(70, 70, 150, 92);
      ctx.fillStyle = "#f8c95c";
      ctx.fillRect(84, 84, 52, 64);
      ctx.fillStyle = "#8ed0c2";
      ctx.fillRect(146, 84, 60, 64);
      ctx.fillStyle = "#2f6b57";
      roundedRect(ctx, 300, 74, 360, 148, 14);
      ctx.fill();
      ctx.strokeStyle = "#d8b56b";
      ctx.lineWidth = 10;
      roundedRect(ctx, 300, 74, 360, 148, 14);
      ctx.stroke();
      ctx.fillStyle = "#f8fbff";
      ctx.font = "900 34px Nunito, Arial, sans-serif";
      ctx.fillText("ABC", 334, 138);
      ctx.fillText("1 2 3", 508, 182);
      ctx.fillStyle = "#f5dfbd";
      ctx.fillRect(0, 402, canvas.width, 218);
      for (var i = 0; i < 3; i++) {
        var x = 120 + i * 245;
        ctx.fillStyle = "#c47b54";
        roundedRect(ctx, x, 310, 150, 72, 12);
        ctx.fill();
        ctx.fillStyle = "#7a513d";
        ctx.fillRect(x + 20, 382, 18, 80);
        ctx.fillRect(x + 112, 382, 18, 80);
        ctx.fillStyle = COLORS[i];
        ctx.beginPath();
        ctx.arc(x + 62, 286, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        roundedRect(ctx, x + 74, 325, 70, 22, 5);
        ctx.fill();
      }
      ctx.fillStyle = "#f6a6b8";
      roundedRect(ctx, 715, 86, 118, 148, 12);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "900 22px Nunito, Arial, sans-serif";
      ctx.fillText("Leia", 748, 140);
      ctx.fillText("e", 766, 170);
      ctx.fillText("brinque", 735, 200);
    } else {
      var sky = ctx.createLinearGradient(0, 0, 0, 430);
      sky.addColorStop(0, "#bde5ff");
      sky.addColorStop(1, "#f6fbff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f7c948";
      ctx.beginPath();
      ctx.arc(780, 92, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8ccf8f";
      ctx.beginPath();
      ctx.moveTo(0, 390);
      ctx.quadraticCurveTo(210, 245, 450, 375);
      ctx.quadraticCurveTo(650, 475, 920, 330);
      ctx.lineTo(920, 620);
      ctx.lineTo(0, 620);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#5daf6a";
      ctx.beginPath();
      ctx.moveTo(0, 450);
      ctx.quadraticCurveTo(250, 340, 540, 440);
      ctx.quadraticCurveTo(710, 500, 920, 410);
      ctx.lineTo(920, 620);
      ctx.lineTo(0, 620);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#d87a59";
      roundedRect(ctx, 126, 328, 160, 118, 10);
      ctx.fill();
      ctx.fillStyle = "#874832";
      ctx.beginPath();
      ctx.moveTo(104, 330);
      ctx.lineTo(206, 242);
      ctx.lineTo(306, 330);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff4c9";
      ctx.fillRect(156, 358, 40, 38);
      ctx.fillRect(222, 358, 40, 38);
      ctx.fillStyle = "#6b7a45";
      for (var t = 0; t < 5; t++) {
        var tx = 410 + t * 86;
        ctx.fillStyle = "#7a513d";
        ctx.fillRect(tx + 22, 332, 22, 102);
        ctx.fillStyle = t % 2 ? "#3e8e58" : "#2f9f68";
        ctx.beginPath();
        ctx.arc(tx + 34, 306, 52, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#f7ecd2";
      ctx.lineWidth = 30;
      ctx.beginPath();
      ctx.moveTo(480, 620);
      ctx.bezierCurveTo(440, 520, 490, 464, 565, 412);
      ctx.stroke();
      ctx.fillStyle = "#f09ab2";
      drawStar(ctx, 650, 180, 30, 14);
      ctx.fill();
      ctx.fillStyle = "#7b6bd6";
      ctx.beginPath();
      ctx.ellipse(118, 180, 45, 24, 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }

  function useDemo(kind) {
    setSourceCanvas(drawDemo(kind), kind === "classroom" ? "Demonstração: sala de aula" : "Demonstração: paisagem");
  }

  function bindEvents() {
    dom.file.addEventListener("change", function () {
      handleImageFile(dom.file.files && dom.file.files[0]);
    });

    ["dragenter", "dragover"].forEach(function (eventName) {
      dom.dropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dom.dropzone.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach(function (eventName) {
      dom.dropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dom.dropzone.classList.remove("is-dragging");
      });
    });
    dom.dropzone.addEventListener("drop", function (event) {
      var files = event.dataTransfer && event.dataTransfer.files;
      handleImageFile(files && files[0]);
    });

    document.querySelectorAll("[data-diff-demo]").forEach(function (button) {
      button.addEventListener("click", function () {
        useDemo(button.getAttribute("data-diff-demo"));
      });
    });

    dom.generate.addEventListener("click", generateActivity);
    dom.regenerate.addEventListener("click", generateActivity);
    dom.solution.addEventListener("click", toggleSolution);
    dom.reset.addEventListener("click", resetGame);
    dom.print.addEventListener("click", printActivity);
    dom.printAnswer.addEventListener("click", printAnswer);
    dom.canvasOriginal.addEventListener("click", onCanvasClick);
    dom.canvasModified.addEventListener("click", onCanvasClick);

    [dom.title, dom.child, dom.date, dom.klass].forEach(function (input) {
      input.addEventListener("input", updatePrintAssets);
    });
    dom.count.addEventListener("change", function () {
      updateScore();
      if (state.ready) generateActivity();
    });
    window.addEventListener("afterprint", function () {
      document.body.classList.remove("diff-print-answer-only");
    });
  }

  function init() {
    if (!byId("encontre-diferencas")) return;

    dom.file = byId("diff-file");
    dom.dropzone = byId("diff-dropzone");
    dom.message = byId("diff-message");
    dom.status = byId("diff-status");
    dom.originalFig = byId("diff-original");
    dom.originalImg = byId("diff-original-img");
    dom.title = byId("diff-title");
    dom.count = byId("diff-count");
    dom.child = byId("diff-child");
    dom.date = byId("diff-date");
    dom.klass = byId("diff-class");
    dom.generate = byId("diff-generate");
    dom.regenerate = byId("diff-regenerate");
    dom.solution = byId("diff-solution");
    dom.reset = byId("diff-reset");
    dom.print = byId("diff-print");
    dom.printAnswer = byId("diff-print-answer");
    dom.canvasOriginal = byId("diff-canvas-original");
    dom.canvasModified = byId("diff-canvas-modified");
    dom.found = byId("diff-found");
    dom.total = byId("diff-total");
    dom.printMeta = byId("diff-print-meta");
    dom.answerMeta = byId("diff-answer-meta");
    dom.printTitle = byId("diff-print-title");
    dom.answerTitle = byId("diff-answer-title");
    dom.printCount = byId("diff-print-count");
    dom.printOriginal = byId("diff-print-original");
    dom.printModified = byId("diff-print-modified");
    dom.answerImg = byId("diff-answer-img");

    setButtons(false);
    bindEvents();
    useDemo("park");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
