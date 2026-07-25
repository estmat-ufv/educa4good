/* Educa4Good — Ligar os Pontos
   Modo 3 (traçado manual) e correção dos caminhos dos modos 1 e 2.

   Usa Paper.js para a manipulação vetorial: segmentos, alças, suavização,
   simplificação, divisão, união e teste de acerto. A biblioteca é carregada
   sob demanda a partir da cópia local versionada; a CDN pinada é apenas
   reserva.

   O editor trabalha nas coordenadas da ORIGEM (pixels da imagem ou unidades
   do viewBox do SVG). O encaixe na folha acontece depois, em
   worksheet-renderer. Assim editar não muda a escala do resultado. */

import { normalizePaths } from "./path-normalizer.js";

export const PAPER_VERSION = "0.12.18";

const PAPER_SOURCES = [
  new URL(`../../vendor/paper/paper-core-${PAPER_VERSION}.min.js`, import.meta.url).href,
  `https://cdn.jsdelivr.net/npm/paper@${PAPER_VERSION}/dist/paper-core.min.js`
];

let paperLoad = null;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(src);
    script.onerror = () => {
      script.remove();
      reject(new Error(`Falha ao carregar ${src}`));
    };
    document.head.appendChild(script);
  });
}

/** Carrega o Paper.js uma única vez. */
export function loadPaper() {
  if (paperLoad) return paperLoad;
  paperLoad = (async () => {
    if (window.paper) return window.paper;
    let lastError = null;
    for (const src of PAPER_SOURCES) {
      try {
        await injectScript(src);
        if (window.paper) return window.paper;
      } catch (error) {
        lastError = error;
      }
    }
    paperLoad = null;
    throw lastError || new Error("Não foi possível carregar o Paper.js.");
  })();
  return paperLoad;
}

export const EDITOR_TOOLS = {
  draw: "Desenhar",
  move: "Mover pontos",
  insert: "Inserir ponto",
  remove: "Remover ponto",
  start: "Definir início",
  select: "Selecionar caminho"
};

const STYLE = {
  path: { strokeColor: "#1f5180", strokeWidth: 2, fillColor: null },
  pathSelected: { strokeColor: "#e8a020", strokeWidth: 3 },
  background: { strokeColor: "#b7cadb", strokeWidth: 1 }
};

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {() => void} [options.onChange] chamado após cada alteração aplicada
 * @param {(text: string) => void} [options.onStatus]
 */
export function createPathEditor(options) {
  const { canvas, onChange, onStatus } = options;
  let paper = null;
  let scope = null;
  let backgroundLayer = null;
  let drawLayer = null;
  let tool = "move";
  let entries = [];
  let activeEntry = null;
  let dragging = null;
  let sourceBounds = null;
  let idSeq = 0;

  function status(text) {
    if (onStatus) onStatus(text);
  }

  function changed() {
    if (onChange) onChange();
  }

  function nextLabel() {
    idSeq += 1;
    return `Traçado ${idSeq}`;
  }

  function applyStyle(entry) {
    const target = entry.item;
    const style = entry.selected ? STYLE.pathSelected : STYLE.path;
    target.strokeColor = style.strokeColor;
    target.strokeWidth = style.strokeWidth / (scope.view.zoom || 1);
    target.fullySelected = entry.selected;
  }

  function refreshStyles() {
    for (const entry of entries) applyStyle(entry);
    scope.view.update();
  }

  function fitView() {
    if (!sourceBounds) return;
    const view = scope.view;
    const size = view.viewSize;
    const scale =
      Math.min(size.width / Math.max(sourceBounds.w, 1e-6), size.height / Math.max(sourceBounds.h, 1e-6)) *
      0.94;
    view.zoom = scale > 0 && Number.isFinite(scale) ? scale : 1;
    view.center = new paper.Point(
      sourceBounds.x + sourceBounds.w / 2,
      sourceBounds.y + sourceBounds.h / 2
    );
    refreshStyles();
  }

  function hit(point) {
    const tolerance = 10 / (scope.view.zoom || 1);
    return scope.project.hitTest(point, {
      segments: true,
      stroke: true,
      curves: true,
      tolerance
    });
  }

  function entryOf(item) {
    return entries.find((entry) => entry.item === item) || null;
  }

  function selectOnly(entry) {
    for (const other of entries) other.selected = other === entry;
    activeEntry = entry;
    refreshStyles();
  }

  // ------------------------------------------------------------------ ações
  function startNewPath(point) {
    const path = new paper.Path();
    path.add(point);
    drawLayer.addChild(path);
    const entry = {
      item: path,
      id: `manual-${entries.length + 1}-${Date.now().toString(36)}`,
      label: nextLabel(),
      selected: true,
      order: entries.length
    };
    entries.push(entry);
    selectOnly(entry);
    status("Clique para adicionar pontos. Clique no primeiro ponto para fechar.");
    return entry;
  }

  function handleDraw(event) {
    const target = hit(event.point);

    // Clicar no primeiro segmento do caminho ativo fecha o traçado.
    if (activeEntry && target && target.type === "segment" && target.item === activeEntry.item) {
      if (target.segment.index === 0 && activeEntry.item.segments.length > 2) {
        activeEntry.item.closed = true;
        status("Caminho fechado.");
        refreshStyles();
        changed();
        return;
      }
    }

    if (!activeEntry || activeEntry.item.closed) {
      startNewPath(event.point);
    } else {
      activeEntry.item.add(event.point);
    }
    refreshStyles();
    changed();
  }

  function handleInsert(event) {
    const target = hit(event.point);
    if (!target || !target.location || !target.item) {
      status("Clique sobre o traço para inserir um ponto.");
      return;
    }
    const entry = entryOf(target.item);
    if (!entry) return;
    entry.item.insert(target.location.index + 1, target.location.point);
    selectOnly(entry);
    changed();
  }

  function handleRemove(event) {
    const target = hit(event.point);
    if (!target || target.type !== "segment") {
      status("Clique exatamente sobre um ponto para removê-lo.");
      return;
    }
    const entry = entryOf(target.item);
    if (!entry) return;
    if (entry.item.segments.length <= 2) {
      status("Um caminho precisa de pelo menos dois pontos. Apague o caminho inteiro em vez disso.");
      return;
    }
    target.segment.remove();
    changed();
  }

  function handleStart(event) {
    const target = hit(event.point);
    if (!target || target.type !== "segment") {
      status("Clique sobre o ponto que deve virar o número 1.");
      return;
    }
    const entry = entryOf(target.item);
    if (!entry) return;
    rotateToSegment(entry, target.segment.index);
    selectOnly(entry);
    status("Ponto inicial definido.");
    changed();
  }

  /** Reordena os segmentos para que `index` passe a ser o primeiro. */
  function rotateToSegment(entry, index) {
    const path = entry.item;
    if (index === 0) return;
    if (!path.closed) {
      // Em caminho aberto só existem duas escolhas: uma ponta ou a outra.
      if (index === path.segments.length - 1) path.reverse();
      else status("Em caminhos abertos o início é uma das pontas. Feche o caminho para escolher outro ponto.");
      return;
    }
    const snapshot = path.segments.map((segment) => ({
      point: segment.point.clone(),
      handleIn: segment.handleIn.clone(),
      handleOut: segment.handleOut.clone()
    }));
    const reordered = snapshot.slice(index).concat(snapshot.slice(0, index));
    path.removeSegments();
    for (const segment of reordered) {
      path.add(new paper.Segment(segment.point, segment.handleIn, segment.handleOut));
    }
    path.closed = true;
  }

  function handleSelect(event) {
    const target = hit(event.point);
    if (!target) {
      for (const entry of entries) entry.selected = false;
      activeEntry = null;
      refreshStyles();
      return;
    }
    const entry = entryOf(target.item);
    if (entry) selectOnly(entry);
  }

  // ------------------------------------------------------------- ferramentas
  function bindTool() {
    const paperTool = new paper.Tool();

    paperTool.onMouseDown = (event) => {
      if (tool === "draw") return handleDraw(event);
      if (tool === "insert") return handleInsert(event);
      if (tool === "remove") return handleRemove(event);
      if (tool === "start") return handleStart(event);
      if (tool === "select") return handleSelect(event);

      // tool === "move"
      const target = hit(event.point);
      if (target && target.type === "segment") {
        const entry = entryOf(target.item);
        dragging = { segment: target.segment, entry };
        if (entry) selectOnly(entry);
      } else if (target) {
        const entry = entryOf(target.item);
        if (entry) selectOnly(entry);
      }
      return undefined;
    };

    paperTool.onMouseDrag = (event) => {
      if (tool !== "move" || !dragging) return;
      dragging.segment.point = dragging.segment.point.add(event.delta);
      scope.view.update();
    };

    paperTool.onMouseUp = () => {
      if (dragging) {
        dragging = null;
        changed();
      }
    };

    paperTool.activate();
    return paperTool;
  }

  // ------------------------------------------------------------------ API
  return {
    async mount() {
      paper = await loadPaper();
      scope = new paper.PaperScope();
      scope.setup(canvas);
      scope.activate();
      backgroundLayer = new paper.Layer();
      backgroundLayer.locked = true;
      drawLayer = new paper.Layer();
      drawLayer.activate();
      bindTool();
      scope.view.onResize = () => fitView();
      return true;
    },

    get ready() {
      return Boolean(scope);
    },

    get tool() {
      return tool;
    },

    setTool(name) {
      tool = EDITOR_TOOLS[name] ? name : "move";
      if (tool !== "draw") activeEntry = entries.find((e) => e.selected) || activeEntry;
      status(
        {
          draw: "Clique para criar pontos. Clique no primeiro ponto para fechar o caminho.",
          move: "Arraste os pontos para ajustar o traçado.",
          insert: "Clique sobre o traço para inserir um ponto.",
          remove: "Clique sobre um ponto para removê-lo.",
          start: "Clique no ponto que deve receber o número 1.",
          select: "Clique em um caminho para selecioná-lo."
        }[tool] || ""
      );
    },

    /** Fundo: imagem raster (data URL) ou geometria vetorial. */
    setBackground(background, bounds) {
      if (!scope) return;
      backgroundLayer.removeChildren();
      sourceBounds = bounds || sourceBounds;

      if (background && background.kind === "image" && background.href) {
        const raster = new paper.Raster({ source: background.href, crossOrigin: "" });
        raster.onLoad = () => {
          raster.position = new paper.Point(
            sourceBounds.x + sourceBounds.w / 2,
            sourceBounds.y + sourceBounds.h / 2
          );
          raster.size = new paper.Size(sourceBounds.w, sourceBounds.h);
          raster.opacity = 0.5;
          fitView();
        };
        backgroundLayer.addChild(raster);
      } else if (background && background.kind === "geometry") {
        for (const d of background.paths || []) {
          const item = new paper.Path();
          item.pathData = d;
          item.strokeColor = STYLE.background.strokeColor;
          item.strokeWidth = STYLE.background.strokeWidth;
          item.fillColor = null;
          item.opacity = 0.6;
          backgroundLayer.addChild(item);
        }
      }
      drawLayer.activate();
      fitView();
    },

    /** Carrega caminhos do estado no editor. */
    loadPaths(paths, bounds) {
      if (!scope) return;
      drawLayer.removeChildren();
      entries = [];
      idSeq = 0;
      sourceBounds = bounds || sourceBounds;

      for (const path of paths) {
        const item = new paper.Path();
        item.pathData = path.svgPathData;
        item.closed = path.closed;
        item.fillColor = null;
        drawLayer.addChild(item);
        idSeq += 1;
        entries.push({
          item,
          id: path.id,
          label: path.label || nextLabel(),
          selected: false,
          order: path.order,
          direction: path.direction,
          breakAfter: path.breakAfter,
          wasSelected: path.selected !== false
        });
      }
      activeEntry = entries[0] || null;
      if (activeEntry) activeEntry.selected = true;
      fitView();
    },

    /** Converte o conteúdo do editor de volta em caminhos normalizados. */
    commit() {
      const raws = entries
        .filter((entry) => entry.item && entry.item.segments.length >= 2)
        .sort((a, b) => a.order - b.order)
        .map((entry, index) => ({
          d: entry.item.pathData,
          closed: entry.item.closed,
          source: "manual",
          label: entry.label || `Traçado ${index + 1}`,
          idPrefix: "edit",
          selected: entry.wasSelected !== false
        }));
      return normalizePaths(raws, { minSegment: 0.2, minLength: 4 });
    },

    /** Lista simplificada para a interface. */
    list() {
      return entries.map((entry, index) => ({
        id: entry.id,
        label: entry.label,
        selected: entry.selected,
        closed: entry.item.closed,
        segments: entry.item.segments.length,
        order: index
      }));
    },

    selectById(id) {
      const entry = entries.find((item) => item.id === id);
      if (entry) selectOnly(entry);
    },

    // -------------------------------------------------------------- comandos
    smoothSelected(strength = 2.5) {
      const targets = entries.filter((entry) => entry.selected);
      if (!targets.length) {
        status("Selecione um caminho primeiro.");
        return false;
      }
      for (const entry of targets) {
        entry.item.simplify(strength);
        entry.item.smooth({ type: "continuous" });
      }
      refreshStyles();
      changed();
      return true;
    },

    reverseSelected() {
      const targets = entries.filter((entry) => entry.selected);
      if (!targets.length) return false;
      for (const entry of targets) entry.item.reverse();
      refreshStyles();
      changed();
      return true;
    },

    toggleClosedSelected() {
      const targets = entries.filter((entry) => entry.selected);
      if (!targets.length) return false;
      for (const entry of targets) {
        if (entry.item.segments.length < 3 && !entry.item.closed) {
          status("Um caminho fechado precisa de pelo menos três pontos.");
          continue;
        }
        entry.item.closed = !entry.item.closed;
      }
      refreshStyles();
      changed();
      return true;
    },

    /** Une as duas extremidades mais próximas entre os caminhos selecionados. */
    joinSelected() {
      const targets = entries.filter((entry) => entry.selected);
      if (targets.length < 2) {
        status("Selecione dois caminhos para unir as extremidades.");
        return false;
      }
      const [first, ...rest] = targets;
      for (const entry of rest) {
        first.item.join(entry.item, 1e6);
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
      }
      selectOnly(first);
      changed();
      return true;
    },

    /** Divide o caminho selecionado no ponto mais próximo do último clique. */
    splitSelectedAt(point) {
      const entry = entries.find((item) => item.selected);
      if (!entry) {
        status("Selecione um caminho para dividir.");
        return false;
      }
      const location = entry.item.getNearestLocation(
        new paper.Point(point?.x ?? 0, point?.y ?? 0)
      );
      if (!location) return false;
      const created = entry.item.splitAt(location);
      if (created) {
        drawLayer.addChild(created);
        idSeq += 1;
        entries.push({
          item: created,
          id: `manual-split-${Date.now().toString(36)}`,
          label: nextLabel(),
          selected: false,
          order: entries.length
        });
      }
      refreshStyles();
      changed();
      return true;
    },

    deleteSelected() {
      const remaining = [];
      let removed = 0;
      for (const entry of entries) {
        if (entry.selected) {
          entry.item.remove();
          removed += 1;
        } else {
          remaining.push(entry);
        }
      }
      entries = remaining;
      entries.forEach((entry, index) => {
        entry.order = index;
      });
      activeEntry = null;
      refreshStyles();
      if (removed) changed();
      return removed > 0;
    },

    reorder(id, delta) {
      const index = entries.findIndex((entry) => entry.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= entries.length) return false;
      const [entry] = entries.splice(index, 1);
      entries.splice(target, 0, entry);
      entries.forEach((item, i) => {
        item.order = i;
      });
      changed();
      return true;
    },

    clearAll() {
      drawLayer.removeChildren();
      entries = [];
      activeEntry = null;
      idSeq = 0;
      scope.view.update();
      changed();
    },

    resize() {
      if (scope) fitView();
    },

    destroy() {
      if (scope) {
        scope.project?.clear();
        scope.remove?.();
      }
      scope = null;
      entries = [];
      activeEntry = null;
    }
  };
}
