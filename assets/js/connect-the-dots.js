/* Educa4Good — Ligar os Pontos (client-side, sem dependências).
   A imagem escolhida é lida localmente e processada em canvas no navegador.
   Nenhum arquivo é enviado, armazenado ou passado para APIs externas. */
(function () {
  "use strict";

  var MAX_FILE_SIZE = 12 * 1024 * 1024;
  var PROCESS_MAX = 560;
  var MIN_VECTOR_AREA_RATIO = 0.00035;
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

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function otsuThreshold(gray) {
    var histogram = new Uint32Array(256);
    var sum = 0;
    for (var i = 0; i < gray.length; i++) {
      var value = clamp(Math.round(gray[i]), 0, 255);
      histogram[value]++;
      sum += value;
    }

    var backgroundWeight = 0;
    var backgroundSum = 0;
    var bestVariance = -1;
    var best = 127;
    for (var threshold = 0; threshold < 255; threshold++) {
      backgroundWeight += histogram[threshold];
      if (!backgroundWeight) continue;
      var foregroundWeight = gray.length - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += threshold * histogram[threshold];
      var backgroundMean = backgroundSum / backgroundWeight;
      var foregroundMean = (sum - backgroundSum) / foregroundWeight;
      var variance = backgroundWeight * foregroundWeight * Math.pow(backgroundMean - foregroundMean, 2);
      if (variance > bestVariance) {
        bestVariance = variance;
        best = threshold;
      }
    }
    return best;
  }

  function borderAverage(gray, w, h) {
    var sum = 0;
    var count = 0;
    var stepX = Math.max(1, Math.floor(w / 80));
    var stepY = Math.max(1, Math.floor(h / 80));
    for (var x = 0; x < w; x += stepX) {
      sum += gray[x] + gray[(h - 1) * w + x];
      count += 2;
    }
    for (var y = 1; y < h - 1; y += stepY) {
      sum += gray[y * w] + gray[y * w + w - 1];
      count += 2;
    }
    return count ? sum / count : 255;
  }

  function closeInkMask(mask, w, h) {
    var dilated = new Uint8Array(mask.length);
    var closed = new Uint8Array(mask.length);
    var x;
    var y;
    var dx;
    var dy;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var found = 0;
        for (dy = -1; dy <= 1 && !found; dy++) {
          for (dx = -1; dx <= 1; dx++) {
            var nx = x + dx;
            var ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) {
              found = 1;
              break;
            }
          }
        }
        dilated[y * w + x] = found;
      }
    }

    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        var keep = 1;
        for (dy = -1; dy <= 1 && keep; dy++) {
          for (dx = -1; dx <= 1; dx++) {
            if (!dilated[(y + dy) * w + x + dx]) {
              keep = 0;
              break;
            }
          }
        }
        closed[y * w + x] = keep;
      }
    }
    return closed;
  }

  function makeInkMask(gray, w, h) {
    var lightBackground = borderAverage(gray, w, h) >= 128;
    var threshold = otsuThreshold(gray);
    threshold = lightBackground ? clamp(threshold + 14, 42, 226) : clamp(threshold - 14, 29, 213);
    var mask = new Uint8Array(gray.length);
    var ink = 0;

    for (var i = 0; i < gray.length; i++) {
      var isInk = lightBackground ? gray[i] <= threshold : gray[i] >= threshold;
      if (isInk) {
        mask[i] = 1;
        ink++;
      }
    }

    var ratio = ink / mask.length;
    if (ratio < 0.0006 || ratio > 0.48) {
      throw new Error("Não encontrei uma silhueta limpa. Tente um desenho com fundo uniforme e linhas bem contrastadas.");
    }
    return closeInkMask(mask, w, h);
  }

  function vectorPointKey(point) {
    return point.x + "," + point.y;
  }

  function traceBoundaryLoops(mask, w, h) {
    var edges = [];
    var starts = new Map();

    function addEdge(ax, ay, bx, by, direction) {
      var edge = {
        a: { x: ax, y: ay },
        b: { x: bx, y: by },
        direction: direction,
        used: false
      };
      var index = edges.length;
      edges.push(edge);
      var key = vectorPointKey(edge.a);
      if (!starts.has(key)) starts.set(key, []);
      starts.get(key).push(index);
    }

    function filled(x, y) {
      return x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x];
    }

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (!filled(x, y)) continue;
        if (!filled(x, y - 1)) addEdge(x, y, x + 1, y, 0);
        if (!filled(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1, 1);
        if (!filled(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1, 2);
        if (!filled(x - 1, y)) addEdge(x, y + 1, x, y, 3);
      }
    }

    function nextEdge(edge) {
      var candidates = (starts.get(vectorPointKey(edge.b)) || []).filter(function (index) {
        return !edges[index].used;
      });
      if (!candidates.length) return -1;
      var preference = [1, 0, 3, 2];
      for (var p = 0; p < preference.length; p++) {
        for (var c = 0; c < candidates.length; c++) {
          var candidate = edges[candidates[c]];
          if ((candidate.direction - edge.direction + 4) % 4 === preference[p]) return candidates[c];
        }
      }
      return candidates[0];
    }

    var loops = [];
    edges.forEach(function (first, startIndex) {
      if (first.used) return;
      var path = [first.a];
      var index = startIndex;
      var guard = 0;
      while (index >= 0 && guard <= edges.length) {
        var edge = edges[index];
        if (edge.used) break;
        edge.used = true;
        path.push(edge.b);
        if (edge.b.x === path[0].x && edge.b.y === path[0].y) break;
        index = nextEdge(edge);
        guard++;
      }
      if (path.length >= 9 && path[path.length - 1].x === path[0].x && path[path.length - 1].y === path[0].y) {
        path.pop();
        loops.push(path);
      }
    });
    return loops;
  }

  function closedPathLength(path) {
    var total = 0;
    for (var i = 0; i < path.length; i++) total += distance(path[i], path[(i + 1) % path.length]);
    return total;
  }

  function polygonArea(path) {
    var area = 0;
    for (var i = 0; i < path.length; i++) {
      var a = path[i];
      var b = path[(i + 1) % path.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
  }

  function contourBounds(path) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    path.forEach(function (point) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function smoothClosedPath(path, passes) {
    var current = path.slice();
    for (var pass = 0; pass < passes; pass++) {
      current = current.map(function (point, index) {
        var prev = current[(index - 1 + current.length) % current.length];
        var next = current[(index + 1) % current.length];
        return {
          x: (prev.x + point.x * 2 + next.x) / 4,
          y: (prev.y + point.y * 2 + next.y) / 4
        };
      });
    }
    return current;
  }

  function pointInPolygon(point, polygon) {
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var a = polygon[i];
      var b = polygon[j];
      var crosses = ((a.y > point.y) !== (b.y > point.y)) &&
        point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 0.00001) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function resampleClosedPath(path, count) {
    if (!path.length || count <= 0) return [];
    if (path.length === 1 || count === 1) return [{ x: path[0].x, y: path[0].y }];

    var lengths = [0];
    var total = 0;
    for (var i = 0; i < path.length; i++) {
      total += distance(path[i], path[(i + 1) % path.length]);
      lengths.push(total);
    }
    if (total <= 0) return [{ x: path[0].x, y: path[0].y }];

    var out = [];
    var segment = 0;
    for (var k = 0; k < count; k++) {
      var target = total * k / count;
      while (segment < path.length - 1 && lengths[segment + 1] < target) segment++;
      var startLength = lengths[segment];
      var endLength = lengths[segment + 1];
      var t = endLength === startLength ? 0 : (target - startLength) / (endLength - startLength);
      var a = path[segment];
      var b = path[(segment + 1) % path.length];
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      });
    }
    return out;
  }

  function extractVectorContours(pointCount) {
    var prep = prepareCanvas(state.image);
    var data = prep.ctx.getImageData(0, 0, prep.w, prep.h);
    var gray = grayscale(data);
    var mask = makeInkMask(gray, prep.w, prep.h);
    var imageArea = prep.w * prep.h;
    var contours = traceBoundaryLoops(mask, prep.w, prep.h).map(function (path) {
      var area = polygonArea(path);
      var smoothed = smoothClosedPath(path, 2);
      return {
        path: smoothed,
        area: area,
        length: closedPathLength(smoothed),
        bounds: contourBounds(smoothed)
      };
    }).filter(function (contour) {
      return contour.area > imageArea * MIN_VECTOR_AREA_RATIO &&
        contour.length > Math.min(prep.w, prep.h) * 0.12;
    }).sort(function (a, b) {
      return b.area - a.area;
    });

    if (!contours.length) {
      throw new Error("Não encontrei contornos nítidos nessa imagem. Tente um desenho com fundo mais simples e alto contraste.");
    }

    var primary = contours[0];
    var maxContours = Math.max(1, Math.min(4, Math.floor(pointCount / 8)));
    var selected = [primary];
    for (var i = 1; i < contours.length && selected.length < maxContours; i++) {
      var candidate = contours[i];
      var center = {
        x: candidate.bounds.x + candidate.bounds.w / 2,
        y: candidate.bounds.y + candidate.bounds.h / 2
      };
      var isInternalDetail = pointInPolygon(center, primary.path);
      var isSignificant = candidate.area >= primary.area * 0.07 &&
        candidate.length >= primary.length * 0.18;
      if (!isInternalDetail && isSignificant) selected.push(candidate);
    }

    state.processSize = { w: prep.w, h: prep.h };
    return selected;
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

  function generatePointsFromImage(config) {
    var contours = extractVectorContours(config.pointCount);
    var allocated = allocateCounts(contours, config.pointCount);
    var points = [];
    var autoBreaks = new Set();
    var ranges = [];
    var vectorPaths = [];

    // Quando há múltiplos contornos, usamos os maiores primeiro, distribuímos
    // pontos proporcionalmente ao comprimento e quebramos a linha entre eles.
    allocated.contours.forEach(function (contour, index) {
      var sampled = resampleClosedPath(contour.path, allocated.counts[index]);
      if (points.length && sampled.length) autoBreaks.add(points.length - 1);
      var start = points.length;
      sampled.forEach(function (p) { points.push(p); });
      ranges.push({ start: start, end: points.length - 1 });
      vectorPaths.push(resampleClosedPath(contour.path, Math.min(260, Math.max(48, Math.round(contour.length / 2)))));
    });

    if (points.length < 2) {
      throw new Error("A imagem gerou poucos pontos. Tente outra figura ou aumente o contraste.");
    }

    if (points.length > config.pointCount) points = points.slice(0, config.pointCount);
    return {
      points: points,
      autoBreaks: autoBreaks,
      ranges: ranges,
      vectorPaths: vectorPaths,
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
    var range = (state.generated.ranges || []).find(function (item) {
      return index >= item.start && index <= item.end;
    }) || { start: 0, end: points.length - 1 };
    var prev = points[index === range.start ? range.end : index - 1];
    var next = points[index === range.end ? range.start : index + 1];
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

  function labelPositions(points, config, layout) {
    var positions = points.map(function (_, index) {
      return labelPosition(points, index, config, layout);
    });
    var minDistance = config.numberSize * 1.42;

    for (var pass = 0; pass < 4; pass++) {
      for (var i = 0; i < positions.length; i++) {
        for (var j = i + 1; j < positions.length; j++) {
          var dx = positions[j].x - positions[i].x;
          var dy = positions[j].y - positions[i].y;
          var length = Math.hypot(dx, dy);
          if (length >= minDistance) continue;
          if (length < 0.01) {
            dx = j % 2 ? 1 : -1;
            dy = i % 2 ? 1 : -1;
            length = Math.hypot(dx, dy);
          }
          var shift = (minDistance - length) / 2 + 0.5;
          var ux = dx / length;
          var uy = dy / length;
          positions[i].x = clamp(positions[i].x - ux * shift, 18, layout.paper.w - 18);
          positions[i].y = clamp(positions[i].y - uy * shift, layout.bounds.top - 10, layout.paper.h - 22);
          positions[j].x = clamp(positions[j].x + ux * shift, 18, layout.paper.w - 18);
          positions[j].y = clamp(positions[j].y + uy * shift, layout.bounds.top - 10, layout.paper.h - 22);
        }
      }
    }
    return positions;
  }

  function mapVectorPath(path, layout) {
    return path.map(function (point) {
      return {
        x: layout.bounds.x + (point.x / state.processSize.w) * layout.bounds.w,
        y: layout.bounds.y + (point.y / state.processSize.h) * layout.bounds.h
      };
    });
  }

  function svgPathData(path, closed) {
    if (!path.length) return "";
    var commands = ["M " + path[0].x.toFixed(2) + " " + path[0].y.toFixed(2)];
    for (var i = 1; i < path.length; i++) {
      commands.push("L " + path[i].x.toFixed(2) + " " + path[i].y.toFixed(2));
    }
    if (closed) commands.push("Z");
    return commands.join(" ");
  }

  function guidePathData(points, breaks, hiddenStarts) {
    if (!points.length) return "";
    var commands = ["M " + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2)];
    for (var i = 0; i < points.length - 1; i++) {
      var command = breaks.has(i) || hiddenStarts.has(i) ? "M " : "L ";
      commands.push(command + points[i + 1].x.toFixed(2) + " " + points[i + 1].y.toFixed(2));
    }
    return commands.join(" ");
  }

  function buildSvg(config) {
    var generated = state.generated;
    var layout = mapPoints(generated.points, config);
    var paper = layout.paper;
    var points = layout.points;
    var labels = labelPositions(points, config, layout);
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

    svg.push('<g class="dots-svg__source" fill="none" stroke="none" aria-hidden="true">');
    (generated.vectorPaths || []).forEach(function (path) {
      svg.push('<path data-source-contour="true" d="' + svgPathData(mapVectorPath(path, layout), true) + '"/>');
    });
    svg.push("</g>");

    if (config.lineWidth > 0) {
      svg.push('<path class="dots-svg__guide" d="' + guidePathData(points, generated.autoBreaks, config.hiddenStarts) + '" fill="none" stroke="' + escapeHtml(config.lineColor) + '" stroke-width="' + config.lineWidth + '" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="7 8" opacity="0.95"/>');
    }

    svg.push("<g>");
    points.forEach(function (p, i) {
      var label = String(config.startNumber + i);
      var lp = labels[i];
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
    setStatus("Vetorizando o contorno no navegador...", "");
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
    var labels = labelPositions(points, config, layout);
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
      var lp = labels[i];
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
