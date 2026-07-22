/* Educa4Good — Ligar os Pontos (client-side, sem dependências).
   A imagem escolhida é lida localmente e processada em canvas no navegador.
   Nenhum arquivo é enviado, armazenado ou passado para APIs externas. */
(function () {
  "use strict";

  var MAX_FILE_SIZE = 12 * 1024 * 1024;
  var PROCESS_MAX = 560;
  var MIN_COMPONENT_PIXELS = 18;
  var MAX_PIXELS_PER_CONTOUR = 4200;
  var PAPER = {
    portrait: { w: 794, h: 1123, label: "portrait" },
    landscape: { w: 1123, h: 794, label: "landscape" }
  };

  var dom = {};
  var state = {
    dataUrl: "",
    fileName: "",
    image: null,
    processSize: null,
    generated: null,
    pendingTimer: 0
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function clampInt(v, min, max, fallback) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) n = fallback;
    return clamp(n, min, max);
  }

  function clampFloat(v, min, max, fallback) {
    var n = parseFloat(v);
    if (!isFinite(n)) n = fallback;
    return clamp(n, min, max);
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

  function updateOutputs() {
    dom.countOutput.textContent = dom.count.value;
    dom.pointOutput.textContent = dom.pointSize.value;
    dom.numberOutput.textContent = dom.numberSize.value;
    dom.lineOutput.textContent = Number(dom.lineWidth.value).toFixed(1).replace(".0", "");
  }

  function validateFile(file) {
    if (!file) return "Escolha uma imagem para continuar.";
    if (file.size > MAX_FILE_SIZE) return "A imagem é grande demais. Use um arquivo de até 12 MB.";
    if (file.type && file.type.indexOf("image/") !== 0) return "Este arquivo não parece ser uma imagem. Tente PNG, JPG ou WebP.";
    return "";
  }

  function handleFile(file) {
    var error = validateFile(file);
    if (error) {
      setMessage(error, "error");
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      loadImage(String(reader.result || ""), file.name || "imagem");
    };
    reader.onerror = function () {
      setMessage("Não foi possível ler o arquivo. Tente outra imagem.", "error");
    };
    reader.readAsDataURL(file);
  }

  function loadImage(dataUrl, fileName) {
    var img = new Image();
    img.onload = function () {
      if (img.naturalWidth < 24 || img.naturalHeight < 24) {
        setMessage("A imagem é pequena demais para gerar pontos com qualidade.", "error");
        return;
      }

      state.dataUrl = dataUrl;
      state.fileName = fileName;
      state.image = img;
      state.processSize = null;
      state.generated = null;

      dom.originalImg.src = dataUrl;
      dom.original.hidden = false;
      dom.referenceImg.src = dataUrl;
      dom.generate.disabled = false;
      dom.print.disabled = true;
      dom.download.disabled = true;

      syncReference();
      showPlaceholder();
      setMessage("Imagem carregada. Ajuste as opções e clique em Gerar/Atualizar atividade.", "ok");
      setStatus("Pronto para gerar a atividade.", "");
    };
    img.onerror = function () {
      setMessage("Não foi possível abrir essa imagem. Tente PNG, JPG ou WebP.", "error");
    };
    img.src = dataUrl;
  }

  function showPlaceholder() {
    dom.activity.innerHTML = '<div class="dots__placeholder"><div class="dots__placeholder-dots" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div><p>Escolha uma imagem e gere a atividade.</p></div>';
  }

  function parseHiddenPairs(text, totalPoints, startNumber) {
    var result = {
      starts: new Set(),
      labels: [],
      errors: []
    };
    var raw = String(text || "").trim();
    if (!raw) return result;

    var first = startNumber;
    var last = startNumber + totalPoints - 1;
    var seen = new Set();
    raw.split(",").forEach(function (part) {
      var item = part.trim();
      if (!item) return;

      var match = item.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!match) {
        result.errors.push("Use pares no formato 12-13, separados por vírgula.");
        return;
      }

      var a = parseInt(match[1], 10);
      var b = parseInt(match[2], 10);
      var low = Math.min(a, b);
      var high = Math.max(a, b);
      var key = low + "-" + high;

      if (Math.abs(a - b) !== 1) {
        result.errors.push("O par " + item + " precisa juntar números consecutivos.");
        return;
      }
      if (low < first || high > last) {
        result.errors.push("O par " + item + " está fora do intervalo " + first + " a " + last + ".");
        return;
      }
      if (seen.has(key)) {
        result.errors.push("O par " + key + " aparece repetido.");
        return;
      }

      seen.add(key);
      result.starts.add(low - startNumber);
      result.labels.push(key);
    });

    return result;
  }

  function getConfig() {
    var pointCount = clampInt(dom.count.value, 8, 140, 45);
    var startNumber = clampInt(dom.start.value, 0, 9999, 1);
    var hidden = parseHiddenPairs(dom.hiddenPairs.value, pointCount, startNumber);
    return {
      pointCount: pointCount,
      startNumber: startNumber,
      pointSize: clampFloat(dom.pointSize.value, 2, 12, 5),
      numberSize: clampFloat(dom.numberSize.value, 10, 28, 16),
      lineWidth: clampFloat(dom.lineWidth.value, 0, 3, 0.8),
      lineColor: dom.lineColor.value || "#9aa9b7",
      paper: dom.paper.value === "landscape" ? "landscape" : "portrait",
      title: (dom.title.value || "Ligar os pontos").trim(),
      child: dom.child.value.trim(),
      date: dom.date.value.trim(),
      klass: dom.klass.value.trim(),
      showInspiration: dom.showInspiration.checked,
      hiddenStarts: hidden.starts,
      hiddenLabels: hidden.labels,
      errors: hidden.errors
    };
  }

  function prepareCanvas(img) {
    var scale = Math.min(PROCESS_MAX / img.naturalWidth, PROCESS_MAX / img.naturalHeight, 1);
    var w = Math.max(32, Math.round(img.naturalWidth * scale));
    var h = Math.max(32, Math.round(img.naturalHeight * scale));
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas: canvas, ctx: ctx, w: w, h: h };
  }

  function grayscale(imageData) {
    var src = imageData.data;
    var out = new Float32Array(imageData.width * imageData.height);
    var min = 255;
    var max = 0;
    for (var i = 0, j = 0; i < src.length; i += 4, j++) {
      var alpha = src[i + 3] / 255;
      var gray = (0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]) * alpha + 255 * (1 - alpha);
      out[j] = gray;
      if (gray < min) min = gray;
      if (gray > max) max = gray;
    }

    if (max - min > 18) {
      var factor = 255 / (max - min);
      for (var k = 0; k < out.length; k++) {
        out[k] = clamp((out[k] - min) * factor, 0, 255);
      }
    }
    return out;
  }

  function sobel(gray, w, h) {
    var mag = new Float32Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var i = y * w + x;
        var gx =
          -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
           gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
        var gy =
          -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
           gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
        mag[i] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return mag;
  }

  function percentileThreshold(mag) {
    var sample = [];
    for (var i = 0; i < mag.length; i += 3) {
      if (mag[i] > 0) sample.push(mag[i]);
    }
    if (sample.length < 20) return 36;
    sample.sort(function (a, b) { return a - b; });
    var p = sample[Math.floor(sample.length * 0.86)];
    return clamp(p, 34, 190);
  }

  function makeBinary(mag, threshold) {
    var binary = new Uint8Array(mag.length);
    for (var i = 0; i < mag.length; i++) {
      if (mag[i] >= threshold) binary[i] = 1;
    }
    return binary;
  }

  function cleanBinary(binary, w, h) {
    var cleaned = new Uint8Array(binary.length);
    var kept = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var i = y * w + x;
        if (!binary[i]) continue;
        var n = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (dx || dy) n += binary[i + dy * w + dx];
          }
        }
        if (n >= 2) {
          cleaned[i] = 1;
          kept++;
        }
      }
    }
    return kept ? cleaned : binary;
  }

  function findComponents(binary, w, h) {
    var visited = new Uint8Array(binary.length);
    var comps = [];
    var dirs = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];

    for (var i = 0; i < binary.length; i++) {
      if (!binary[i] || visited[i]) continue;
      var stack = [i];
      var pixels = [];
      visited[i] = 1;

      while (stack.length) {
        var p = stack.pop();
        pixels.push(p);
        var x = p % w;
        var y = (p - x) / w;
        for (var d = 0; d < dirs.length; d++) {
          var np = p + dirs[d];
          var nx = np % w;
          var ny = (np - nx) / w;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) continue;
          if (binary[np] && !visited[np]) {
            visited[np] = 1;
            stack.push(np);
          }
        }
      }

      if (pixels.length >= MIN_COMPONENT_PIXELS) {
        comps.push({ pixels: pixels, weight: pixels.length });
      }
    }

    comps.sort(function (a, b) { return b.weight - a.weight; });
    return comps;
  }

  function limitPixels(pixels) {
    if (pixels.length <= MAX_PIXELS_PER_CONTOUR) return pixels.slice();
    var step = Math.ceil(pixels.length / MAX_PIXELS_PER_CONTOUR);
    var out = [];
    for (var i = 0; i < pixels.length; i += step) out.push(pixels[i]);
    return out;
  }

  function chooseStart(pixels, w) {
    var best = pixels[0];
    var bestScore = Infinity;
    pixels.forEach(function (p) {
      var x = p % w;
      var y = (p - x) / w;
      var score = x + y * 1.6;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    });
    return best;
  }

  function bestNeighbor(current, remaining, w, h, lastDx, lastDy) {
    var x = current % w;
    var y = (current - x) / w;
    var best = null;
    var bestScore = Infinity;

    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx;
        var ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        var ni = ny * w + nx;
        if (!remaining.has(ni)) continue;
        var turn = lastDx || lastDy ? -(dx * lastDx + dy * lastDy) : 0;
        var score = Math.sqrt(dx * dx + dy * dy) * 3 + turn;
        if (score < bestScore) {
          bestScore = score;
          best = ni;
        }
      }
    }
    return best;
  }

  function nearestRemaining(current, remaining, w) {
    if (!remaining.size) return null;
    var x = current % w;
    var y = (current - x) / w;
    var best = null;
    var bestD = Infinity;
    remaining.forEach(function (p) {
      var px = p % w;
      var py = (p - px) / w;
      var dx = px - x;
      var dy = py - y;
      var d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    return best;
  }

  function orderComponent(component, w, h) {
    var pixels = limitPixels(component.pixels);
    var remaining = new Set(pixels);
    var current = chooseStart(pixels, w);
    var ordered = [];
    var lastDx = 0;
    var lastDy = 0;

    while (current != null && remaining.size) {
      remaining.delete(current);
      var x = current % w;
      var y = (current - x) / w;
      ordered.push({ x: x, y: y });

      var next = bestNeighbor(current, remaining, w, h, lastDx, lastDy);
      if (next == null) next = nearestRemaining(current, remaining, w);
      if (next == null) break;

      var nx = next % w;
      var ny = (next - nx) / w;
      lastDx = Math.sign(nx - x);
      lastDy = Math.sign(ny - y);
      current = next;
    }

    return ordered;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function splitOnJumps(path, w, h) {
    if (path.length < 2) return [];
    var jump = Math.max(10, Math.min(w, h) * 0.045);
    var parts = [[path[0]]];

    for (var i = 1; i < path.length; i++) {
      if (distance(path[i - 1], path[i]) > jump) {
        parts.push([path[i]]);
      } else {
        parts[parts.length - 1].push(path[i]);
      }
    }

    return parts.filter(function (part) { return part.length >= 8; });
  }

  function pathLength(path) {
    var total = 0;
    for (var i = 1; i < path.length; i++) total += distance(path[i - 1], path[i]);
    return total;
  }

  function resamplePath(path, count) {
    if (!path.length || count <= 0) return [];
    if (path.length === 1 || count === 1) return [{ x: path[0].x, y: path[0].y }];

    var lengths = [0];
    var total = 0;
    for (var i = 1; i < path.length; i++) {
      total += distance(path[i - 1], path[i]);
      lengths.push(total);
    }
    if (total <= 0) return [{ x: path[0].x, y: path[0].y }];

    var out = [];
    var seg = 1;
    for (var k = 0; k < count; k++) {
      var target = count === 1 ? 0 : (total * k) / (count - 1);
      while (seg < lengths.length - 1 && lengths[seg] < target) seg++;
      var prevLen = lengths[seg - 1];
      var nextLen = lengths[seg];
      var t = nextLen === prevLen ? 0 : (target - prevLen) / (nextLen - prevLen);
      var a = path[seg - 1];
      var b = path[seg];
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      });
    }
    return out;
  }

  function allocateCounts(contours, total) {
    var maxContours = Math.max(1, Math.min(contours.length, Math.floor(total / 6) || 1, 8));
    var chosen = contours.slice(0, maxContours);
    var sum = chosen.reduce(function (acc, c) { return acc + c.length; }, 0);
    var counts = chosen.map(function (c) {
      return Math.max(3, Math.round(total * c.length / sum));
    });

    var used = counts.reduce(function (a, b) { return a + b; }, 0);
    var order = chosen.map(function (_, i) { return i; }).sort(function (a, b) {
      return chosen[b].length - chosen[a].length;
    });

    var guard = 0;
    while (used !== total && guard < 500) {
      for (var i = 0; i < order.length && used !== total; i++) {
        var idx = order[i];
        if (used < total) {
          counts[idx]++;
          used++;
        } else if (counts[idx] > 3) {
          counts[idx]--;
          used--;
        }
      }
      guard++;
    }

    return { contours: chosen, counts: counts };
  }

  function extractContours(pointCount) {
    var prep = prepareCanvas(state.image);
    var data = prep.ctx.getImageData(0, 0, prep.w, prep.h);
    var gray = grayscale(data);
    var mag = sobel(gray, prep.w, prep.h);
    var baseThreshold = percentileThreshold(mag);
    var bestContours = [];
    var bestWeight = 0;

    [1, 0.72, 0.52].some(function (factor) {
      var binary = cleanBinary(makeBinary(mag, baseThreshold * factor), prep.w, prep.h);
      var comps = findComponents(binary, prep.w, prep.h)
        .filter(function (c) { return c.weight >= Math.max(MIN_COMPONENT_PIXELS, prep.w * prep.h * 0.00025); })
        .slice(0, 18);
      var contours = [];

      comps.forEach(function (component) {
        var ordered = orderComponent(component, prep.w, prep.h);
        splitOnJumps(ordered, prep.w, prep.h).forEach(function (part) {
          var len = pathLength(part);
          if (len > Math.min(prep.w, prep.h) * 0.08) {
            contours.push({ path: part, length: len, weight: component.weight });
          }
        });
      });

      contours.sort(function (a, b) { return b.length - a.length; });
      var weight = contours.reduce(function (acc, c) { return acc + c.length; }, 0);
      if (weight > bestWeight) {
        bestWeight = weight;
        bestContours = contours;
      }
      return bestContours.length && weight > pointCount * 12;
    });

    if (!bestContours.length) {
      throw new Error("Não encontrei contornos nítidos nessa imagem. Tente um desenho com fundo mais simples e alto contraste.");
    }

    state.processSize = { w: prep.w, h: prep.h };
    return bestContours;
  }

  function generatePointsFromImage(config) {
    var contours = extractContours(config.pointCount);
    var allocated = allocateCounts(contours, config.pointCount);
    var points = [];
    var autoBreaks = new Set();

    // Quando há múltiplos contornos, usamos os maiores primeiro, distribuímos
    // pontos proporcionalmente ao comprimento e quebramos a linha entre eles.
    allocated.contours.forEach(function (contour, index) {
      var sampled = resamplePath(contour.path, allocated.counts[index]);
      if (points.length && sampled.length) autoBreaks.add(points.length - 1);
      sampled.forEach(function (p) { points.push(p); });
    });

    if (points.length < 2) {
      throw new Error("A imagem gerou poucos pontos. Tente outra figura ou aumente o contraste.");
    }

    if (points.length > config.pointCount) points = points.slice(0, config.pointCount);
    return {
      points: points,
      autoBreaks: autoBreaks,
      contourCount: allocated.contours.length
    };
  }

  function paperFor(config) {
    return PAPER[config.paper] || PAPER.portrait;
  }

  function fitRect(areaW, areaH, aspect) {
    var w = areaW;
    var h = w / aspect;
    if (h > areaH) {
      h = areaH;
      w = h * aspect;
    }
    return { w: w, h: h };
  }

  function metadata(config) {
    var items = [];
    if (config.child) items.push("Nome: " + config.child);
    if (config.date) items.push("Data: " + config.date);
    if (config.klass) items.push("Turma: " + config.klass);
    return items.join("    ");
  }

  function mapPoints(points, config) {
    var paper = paperFor(config);
    var meta = metadata(config);
    var top = meta ? 136 : 108;
    var bottom = config.paper === "landscape" ? 42 : 58;
    var marginX = config.paper === "landscape" ? 58 : 62;
    var areaW = paper.w - marginX * 2;
    var areaH = paper.h - top - bottom;
    var aspect = state.processSize.w / state.processSize.h;
    var fit = fitRect(areaW, areaH, aspect);
    var x0 = marginX + (areaW - fit.w) / 2;
    var y0 = top + (areaH - fit.h) / 2;

    return {
      paper: paper,
      bounds: { x: x0, y: y0, w: fit.w, h: fit.h, top: top, bottom: bottom },
      points: points.map(function (p) {
        return {
          x: x0 + (p.x / state.processSize.w) * fit.w,
          y: y0 + (p.y / state.processSize.h) * fit.h
        };
      })
    };
  }

  function labelPosition(points, index, config, layout) {
    var p = points[index];
    var prev = points[Math.max(0, index - 1)];
    var next = points[Math.min(points.length - 1, index + 1)];
    var dx = next.x - prev.x;
    var dy = next.y - prev.y;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var cx = layout.paper.w / 2;
    var cy = layout.bounds.y + layout.bounds.h / 2;
    var before = Math.hypot(p.x - cx, p.y - cy);
    var after = Math.hypot(p.x + nx * 18 - cx, p.y + ny * 18 - cy);
    if (after < before) {
      nx *= -1;
      ny *= -1;
    }
    var offset = config.pointSize + config.numberSize * 0.72 + 4;
    return {
      x: clamp(p.x + nx * offset, 18, layout.paper.w - 18),
      y: clamp(p.y + ny * offset, layout.bounds.top - 10, layout.paper.h - 22)
    };
  }

  function buildSvg(config) {
    var generated = state.generated;
    var layout = mapPoints(generated.points, config);
    var paper = layout.paper;
    var points = layout.points;
    var meta = metadata(config);
    var title = escapeHtml(config.title || "Ligar os pontos");
    var font = "Nunito, Segoe UI, sans-serif";
    var svg = [];

    svg.push('<svg class="dots-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + paper.w + " " + paper.h + '" role="img" aria-label="' + title + '">');
    svg.push('<rect x="0" y="0" width="' + paper.w + '" height="' + paper.h + '" fill="#ffffff"/>');
    svg.push('<text class="dots-svg__title" x="' + (paper.w / 2) + '" y="58" text-anchor="middle" font-family="' + escapeHtml(font) + '" font-size="34" font-weight="900" fill="#1f5180">' + title + "</text>");
    if (meta) {
      svg.push('<text class="dots-svg__meta" x="' + (paper.w / 2) + '" y="98" text-anchor="middle" font-family="' + escapeHtml(font) + '" font-size="18" font-weight="700" fill="#223344">' + escapeHtml(meta) + "</text>");
    }

    if (config.showInspiration && state.dataUrl) {
      svg.push('<image class="dots-svg__inspiration" href="' + state.dataUrl + '" x="' + layout.bounds.x.toFixed(2) + '" y="' + layout.bounds.y.toFixed(2) + '" width="' + layout.bounds.w.toFixed(2) + '" height="' + layout.bounds.h.toFixed(2) + '" preserveAspectRatio="xMidYMid meet" opacity="0.13"/>');
    }

    if (config.lineWidth > 0) {
      svg.push('<g fill="none" stroke="' + escapeHtml(config.lineColor) + '" stroke-width="' + config.lineWidth + '" stroke-linecap="round" stroke-dasharray="7 8" opacity="0.95">');
      for (var i = 0; i < points.length - 1; i++) {
        if (generated.autoBreaks.has(i) || config.hiddenStarts.has(i)) continue;
        svg.push('<line x1="' + points[i].x.toFixed(2) + '" y1="' + points[i].y.toFixed(2) + '" x2="' + points[i + 1].x.toFixed(2) + '" y2="' + points[i + 1].y.toFixed(2) + '"/>');
      }
      svg.push("</g>");
    }

    svg.push("<g>");
    points.forEach(function (p, i) {
      var label = String(config.startNumber + i);
      var lp = labelPosition(points, i, config, layout);
      svg.push('<circle class="dots-svg__dot" cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2) + '" r="' + config.pointSize + '" fill="#223344"/>');
      svg.push('<text class="dots-svg__label" x="' + lp.x.toFixed(2) + '" y="' + lp.y.toFixed(2) + '" text-anchor="middle" dominant-baseline="middle" font-family="' + escapeHtml(font) + '" font-size="' + config.numberSize + '" font-weight="800" fill="#223344">' + escapeHtml(label) + "</text>");
    });
    svg.push("</g>");
    svg.push("</svg>");
    return svg.join("");
  }

  function syncReference(config) {
    var show = config ? config.showInspiration : dom.showInspiration.checked;
    if (!state.dataUrl) {
      dom.reference.hidden = true;
      dom.printPage.classList.add("dots__print-page--no-reference");
      return;
    }
    dom.reference.hidden = false;
    dom.referenceImg.src = state.dataUrl;
    dom.reference.classList.toggle("dots__reference--screen-hidden", !show);
    dom.printPage.classList.toggle("dots__print-page--no-reference", !show);
  }

  function updatePaperClass(config) {
    dom.printPage.classList.toggle("dots__print-page--landscape", config.paper === "landscape");
    dom.printPage.classList.toggle("dots__print-page--portrait", config.paper !== "landscape");
  }

  function renderActivity() {
    if (!state.generated) return false;
    var config = getConfig();
    updatePaperClass(config);
    syncReference(config);
    if (config.errors.length) {
      setMessage(config.errors.join(" "), "error");
      return false;
    }
    dom.activity.innerHTML = buildSvg(config);
    setMessage("", "");
    dom.print.disabled = false;
    dom.download.disabled = false;
    return true;
  }

  function generateActivity() {
    if (!state.image) {
      setMessage("Envie uma imagem antes de gerar a atividade.", "error");
      byId("dots-file").focus();
      return;
    }

    updateOutputs();
    var config = getConfig();
    updatePaperClass(config);
    syncReference(config);
    if (config.errors.length) {
      setMessage(config.errors.join(" "), "error");
      return;
    }

    dom.generate.disabled = true;
    setStatus("Processando contornos no navegador...", "");
    window.setTimeout(function () {
      try {
        state.generated = generatePointsFromImage(config);
        renderActivity();
        var hiddenText = config.hiddenLabels.length ? " Conexões omitidas: " + config.hiddenLabels.join(", ") + "." : "";
        var contoursText = state.generated.contourCount > 1 ? " Usei " + state.generated.contourCount + " contornos principais, sem ligar um contorno ao outro." : "";
        setStatus("Atividade gerada com " + state.generated.points.length + " pontos." + hiddenText + contoursText, "ok");
      } catch (err) {
        state.generated = null;
        showPlaceholder();
        dom.print.disabled = true;
        dom.download.disabled = true;
        setStatus(err.message || "Não foi possível gerar a atividade com essa imagem.", "error");
      } finally {
        dom.generate.disabled = false;
      }
    }, 20);
  }

  function scheduleGenerate() {
    if (!state.image || !state.generated) return;
    window.clearTimeout(state.pendingTimer);
    state.pendingTimer = window.setTimeout(generateActivity, 260);
  }

  function updatePrintPageStyle() {
    var config = getConfig();
    var style = byId("dots-print-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "dots-print-style";
      document.head.appendChild(style);
    }
    style.textContent = "@page { size: A4 " + (config.paper === "landscape" ? "landscape" : "portrait") + "; margin: 10mm; }";
  }

  function canvasForPng(config) {
    var paper = paperFor(config);
    var scale = 2;
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    canvas.width = paper.w * scale;
    canvas.height = paper.h * scale;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, paper.w, paper.h);

    var layout = mapPoints(state.generated.points, config);
    var points = layout.points;
    var meta = metadata(config);
    var font = "Nunito, Segoe UI, sans-serif";

    ctx.fillStyle = "#1f5180";
    ctx.font = "900 34px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(config.title || "Ligar os pontos", paper.w / 2, 58);

    if (meta) {
      ctx.fillStyle = "#223344";
      ctx.font = "700 18px " + font;
      ctx.fillText(meta, paper.w / 2, 98);
    }

    if (config.lineWidth > 0) {
      ctx.save();
      ctx.strokeStyle = config.lineColor;
      ctx.lineWidth = config.lineWidth;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.95;
      ctx.setLineDash([7, 8]);
      for (var i = 0; i < points.length - 1; i++) {
        if (state.generated.autoBreaks.has(i) || config.hiddenStarts.has(i)) continue;
        ctx.beginPath();
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(points[i + 1].x, points[i + 1].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    points.forEach(function (p, i) {
      var label = String(config.startNumber + i);
      var lp = labelPosition(points, i, config, layout);
      ctx.fillStyle = "#223344";
      ctx.beginPath();
      ctx.arc(p.x, p.y, config.pointSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "800 " + config.numberSize + "px " + font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lp.x, lp.y);
    });

    return canvas;
  }

  function printActivity() {
    if (!renderActivity()) return;
    updatePrintPageStyle();
    window.print();
  }

  function downloadPng() {
    var config = getConfig();
    if (!state.generated) return;
    if (config.errors.length) {
      setMessage(config.errors.join(" "), "error");
      return;
    }
    var exportConfig = Object.assign({}, config, { showInspiration: false });
    var canvas = canvasForPng(exportConfig);

    if (canvas.toBlob) {
      canvas.toBlob(function (png) {
        if (!png) {
          setMessage("Não foi possível baixar o PNG. Use a impressão como alternativa.", "error");
          return;
        }
        saveBlob(png, "ligar-os-pontos.png");
      }, "image/png");
    } else {
      var a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "ligar-os-pontos.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  function saveBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function bindUpload() {
    dom.file.addEventListener("change", function () {
      handleFile(dom.file.files && dom.file.files[0]);
    });

    ["dragenter", "dragover"].forEach(function (type) {
      dom.dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        dom.dropzone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach(function (type) {
      dom.dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        dom.dropzone.classList.remove("is-dragging");
      });
    });

    dom.dropzone.addEventListener("drop", function (event) {
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      handleFile(file);
    });
  }

  function bindSettings() {
    dom.settings.addEventListener("input", function (event) {
      updateOutputs();
      if (!state.generated) return;
      if (event.target === dom.count) {
        setStatus("Quantidade alterada. Atualizando os pontos...", "");
        scheduleGenerate();
      } else {
        renderActivity();
      }
    });

    dom.settings.addEventListener("change", function (event) {
      updateOutputs();
      if (!state.generated) return;
      if (event.target === dom.count) {
        scheduleGenerate();
      } else {
        renderActivity();
      }
    });
  }

  function init() {
    if (!byId("ligar-os-pontos")) return;

    dom.file = byId("dots-file");
    dom.dropzone = byId("dots-dropzone");
    dom.message = byId("dots-message");
    dom.status = byId("dots-status");
    dom.original = byId("dots-original");
    dom.originalImg = byId("dots-original-img");
    dom.reference = byId("dots-reference");
    dom.referenceImg = byId("dots-reference-img");
    dom.activity = byId("dots-activity");
    dom.printPage = byId("dots-print-page");
    dom.settings = byId("dots-settings");
    dom.generate = byId("dots-generate");
    dom.print = byId("dots-print");
    dom.download = byId("dots-download");
    dom.title = byId("dots-title");
    dom.count = byId("dots-count");
    dom.countOutput = byId("dots-count-output");
    dom.start = byId("dots-start");
    dom.pointSize = byId("dots-point-size");
    dom.pointOutput = byId("dots-point-output");
    dom.numberSize = byId("dots-number-size");
    dom.numberOutput = byId("dots-number-output");
    dom.lineWidth = byId("dots-line-width");
    dom.lineOutput = byId("dots-line-output");
    dom.lineColor = byId("dots-line-color");
    dom.paper = byId("dots-paper");
    dom.child = byId("dots-child");
    dom.date = byId("dots-date");
    dom.klass = byId("dots-class");
    dom.showInspiration = byId("dots-show-inspiration");
    dom.hiddenPairs = byId("dots-hidden-pairs");

    updateOutputs();
    syncReference();
    bindUpload();
    bindSettings();
    dom.generate.addEventListener("click", generateActivity);
    dom.print.addEventListener("click", printActivity);
    dom.download.addEventListener("click", downloadPng);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
