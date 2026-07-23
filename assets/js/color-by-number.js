/* Educa4Good - Colorir por Numeros (client-side, sem dependencias).
   A imagem escolhida fica no navegador e nao e enviada para servidores. */
(function () {
  "use strict";

  var MAX_FILE_SIZE = 12 * 1024 * 1024;
  var RAW_MAX_SIDE = 1400;
  var OUT_W = 900;
  var OUT_H = 660;
  var PRESETS = {
    easy: { colors: 4, detail: "low" },
    medium: { colors: 6, detail: "medium" },
    hard: { colors: 8, detail: "medium" },
    challenge: { colors: 10, detail: "high" }
  };
  // numberArea nunca pode ser maior que minArea: regiao que sobrevive a fusao
  // precisa receber numero, senao a crianca ve um contorno sem saber o que pintar.
  var DETAIL = {
    low: { w: 78, minArea: 18, numberArea: 18, maxRegions: 90, blur: true },
    medium: { w: 112, minArea: 10, numberArea: 10, maxRegions: 150, blur: true },
    high: { w: 150, minArea: 6, numberArea: 6, maxRegions: 230, blur: false }
  };
  var PALETTE_PRESETS = {
    basic: ["#e53935", "#fdd835", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#ec407a", "#8d6e63", "#00acc1", "#7cb342"],
    soft: ["#ef9a9a", "#ffe082", "#90caf9", "#a5d6a7", "#ffcc80", "#ce93d8", "#f8bbd0", "#bcaaa4", "#b0bec5", "#80cbc4"],
    vibrant: ["#d50000", "#ffd600", "#2962ff", "#00c853", "#ff6d00", "#aa00ff", "#ff4081", "#795548", "#00b8d4", "#64dd17"],
    gray: ["#ffffff", "#e8edf2", "#c6cdd4", "#9aa4ad", "#747e87", "#555d65", "#343a40", "#1f2328", "#000000", "#bfc7cf"]
  };
  var COLOR_NAMES = [
    ["vermelho", [220, 48, 55]],
    ["amarelo", [245, 205, 55]],
    ["azul", [43, 108, 190]],
    ["verde", [62, 142, 88]],
    ["laranja", [240, 132, 36]],
    ["roxo", [128, 80, 170]],
    ["rosa", [220, 90, 140]],
    ["marrom", [125, 82, 55]],
    ["cinza", [140, 150, 160]],
    ["preto", [30, 32, 36]],
    ["branco", [245, 246, 248]],
    ["azul-claro", [130, 190, 230]]
  ];

  var dom = {};
  var state = {
    rawCanvas: null,
    rawName: "Demonstração",
    frameCanvas: null,
    result: null,
    view: "activity",
    showSolution: false,
    selectedColor: 0,
    painted: {},
    ready: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function makeCanvas(w, h) {
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    return canvas;
  }

  function hexToRgb(hex) {
    var clean = String(hex || "#000000").replace("#", "");
    if (clean.length === 3) clean = clean.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(clean, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(rgb) {
    return "#" + rgb.map(function (v) {
      return clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    }).join("");
  }

  function colorDistance(a, b) {
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  function nearestColorName(hex) {
    var rgb = hexToRgb(hex);
    var best = COLOR_NAMES[0];
    var bestD = Infinity;
    COLOR_NAMES.forEach(function (item) {
      var d = colorDistance(rgb, item[1]);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    });
    return best[0];
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
      title: (dom.title.value || "Colorir por números").trim(),
      colors: clamp(parseInt(dom.colors.value, 10) || 6, 4, 10),
      detail: dom.detail.value || "medium",
      palettePreset: dom.palettePreset.value || "auto",
      zoom: clamp(parseInt(dom.zoom.value, 10) || 100, 100, 220) / 100,
      panX: clamp(parseInt(dom.panX.value, 10) || 0, -100, 100) / 100,
      panY: clamp(parseInt(dom.panY.value, 10) || 0, -100, 100) / 100,
      simplifyBg: dom.simplifyBg.checked,
      child: dom.child.value.trim(),
      date: dom.date.value.trim(),
      klass: dom.klass.value.trim()
    };
  }

  function syncRangeLabels() {
    dom.zoomOutput.textContent = String(parseInt(dom.zoom.value, 10) || 100) + "%";
    dom.panXOutput.textContent = dom.panX.value;
    dom.panYOutput.textContent = dom.panY.value;
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

  function cloneCanvas(source) {
    var out = makeCanvas(source.width, source.height);
    out.getContext("2d").drawImage(source, 0, 0);
    return out;
  }

  function resizeImageToCanvas(img) {
    var naturalW = img.naturalWidth || img.width;
    var naturalH = img.naturalHeight || img.height;
    var scale = Math.min(1, RAW_MAX_SIDE / Math.max(naturalW, naturalH));
    var out = makeCanvas(naturalW * scale, naturalH * scale);
    var ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, out.width, out.height);
    return out;
  }

  function makeFrameCanvas(config) {
    var out = makeCanvas(OUT_W, OUT_H);
    var ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    if (!state.rawCanvas) return out;

    var fit = Math.min(OUT_W / state.rawCanvas.width, OUT_H / state.rawCanvas.height);
    var scale = fit * config.zoom;
    var drawW = state.rawCanvas.width * scale;
    var drawH = state.rawCanvas.height * scale;
    var maxX = Math.max(0, (drawW - OUT_W) / 2);
    var maxY = Math.max(0, (drawH - OUT_H) / 2);
    var x = (OUT_W - drawW) / 2 - config.panX * maxX;
    var y = (OUT_H - drawH) / 2 - config.panY * maxY;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(state.rawCanvas, x, y, drawW, drawH);
    return out;
  }

  function borderAverage(data, w, h) {
    var r = 0, g = 0, b = 0, n = 0;
    function add(x, y) {
      var i = (y * w + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    for (var x = 0; x < w; x++) {
      add(x, 0);
      add(x, h - 1);
    }
    for (var y = 1; y < h - 1; y++) {
      add(0, y);
      add(w - 1, y);
    }
    return n ? [r / n, g / n, b / n] : [255, 255, 255];
  }

  // A reducao para ~112 px faz o traco fino sumir: uma linha de 6 px numa
  // imagem de 1000 px vira 0,7 px e a media a dissolve em cinza claro, jogando
  // o desenho inteiro no grupo do fundo. Aqui cada celula pequena olha o pixel
  // mais escuro do bloco original e, se ele for bem mais escuro que a media,
  // assume essa cor. Assim contorno de desenho para colorir sobrevive, e area
  // de cor lisa (onde min ~ media) fica intacta.
  function keepThinStrokes(frameCanvas, data, smallW, smallH) {
    var fctx = frameCanvas.getContext("2d");
    var full = fctx.getImageData(0, 0, frameCanvas.width, frameCanvas.height).data;
    var fw = frameCanvas.width;
    var fh = frameCanvas.height;
    var blockW = fw / smallW;
    var blockH = fh / smallH;

    for (var sy = 0; sy < smallH; sy++) {
      var y0 = Math.floor(sy * blockH);
      var y1 = Math.min(fh, Math.max(y0 + 1, Math.ceil((sy + 1) * blockH)));
      for (var sx = 0; sx < smallW; sx++) {
        var x0 = Math.floor(sx * blockW);
        var x1 = Math.min(fw, Math.max(x0 + 1, Math.ceil((sx + 1) * blockW)));
        var darkest = 1e9, dr = 0, dg = 0, db = 0;
        for (var y = y0; y < y1; y++) {
          var row = y * fw;
          for (var x = x0; x < x1; x++) {
            var p = (row + x) * 4;
            var lum = 0.299 * full[p] + 0.587 * full[p + 1] + 0.114 * full[p + 2];
            if (lum < darkest) {
              darkest = lum;
              dr = full[p]; dg = full[p + 1]; db = full[p + 2];
            }
          }
        }
        var s = (sy * smallW + sx) * 4;
        var avg = 0.299 * data[s] + 0.587 * data[s + 1] + 0.114 * data[s + 2];
        if (darkest < avg - 34) {
          data[s] = dr; data[s + 1] = dg; data[s + 2] = db;
        }
      }
    }
  }

  function prepareSmallCanvas(frameCanvas, detailConfig, simplifyBg) {
    var smallW = detailConfig.w;
    var smallH = Math.round(smallW * OUT_H / OUT_W);
    var small = makeCanvas(smallW, smallH);
    var ctx = small.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, smallW, smallH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = detailConfig.blur ? "high" : "medium";
    ctx.drawImage(frameCanvas, 0, 0, smallW, smallH);

    var img = ctx.getImageData(0, 0, smallW, smallH);
    var data = img.data;
    keepThinStrokes(frameCanvas, data, smallW, smallH);
    var bg = borderAverage(data, smallW, smallH);
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      if (simplifyBg) {
        var lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum > 240 || colorDistance([r, g, b], bg) < 1500) {
          data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return small;
  }

  // ------------------------------------------------------------------
  // Desenho para colorir (traco escuro sobre fundo claro)
  // ------------------------------------------------------------------
  // Uma folha de colorir nao tem cor de onde tirar paleta: o k-means devolve
  // branco/cinza/preto e a atividade vira "pinte o contorno de preto". Nesses
  // casos o traco passa a ser separador e as AREAS FECHADAS e que recebem as
  // cores, que vem do preset escolhido.
  function detectLineArt(small) {
    var d = small.getContext("2d").getImageData(0, 0, small.width, small.height).data;
    var total = small.width * small.height;
    var claros = 0, cromaticos = 0;
    for (var p = 0; p < d.length; p += 4) {
      var r = d[p], g = d[p + 1], b = d[p + 2];
      if (0.299 * r + 0.587 * g + 0.114 * b > 232) claros++;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 34) cromaticos++;
    }
    return claros / total > 0.55 && cromaticos / total < 0.08;
  }

  // Limiar de Otsu: separa traco de fundo sem depender de valor fixo.
  function otsuThreshold(lum) {
    var hist = new Float64Array(256);
    var i;
    for (i = 0; i < lum.length; i++) hist[Math.max(0, Math.min(255, lum[i] | 0))]++;
    var total = lum.length;
    var sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = 0, bestVar = -1;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB;
      var mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > bestVar) { bestVar = between; best = i; }
    }
    return best;
  }

  // Colore o mapa de regioes de forma que vizinhas nunca recebam o mesmo
  // numero (guloso sobre o grafo de adjacencia).
  function colorRegionGraph(regionOf, ink, w, h, count, colors) {
    var vizinhos = [];
    var k;
    for (k = 0; k < count; k++) vizinhos.push({});
    function ligar(a, b) {
      if (a < 0 || b < 0 || a === b) return;
      vizinhos[a][b] = 1;
      vizinhos[b][a] = 1;
    }
    // Num desenho de contorno as areas NUNCA se tocam: existe sempre traco
    // entre elas. A vizinhanca precisa ser lida atraves do traco, senao o
    // grafo fica sem arestas e todas as areas recebem o mesmo numero.
    var raio = 2;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        if (!ink[i]) continue;
        var perto = [];
        for (var dy = -raio; dy <= raio; dy++) {
          var ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (var dx = -raio; dx <= raio; dx++) {
            var nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            var id = regionOf[ny * w + nx];
            if (id >= 0 && perto.indexOf(id) < 0) perto.push(id);
          }
        }
        for (var a = 0; a < perto.length; a++) {
          for (var b = a + 1; b < perto.length; b++) ligar(perto[a], perto[b]);
        }
      }
    }

    // Areas maiores primeiro: as cores mais usadas caem nas partes grandes.
    var ordem = [];
    for (k = 0; k < count; k++) ordem.push(k);
    ordem.sort(function (a, b) {
      return Object.keys(vizinhos[b]).length - Object.keys(vizinhos[a]).length;
    });

    var cor = new Int16Array(count);
    for (k = 0; k < count; k++) cor[k] = -1;
    var uso = new Int32Array(colors);
    ordem.forEach(function (regiao) {
      var usadas = {};
      Object.keys(vizinhos[regiao]).forEach(function (n) {
        var c = cor[parseInt(n, 10)];
        if (c >= 0) usadas[c] = 1;
      });
      // Entre as cores livres, escolhe a menos usada ate agora: distribui a
      // paleta inteira em vez de repetir sempre os primeiros numeros.
      var melhor = -1;
      for (var c = 0; c < colors; c++) {
        if (usadas[c]) continue;
        if (melhor < 0 || uso[c] < uso[melhor]) melhor = c;
      }
      if (melhor < 0) melhor = 0;
      cor[regiao] = melhor;
      uso[melhor]++;
    });
    return cor;
  }

  // Monta labels/paleta a partir do traco. O ultimo indice da paleta e o
  // contorno (id 0), que nao e pintavel.
  function buildLineArt(small, colors, detailConfig, presetName) {
    var w = small.width, h = small.height;
    var d = small.getContext("2d").getImageData(0, 0, w, h).data;
    var n = w * h;
    var lum = new Float32Array(n);
    var i, p;
    for (i = 0, p = 0; i < n; i++, p += 4) {
      lum[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    }
    var thr = Math.min(otsuThreshold(lum), 215);
    var ink = new Uint8Array(n);
    for (i = 0; i < n; i++) ink[i] = lum[i] < thr ? 1 : 0;

    // Areas fechadas entre os tracos.
    var regionOf = new Int32Array(n);
    for (i = 0; i < n; i++) regionOf[i] = -1;
    var stack = new Int32Array(n);
    var areas = [];
    for (var start = 0; start < n; start++) {
      if (ink[start] || regionOf[start] >= 0) continue;
      var id = areas.length;
      var top = 0, size = 0;
      stack[top++] = start;
      regionOf[start] = id;
      while (top > 0) {
        var idx = stack[--top];
        size++;
        var x = idx % w, y = (idx / w) | 0;
        if (x > 0 && !ink[idx - 1] && regionOf[idx - 1] < 0) { regionOf[idx - 1] = id; stack[top++] = idx - 1; }
        if (x < w - 1 && !ink[idx + 1] && regionOf[idx + 1] < 0) { regionOf[idx + 1] = id; stack[top++] = idx + 1; }
        if (y > 0 && !ink[idx - w] && regionOf[idx - w] < 0) { regionOf[idx - w] = id; stack[top++] = idx - w; }
        if (y < h - 1 && !ink[idx + w] && regionOf[idx + w] < 0) { regionOf[idx + w] = id; stack[top++] = idx + w; }
      }
      areas.push(size);
    }

    // Area miuda demais para pintar vira traco.
    var minArea = Math.max(4, detailConfig.minArea);
    for (i = 0; i < n; i++) {
      if (regionOf[i] >= 0 && areas[regionOf[i]] < minArea) { ink[i] = 1; regionOf[i] = -1; }
    }

    var cor = colorRegionGraph(regionOf, ink, w, h, areas.length, colors);
    var inkIndex = colors;
    var labels = new Uint16Array(n);
    for (i = 0; i < n; i++) {
      labels[i] = regionOf[i] >= 0 ? cor[regionOf[i]] : inkIndex;
    }

    var preset = PALETTE_PRESETS[presetName] || PALETTE_PRESETS.basic;
    var palette = [];
    for (i = 0; i < colors; i++) {
      var hex = preset[i % preset.length];
      palette.push({ id: i + 1, color: hex, original: hex, name: nearestColorName(hex) });
    }
    palette.push({ id: 0, color: "#26394b", original: "#26394b", name: "contorno", ink: true });
    return { labels: labels, palette: palette, inkIndex: inkIndex };
  }

  function collectPixels(canvas) {
    var ctx = canvas.getContext("2d");
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var pixels = [];
    for (var i = 0; i < data.length; i += 4) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    return pixels;
  }

  function luminance(rgb) {
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  }

  function initialCenters(pixels, k) {
    var bins = new Map();
    pixels.forEach(function (p) {
      var key = (p[0] >> 4) + "," + (p[1] >> 4) + "," + (p[2] >> 4);
      var item = bins.get(key);
      if (!item) {
        item = { count: 0, r: 0, g: 0, b: 0 };
        bins.set(key, item);
      }
      item.count++;
      item.r += p[0]; item.g += p[1]; item.b += p[2];
    });
    var sorted = Array.from(bins.values()).map(function (item) {
      return [item.r / item.count, item.g / item.count, item.b / item.count, item.count];
    }).sort(function (a, b) { return b[3] - a[3]; });
    var centers = [];
    sorted.forEach(function (candidate) {
      if (centers.length >= k) return;
      var rgb = candidate.slice(0, 3);
      var far = centers.every(function (c) { return colorDistance(rgb, c) > 900; });
      if (far) centers.push(rgb);
    });
    var step = Math.max(1, Math.floor(sorted.length / Math.max(1, k)));
    for (var i = 0; centers.length < k && i < sorted.length; i += step) {
      centers.push(sorted[i].slice(0, 3));
    }
    while (centers.length < k) centers.push([255, 255, 255]);
    return centers.slice(0, k);
  }

  function quantize(canvas, k) {
    var pixels = collectPixels(canvas);
    var centers = initialCenters(pixels, k);
    var labels = new Uint16Array(pixels.length);

    for (var iter = 0; iter < 9; iter++) {
      var sums = centers.map(function () { return [0, 0, 0, 0]; });
      pixels.forEach(function (p, index) {
        var best = 0, bestD = Infinity;
        for (var c = 0; c < centers.length; c++) {
          var d = colorDistance(p, centers[c]);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        labels[index] = best;
        sums[best][0] += p[0];
        sums[best][1] += p[1];
        sums[best][2] += p[2];
        sums[best][3]++;
      });
      sums.forEach(function (sum, index) {
        if (sum[3]) centers[index] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
      });
    }

    var order = centers.map(function (center, index) {
      return { index: index, lum: luminance(center), center: center };
    }).sort(function (a, b) { return b.lum - a.lum; });
    var remap = {};
    order.forEach(function (item, index) { remap[item.index] = index; });
    var sortedCenters = order.map(function (item) { return item.center; });
    for (var i = 0; i < labels.length; i++) labels[i] = remap[labels[i]];
    return { labels: labels, centers: sortedCenters };
  }

  function majorityNeighbor(labels, w, h, x, y, current) {
    var counts = {};
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var label = labels[ny * w + nx];
        if (label !== current) counts[label] = (counts[label] || 0) + 1;
      }
    }
    var best = current, bestCount = -1;
    Object.keys(counts).forEach(function (key) {
      if (counts[key] > bestCount) {
        bestCount = counts[key];
        best = parseInt(key, 10);
      }
    });
    return best;
  }

  function smoothMajority(labels, w, h) {
    var next = new Uint16Array(labels);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var index = y * w + x;
        var current = labels[index];
        var counts = {};
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var label = labels[(y + dy) * w + (x + dx)];
            counts[label] = (counts[label] || 0) + 1;
          }
        }
        var best = current, bestCount = counts[current] || 0;
        Object.keys(counts).forEach(function (key) {
          if (counts[key] > bestCount) {
            bestCount = counts[key];
            best = parseInt(key, 10);
          }
        });
        if (bestCount >= 6) next[index] = best;
      }
    }
    return next;
  }

  function findComponents(labels, w, h) {
    var visited = new Uint8Array(labels.length);
    var components = [];
    var q = [];
    for (var start = 0; start < labels.length; start++) {
      if (visited[start]) continue;
      var label = labels[start];
      var cells = [];
      var minX = w, minY = h, maxX = 0, maxY = 0;
      visited[start] = 1;
      q.length = 0;
      q.push(start);
      for (var head = 0; head < q.length; head++) {
        var idx = q[head];
        cells.push(idx);
        var x = idx % w, y = Math.floor(idx / w);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        var neighbors = [idx - 1, idx + 1, idx - w, idx + w];
        for (var n = 0; n < neighbors.length; n++) {
          var ni = neighbors[n];
          if (ni < 0 || ni >= labels.length || visited[ni] || labels[ni] !== label) continue;
          if ((n === 0 && x === 0) || (n === 1 && x === w - 1)) continue;
          visited[ni] = 1;
          q.push(ni);
        }
      }
      components.push({
        colorIndex: label,
        cells: cells,
        area: cells.length,
        minX: minX,
        maxX: maxX,
        minY: minY,
        maxY: maxY
      });
    }
    return components;
  }

  function mergeSmallRegions(labels, w, h, threshold, passes) {
    var out = new Uint16Array(labels);
    for (var pass = 0; pass < passes; pass++) {
      var components = findComponents(out, w, h);
      var changed = false;
      components.forEach(function (component) {
        if (component.area >= threshold) return;
        var counts = {};
        component.cells.forEach(function (idx) {
          var x = idx % w, y = Math.floor(idx / w);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
            var nx = x + d[0], ny = y + d[1];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
            var label = out[ny * w + nx];
            if (label !== component.colorIndex) counts[label] = (counts[label] || 0) + 1;
          });
        });
        var best = null, bestCount = -1;
        Object.keys(counts).forEach(function (key) {
          if (counts[key] > bestCount) {
            bestCount = counts[key];
            best = parseInt(key, 10);
          }
        });
        if (best != null) {
          component.cells.forEach(function (idx) { out[idx] = best; });
          changed = true;
        }
      });
      if (!changed) break;
    }
    return out;
  }

  function labelPosition(component, regionId, regionMap, w, h) {
    var bw = component.maxX - component.minX + 1;
    var bh = component.maxY - component.minY + 1;
    var size = bw * bh;
    var mask = new Uint8Array(size);
    var dist = new Int16Array(size);
    for (var i = 0; i < size; i++) dist[i] = -1;
    component.cells.forEach(function (idx) {
      var x = idx % w - component.minX;
      var y = Math.floor(idx / w) - component.minY;
      mask[y * bw + x] = 1;
    });

    var q = [];
    component.cells.forEach(function (idx) {
      var gx = idx % w;
      var gy = Math.floor(idx / w);
      var lx = gx - component.minX;
      var ly = gy - component.minY;
      var local = ly * bw + lx;
      var boundary = false;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = gx + d[0], ny = gy + d[1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || regionMap[ny * w + nx] !== regionId) boundary = true;
      });
      if (boundary) {
        dist[local] = 0;
        q.push(local);
      }
    });

    for (var head = 0; head < q.length; head++) {
      var current = q[head];
      var cx = current % bw;
      var cy = Math.floor(current / bw);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = cx + d[0], ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) return;
        var ni = ny * bw + nx;
        if (!mask[ni] || dist[ni] !== -1) return;
        dist[ni] = dist[current] + 1;
        q.push(ni);
      });
    }

    var sumX = 0, sumY = 0;
    component.cells.forEach(function (idx) {
      sumX += idx % w;
      sumY += Math.floor(idx / w);
    });
    var centroidX = sumX / component.cells.length;
    var centroidY = sumY / component.cells.length;
    var bestCell = component.cells[0];
    var bestScore = -Infinity;
    component.cells.forEach(function (idx) {
      var gx = idx % w;
      var gy = Math.floor(idx / w);
      var local = (gy - component.minY) * bw + (gx - component.minX);
      var d = dist[local];
      var dc = Math.hypot(gx - centroidX, gy - centroidY);
      var score = d * 1000 - dc;
      if (score > bestScore) {
        bestScore = score;
        bestCell = idx;
      }
    });
    var x = bestCell % w;
    var y = Math.floor(bestCell / w);
    return {
      x: (x + 0.5) / w * OUT_W,
      y: (y + 0.5) / h * OUT_H,
      clearance: Math.max(1, dist[(y - component.minY) * bw + (x - component.minX)])
    };
  }

  function buildRegions(labels, w, h, detailConfig, inkIndex) {
    var components = findComponents(labels, w, h);
    var regionMap = new Int32Array(labels.length);
    for (var i = 0; i < regionMap.length; i++) regionMap[i] = -1;
    components.sort(function (a, b) { return b.area - a.area; });
    var regions = components.map(function (component, id) {
      component.id = id;
      component.cells.forEach(function (idx) { regionMap[idx] = id; });
      return component;
    });
    // Toda regiao desenhada recebe numero. Se sobrar algum caco abaixo do
    // limiar (a fusao nao consegue absorver quem nao tem vizinho de outra cor),
    // ele ainda assim ganha um numero -- regiao sem numero e impintavel.
    regions.forEach(function (region) {
      var contorno = inkIndex >= 0 && region.colorIndex === inkIndex;
      region.label = (!contorno && region.area >= 3)
        ? labelPosition(region, region.id, regionMap, w, h)
        : null;
    });
    return { regions: regions, regionMap: regionMap };
  }

  function applyPalettePreset(palette, presetName) {
    if (presetName === "auto") return palette;
    var preset = PALETTE_PRESETS[presetName] || PALETTE_PRESETS.basic;
    return palette.map(function (item, index) {
      if (item.ink) return item;   // a cor do contorno nao entra no preset
      var color = preset[index % preset.length];
      return Object.assign({}, item, {
        color: color,
        name: nearestColorName(color)
      });
    });
  }

  function makePalette(centers, presetName) {
    var palette = centers.map(function (center, index) {
      var hex = rgbToHex(center);
      return {
        id: index + 1,
        color: hex,
        original: hex,
        name: nearestColorName(hex)
      };
    });
    return applyPalettePreset(palette, presetName);
  }

  function drawFlat(labels, w, h, palette, options) {
    var canvas = makeCanvas(OUT_W, OUT_H);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    var cellW = OUT_W / w;
    var cellH = OUT_H / h;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var label = labels[y * w + x];
        ctx.fillStyle = palette[label] ? palette[label].color : "#ffffff";
        ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
      }
    }
    if (options && options.boundaries) drawBoundaries(ctx, labels, w, h, options.boundaryColor || "rgba(40,58,70,0.45)", options.boundaryWidth || 1.2);
    return canvas;
  }

  function drawBoundaries(ctx, labels, w, h, color, width) {
    var cellW = OUT_W / w;
    var cellH = OUT_H / h;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        var label = labels[idx];
        var px = x * cellW;
        var py = y * cellH;
        if (x === 0 || labels[idx - 1] !== label) {
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + cellH);
        }
        if (y === 0 || labels[idx - w] !== label) {
          ctx.moveTo(px, py);
          ctx.lineTo(px + cellW, py);
        }
        if (x === w - 1) {
          ctx.moveTo(px + cellW, py);
          ctx.lineTo(px + cellW, py + cellH);
        }
        if (y === h - 1) {
          ctx.moveTo(px, py + cellH);
          ctx.lineTo(px + cellW, py + cellH);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function boxesOverlap(a, b, pad) {
    return !(a.right + pad < b.left ||
      a.left - pad > b.right ||
      a.bottom + pad < b.top ||
      a.top - pad > b.bottom);
  }

  function labelBox(x, y, w, h) {
    return {
      left: x - w / 2,
      right: x + w / 2,
      top: y - h / 2,
      bottom: y + h / 2
    };
  }

  function boxInsideCanvas(box) {
    return box.left >= 6 && box.top >= 6 && box.right <= OUT_W - 6 && box.bottom <= OUT_H - 6;
  }

  function boxCollides(box, placed) {
    for (var i = 0; i < placed.length; i++) {
      if (boxesOverlap(box, placed[i], 4)) return true;
    }
    return false;
  }

  function calloutCandidate(anchor, boxW, boxH, placed, fontSize) {
    var distances = [fontSize * 1.7, fontSize * 2.55, fontSize * 3.4, fontSize * 4.25];
    var directions = [
      [1, 0], [-1, 0], [0, -1], [0, 1],
      [1, -0.72], [-1, -0.72], [1, 0.72], [-1, 0.72]
    ];
    for (var d = 0; d < distances.length; d++) {
      for (var i = 0; i < directions.length; i++) {
        var dir = directions[i];
        var x = anchor.x + dir[0] * distances[d];
        var y = anchor.y + dir[1] * distances[d];
        var box = labelBox(x, y, boxW, boxH);
        if (boxInsideCanvas(box) && !boxCollides(box, placed)) {
          return { x: x, y: y, box: box };
        }
      }
    }
    return null;
  }

  function drawNumbers(ctx, regions, palette, scale) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var placed = [];
    regions.forEach(function (region) {
      if (!region.label) return;
      var number = palette[region.colorIndex] ? palette[region.colorIndex].id : region.colorIndex + 1;
      var text = String(number);
      var clearancePx = region.label.clearance * scale;
      var minClearance = text.length > 1 ? 13 : 9;
      var fontSize = clamp(clearancePx * 0.85 + 8, 12, 30);
      ctx.font = "900 " + fontSize + "px Nunito, Arial, sans-serif";
      var metrics = ctx.measureText(text);
      var boxW = metrics.width + Math.max(8, fontSize * 0.55);
      var boxH = fontSize * 1.35;
      var available = clearancePx * 2.08;
      var anchor = { x: region.label.x, y: region.label.y };
      var box = labelBox(anchor.x, anchor.y, boxW, boxH);
      var inPlace = clearancePx >= minClearance &&
        boxW <= available &&
        boxH <= available * 1.08 &&
        boxInsideCanvas(box) &&
        !boxCollides(box, placed);
      var position = inPlace ? { x: anchor.x, y: anchor.y, box: box } : calloutCandidate(anchor, boxW, boxH, placed, fontSize);
      if (!position) {
        // Ultimo recurso: encolhe o numero e escreve no proprio ponto da regiao.
        // Melhor um numero apertado do que uma regiao sem numero nenhum.
        fontSize = clamp(fontSize * 0.7, 10, 18);
        ctx.font = "900 " + fontSize + "px Nunito, Arial, sans-serif";
        boxW = ctx.measureText(text).width + 6;
        boxH = fontSize * 1.2;
        var fallbackX = clamp(anchor.x, boxW / 2 + 6, OUT_W - boxW / 2 - 6);
        var fallbackY = clamp(anchor.y, boxH / 2 + 6, OUT_H - boxH / 2 - 6);
        position = { x: fallbackX, y: fallbackY, box: labelBox(fallbackX, fallbackY, boxW, boxH) };
      }
      placed.push(position.box);

      if (!inPlace) {
        ctx.save();
        ctx.strokeStyle = "rgba(77, 93, 111, 0.76)";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo(position.x, position.y);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(77, 93, 111, 0.9)";
        ctx.lineWidth = 1.2;
        roundedRect(ctx, position.box.left, position.box.top, boxW, boxH, Math.min(8, boxH / 2));
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      ctx.lineWidth = Math.max(3, fontSize * 0.22);
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#1f3448";
      ctx.strokeText(text, position.x, position.y + 0.5);
      ctx.fillText(text, position.x, position.y + 0.5);
    });
    ctx.restore();
  }

  function drawActivity(includePaint) {
    var result = state.result;
    var canvas = makeCanvas(OUT_W, OUT_H);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    if (!result) return canvas;
    var cellW = OUT_W / result.w;
    var cellH = OUT_H / result.h;
    if (includePaint) {
      result.regions.forEach(function (region) {
        if (!state.painted[region.id]) return;
        ctx.fillStyle = result.palette[region.colorIndex].color;
        region.cells.forEach(function (idx) {
          var x = idx % result.w;
          var y = Math.floor(idx / result.w);
          ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
        });
      });
    }
    drawBoundaries(ctx, result.labels, result.w, result.h, "#26394b", 1.45);
    drawNumbers(ctx, result.regions, result.palette, Math.min(cellW, cellH));
    return canvas;
  }

  function renderPreview() {
    var ctx = dom.canvas.getContext("2d");
    dom.canvas.width = OUT_W;
    dom.canvas.height = OUT_H;
    ctx.clearRect(0, 0, OUT_W, OUT_H);
    if (!state.result) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      return;
    }
    var canvas;
    if (state.showSolution || state.view === "colored") {
      canvas = drawFlat(state.result.labels, state.result.w, state.result.h, state.result.palette, { boundaries: true });
    } else if (state.view === "original") {
      canvas = state.frameCanvas;
    } else if (state.view === "simplified") {
      canvas = drawFlat(state.result.labels, state.result.w, state.result.h, state.result.palette, { boundaries: false });
    } else {
      canvas = drawActivity(true);
    }
    ctx.drawImage(canvas, 0, 0);
  }

  function generate() {
    if (!state.rawCanvas) {
      setMessage("Escolha uma imagem ou use uma demonstração para começar.", "error");
      return false;
    }
    var config = getConfig();
    var detailConfig = DETAIL[config.detail] || DETAIL.medium;
    setStatus("Preparando sua atividade...", "");

    state.frameCanvas = makeFrameCanvas(config);
    var small = prepareSmallCanvas(state.frameCanvas, detailConfig, config.simplifyBg);
    var labels, palette;
    var inkIndex = -1;
    var lineArt = detectLineArt(small);

    if (lineArt) {
      // Folha de colorir: o traco separa, as areas fechadas recebem as cores.
      var art = buildLineArt(small, config.colors, detailConfig,
        config.palettePreset === "auto" ? "basic" : config.palettePreset);
      labels = art.labels;
      palette = art.palette;
      inkIndex = art.inkIndex;
    } else {
      var quantized = quantize(small, config.colors);
      labels = quantized.labels;
      labels = smoothMajority(labels, small.width, small.height);
      labels = mergeSmallRegions(labels, small.width, small.height, detailConfig.minArea, 3);
      var components = findComponents(labels, small.width, small.height);
      if (components.length > detailConfig.maxRegions) {
        // A suavizacao precisa vir ANTES da fusao: ela reabre regioes pequenas,
        // e a fusao tem de ser sempre o ultimo passo para nao sobrar caco sem numero.
        labels = smoothMajority(labels, small.width, small.height);
        labels = mergeSmallRegions(labels, small.width, small.height, detailConfig.minArea * 2, 3);
      }
      palette = makePalette(quantized.centers, config.palettePreset);
    }

    var regionData = buildRegions(labels, small.width, small.height, detailConfig, inkIndex);
    state.result = {
      w: small.width,
      h: small.height,
      labels: labels,
      regions: regionData.regions,
      regionMap: regionData.regionMap,
      palette: palette,
      inkIndex: inkIndex,
      lineArt: lineArt
    };
    state.painted = {};
    state.selectedColor = 0;
    state.view = "activity";
    state.showSolution = false;
    state.ready = true;
    setButtons(true);
    syncTabs();
    renderPalette();
    renderPreview();
    updateProgress();
    updatePrintAssets();
    setMessage("Atividade criada com " + palette.length + " cores.", "ok");
    setStatus("Atividade pronta. Edite a legenda ou clique nas regiões para colorir na tela.", "ok");
    return true;
  }

  function syncTabs() {
    document.querySelectorAll("[data-cbn-view]").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-cbn-view") === state.view && !state.showSolution);
    });
    dom.solution.textContent = state.showSolution ? "◎ Ocultar solução" : "◎ Ver solução";
  }

  function setButtons(enabled) {
    dom.regenerate.disabled = !enabled;
    dom.solution.disabled = !enabled;
    dom.resetPaint.disabled = !enabled;
    dom.print.disabled = !enabled;
    dom.printAnswer.disabled = !enabled;
  }

  function renderPalette() {
    if (!state.result) {
      dom.palette.innerHTML = "";
      return;
    }
    dom.selectedLabel.textContent = "Número selecionado: " + (state.result.palette[state.selectedColor] ? state.result.palette[state.selectedColor].id : 1);
    dom.palette.innerHTML = state.result.palette.map(function (item, index) {
      if (item.ink) return "";   // contorno nao e cor para a crianca pintar
      return '<div class="cbn-swatch' + (index === state.selectedColor ? " is-active" : "") + '">' +
        '<button type="button" class="cbn-swatch__pick" data-cbn-color="' + index + '" style="background:' + item.color + '">' + item.id + "</button>" +
        '<span class="cbn-swatch__text"><strong>' + item.id + " = " + item.name + '</strong><span>' + item.color.toUpperCase() + "</span></span>" +
        '<input type="color" aria-label="Editar cor do número ' + item.id + '" data-cbn-input="' + index + '" value="' + item.color + '">' +
        "</div>";
    }).join("");
  }

  function updateProgress() {
    if (!state.result) {
      dom.paintedCount.textContent = "0";
      dom.regionCount.textContent = "0";
      return;
    }
    var paintable = state.result.regions.filter(function (region) { return !!region.label; });
    var total = paintable.length;
    var painted = paintable.filter(function (region) { return !!state.painted[region.id]; }).length;
    dom.paintedCount.textContent = String(painted);
    dom.regionCount.textContent = String(total);
  }

  function metaHtml(config) {
    return [
      "Nome: " + (config.child || "____________________________"),
      "Data: " + (config.date || "____/____/______"),
      "Turma: " + (config.klass || "____________")
    ].map(function (item) {
      return "<span>" + item.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>";
    }).join("");
  }

  function legendHtml() {
    if (!state.result) return "";
    return state.result.palette.map(function (item) {
      if (item.ink) return "";
      return '<span class="cbn-print-key"><i style="background:' + item.color + '">' + item.id + "</i><strong>" + item.name + "</strong></span>";
    }).join("");
  }

  function updatePrintAssets() {
    if (!state.result) return;
    var config = getConfig();
    var activity = drawActivity(false);
    var answer = drawFlat(state.result.labels, state.result.w, state.result.h, state.result.palette, { boundaries: true, boundaryColor: "rgba(38,57,75,0.32)", boundaryWidth: 1 });
    dom.printMeta.innerHTML = metaHtml(config);
    dom.answerMeta.innerHTML = metaHtml(config);
    dom.printTitle.textContent = config.title || "Colorir por números";
    dom.answerTitle.textContent = "Gabarito — " + (config.title || "Colorir por números");
    dom.printActivityImg.src = activity.toDataURL("image/png");
    dom.answerImg.src = answer.toDataURL("image/png");
    dom.printLegend.innerHTML = legendHtml();
    dom.answerLegend.innerHTML = legendHtml();
  }

  function applyCurrentPalettePreset() {
    if (!state.result) return;
    state.result.palette = applyPalettePreset(state.result.palette, dom.palettePreset.value);
    state.result.palette.forEach(function (item) { item.name = nearestColorName(item.color); });
    renderPalette();
    renderPreview();
    updatePrintAssets();
  }

  function canvasPoint(event) {
    var rect = dom.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * OUT_W / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * OUT_H / Math.max(1, rect.height)
    };
  }

  function onCanvasClick(event) {
    if (!state.result || state.view !== "activity" || state.showSolution) return;
    var point = canvasPoint(event);
    var sx = clamp(Math.floor(point.x / OUT_W * state.result.w), 0, state.result.w - 1);
    var sy = clamp(Math.floor(point.y / OUT_H * state.result.h), 0, state.result.h - 1);
    var regionId = state.result.regionMap[sy * state.result.w + sx];
    var region = state.result.regions[regionId];
    if (!region || !region.label) {
      setStatus("Essa região é pequena demais para pintura por clique. Use a folha impressa para pintar com calma.", "");
      return;
    }
    if (region.colorIndex !== state.selectedColor) {
      var expected = state.result.palette[region.colorIndex].id;
      setStatus("Essa região pede o número " + expected + ".", "");
      return;
    }
    state.painted[region.id] = true;
    renderPreview();
    updateProgress();
    setStatus("Região do número " + state.result.palette[state.selectedColor].id + " colorida.", "ok");
  }

  function loadFile(file) {
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
      setSourceCanvas(resizeImageToCanvas(img), file.name || "Imagem escolhida");
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setMessage("Não foi possível ler essa imagem. Tente PNG, JPG ou WebP.", "error");
    };
    img.src = url;
  }

  function setSourceCanvas(canvas, name) {
    state.rawCanvas = cloneCanvas(canvas);
    state.rawName = name || "Imagem escolhida";
    dom.originalImg.src = state.rawCanvas.toDataURL("image/png");
    dom.originalFig.hidden = false;
    setMessage("Imagem carregada. Ajuste as opções e gere a atividade.", "ok");
    generate();
  }

  function drawDemo(kind) {
    var canvas = makeCanvas(980, 720);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (kind === "rocket") {
      var sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
      sky.addColorStop(0, "#bde5ff");
      sky.addColorStop(1, "#eef7ff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f6c85f";
      ctx.beginPath();
      ctx.arc(125, 120, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7b6bd6";
      for (var s = 0; s < 8; s++) {
        ctx.beginPath();
        ctx.arc(230 + s * 82, 105 + (s % 3) * 38, 9 + (s % 2) * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(500, 350);
      ctx.rotate(-0.45);
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, -78, -170, 156, 260, 46);
      ctx.fill();
      ctx.fillStyle = "#d84c5f";
      ctx.beginPath();
      ctx.moveTo(-78, -110);
      ctx.quadraticCurveTo(0, -238, 78, -110);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2b6ca3";
      ctx.beginPath();
      ctx.arc(0, -58, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#90caf9";
      ctx.beginPath();
      ctx.arc(0, -58, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0b429";
      ctx.beginPath();
      ctx.moveTo(-44, 88);
      ctx.lineTo(-82, 172);
      ctx.lineTo(-12, 112);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(44, 88);
      ctx.lineTo(82, 172);
      ctx.lineTo(12, 112);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fb8c00";
      ctx.beginPath();
      ctx.moveTo(-38, 104);
      ctx.quadraticCurveTo(0, 210, 38, 104);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#5daf6a";
      ctx.fillRect(0, 605, canvas.width, 115);
    } else {
      var bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bg.addColorStop(0, "#dff4ff");
      bg.addColorStop(1, "#fff9e7");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#95d38c";
      ctx.beginPath();
      ctx.moveTo(0, 500);
      ctx.quadraticCurveTo(240, 370, 500, 500);
      ctx.quadraticCurveTo(720, 610, 980, 470);
      ctx.lineTo(980, 720);
      ctx.lineTo(0, 720);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#3e8e58";
      ctx.fillRect(0, 570, canvas.width, 150);
      ctx.fillStyle = "#f0b429";
      ctx.beginPath();
      ctx.arc(815, 118, 50, 0, Math.PI * 2);
      ctx.fill();
      for (var i = 0; i < 5; i++) {
        var x = 145 + i * 150;
        ctx.fillStyle = "#7a513d";
        ctx.fillRect(x + 24, 360, 22, 170);
        ctx.fillStyle = ["#43a047", "#2f9f68", "#7cb342", "#3e8e58", "#66bb6a"][i];
        ctx.beginPath();
        ctx.arc(x + 35, 326, 62, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#d66d8c";
      for (var f = 0; f < 6; f++) {
        var fx = 130 + f * 120;
        var fy = 545 + (f % 2) * 34;
        ctx.beginPath();
        ctx.arc(fx, fy, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = f % 2 ? "#f6a6b8" : "#f0b429";
      }
      ctx.fillStyle = "#d87a59";
      roundedRect(ctx, 368, 418, 190, 112, 12);
      ctx.fill();
      ctx.fillStyle = "#874832";
      ctx.beginPath();
      ctx.moveTo(342, 420);
      ctx.lineTo(462, 316);
      ctx.lineTo(586, 420);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff4c9";
      ctx.fillRect(405, 454, 42, 40);
      ctx.fillRect(480, 454, 42, 40);
    }
    return canvas;
  }

  function useDemo(kind) {
    setSourceCanvas(drawDemo(kind), kind === "rocket" ? "Demonstração: foguete" : "Demonstração: jardim");
  }

  function resetFrame() {
    dom.zoom.value = "100";
    dom.panX.value = "0";
    dom.panY.value = "0";
    syncRangeLabels();
    if (state.rawCanvas) generate();
  }

  function printActivity() {
    if (!state.ready && !generate()) return;
    updatePrintAssets();
    document.body.classList.remove("cbn-print-answer-only");
    window.setTimeout(function () { window.print(); }, 50);
  }

  function printAnswer() {
    if (!state.ready && !generate()) return;
    updatePrintAssets();
    document.body.classList.add("cbn-print-answer-only");
    window.setTimeout(function () { window.print(); }, 50);
  }

  function bindEvents() {
    dom.file.addEventListener("change", function () {
      loadFile(dom.file.files && dom.file.files[0]);
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
      loadFile(files && files[0]);
    });

    document.querySelectorAll("[data-cbn-demo]").forEach(function (button) {
      button.addEventListener("click", function () {
        useDemo(button.getAttribute("data-cbn-demo"));
      });
    });

    dom.preset.addEventListener("change", function () {
      var preset = PRESETS[dom.preset.value] || PRESETS.medium;
      dom.colors.value = String(preset.colors);
      dom.detail.value = preset.detail;
      if (state.rawCanvas) generate();
    });
    [dom.colors, dom.detail, dom.simplifyBg].forEach(function (element) {
      element.addEventListener("change", function () {
        if (state.rawCanvas) generate();
      });
    });
    [dom.zoom, dom.panX, dom.panY].forEach(function (element) {
      element.addEventListener("input", syncRangeLabels);
      element.addEventListener("change", function () {
        if (state.rawCanvas) generate();
      });
    });
    dom.palettePreset.addEventListener("change", function () {
      if (state.result) applyCurrentPalettePreset();
    });
    dom.resetFrame.addEventListener("click", resetFrame);
    dom.generate.addEventListener("click", generate);
    dom.regenerate.addEventListener("click", generate);
    dom.solution.addEventListener("click", function () {
      if (!state.result) return;
      state.showSolution = !state.showSolution;
      if (state.showSolution) state.view = "colored";
      syncTabs();
      renderPreview();
      setStatus(state.showSolution ? "Solução colorida visível." : "Solução ocultada.", "");
    });
    dom.resetPaint.addEventListener("click", function () {
      state.painted = {};
      state.showSolution = false;
      state.view = "activity";
      syncTabs();
      renderPreview();
      updateProgress();
      setStatus("Pintura da tela limpa.", "");
    });
    dom.print.addEventListener("click", printActivity);
    dom.printAnswer.addEventListener("click", printAnswer);
    dom.canvas.addEventListener("click", onCanvasClick);

    document.querySelectorAll("[data-cbn-view]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.view = button.getAttribute("data-cbn-view");
        state.showSolution = false;
        syncTabs();
        renderPreview();
      });
    });
    dom.palette.addEventListener("click", function (event) {
      var button = event.target.closest("[data-cbn-color]");
      if (!button || !state.result) return;
      state.selectedColor = parseInt(button.getAttribute("data-cbn-color"), 10) || 0;
      renderPalette();
    });
    dom.palette.addEventListener("input", function (event) {
      if (!event.target.matches("[data-cbn-input]") || !state.result) return;
      var index = parseInt(event.target.getAttribute("data-cbn-input"), 10) || 0;
      var item = state.result.palette[index];
      if (!item) return;
      item.color = event.target.value;
      item.name = nearestColorName(item.color);
      renderPalette();
      renderPreview();
      updatePrintAssets();
    });
    [dom.title, dom.child, dom.date, dom.klass].forEach(function (input) {
      input.addEventListener("input", updatePrintAssets);
    });
    window.addEventListener("afterprint", function () {
      document.body.classList.remove("cbn-print-answer-only");
    });
  }

  function init() {
    if (!byId("colorir-por-numeros")) return;

    dom.file = byId("cbn-file");
    dom.dropzone = byId("cbn-dropzone");
    dom.message = byId("cbn-message");
    dom.status = byId("cbn-status");
    dom.originalFig = byId("cbn-original");
    dom.originalImg = byId("cbn-original-img");
    dom.title = byId("cbn-title");
    dom.preset = byId("cbn-preset");
    dom.colors = byId("cbn-colors");
    dom.detail = byId("cbn-detail");
    dom.palettePreset = byId("cbn-palette-preset");
    dom.zoom = byId("cbn-zoom");
    dom.panX = byId("cbn-pan-x");
    dom.panY = byId("cbn-pan-y");
    dom.zoomOutput = byId("cbn-zoom-output");
    dom.panXOutput = byId("cbn-pan-x-output");
    dom.panYOutput = byId("cbn-pan-y-output");
    dom.simplifyBg = byId("cbn-simplify-bg");
    dom.resetFrame = byId("cbn-reset-frame");
    dom.child = byId("cbn-child");
    dom.date = byId("cbn-date");
    dom.klass = byId("cbn-class");
    dom.generate = byId("cbn-generate");
    dom.regenerate = byId("cbn-regenerate");
    dom.solution = byId("cbn-solution");
    dom.resetPaint = byId("cbn-reset-paint");
    dom.print = byId("cbn-print");
    dom.printAnswer = byId("cbn-print-answer");
    dom.canvas = byId("cbn-canvas");
    dom.palette = byId("cbn-palette");
    dom.selectedLabel = byId("cbn-selected-label");
    dom.paintedCount = byId("cbn-painted-count");
    dom.regionCount = byId("cbn-region-count");
    dom.printMeta = byId("cbn-print-meta");
    dom.answerMeta = byId("cbn-answer-meta");
    dom.printTitle = byId("cbn-print-title");
    dom.answerTitle = byId("cbn-answer-title");
    dom.printActivityImg = byId("cbn-print-activity-img");
    dom.answerImg = byId("cbn-answer-img");
    dom.printLegend = byId("cbn-print-legend");
    dom.answerLegend = byId("cbn-answer-legend");

    syncRangeLabels();
    setButtons(false);
    bindEvents();
    useDemo("garden");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
