/* Educa4Good — Ligar os Pontos
   Impressão.

   A folha impressa é o SVG final, em milímetros, dentro de um contêiner que o
   CSS de impressão deixa como único elemento visível. Nada é rasterizado no
   caminho da impressora. */

const STYLE_ID = "cd-print-page-rule";

/**
 * Ajusta a regra `@page` conforme a orientação escolhida. Sem isso o
 * navegador imprime com a orientação padrão do sistema e a folha sai cortada.
 */
export function applyPageRule(pageSize, orientation) {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  const size = pageSize === "A4" ? "A4" : "A4";
  style.textContent = `@page { size: ${size} ${orientation === "landscape" ? "landscape" : "portrait"}; margin: 0; }`;
}

/**
 * Coloca o SVG no contêiner de impressão. O nó é criado por DOMParser e
 * importado — nunca por innerHTML.
 */
export function mountPrintSheet(container, svgMarkup) {
  while (container.firstChild) container.removeChild(container.firstChild);
  const node = parseSvg(svgMarkup);
  if (node) container.appendChild(node);
  return node;
}

export function parseSvg(svgMarkup) {
  const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  if (parsed.getElementsByTagName("parsererror").length) return null;
  return document.importNode(parsed.documentElement, true);
}

/** Dispara a impressão do navegador depois de o layout assentar. */
export function printSheet() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("afterprint", finish);
      resolve();
    };
    window.addEventListener("afterprint", finish);

    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      try {
        window.print();
      } catch {
        /* navegador sem suporte a impressão programática */
      }
      // Alguns navegadores não disparam afterprint; libera de todo modo.
      setTimeout(finish, 1500);
    };

    // Duas passadas de rAF deixam o layout assentar. Em aba oculta o rAF é
    // suspenso, então o setTimeout garante que a impressão aconteça.
    requestAnimationFrame(() => requestAnimationFrame(fire));
    setTimeout(fire, 150);
  });
}
