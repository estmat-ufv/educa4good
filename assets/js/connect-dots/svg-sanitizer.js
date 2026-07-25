/* Educa4Good — Ligar os Pontos
   Sanitização de SVG enviado pelo usuário.

   O arquivo é conteúdo NÃO CONFIÁVEL. A estratégia aqui é a mais restritiva
   possível: o documento original é lido com DOMParser (que não executa
   scripts) e depois DESCARTADO. Nada dele entra na página — construímos uma
   árvore nova, do zero, com `createElementNS`, copiando apenas nomes de
   elementos e atributos que estão na lista de permissões e cujos valores
   passam pela checagem. Em nenhum momento usamos innerHTML. */

import { SVG_NS } from "./constants.js";

/** Elementos aceitos: geometria, agrupamento e metadados inofensivos. */
const ALLOWED_ELEMENTS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polygon", "polyline",
  "title", "desc"
]);

/** Atributos aceitos em qualquer elemento. */
const GLOBAL_ATTRIBUTES = new Set([
  "id", "class", "transform", "fill", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset",
  "fill-rule", "fill-opacity", "stroke-opacity", "opacity", "display", "visibility",
  "color", "vector-effect", "shape-rendering"
]);

/** Atributos aceitos por elemento. */
const ELEMENT_ATTRIBUTES = {
  svg: new Set(["viewBox", "width", "height", "preserveAspectRatio", "version"]),
  path: new Set(["d", "pathLength"]),
  circle: new Set(["cx", "cy", "r"]),
  ellipse: new Set(["cx", "cy", "rx", "ry"]),
  rect: new Set(["x", "y", "width", "height", "rx", "ry"]),
  line: new Set(["x1", "y1", "x2", "y2"]),
  polygon: new Set(["points"]),
  polyline: new Set(["points"]),
  g: new Set([]),
  title: new Set([]),
  desc: new Set([])
};

/** Propriedades de estilo aceitas dentro do atributo `style`. */
const ALLOWED_STYLE_PROPERTIES = new Set([
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "fill-rule", "fill-opacity",
  "stroke-opacity", "opacity", "display", "visibility", "color"
]);

/** Qualquer valor que contenha uma destas marcas é rejeitado inteiro. */
const DANGEROUS_VALUE = /url\s*\(|javascript\s*:|data\s*:|expression\s*\(|&#|<|>/i;

/** Nomes de elementos que exigem registro explícito quando aparecem. */
const NOTABLE_REMOVALS = new Set([
  "script", "foreignObject", "image", "use", "iframe", "object", "embed",
  "animate", "animateTransform", "animateMotion", "set", "style", "filter",
  "mask", "clipPath", "pattern", "marker", "linearGradient", "radialGradient",
  "a", "switch", "text", "tspan", "textPath", "symbol", "defs", "metadata"
]);

/**
 * @typedef {Object} SanitizeReport
 * @property {string[]} removedElements
 * @property {string[]} removedAttributes
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * @param {string} source conteúdo do arquivo .svg
 * @returns {{root: SVGSVGElement|null, report: SanitizeReport}}
 */
export function sanitizeSvg(source) {
  const report = { removedElements: [], removedAttributes: [], errors: [], warnings: [] };
  const text = String(source || "");

  if (!text.trim()) {
    report.errors.push("O arquivo SVG está vazio.");
    return { root: null, report };
  }
  if (typeof DOMParser === "undefined") {
    report.errors.push("Este navegador não permite ler SVG com segurança.");
    return { root: null, report };
  }

  let parsed;
  try {
    parsed = new DOMParser().parseFromString(text, "image/svg+xml");
  } catch {
    report.errors.push("Não foi possível interpretar este SVG.");
    return { root: null, report };
  }

  if (parsed.getElementsByTagName("parsererror").length) {
    report.errors.push("O SVG tem erro de sintaxe e não pôde ser lido.");
    return { root: null, report };
  }

  const source_root = parsed.documentElement;
  if (!source_root || localName(source_root) !== "svg") {
    report.errors.push("O arquivo não tem um elemento <svg> na raiz.");
    return { root: null, report };
  }

  const root = document.createElementNS(SVG_NS, "svg");
  copyAttributes(source_root, root, report);
  copyChildren(source_root, root, report, 0);

  if (!root.querySelector("path, circle, ellipse, rect, line, polygon, polyline")) {
    report.errors.push(
      "Nenhuma forma utilizável foi encontrada. Este SVG pode conter apenas texto, " +
        "imagens embutidas ou referências externas."
    );
  }
  return { root, report };
}

function localName(node) {
  return (node.localName || node.nodeName || "").replace(/^.*:/, "");
}

function copyChildren(from, to, report, depth) {
  if (depth > 40) {
    report.warnings.push("Estrutura muito aninhada: níveis extras foram ignorados.");
    return;
  }
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType !== 1) continue;
    const name = localName(child);

    // <svg> aninhado cria um novo viewport; tratá-lo como grupo distorceria a
    // geometria, então é recusado de forma visível.
    if (depth > 0 && name === "svg") {
      note(report.removedElements, "svg (aninhado)");
      report.warnings.push(
        "Um <svg> aninhado foi ignorado: reexporte o arquivo com um único viewport."
      );
      continue;
    }

    if (!ALLOWED_ELEMENTS.has(name)) {
      note(report.removedElements, NOTABLE_REMOVALS.has(name) ? name : name || "desconhecido");
      continue;
    }

    const created = document.createElementNS(SVG_NS, name);
    copyAttributes(child, created, report);
    if (name === "title" || name === "desc") {
      created.textContent = String(child.textContent || "").slice(0, 300);
    } else {
      copyChildren(child, created, report, depth + 1);
    }
    to.appendChild(created);
  }
}

function copyAttributes(from, to, report) {
  const name = localName(from);
  const allowed = ELEMENT_ATTRIBUTES[name] || new Set();

  for (const attr of Array.from(from.attributes || [])) {
    const attrName = attr.name;
    const bare = attrName.replace(/^.*:/, "");
    const value = String(attr.value || "");

    // Eventos, href e namespaces estranhos saem sem discussão.
    if (/^on/i.test(attrName) || bare === "href" || attrName === "xlink:href") {
      note(report.removedAttributes, attrName);
      continue;
    }
    if (attrName === "style") {
      const safe = filterStyle(value, report);
      if (safe) to.setAttribute("style", safe);
      continue;
    }
    if (!allowed.has(attrName) && !allowed.has(bare) &&
        !GLOBAL_ATTRIBUTES.has(attrName) && !GLOBAL_ATTRIBUTES.has(bare)) {
      if (attrName !== "xmlns" && !attrName.startsWith("xmlns:")) {
        note(report.removedAttributes, attrName);
      }
      continue;
    }
    if (DANGEROUS_VALUE.test(value)) {
      note(report.removedAttributes, `${attrName} (valor recusado)`);
      continue;
    }
    if (value.length > 400000) {
      note(report.removedAttributes, `${attrName} (valor grande demais)`);
      continue;
    }
    to.setAttribute(allowed.has(attrName) || GLOBAL_ATTRIBUTES.has(attrName) ? attrName : bare, value);
  }
}

function filterStyle(value, report) {
  const kept = [];
  for (const declaration of value.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const propertyValue = declaration.slice(colon + 1).trim();
    if (!ALLOWED_STYLE_PROPERTIES.has(property) || DANGEROUS_VALUE.test(propertyValue)) {
      note(report.removedAttributes, `style:${property || "?"}`);
      continue;
    }
    kept.push(`${property}:${propertyValue}`);
  }
  return kept.join(";");
}

function note(list, entry) {
  if (!list.includes(entry)) list.push(entry);
}

/** Exportado para os testes de lista de permissões. */
export const SANITIZER_POLICY = {
  ALLOWED_ELEMENTS,
  GLOBAL_ATTRIBUTES,
  ELEMENT_ATTRIBUTES,
  ALLOWED_STYLE_PROPERTIES,
  DANGEROUS_VALUE
};
