/* Educa4Good — Ligar os Pontos
   Seleção visual dos contornos candidatos.

   Regra da atividade: NENHUM contorno é aceito em silêncio. Todos os
   candidatos aparecem sobre a imagem, com cor e número próprios, e o usuário
   precisa marcar o que deseja. O mais provável recebe destaque, nunca
   confirmação automática.

   Toda a construção de DOM é por createElement/createElementNS. */

import { SVG_NS } from "./constants.js";
import { pointsToPathData } from "./path-geometry.js";

/** Cores distinguíveis, com contraste suficiente sobre a imagem. */
export const CANDIDATE_COLORS = [
  "#e6194b", "#2b6ca3", "#3e8e58", "#e8a020", "#911eb4", "#008b8b",
  "#d66d8c", "#7f5d1e", "#1f5180", "#a9a300", "#800000", "#4363d8"
];

export function colorFor(index) {
  return CANDIDATE_COLORS[index % CANDIDATE_COLORS.length];
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, String(value));
  return node;
}

/** Converte a prévia binária devolvida pelo worker em data URL. */
export function binaryToDataUrl(binary) {
  if (!binary || !binary.width) return "";
  const canvas = document.createElement("canvas");
  canvas.width = binary.width;
  canvas.height = binary.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const imageData = ctx.createImageData(binary.width, binary.height);
  imageData.data.set(binary.data);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * @param {object} options
 * @param {HTMLElement} options.stage área do desenho sobreposto
 * @param {HTMLElement} options.list área da lista de candidatos
 * @param {(index: number) => void} options.onToggle
 * @param {(index: number) => void} [options.onFocus]
 */
export function createContourSelector(options) {
  const { stage, list, onToggle, onFocus } = options;
  let current = { candidates: [], selected: [], imageSize: { w: 1, h: 1 } };
  /** Nós criados, por índice de candidato: permite atualização pontual. */
  const nodes = new Map();

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function register(index, parts) {
    nodes.set(index, { ...(nodes.get(index) || {}), ...parts });
  }

  /**
   * Marcar/desmarcar é a ação mais repetida aqui. Reconstruir a lista inteira
   * a cada clique tirava o foco do controle e descartava cliques rápidos, então
   * a atualização visual é pontual.
   */
  function updateSelection(selected) {
    current = { ...current, selected: selected.slice() };
    for (const [index, parts] of nodes) {
      const isSelected = selected.includes(index);
      if (parts.path) {
        parts.path.setAttribute("fill", isSelected ? parts.color : "none");
        parts.path.setAttribute("fill-opacity", isSelected ? "0.12" : "0");
        parts.path.setAttribute("stroke-width", String(isSelected ? parts.stroke * 2.2 : parts.stroke));
        parts.path.setAttribute("aria-pressed", isSelected ? "true" : "false");
      }
      if (parts.card) parts.card.classList.toggle("is-selected", isSelected);
      if (parts.input) parts.input.checked = isSelected;
    }
  }

  function renderStage(view) {
    clear(stage);
    const { imageSize, candidates, selected } = view;
    const svg = svgEl("svg", {
      viewBox: `0 0 ${imageSize.w} ${imageSize.h}`,
      class: "cd-contours",
      role: "group",
      "aria-label": "Contornos encontrados na imagem"
    });

    if (view.backgroundHref) {
      svg.appendChild(
        svgEl("image", {
          href: view.backgroundHref,
          x: 0,
          y: 0,
          width: imageSize.w,
          height: imageSize.h,
          preserveAspectRatio: "none",
          opacity: view.previewMode === "contours" ? 0.55 : 1
        })
      );
    }

    const stroke = Math.max(1, Math.min(imageSize.w, imageSize.h) / 240);
    candidates.forEach((candidate, index) => {
      const isSelected = selected.includes(index);
      const color = colorFor(index);
      const group = svgEl("g", { class: "cd-contours__item" });

      const path = svgEl("path", {
        d: pointsToPathData(candidate.points, candidate.closed !== false, 1),
        fill: isSelected ? color : "none",
        "fill-opacity": isSelected ? "0.12" : "0",
        stroke: color,
        "stroke-width": isSelected ? stroke * 2.2 : stroke,
        "stroke-dasharray": candidate.frameLike ? `${stroke * 4} ${stroke * 3}` : "",
        "stroke-linejoin": "round",
        tabindex: "0",
        role: "button",
        "aria-pressed": isSelected ? "true" : "false",
        "aria-label": `Candidato ${index + 1}${candidate.frameLike ? " (moldura)" : ""}`,
        "data-candidate": String(index)
      });
      group.appendChild(path);

      const badgeR = Math.max(8, Math.min(imageSize.w, imageSize.h) / 26);
      const cx = candidate.bounds.x + candidate.bounds.w / 2;
      const cy = candidate.bounds.y + badgeR * 1.1;
      group.appendChild(
        svgEl("circle", { cx, cy, r: badgeR, fill: color, stroke: "#fff", "stroke-width": stroke })
      );
      const label = svgEl("text", {
        x: cx,
        y: cy + badgeR * 0.36,
        "text-anchor": "middle",
        fill: "#fff",
        "font-size": badgeR * 1.15,
        "font-weight": "700",
        "font-family": "Nunito, system-ui, sans-serif",
        "pointer-events": "none"
      });
      label.textContent = String(index + 1);
      group.appendChild(label);
      svg.appendChild(group);
      register(index, { path, color, stroke });
    });

    svg.addEventListener("click", (event) => {
      const target = event.target.closest?.("[data-candidate]");
      if (!target) return;
      onToggle(Number(target.getAttribute("data-candidate")));
    });
    svg.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target.closest?.("[data-candidate]");
      if (!target) return;
      event.preventDefault();
      onToggle(Number(target.getAttribute("data-candidate")));
    });

    stage.appendChild(svg);
  }

  function renderList(view) {
    clear(list);
    const { candidates, selected } = view;
    // A lista é reconstruída aqui; as referências dos nós são registradas para
    // que os toggles seguintes façam atualização pontual.

    if (!candidates.length) {
      list.appendChild(
        el("p", "cd-note", "Nenhum contorno foi encontrado com os ajustes atuais.")
      );
      return;
    }

    candidates.forEach((candidate, index) => {
      const isSelected = selected.includes(index);
      const card = el("div", `cd-candidate${isSelected ? " is-selected" : ""}`);
      if (candidate.likely) card.classList.add("is-likely");
      if (candidate.frameLike) card.classList.add("is-rejected");

      const head = el("label", "cd-candidate__head");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = isSelected;
      input.setAttribute("data-candidate-input", String(index));
      input.addEventListener("change", () => onToggle(index));
      head.appendChild(input);

      const chip = el("span", "cd-candidate__chip");
      chip.style.background = colorFor(index);
      chip.textContent = String(index + 1);
      head.appendChild(chip);

      const title = el("span", "cd-candidate__title");
      title.textContent = candidate.likely
        ? `Candidato ${index + 1} — mais provável`
        : `Candidato ${index + 1}`;
      head.appendChild(title);
      card.appendChild(head);

      const metrics = el("p", "cd-candidate__metrics");
      metrics.textContent =
        `${(candidate.metrics.areaRatio * 100).toFixed(1)}% da imagem · ` +
        `${Math.round(candidate.perimeter)} px de contorno · ` +
        `${candidate.holes} buraco(s) · nota ${(candidate.score * 100).toFixed(0)}`;
      card.appendChild(metrics);

      if (candidate.flags.length) {
        const flags = el("ul", "cd-candidate__flags");
        for (const flag of candidate.flags) {
          const item = el("li", `cd-flag cd-flag--${flag.severity}`, flag.label);
          flags.appendChild(item);
        }
        card.appendChild(flags);
      }

      if (onFocus) {
        card.addEventListener("mouseenter", () => onFocus(index));
        card.addEventListener("focusin", () => onFocus(index));
      }
      register(index, { card, input });
      list.appendChild(card);
    });
  }

  return {
    render(view) {
      current = { ...current, ...view };
      nodes.clear();
      renderStage(current);
      renderList(current);
    },
    updateSelection,
    get view() {
      return current;
    }
  };
}
