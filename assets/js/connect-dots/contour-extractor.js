/* Educa4Good — Ligar os Pontos
   Extração de contornos com OpenCV.js.

   ATENÇÃO — este arquivo é um SCRIPT CLÁSSICO, de propósito. Ele é carregado
   com `importScripts()` dentro do Web Worker (que não aceita ES Modules junto
   com importScripts) e com uma tag <script> no caminho alternativo em thread
   principal. Por isso não há `import`/`export` aqui: a API é publicada em
   `self.CdContourExtractor`.

   O restante da aplicação é ES Modules. A classificação dos candidatos, que é
   onde mora a lógica de verdade, fica em `contour-classifier.js` (módulo puro
   e testado). Aqui só há a cola do OpenCV. */

(function (scope) {
  "use strict";

  var MAX_CONTOURS = 40;

  function odd(value, min, max) {
    var n = Math.round(value);
    if (n % 2 === 0) n += 1;
    return Math.min(max, Math.max(min, n));
  }

  /** Máscara binária onde a "tinta" vale 255. */
  function buildMask(cv, src, params) {
    var mask = new cv.Mat();
    var usedThreshold = -1;

    if (params.useAlpha) {
      // PNG/WebP com transparência: o canal alfa é o sinal mais limpo que
      // existe para uma silhueta. Não há por que adivinhar limiar de cor.
      var channels = new cv.MatVector();
      cv.split(src, channels);
      var alpha = channels.get(3);
      cv.threshold(alpha, mask, 8, 255, cv.THRESH_BINARY);
      usedThreshold = 8;
      channels.delete();
      alpha.delete();
    } else {
      var gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      if (params.denoise > 0) {
        cv.medianBlur(gray, gray, params.denoise >= 2 ? 5 : 3);
      }

      if (params.thresholdMode === "adaptive") {
        cv.adaptiveThreshold(
          gray,
          mask,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY_INV,
          odd(params.blockSize, 3, 99),
          params.constant
        );
      } else if (params.thresholdMode === "manual") {
        usedThreshold = params.threshold;
        cv.threshold(gray, mask, params.threshold, 255, cv.THRESH_BINARY_INV);
      } else {
        usedThreshold = cv.threshold(gray, mask, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      }
      gray.delete();
    }

    if (params.invert) cv.bitwise_not(mask, mask);

    // Abertura remove pontinhos de ruído; fechamento costura falhas do traço.
    if (params.open > 0) {
      var openKernel = cv.getStructuringElement(
        cv.MORPH_ELLIPSE,
        new cv.Size(odd(params.open * 2 + 1, 3, 21), odd(params.open * 2 + 1, 3, 21))
      );
      cv.morphologyEx(mask, mask, cv.MORPH_OPEN, openKernel);
      openKernel.delete();
    }
    if (params.close > 0) {
      var closeKernel = cv.getStructuringElement(
        cv.MORPH_ELLIPSE,
        new cv.Size(odd(params.close * 2 + 1, 3, 21), odd(params.close * 2 + 1, 3, 21))
      );
      cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, closeKernel);
      closeKernel.delete();
    }

    return { mask: mask, threshold: usedThreshold };
  }

  function matToPoints(mat) {
    var points = [];
    var data = mat.data32S;
    for (var i = 0; i < data.length; i += 2) {
      points.push({ x: data[i], y: data[i + 1] });
    }
    return points;
  }

  /**
   * Fração do contorno que encosta na borda da imagem.
   *
   * A margem é proporcional ao tamanho da imagem, não fixa em 1 ou 2 px:
   * moldura de digitalização, borda de captura de tela e enquadramento
   * impresso quase nunca caem exatamente na coluna zero. Com margem fixa a
   * moldura passava batida e virava "a figura".
   */
  function borderContactRatio(points, width, height) {
    if (!points.length) return 0;
    var margin = Math.max(2, Math.round(Math.min(width, height) * 0.012));
    var touching = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (
        p.x <= margin ||
        p.y <= margin ||
        p.x >= width - 1 - margin ||
        p.y >= height - 1 - margin
      ) {
        touching += 1;
      }
    }
    return touching / points.length;
  }

  /**
   * @param {object} cv namespace do OpenCV já inicializado
   * @param {{width:number,height:number,data:Uint8ClampedArray}} imageData
   * @param {object} params
   * @returns {{contours: object[], binary: object, threshold: number}}
   */
  function extractContours(cv, imageData, params) {
    var settings = {
      thresholdMode: params.thresholdMode || "otsu",
      threshold: typeof params.threshold === "number" ? params.threshold : 128,
      blockSize: params.blockSize || 25,
      constant: typeof params.constant === "number" ? params.constant : 5,
      invert: !!params.invert,
      open: params.open || 0,
      close: params.close || 0,
      denoise: params.denoise || 0,
      useAlpha: !!params.useAlpha,
      minAreaRatio: params.minAreaRatio || 0.0004
    };

    var src = cv.matFromImageData(imageData);
    var built = buildMask(cv, src, settings);
    var mask = built.mask;
    var width = imageData.width;
    var height = imageData.height;
    var imageArea = width * height;

    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_NONE);

    // Contagem de filhos por contorno: [next, prev, firstChild, parent]
    var total = contours.size();
    var childCount = new Array(total).fill(0);
    var parentOf = new Array(total).fill(-1);
    for (var h = 0; h < total; h++) {
      var parent = hierarchy.data32S[h * 4 + 3];
      parentOf[h] = parent;
      if (parent >= 0 && parent < total) childCount[parent] += 1;
    }

    var collected = [];
    for (var i = 0; i < total; i++) {
      var contour = contours.get(i);
      var area = Math.abs(cv.contourArea(contour, false));
      var perimeter = cv.arcLength(contour, true);

      if (area < imageArea * settings.minAreaRatio || perimeter < 24) {
        contour.delete();
        continue;
      }

      var raw = matToPoints(contour);
      var rect = cv.boundingRect(contour);

      // Simplificação leve: mantém a forma e reduz muito o volume de dados.
      var simplified = new cv.Mat();
      cv.approxPolyDP(contour, simplified, Math.max(0.6, perimeter * 0.0012), true);
      var points = matToPoints(simplified);
      simplified.delete();
      if (points.length < 4) points = raw;

      collected.push({
        points: points,
        area: area,
        perimeter: perimeter,
        bounds: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        holes: childCount[i],
        parent: parentOf[i],
        borderContact: borderContactRatio(raw, width, height),
        closed: true,
        rawCount: raw.length
      });
      contour.delete();
    }

    collected.sort(function (a, b) {
      return b.area - a.area;
    });
    if (collected.length > MAX_CONTOURS) collected.length = MAX_CONTOURS;

    // Prévia da binarização em RGBA, para a interface mostrar o que o
    // algoritmo realmente está vendo.
    var preview = new Uint8ClampedArray(width * height * 4);
    var maskData = mask.data;
    for (var p = 0, q = 0; p < maskData.length; p++, q += 4) {
      var value = maskData[p] ? 25 : 255;
      preview[q] = value;
      preview[q + 1] = value;
      preview[q + 2] = value;
      preview[q + 3] = 255;
    }

    src.delete();
    mask.delete();
    contours.delete();
    hierarchy.delete();

    return {
      contours: collected,
      binary: { width: width, height: height, data: preview },
      threshold: built.threshold
    };
  }

  scope.CdContourExtractor = { extractContours: extractContours, MAX_CONTOURS: MAX_CONTOURS };
})(typeof self !== "undefined" ? self : this);
