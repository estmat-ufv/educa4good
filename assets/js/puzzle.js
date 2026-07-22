/* Educa4Good — quebra-cabeça de imagens (client-side, sem dependências).
   A imagem escolhida NUNCA sai do navegador: é lida com FileReader/objectURL,
   recortada em um quadrado e fatiada em uma grade n x n. */
(function () {
  "use strict";

  function init() {
    var root = document.getElementById("qc");
    if (!root) return;

    var fileInput = document.getElementById("qc-file");
    var nInput = document.getElementById("qc-n");
    var nLabel = document.getElementById("qc-n-label");
    var shuffleBtn = document.getElementById("qc-shuffle");
    var board = document.getElementById("qc-board");
    var hint = document.getElementById("qc-hint");
    var win = document.getElementById("qc-win");
    var model = document.getElementById("qc-model");
    var download = document.getElementById("qc-download");
    var adshot = document.getElementById("qc-adshot");

    var squaredUrl = null;   // dataURL do quadrado recortado
    var hasImage = false;
    var n = clampN(nInput.value);
    var N = n * n;
    var state = [];          // state[posição] = id da peça (0..N-1); N-1 = vazio
    var cells = [];

    function clampN(v) { v = parseInt(v, 10); if (isNaN(v) || v < 1) v = 1; if (v > 5) v = 5; return v; }

    function makeSquare(img) {
      var side = Math.min(img.naturalWidth, img.naturalHeight);
      var out = Math.min(side, 900);
      var cv = document.createElement("canvas");
      cv.width = out; cv.height = out;
      var ctx = cv.getContext("2d");
      var sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      return cv.toDataURL("image/png");
    }

    function bgPos(id) {
      if (n <= 1) return "0% 0%";
      var r = Math.floor(id / n), c = id % n;
      return (c * 100 / (n - 1)) + "% " + (r * 100 / (n - 1)) + "%";
    }

    function buildBoard() {
      n = clampN(nInput.value); N = n * n;
      board.style.setProperty("--qc-n", n);
      board.innerHTML = "";
      cells = [];
      state = [];
      for (var i = 0; i < N; i++) state[i] = i;
      for (var p = 0; p < N; p++) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "qc__tile";
        btn.setAttribute("data-pos", p);
        btn.addEventListener("click", onCellClick);
        board.appendChild(btn);
        cells.push(btn);
      }
      render();
    }

    function render() {
      for (var p = 0; p < N; p++) {
        var id = state[p], cell = cells[p];
        if (n > 1 && id === N - 1) {
          cell.className = "qc__tile qc__tile--blank";
          cell.style.backgroundImage = "none";
          cell.setAttribute("aria-label", "espaço vazio");
        } else {
          cell.className = "qc__tile";
          cell.style.backgroundImage = squaredUrl ? "url(" + squaredUrl + ")" : "none";
          cell.style.backgroundSize = (n * 100) + "% " + (n * 100) + "%";
          cell.style.backgroundPosition = bgPos(id);
          cell.setAttribute("aria-label", "peça " + (id + 1));
        }
      }
      checkWin();
    }

    function neighbors(pos) {
      var r = Math.floor(pos / n), c = pos % n, res = [];
      if (r > 0) res.push(pos - n);
      if (r < n - 1) res.push(pos + n);
      if (c > 0) res.push(pos - 1);
      if (c < n - 1) res.push(pos + 1);
      return res;
    }

    function onCellClick(e) {
      if (!hasImage || n < 2) return;
      var p = parseInt(e.currentTarget.getAttribute("data-pos"), 10);
      var bp = state.indexOf(N - 1);
      if (neighbors(p).indexOf(bp) !== -1) {
        var t = state[p]; state[p] = state[bp]; state[bp] = t;
        render();
      }
    }

    function isSolved() { for (var i = 0; i < N; i++) if (state[i] !== i) return false; return true; }

    function scramble() {
      if (n < 2) { render(); return; }
      for (var i = 0; i < N; i++) state[i] = i;   // parte do estado resolvido: sempre solúvel
      var bp = N - 1, last = -1, moves = 40 + 30 * N;
      for (var m = 0; m < moves; m++) {
        var nb = neighbors(bp);
        var choices = nb.filter(function (x) { return x !== last; });
        if (!choices.length) choices = nb;   // grades pequenas (2x2): evita ciclo travado
        var pick = choices[Math.floor(Math.random() * choices.length)];
        var t = state[pick]; state[pick] = state[bp]; state[bp] = t;
        last = bp; bp = pick;
      }
      // Ajuste iterativo (sem recursão) caso o embaralhamento caia no resolvido.
      var guard = 0;
      while (isSolved() && guard < 80) {
        var nb2 = neighbors(bp);
        var pick2 = nb2[Math.floor(Math.random() * nb2.length)];
        var t2 = state[pick2]; state[pick2] = state[bp]; state[bp] = t2;
        bp = pick2; guard++;
      }
      render();
    }

    function checkWin() {
      win.hidden = !(hasImage && n >= 2 && isSolved());
    }

    function setImage(url) {
      squaredUrl = url; hasImage = true;
      model.style.backgroundImage = "url(" + url + ")";
      model.classList.add("has-img");
      if (adshot) { adshot.style.backgroundImage = "url(" + url + ")"; adshot.classList.add("has-img"); }
      if (download) download.hidden = false;
      buildBoard();
      scramble();
    }

    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var img = new Image();
      var obj = URL.createObjectURL(f);
      img.onload = function () { var u = makeSquare(img); URL.revokeObjectURL(obj); setImage(u); };
      img.onerror = function () { URL.revokeObjectURL(obj); alert("Não foi possível ler essa imagem. Tente um PNG ou JPG."); };
      img.src = obj;
    });

    nInput.addEventListener("input", function () {
      nLabel.textContent = nInput.value;
      if (hasImage) { buildBoard(); scramble(); }
    });

    shuffleBtn.addEventListener("click", function () {
      if (!hasImage) { fileInput.click(); return; }
      scramble();
    });

    if (download) download.addEventListener("click", function () {
      if (!squaredUrl) return;
      var a = document.createElement("a");
      a.href = squaredUrl; a.download = "quebra-cabeca.png";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });

    nLabel.textContent = nInput.value;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
