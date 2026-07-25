/* Educa4Good — Ligar os Pontos
   Ponto de entrada. Carregado como <script type="module">.

   Toda a atividade acontece no navegador: nenhuma imagem é enviada,
   armazenada ou processada fora do aparelho do usuário. */

import { createStore } from "./state.js";
import { createUiController } from "./ui-controller.js";

function start() {
  const host = document.getElementById("ligar-os-pontos");
  if (!host) return;

  const store = createStore();
  const ui = createUiController(store);
  ui.init();

  // Exposto apenas para depuração manual no console; nada depende disso.
  if (window.location.hash === "#debug") {
    window.__ligarOsPontos = { store, ui };
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
