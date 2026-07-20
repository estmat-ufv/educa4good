/* Educa4Good — interações do site (vanilla JS, sem dependências) */
(function () {
  "use strict";

  /* ---------- Menu mobile ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Persistência do idioma ---------- */
  // Cada página declara seu idioma em <html lang="...">.
  // Ao clicar no seletor, guardamos a escolha para o index raiz redirecionar.
  document.querySelectorAll(".lang-switch a[data-lang]").forEach(function (a) {
    a.addEventListener("click", function () {
      try { localStorage.setItem("e4g-lang", a.getAttribute("data-lang")); } catch (e) {}
    });
  });

  /* ---------- Filtros da galeria ---------- */
  var bar = document.querySelector(".filter-bar");
  if (bar) {
    var figures = document.querySelectorAll(".gallery figure");
    bar.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      bar.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      var f = btn.getAttribute("data-filter");
      figures.forEach(function (fig) {
        var cats = (fig.getAttribute("data-cat") || "").split(" ");
        fig.hidden = f !== "all" && cats.indexOf(f) === -1;
      });
    });
  }

  /* ---------- Lightbox da galeria ---------- */
  var box = document.getElementById("lightbox");
  if (box) {
    var boxImg = box.querySelector("img");
    var boxTitle = box.querySelector(".t");
    document.querySelectorAll(".gallery .shot").forEach(function (b) {
      b.addEventListener("click", function () {
        boxImg.src = b.querySelector("img").src;
        boxImg.alt = b.querySelector("img").alt;
        boxTitle.textContent = b.getAttribute("data-title") || "";
        if (typeof box.showModal === "function") box.showModal();
      });
    });
    box.querySelector(".lightbox__close").addEventListener("click", function () { box.close(); });
    box.addEventListener("click", function (e) { if (e.target === box) box.close(); });
  }

  /* ---------- Revelação suave ao rolar ---------- */
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var items = document.querySelectorAll(".reveal");
  if (!reduced && "IntersectionObserver" in window && items.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("is-visible"); });
  }
})();
