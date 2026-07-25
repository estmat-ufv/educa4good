/* Educa4Good — Ligar os Pontos
   Controlador da interface.

   Liga os controles da página ao estado central e ao pipeline. Toda mudança
   passa por `store.update()`; nada de variáveis globais espalhadas.

   O botão de exportar/imprimir só libera quando o validador não aponta erro
   crítico; avisos exigem uma confirmação explícita marcada em
   `validation.acknowledged`. */

import { LIMITS, STEPS, SETTING_RANGES, EXPORT_DPI } from "./constants.js";
import { validateFile, detectKind, readAsText, loadRaster, analysisImageData } from "./image-loader.js";
import { sanitizeSvg } from "./svg-sanitizer.js";
import { importSvg } from "./svg-importer.js";
import { pathsBounds } from "./path-normalizer.js";
import { createRasterPipeline, candidatesToPaths } from "./raster-pipeline.js";
import { classifyContours, summarizeCandidates } from "./contour-classifier.js";
import { createContourSelector, binaryToDataUrl } from "./contour-selector.js";
import { createPathEditor, EDITOR_TOOLS } from "./path-editor.js";
import { buildWorksheetPlan, renderWorksheetSvg, buildSourcePreview } from "./worksheet-renderer.js";
import { validateWorksheet } from "./quality-validator.js";
import { svgToBlob, saveBlob, suggestFileName } from "./svg-exporter.js";
import { svgToPngBlob } from "./png-exporter.js";
import { applyPageRule, mountPrintSheet, parseSvg, printSheet } from "./print-manager.js";

const byId = (id) => document.getElementById(id);

function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clampRange(key, value, fallback) {
  const range = SETTING_RANGES[key];
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (!range) return number;
  return Math.min(range.max, Math.max(range.min, number));
}

/** Converte coordenadas de tela para unidades do SVG. */
function toSvgPoint(svg, clientX, clientY) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(ctm.inverse());
}

export function createUiController(store) {
  const dom = {};
  const pipeline = createRasterPipeline();
  let selector = null;
  let editor = null;
  let editorMounted = false;
  let lastPlan = null;
  let lastValidation = { valid: false, errors: [], warnings: [] };
  let previewSvg = null;
  let rasterTimer = 0;

  // ------------------------------------------------------------------ básico
  function cacheDom() {
    const ids = [
      "cd-steps", "cd-message", "cd-file", "cd-dropzone", "cd-file-info", "cd-example",
      "cd-modes", "cd-mode-note",
      "cd-panel-upload", "cd-panel-mode", "cd-panel-raster", "cd-panel-paths",
      "cd-panel-edit", "cd-panel-points", "cd-panel-sheet",
      "cd-th-mode", "cd-th-value", "cd-th-value-out", "cd-block", "cd-block-out",
      "cd-const", "cd-const-out", "cd-invert", "cd-open", "cd-open-out",
      "cd-close", "cd-close-out", "cd-denoise", "cd-denoise-out",
      "cd-min-area", "cd-min-area-out", "cd-reprocess", "cd-raster-progress",
      "cd-contour-stage", "cd-candidates", "cd-raster-summary", "cd-apply-contours",
      "cd-path-list", "cd-path-summary",
      "cd-editor-canvas", "cd-tools", "cd-editor-status", "cd-open-editor",
      "cd-smooth", "cd-reverse", "cd-toggle-closed", "cd-join", "cd-split",
      "cd-delete-path", "cd-clear-paths", "cd-apply-edit",
      "cd-count", "cd-count-out", "cd-sampling", "cd-point-radius", "cd-point-radius-out",
      "cd-label-size", "cd-label-size-out", "cd-point-color", "cd-label-color",
      "cd-guide-color", "cd-guide-width", "cd-guide-width-out", "cd-show-guide",
      "cd-numbering", "cd-start-number", "cd-hidden-pairs", "cd-reset-manual",
      "cd-title", "cd-orientation", "cd-margin", "cd-margin-out",
      "cd-show-fields", "cd-field-name", "cd-field-date", "cd-field-class", "cd-field-teacher",
      "cd-show-inspiration", "cd-inspiration-size", "cd-inspiration-size-out",
      "cd-inspiration-pos", "cd-show-original", "cd-original-opacity", "cd-original-opacity-out",
      "cd-sheet-view", "cd-validation", "cd-breaks", "cd-undo", "cd-redo", "cd-restart",
      "cd-export-svg", "cd-export-png", "cd-dpi", "cd-print", "cd-print-area"
    ];
    for (const id of ids) dom[id] = byId(id);
    dom.previewRadios = Array.from(document.querySelectorAll('input[name="cd-preview"]'));
  }

  function message(text, type = "") {
    if (!dom["cd-message"]) return;
    dom["cd-message"].textContent = text || "";
    dom["cd-message"].classList.toggle("is-error", type === "error");
    dom["cd-message"].classList.toggle("is-ok", type === "ok");
    dom["cd-message"].classList.toggle("is-busy", type === "busy");
  }

  function setBusy(busy, text) {
    store.update((draft) => {
      draft.ui.busy = busy;
    }, { silent: true });
    document.body.classList.toggle("cd-is-busy", busy);
    if (text) message(text, busy ? "busy" : "");
  }

  function setStep(step) {
    store.update((draft) => {
      draft.step = step;
    }, { silent: true });
    renderSteps();
  }

  function renderSteps() {
    const container = dom["cd-steps"];
    if (!container) return;
    const state = store.getState();
    const currentIndex = STEPS.findIndex((s) => s.id === state.step);
    Array.from(container.children).forEach((item, index) => {
      item.classList.toggle("is-current", index === currentIndex);
      item.classList.toggle("is-done", index < currentIndex);
      item.setAttribute("aria-current", index === currentIndex ? "step" : "false");
    });
  }

  function showPanels() {
    const state = store.getState();
    const hasSource = Boolean(state.source.type);
    const hasPaths = state.paths.length > 0;
    toggle(dom["cd-panel-mode"], hasSource);
    toggle(dom["cd-panel-raster"], state.mode === "raster");
    toggle(dom["cd-panel-paths"], state.mode === "svg");
    toggle(dom["cd-panel-edit"], hasSource);
    toggle(dom["cd-panel-points"], hasPaths);
    toggle(dom["cd-panel-sheet"], hasPaths);
  }

  function toggle(node, visible) {
    if (node) node.hidden = !visible;
  }

  // ------------------------------------------------------------------ upload
  async function handleFile(file) {
    const check = validateFile(file);
    if (!check.ok) {
      message(check.error, "error");
      return;
    }
    store.reset();
    selector = null;
    clear(dom["cd-candidates"]);
    clear(dom["cd-contour-stage"]);
    renderPathList();
    syncControlsFromState();
    setBusy(true, "Lendo o arquivo…");

    try {
      if (check.kind === "svg") await loadSvgFile(file);
      else await loadRasterFile(file);
      if (check.warning) message(check.warning, "");
    } catch (error) {
      message(error.message || "Não foi possível abrir este arquivo.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadSvgFile(file) {
    const text = await readAsText(file);
    const { root, report } = sanitizeSvg(text);
    if (!root || report.errors.length) {
      throw new Error(report.errors[0] || "SVG inválido.");
    }
    const imported = importSvg(root);
    if (!imported.paths.length) {
      throw new Error(
        "Nenhuma forma utilizável foi encontrada neste SVG. Use o traçado manual."
      );
    }

    store.setAsset("sanitizedSvg", root);
    store.setAsset("originalFile", file);
    store.setAsset("originalText", text);

    store.update((draft) => {
      draft.source = {
        type: "svg",
        filename: file.name,
        width: imported.viewBox.w,
        height: imported.viewBox.h,
        bytes: file.size
      };
      draft.mode = "svg";
      draft.paths = imported.paths;
      draft.step = "select";
    });

    const removed = [...report.removedElements];
    const notes = [
      `${imported.paths.length} caminho(s) encontrado(s).`,
      imported.backgrounds
        ? `${imported.backgrounds} forma(s) que cobrem a folha inteira foram tratadas como fundo e vieram desmarcadas.`
        : "",
      removed.length ? `Removido por segurança: ${removed.join(", ")}.` : "",
      imported.hiddenCount ? `${imported.hiddenCount} elemento(s) invisível(is) ignorado(s).` : "",
      ...report.warnings
    ].filter(Boolean);
    fileInfo(file, notes.join(" "));
    message("SVG lido e sanitizado. Selecione os caminhos desejados.", "ok");
    renderPathList();
    refresh();
  }

  async function loadRasterFile(file) {
    const raster = await loadRaster(file);
    store.setAsset("originalFile", file);
    store.setAsset("analysisCanvas", raster.analysisCanvas);
    store.setAsset("previewDataUrl", raster.previewDataUrl);

    store.update((draft) => {
      draft.source = {
        type: "raster",
        filename: file.name,
        width: raster.width,
        height: raster.height,
        bytes: file.size
      };
      draft.mode = "raster";
      draft.raster.analysisSize = raster.analysisSize;
      draft.raster.scaleToSource = raster.scaleToSource;
      draft.raster.useAlpha = raster.hasAlpha;
      draft.raster.invert = false;
      draft.step = "select";
    });

    fileInfo(
      file,
      [
        `${raster.width}×${raster.height} px`,
        raster.downscaled
          ? `análise em ${raster.analysisSize.w}×${raster.analysisSize.h} px`
          : "",
        raster.hasAlpha ? "com transparência (o canal alfa será usado)" : ""
      ]
        .filter(Boolean)
        .join(" · ")
    );
    message("Imagem carregada. Procurando contornos candidatos…", "");
    await runExtraction();
  }

  function fileInfo(file, extra) {
    if (!dom["cd-file-info"]) return;
    dom["cd-file-info"].textContent = `${file.name} — ${(file.size / 1024).toFixed(0)} KB. ${extra || ""}`;
  }

  // ------------------------------------------------------------------ raster
  function rasterParams() {
    const state = store.getState();
    const r = state.raster;
    return {
      thresholdMode: r.thresholdMode,
      threshold: r.threshold,
      blockSize: r.blockSize,
      constant: r.constant,
      invert: r.invert,
      open: r.open,
      close: r.close,
      denoise: r.denoise,
      useAlpha: Boolean(r.useAlpha),
      minAreaRatio: r.minAreaRatio
    };
  }

  async function runExtraction() {
    const assets = store.getAssets();
    if (!assets.analysisCanvas) return;
    setBusy(true, "Analisando a imagem…");
    progress("Preparando…");

    try {
      const imageData = analysisImageData(assets.analysisCanvas);
      const result = await pipeline.extract(imageData, rasterParams(), progress);
      const size = store.getState().raster.analysisSize;
      const candidates = classifyContours(result.contours, { w: size.w, h: size.h }, {
        minAreaRatio: store.getState().raster.minAreaRatio
      });
      const summary = summarizeCandidates(candidates);

      store.setAsset("binaryDataUrl", binaryToDataUrl(result.binary));
      store.update((draft) => {
        draft.raster.candidates = candidates.map((c) => ({ ...c, points: c.points }));
        // Nada é selecionado sozinho: a confirmação é sempre do usuário.
        draft.raster.selectedCandidates = [];
        draft.raster.threshold =
          result.threshold >= 0 && draft.raster.thresholdMode === "otsu"
            ? Math.round(result.threshold)
            : draft.raster.threshold;
      });

      progress("");
      if (dom["cd-raster-summary"]) {
        dom["cd-raster-summary"].textContent = summary.message;
        dom["cd-raster-summary"].classList.toggle("is-error", !summary.confident);
      }
      message(
        `${candidates.length} contorno(s) candidato(s). ${summary.message}`,
        summary.confident ? "" : "error"
      );
      renderSelector();
      syncControlsFromState();
    } catch (error) {
      progress("");
      message(
        `${error.message} Você ainda pode usar o traçado manual.`,
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  function progress(text) {
    if (dom["cd-raster-progress"]) dom["cd-raster-progress"].textContent = text || "";
  }

  function scheduleExtraction() {
    window.clearTimeout(rasterTimer);
    rasterTimer = window.setTimeout(() => runExtraction(), 260);
  }

  function renderSelector() {
    const state = store.getState();
    if (!dom["cd-contour-stage"] || !dom["cd-candidates"]) return;
    if (!selector) {
      selector = createContourSelector({
        stage: dom["cd-contour-stage"],
        list: dom["cd-candidates"],
        onToggle: toggleCandidate
      });
    }
    const assets = store.getAssets();
    const previewMode = dom.previewRadios.find((r) => r.checked)?.value || "contours";
    const backgroundHref =
      previewMode === "binary"
        ? assets.binaryDataUrl
        : previewMode === "none"
        ? ""
        : assets.previewDataUrl;

    selector.render({
      candidates: state.raster.candidates,
      selected: state.raster.selectedCandidates,
      imageSize: { w: state.raster.analysisSize.w, h: state.raster.analysisSize.h },
      backgroundHref,
      previewMode
    });
    if (dom["cd-apply-contours"]) {
      dom["cd-apply-contours"].disabled = state.raster.selectedCandidates.length === 0;
    }
  }

  function toggleCandidate(index) {
    store.update((draft) => {
      const list = draft.raster.selectedCandidates;
      const at = list.indexOf(index);
      if (at >= 0) list.splice(at, 1);
      else list.push(index);
      list.sort((a, b) => a - b);
    }, { history: true });

    const selected = store.getState().raster.selectedCandidates;
    if (selector) selector.updateSelection(selected);
    if (dom["cd-apply-contours"]) dom["cd-apply-contours"].disabled = selected.length === 0;
  }

  function applyCandidates() {
    const state = store.getState();
    const chosen = state.raster.selectedCandidates.map((i) => state.raster.candidates[i]).filter(Boolean);
    if (!chosen.length) {
      message("Marque ao menos um contorno antes de continuar.", "error");
      return;
    }
    const paths = candidatesToPaths(chosen, state.raster.scaleToSource);
    if (!paths.length) {
      message("Os contornos escolhidos são curtos demais para virar atividade.", "error");
      return;
    }
    store.update((draft) => {
      draft.paths = paths;
      draft.pathSamples = {};
      draft.pointOffsets = {};
      draft.labelOffsets = {};
      draft.step = "edit";
    }, { history: true });
    message(
      `${paths.length} caminho(s) confirmado(s). Revise no editor ou siga para os pontos.`,
      "ok"
    );
    renderPathList();
    refresh();
  }

  // ----------------------------------------------------------- lista de SVG
  function renderPathList() {
    const container = dom["cd-path-list"];
    if (!container) return;
    clear(container);
    const state = store.getState();

    if (!state.paths.length) {
      container.appendChild(el("p", "cd-note", "Nenhum caminho carregado."));
      return;
    }

    state.paths
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((path) => {
        const row = el("div", `cd-path${path.selected ? " is-selected" : ""}`);
        row.setAttribute("data-path-id", path.id);

        const head = el("label", "cd-path__head");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = path.selected;
        input.addEventListener("change", () => togglePath(path.id));
        head.appendChild(input);
        head.appendChild(el("span", "cd-path__title", path.label));
        row.appendChild(head);

        row.appendChild(
          el(
            "p",
            "cd-path__meta",
            `${path.closed ? "fechado" : "aberto"} · ${path.metrics.length.toFixed(1)} un · ` +
              `${path.metrics.vertexCount} vértices${path.direction === "reverse" ? " · invertido" : ""}`
          )
        );

        const tools = el("div", "cd-path__tools");
        tools.appendChild(button("↑", "Subir na ordem", () => movePath(path.id, -1)));
        tools.appendChild(button("↓", "Descer na ordem", () => movePath(path.id, 1)));
        tools.appendChild(
          button("⇄", "Inverter sentido", () => patchPath(path.id, (p) => {
            p.direction = p.direction === "reverse" ? "forward" : "reverse";
          }))
        );
        tools.appendChild(
          button(path.closed ? "◌" : "◍", path.closed ? "Abrir caminho" : "Fechar caminho", () =>
            patchPath(path.id, (p) => {
              p.closed = !p.closed;
            })
          )
        );
        tools.appendChild(
          button("⟲", "Girar o ponto inicial", () =>
            patchPath(path.id, (p) => {
              p.startOffset = Number(((p.startOffset + 0.05) % 1).toFixed(4));
            })
          )
        );
        tools.appendChild(
          button(path.breakAfter ? "⌇" : "⌁", "Interromper depois deste caminho", () =>
            patchPath(path.id, (p) => {
              p.breakAfter = !p.breakAfter;
            })
          )
        );
        row.appendChild(tools);
        container.appendChild(row);
      });

    updatePathSummary();
  }

  function updatePathSummary() {
    if (!dom["cd-path-summary"]) return;
    const state = store.getState();
    const selected = state.paths.filter((p) => p.selected).length;
    dom["cd-path-summary"].textContent =
      `${selected} de ${state.paths.length} caminho(s) selecionado(s). ` +
      "Caminhos separados nunca são ligados entre si.";
  }

  function button(label, title, onClick) {
    const node = el("button", "cd-icon-btn", label);
    node.type = "button";
    node.title = title;
    node.setAttribute("aria-label", title);
    node.addEventListener("click", onClick);
    return node;
  }

  /**
   * Marcar/desmarcar é a ação mais repetida da lista. Reconstruir a lista
   * inteira a cada clique jogava o foco fora e perdia a rolagem, então aqui a
   * atualização é pontual.
   */
  function togglePath(id) {
    store.update((draft) => {
      const path = draft.paths.find((p) => p.id === id);
      if (!path) return;
      path.selected = !path.selected;
      delete draft.pathSamples[id];
    }, { history: true });

    const row = dom["cd-path-list"]?.querySelector(`[data-path-id="${CSS.escape(id)}"]`);
    const path = store.getState().paths.find((p) => p.id === id);
    if (row && path) {
      row.classList.toggle("is-selected", path.selected);
      const input = row.querySelector('input[type="checkbox"]');
      if (input) input.checked = path.selected;
      updatePathSummary();
    } else {
      renderPathList();
    }
    refresh();
  }

  function patchPath(id, mutate) {
    store.update((draft) => {
      const path = draft.paths.find((p) => p.id === id);
      if (!path) return;
      mutate(path);
      // Edições manuais de ponto deixam de valer quando a geometria muda.
      delete draft.pathSamples[id];
    }, { history: true });
    renderPathList();
    refresh();
  }

  function movePath(id, delta) {
    store.update((draft) => {
      const ordered = draft.paths.slice().sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((p) => p.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= ordered.length) return;
      const [item] = ordered.splice(index, 1);
      ordered.splice(target, 0, item);
      ordered.forEach((path, i) => {
        path.order = i;
      });
      draft.paths = ordered;
    }, { history: true });
    renderPathList();
    refresh();
  }

  // ------------------------------------------------------------------ editor
  async function openEditor() {
    const state = store.getState();
    if (!state.source.type) {
      message("Envie um arquivo antes de abrir o editor.", "error");
      return;
    }
    setBusy(true, "Carregando o editor…");
    try {
      if (!editor) {
        editor = createPathEditor({
          canvas: dom["cd-editor-canvas"],
          onStatus: (text) => {
            if (dom["cd-editor-status"]) dom["cd-editor-status"].textContent = text;
          },
          onChange: () => {
            if (dom["cd-apply-edit"]) dom["cd-apply-edit"].disabled = false;
          }
        });
      }
      if (!editorMounted) {
        await editor.mount();
        editorMounted = true;
        renderToolButtons();
      }
      loadEditorScene();
      setStep("edit");
      message("Editor pronto. Ajuste o traçado e clique em “Aplicar traçado”.", "ok");
    } catch (error) {
      message(`Não foi possível abrir o editor: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function loadEditorScene() {
    const state = store.getState();
    const assets = store.getAssets();
    const bounds =
      pathsBounds(state.paths, false) ||
      { x: 0, y: 0, w: state.source.width || 100, h: state.source.height || 100 };

    if (state.source.type === "raster") {
      editor.setBackground(
        { kind: "image", href: assets.previewDataUrl },
        { x: 0, y: 0, w: state.source.width, h: state.source.height }
      );
    } else {
      editor.setBackground(
        { kind: "geometry", paths: state.paths.map((p) => p.svgPathData) },
        bounds
      );
    }
    editor.loadPaths(state.paths, bounds);
    editor.setTool(state.paths.length ? "move" : "draw");
    renderToolButtons();
  }

  function renderToolButtons() {
    const container = dom["cd-tools"];
    if (!container) return;
    const current = editor && editor.ready ? editor.tool : "";
    Array.from(container.querySelectorAll("[data-tool]")).forEach((node) => {
      const active = node.getAttribute("data-tool") === current;
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyEditor() {
    if (!editor || !editor.ready) return;
    const paths = editor.commit();
    if (!paths.length) {
      message("O editor está vazio. Desenhe pelo menos um caminho.", "error");
      return;
    }
    store.update((draft) => {
      draft.paths = paths;
      draft.pathSamples = {};
      draft.pointOffsets = {};
      draft.labelOffsets = {};
      draft.mode = draft.mode || "manual";
      draft.step = "points";
    }, { history: true });
    if (dom["cd-apply-edit"]) dom["cd-apply-edit"].disabled = true;
    message(`${paths.length} caminho(s) aplicado(s).`, "ok");
    renderPathList();
    refresh();
  }

  // ------------------------------------------------------------------ prévia
  function refresh() {
    const state = store.getState();
    showPanels();
    renderSteps();
    updateModeButtons();

    if (!state.paths.length || !state.paths.some((p) => p.selected)) {
      lastPlan = null;
      lastValidation = {
        valid: false,
        errors: [{ code: "no-path", message: "Selecione ao menos um caminho." }],
        warnings: []
      };
      showPlaceholder();
      renderValidation();
      updateActions();
      return;
    }

    try {
      const plan = buildWorksheetPlan(state, {
        sourcePreview: buildSourcePreview(state, store.getAssets())
      });
      lastPlan = plan;
      lastValidation = validateWorksheet(plan);
      mountPreview(renderWorksheetSvg(plan, { interactive: true }));
      renderValidation();
      renderBreaks(plan);
      updateActions();
    } catch (error) {
      lastPlan = null;
      lastValidation = {
        valid: false,
        errors: [{ code: "render", message: `Falha ao montar a folha: ${error.message}` }],
        warnings: []
      };
      showPlaceholder();
      renderValidation();
      updateActions();
    }
  }

  function showPlaceholder() {
    const host = dom["cd-sheet-view"];
    if (!host) return;
    clear(host);
    const box = el("div", "cd-placeholder");
    box.appendChild(el("p", "", "Envie um arquivo e confirme um caminho para ver a folha."));
    host.appendChild(box);
  }

  function mountPreview(markup) {
    const host = dom["cd-sheet-view"];
    if (!host) return;
    const node = parseSvg(markup);
    if (!node) {
      showPlaceholder();
      return;
    }
    clear(host);
    node.classList.add("cd-sheet-svg");
    node.removeAttribute("width");
    node.removeAttribute("height");
    host.appendChild(node);
    previewSvg = node;
    bindPreviewDragging(node);
  }

  /** Arrastar pontos e números direto na prévia. */
  function bindPreviewDragging(svg) {
    let drag = null;

    svg.addEventListener("pointerdown", (event) => {
      const dot = event.target.closest?.("[data-point-index]");
      const label = event.target.closest?.("[data-label-index]");
      const node = dot || label;
      if (!node || !lastPlan) return;
      const index = Number(node.getAttribute(dot ? "data-point-index" : "data-label-index"));
      const point = lastPlan.points[index];
      if (!point) return;
      const origin = toSvgPoint(svg, event.clientX, event.clientY);
      if (!origin) return;
      drag = {
        kind: dot ? "point" : "label",
        pointId: point.id,
        origin,
        base: dot
          ? store.getState().pointOffsets[point.id] || { dx: 0, dy: 0 }
          : store.getState().labelOffsets[point.id] ||
            (lastPlan.labelLayout.labels[index]
              ? {
                  dx: lastPlan.labelLayout.labels[index].x - point.x,
                  dy: lastPlan.labelLayout.labels[index].y - point.y
                }
              : { dx: 0, dy: 0 }),
        node,
        moved: false
      };
      store.checkpoint();
      node.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    svg.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const now = toSvgPoint(svg, event.clientX, event.clientY);
      if (!now) return;
      const dx = drag.base.dx + (now.x - drag.origin.x);
      const dy = drag.base.dy + (now.y - drag.origin.y);
      drag.moved = true;
      drag.last = { dx, dy };
      // Feedback imediato sem recalcular a folha inteira.
      if (drag.kind === "point") {
        const point = lastPlan.points.find((p) => p.id === drag.pointId);
        if (point) {
          drag.node.setAttribute("cx", String(point.x - (store.getState().pointOffsets[drag.pointId]?.dx || 0) + dx));
          drag.node.setAttribute("cy", String(point.y - (store.getState().pointOffsets[drag.pointId]?.dy || 0) + dy));
        }
      } else {
        const point = lastPlan.points.find((p) => p.id === drag.pointId);
        if (point) {
          drag.node.setAttribute("x", String(point.x + dx));
          drag.node.setAttribute("y", String(point.y + dy + store.getState().settings.labelFontSize * 0.355));
        }
      }
    });

    const finish = () => {
      if (!drag) return;
      const current = drag;
      drag = null;
      if (!current.moved || !current.last) return;
      store.update((draft) => {
        const target = current.kind === "point" ? draft.pointOffsets : draft.labelOffsets;
        target[current.pointId] = { dx: current.last.dx, dy: current.last.dy };
      });
      refresh();
    };

    svg.addEventListener("pointerup", finish);
    svg.addEventListener("pointercancel", finish);
    svg.addEventListener("lostpointercapture", finish);

    // Clique com Alt exclui um ponto; Alt+clique no traço insere um ponto.
    svg.addEventListener("click", (event) => {
      if (!event.altKey || !lastPlan) return;
      const dot = event.target.closest?.("[data-point-index]");
      if (!dot) return;
      event.preventDefault();
      removePoint(Number(dot.getAttribute("data-point-index")));
    });
  }

  function currentFractions(pathId) {
    if (!lastPlan) return [];
    const state = store.getState();
    if (Array.isArray(state.pathSamples[pathId])) return state.pathSamples[pathId].slice();
    return lastPlan.points.filter((p) => p.pathId === pathId).map((p) => p.arcFraction);
  }

  function removePoint(index) {
    const point = lastPlan?.points[index];
    if (!point) return;
    const fractions = currentFractions(point.pathId);
    if (fractions.length <= 3) {
      message("Um caminho precisa de pelo menos três pontos.", "error");
      return;
    }
    fractions.splice(point.indexInPath, 1);
    store.update((draft) => {
      draft.pathSamples[point.pathId] = fractions;
      delete draft.pointOffsets[point.id];
      delete draft.labelOffsets[point.id];
    }, { history: true });
    message(`Ponto ${point.number} removido.`, "ok");
    refresh();
  }

  function insertPointAfter(index) {
    const point = lastPlan?.points[index];
    if (!point) return;
    const fractions = currentFractions(point.pathId);
    const at = point.indexInPath;
    const next = at + 1 < fractions.length ? fractions[at + 1] : fractions[0] + 1;
    const middle = (fractions[at] + next) / 2;
    fractions.splice(at + 1, 0, middle % 1);
    fractions.sort((a, b) => a - b);
    store.update((draft) => {
      draft.pathSamples[point.pathId] = fractions;
    }, { history: true });
    refresh();
  }

  function renderValidation() {
    const host = dom["cd-validation"];
    if (!host) return;
    clear(host);
    const { errors, warnings } = lastValidation;
    const state = store.getState();

    // Antes do primeiro arquivo não há nada para validar; anunciar "validado"
    // seria mentira.
    if (!state.source.type) {
      host.appendChild(
        el(
          "p",
          "cd-alert",
          "A validação aparece aqui depois que você enviar um arquivo e confirmar um caminho."
        )
      );
      return;
    }

    if (!errors.length && !warnings.length) {
      const ok = el("p", "cd-alert cd-alert--ok", "Folha validada: pronta para imprimir ou exportar.");
      host.appendChild(ok);
      return;
    }

    if (errors.length) {
      const box = el("div", "cd-alert cd-alert--error");
      box.appendChild(el("strong", "", `${errors.length} problema(s) impedem a exportação:`));
      const list = el("ul");
      for (const item of errors) list.appendChild(el("li", "", item.message));
      box.appendChild(list);
      host.appendChild(box);
    }

    if (warnings.length) {
      const box = el("div", "cd-alert cd-alert--warning");
      box.appendChild(el("strong", "", `${warnings.length} aviso(s):`));
      const list = el("ul");
      for (const item of warnings) list.appendChild(el("li", "", item.message));
      box.appendChild(list);

      const confirm = el("label", "cd-alert__confirm");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.validation.acknowledged.includes(warningKey(warnings));
      input.addEventListener("change", () => {
        const key = warningKey(warnings);
        store.update((draft) => {
          const list = draft.validation.acknowledged;
          const at = list.indexOf(key);
          if (input.checked && at < 0) list.push(key);
          if (!input.checked && at >= 0) list.splice(at, 1);
        }, { silent: true });
        updateActions();
      });
      confirm.appendChild(input);
      confirm.appendChild(
        el("span", "", "Eu revisei a prévia e quero continuar mesmo assim.")
      );
      box.appendChild(confirm);
      host.appendChild(box);
    }
  }

  function warningKey(warnings) {
    return warnings.map((w) => w.code).sort().join("|");
  }

  function renderBreaks(plan) {
    if (!dom["cd-breaks"]) return;
    dom["cd-breaks"].textContent = plan.breaks.length
      ? `Interrupções registradas: ${plan.breaks.map((b) => `${b.from}–${b.to}`).join(", ")}`
      : `Sequência contínua de ${plan.points.length} pontos.`;
  }

  function updateActions() {
    const state = store.getState();
    const warnings = lastValidation.warnings || [];
    const acknowledged =
      !warnings.length || state.validation.acknowledged.includes(warningKey(warnings));
    const canExport = lastValidation.valid && acknowledged && Boolean(lastPlan);

    for (const id of ["cd-export-svg", "cd-export-png", "cd-print"]) {
      if (dom[id]) dom[id].disabled = !canExport;
    }
    if (dom["cd-undo"]) dom["cd-undo"].disabled = !store.canUndo();
    if (dom["cd-redo"]) dom["cd-redo"].disabled = !store.canRedo();
  }

  // -------------------------------------------------------------- exportação
  function currentMarkup() {
    if (!lastPlan) return "";
    return renderWorksheetSvg(lastPlan, { interactive: false });
  }

  function exportSvg() {
    const markup = currentMarkup();
    if (!markup) return;
    saveBlob(svgToBlob(markup), suggestFileName(store.getState().settings.title, "svg"));
    message("SVG exportado.", "ok");
  }

  async function exportPng() {
    const markup = currentMarkup();
    if (!markup || !lastPlan) return;
    const dpi = Number(dom["cd-dpi"]?.value || 150);
    setBusy(true, `Gerando PNG em ${dpi} DPI…`);
    try {
      const blob = await svgToPngBlob(markup, {
        widthMm: lastPlan.page.w,
        heightMm: lastPlan.page.h,
        dpi
      });
      saveBlob(blob, suggestFileName(`${store.getState().settings.title}-${dpi}dpi`, "png"));
      message(`PNG em ${dpi} DPI exportado.`, "ok");
    } catch (error) {
      message(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function print() {
    const markup = currentMarkup();
    if (!markup) return;
    const settings = store.getState().settings;
    applyPageRule(settings.pageSize, settings.orientation);
    mountPrintSheet(dom["cd-print-area"], markup);
    document.body.classList.add("cd-printing");
    await printSheet();
    document.body.classList.remove("cd-printing");
  }

  // ---------------------------------------------------------------- controles
  function patchSettings(mutate, options = {}) {
    store.update((draft) => mutate(draft.settings, draft), options);
    refresh();
  }

  function bindRange(id, key, outId, transform = Number) {
    const input = dom[id];
    if (!input) return;
    const output = outId ? dom[outId] : null;
    const render = () => {
      if (output) output.textContent = input.value;
    };
    render();
    input.addEventListener("input", () => {
      render();
      patchSettings((settings) => {
        settings[key] = clampRange(key, transform(input.value), settings[key]);
      });
    });
  }

  function bindCheckbox(id, key) {
    const input = dom[id];
    if (!input) return;
    input.addEventListener("change", () => {
      patchSettings((settings) => {
        settings[key] = input.checked;
      });
    });
  }

  function bindSelect(id, key) {
    const input = dom[id];
    if (!input) return;
    input.addEventListener("change", () => {
      patchSettings((settings) => {
        settings[key] = input.value;
      });
    });
  }

  function bindColor(id, key) {
    const input = dom[id];
    if (!input) return;
    input.addEventListener("input", () => {
      patchSettings((settings) => {
        settings[key] = input.value;
      });
    });
  }

  function bindRasterRange(id, key, outId, transform = Number) {
    const input = dom[id];
    if (!input) return;
    const output = outId ? dom[outId] : null;
    const render = () => {
      if (output) output.textContent = input.value;
    };
    render();
    input.addEventListener("input", () => {
      render();
      store.update((draft) => {
        draft.raster[key] = transform(input.value);
      }, { silent: true });
      scheduleExtraction();
    });
  }

  function parseHiddenPairs(text) {
    const pairs = [];
    const errors = [];
    for (const chunk of String(text || "").split(/[,;\n]+/)) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      const match = /^(\d+)\s*[-–—aA]?\s*(\d+)$/.exec(trimmed);
      if (!match) {
        errors.push(trimmed);
        continue;
      }
      pairs.push([Number(match[1]), Number(match[2])]);
    }
    return { pairs, errors };
  }

  function bindControls() {
    // upload
    dom["cd-file"]?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) handleFile(file);
      event.target.value = "";
    });

    const zone = dom["cd-dropzone"];
    if (zone) {
      for (const type of ["dragenter", "dragover"]) {
        zone.addEventListener(type, (event) => {
          event.preventDefault();
          zone.classList.add("is-over");
        });
      }
      for (const type of ["dragleave", "dragend"]) {
        zone.addEventListener(type, () => zone.classList.remove("is-over"));
      }
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("is-over");
        const file = event.dataTransfer?.files?.[0];
        if (file) handleFile(file);
      });
    }

    dom["cd-example"]?.addEventListener("click", loadExample);

    // modo
    dom["cd-modes"]?.addEventListener("click", (event) => {
      const node = event.target.closest?.("[data-mode]");
      if (!node) return;
      selectMode(node.getAttribute("data-mode"));
    });

    // raster
    dom["cd-th-mode"]?.addEventListener("change", () => {
      store.update((draft) => {
        draft.raster.thresholdMode = dom["cd-th-mode"].value;
      }, { silent: true });
      syncControlsFromState();
      scheduleExtraction();
    });
    bindRasterRange("cd-th-value", "threshold", "cd-th-value-out");
    bindRasterRange("cd-block", "blockSize", "cd-block-out");
    bindRasterRange("cd-const", "constant", "cd-const-out");
    bindRasterRange("cd-open", "open", "cd-open-out");
    bindRasterRange("cd-close", "close", "cd-close-out");
    bindRasterRange("cd-denoise", "denoise", "cd-denoise-out");
    bindRasterRange("cd-min-area", "minAreaRatio", "cd-min-area-out", (v) => Number(v) / 1000);
    dom["cd-invert"]?.addEventListener("change", () => {
      store.update((draft) => {
        draft.raster.invert = dom["cd-invert"].checked;
      }, { silent: true });
      scheduleExtraction();
    });
    dom["cd-reprocess"]?.addEventListener("click", () => runExtraction());
    dom["cd-apply-contours"]?.addEventListener("click", applyCandidates);
    for (const radio of dom.previewRadios) {
      radio.addEventListener("change", renderSelector);
    }

    // editor
    dom["cd-open-editor"]?.addEventListener("click", openEditor);
    dom["cd-tools"]?.addEventListener("click", (event) => {
      const node = event.target.closest?.("[data-tool]");
      if (!node || !editor?.ready) return;
      editor.setTool(node.getAttribute("data-tool"));
      renderToolButtons();
    });
    dom["cd-smooth"]?.addEventListener("click", () => editor?.smoothSelected());
    dom["cd-reverse"]?.addEventListener("click", () => editor?.reverseSelected());
    dom["cd-toggle-closed"]?.addEventListener("click", () => editor?.toggleClosedSelected());
    dom["cd-join"]?.addEventListener("click", () => editor?.joinSelected());
    dom["cd-split"]?.addEventListener("click", () => {
      if (dom["cd-editor-status"]) {
        dom["cd-editor-status"].textContent =
          "Use a ferramenta “Inserir ponto” e depois divida pelo ponto escolhido.";
      }
      editor?.splitSelectedAt({ x: 0, y: 0 });
    });
    dom["cd-delete-path"]?.addEventListener("click", () => editor?.deleteSelected());
    dom["cd-clear-paths"]?.addEventListener("click", () => editor?.clearAll());
    dom["cd-apply-edit"]?.addEventListener("click", applyEditor);

    // pontos
    bindRange("cd-count", "pointCount", "cd-count-out");
    dom["cd-count"]?.addEventListener("input", () => {
      // Mudar o total volta à amostragem automática.
      store.update((draft) => {
        draft.pathSamples = {};
      }, { silent: true });
    });
    bindSelect("cd-sampling", "samplingMode");
    bindRange("cd-point-radius", "pointRadius", "cd-point-radius-out", (v) => Number(v) / 10);
    bindRange("cd-label-size", "labelFontSize", "cd-label-size-out", (v) => Number(v) / 10);
    bindColor("cd-point-color", "pointColor");
    bindColor("cd-label-color", "labelColor");
    bindColor("cd-guide-color", "guideColor");
    bindRange("cd-guide-width", "guideWidth", "cd-guide-width-out", (v) => Number(v) / 10);
    bindCheckbox("cd-show-guide", "showGuideLines");
    bindSelect("cd-numbering", "numbering");
    dom["cd-start-number"]?.addEventListener("change", () => {
      patchSettings((settings) => {
        settings.startNumber = clampRange(
          "startNumber",
          parseInt(dom["cd-start-number"].value, 10),
          settings.startNumber
        );
      });
    });
    dom["cd-hidden-pairs"]?.addEventListener("change", () => {
      const { pairs, errors } = parseHiddenPairs(dom["cd-hidden-pairs"].value);
      store.update((draft) => {
        draft.hiddenPairs = pairs;
      }, { history: true });
      message(
        errors.length
          ? `Não entendi: ${errors.join(", ")}. Use o formato 12-13.`
          : `${pairs.length} interrupção(ões) registrada(s).`,
        errors.length ? "error" : "ok"
      );
      refresh();
    });
    dom["cd-reset-manual"]?.addEventListener("click", () => {
      store.update((draft) => {
        draft.pathSamples = {};
        draft.pointOffsets = {};
        draft.labelOffsets = {};
      }, { history: true });
      message("Posicionamento automático restaurado.", "ok");
      refresh();
    });

    // folha
    dom["cd-title"]?.addEventListener("input", () => {
      patchSettings((settings) => {
        settings.title = dom["cd-title"].value;
      });
    });
    bindSelect("cd-orientation", "orientation");
    bindRange("cd-margin", "margin", "cd-margin-out");
    bindCheckbox("cd-show-fields", "showFields");
    bindCheckbox("cd-field-name", "fieldName");
    bindCheckbox("cd-field-date", "fieldDate");
    bindCheckbox("cd-field-class", "fieldClass");
    bindCheckbox("cd-field-teacher", "fieldTeacher");
    bindCheckbox("cd-show-inspiration", "showInspiration");
    bindRange("cd-inspiration-size", "inspirationSize", "cd-inspiration-size-out");
    bindSelect("cd-inspiration-pos", "inspirationPosition");
    bindCheckbox("cd-show-original", "showOriginalImage");
    bindRange("cd-original-opacity", "originalOpacity", "cd-original-opacity-out", (v) => Number(v) / 100);

    // ações
    dom["cd-undo"]?.addEventListener("click", () => {
      if (store.undo()) {
        syncControlsFromState();
        renderPathList();
        refresh();
      }
    });
    dom["cd-redo"]?.addEventListener("click", () => {
      if (store.redo()) {
        syncControlsFromState();
        renderPathList();
        refresh();
      }
    });
    dom["cd-restart"]?.addEventListener("click", () => {
      store.reset();
      if (editor?.ready) editor.clearAll();
      selector = null;
      lastPlan = null;
      syncControlsFromState();
      renderPathList();
      clear(dom["cd-candidates"]);
      clear(dom["cd-contour-stage"]);
      if (dom["cd-file-info"]) dom["cd-file-info"].textContent = "";
      message("Tudo reiniciado.", "ok");
      refresh();
    });
    dom["cd-export-svg"]?.addEventListener("click", exportSvg);
    dom["cd-export-png"]?.addEventListener("click", exportPng);
    dom["cd-print"]?.addEventListener("click", print);

    window.addEventListener("resize", () => {
      if (editor?.ready) editor.resize();
    });
  }

  function selectMode(mode) {
    const state = store.getState();
    if (mode === "raster" && state.source.type !== "raster") {
      message("A detecção assistida vale para PNG, JPEG e WebP.", "error");
      return;
    }
    if (mode === "svg" && state.source.type !== "svg") {
      message("O modo exato vale para arquivos SVG.", "error");
      return;
    }
    store.update((draft) => {
      draft.mode = mode;
      draft.step = mode === "manual" ? "edit" : "select";
    }, { history: true });
    updateModeButtons();
    if (mode === "manual") openEditor();
    else refresh();
  }

  function updateModeButtons() {
    const state = store.getState();
    const container = dom["cd-modes"];
    if (!container) return;
    Array.from(container.querySelectorAll("[data-mode]")).forEach((node) => {
      const mode = node.getAttribute("data-mode");
      const available =
        mode === "manual" ||
        (mode === "svg" && state.source.type === "svg") ||
        (mode === "raster" && state.source.type === "raster");
      node.disabled = !available || !state.source.type;
      node.classList.toggle("is-active", state.mode === mode);
      node.setAttribute("aria-pressed", state.mode === mode ? "true" : "false");
    });
    if (dom["cd-mode-note"]) {
      dom["cd-mode-note"].textContent =
        {
          svg: "Geometria exata do arquivo. Resultado determinístico: a mesma entrada e as mesmas opções sempre geram a mesma folha.",
          raster: "O OpenCV.js procura contornos candidatos. Você precisa confirmar qual deles é a figura.",
          manual: "Você desenha o traçado sobre a imagem. É a saída segura quando a detecção não convence."
        }[state.mode] || "Escolha como o traçado será obtido.";
    }
  }

  /** Reflete o estado nos controles (usado após undo/redo/reset). */
  function syncControlsFromState() {
    const state = store.getState();
    const s = state.settings;
    const r = state.raster;
    const set = (id, value) => {
      if (dom[id]) dom[id].value = String(value);
    };
    const check = (id, value) => {
      if (dom[id]) dom[id].checked = Boolean(value);
    };
    const out = (id, value) => {
      if (dom[id]) dom[id].textContent = String(value);
    };

    set("cd-count", s.pointCount);
    out("cd-count-out", s.pointCount);
    set("cd-sampling", s.samplingMode);
    set("cd-point-radius", Math.round(s.pointRadius * 10));
    out("cd-point-radius-out", Math.round(s.pointRadius * 10));
    set("cd-label-size", Math.round(s.labelFontSize * 10));
    out("cd-label-size-out", Math.round(s.labelFontSize * 10));
    set("cd-point-color", s.pointColor);
    set("cd-label-color", s.labelColor);
    set("cd-guide-color", s.guideColor);
    set("cd-guide-width", Math.round(s.guideWidth * 10));
    out("cd-guide-width-out", Math.round(s.guideWidth * 10));
    check("cd-show-guide", s.showGuideLines);
    set("cd-numbering", s.numbering);
    set("cd-start-number", s.startNumber);
    set("cd-title", s.title);
    set("cd-orientation", s.orientation);
    set("cd-margin", s.margin);
    out("cd-margin-out", s.margin);
    check("cd-show-fields", s.showFields);
    check("cd-field-name", s.fieldName);
    check("cd-field-date", s.fieldDate);
    check("cd-field-class", s.fieldClass);
    check("cd-field-teacher", s.fieldTeacher);
    check("cd-show-inspiration", s.showInspiration);
    set("cd-inspiration-size", s.inspirationSize);
    out("cd-inspiration-size-out", s.inspirationSize);
    set("cd-inspiration-pos", s.inspirationPosition);
    check("cd-show-original", s.showOriginalImage);
    set("cd-original-opacity", Math.round(s.originalOpacity * 100));
    out("cd-original-opacity-out", Math.round(s.originalOpacity * 100));

    set("cd-th-mode", r.thresholdMode);
    set("cd-th-value", r.threshold);
    out("cd-th-value-out", r.threshold);
    set("cd-block", r.blockSize);
    out("cd-block-out", r.blockSize);
    set("cd-const", r.constant);
    out("cd-const-out", r.constant);
    check("cd-invert", r.invert);
    set("cd-open", r.open);
    out("cd-open-out", r.open);
    set("cd-close", r.close);
    out("cd-close-out", r.close);
    set("cd-denoise", r.denoise);
    out("cd-denoise-out", r.denoise);
    set("cd-min-area", Math.round(r.minAreaRatio * 1000));
    out("cd-min-area-out", Math.round(r.minAreaRatio * 1000));

    const manual = r.thresholdMode === "manual";
    const adaptive = r.thresholdMode === "adaptive";
    if (dom["cd-th-value"]) dom["cd-th-value"].disabled = !manual;
    if (dom["cd-block"]) dom["cd-block"].disabled = !adaptive;
    if (dom["cd-const"]) dom["cd-const"].disabled = !adaptive;

    updateModeButtons();
    showPanels();
  }

  /** Figura de exemplo do próprio projeto: nada de material de terceiros. */
  async function loadExample() {
    const href = new URL("../../images/tools/exemplo-borboleta.svg", import.meta.url).href;
    setBusy(true, "Carregando o exemplo…");
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error("Exemplo não encontrado.");
      const text = await response.text();
      const file = new File([text], "exemplo-borboleta.svg", { type: "image/svg+xml" });
      await handleFile(file);
    } catch (error) {
      message(`Não foi possível carregar o exemplo: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return {
    init() {
      cacheDom();
      bindControls();
      syncControlsFromState();
      refresh();
      if (dom["cd-dpi"]) {
        clear(dom["cd-dpi"]);
        for (const dpi of EXPORT_DPI) {
          const option = document.createElement("option");
          option.value = String(dpi);
          option.textContent = `${dpi} DPI`;
          dom["cd-dpi"].appendChild(option);
        }
      }
      message(
        `Envie um SVG, PNG, JPEG ou WebP de até ${LIMITS.maxFileBytes / 1048576} MB. ` +
          "Nada é enviado para servidores.",
        ""
      );
    },
    refresh,
    removePoint,
    insertPointAfter,
    get plan() {
      return lastPlan;
    },
    get validation() {
      return lastValidation;
    },
    EDITOR_TOOLS
  };
}
