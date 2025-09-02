// apps/inn/js/pirate-cave-extract.js
// Extractor PDF → JSON (versión agnóstica cara Pirate Cave)
// - Reconstrucción por coordenadas (x/y) y lectura en 2 columnas si procede
// - Normalización básica de texto y unión de palabras cortadas por guion
// - Bloques de párrafo y lista (viñetas, números, romanos)
// - Árbol por headings numerados (1., 1.1, 1.1.1) sin filtros específicos del documento

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Headings numerados (genéricos)
const H1 = /^\s*\d+\.\s+/;
const H2 = /^\s*\d+\.\d+\s+/;
const H3 = /^\s*\d+\.\d+\.\d+\s+/;

function classifyHeading(line) {
  if (H3.test(line)) return 3;
  if (H2.test(line)) return 2;
  if (H1.test(line)) return 1;
  return 0;
}

// Listas (genérico): -, –, •, ·, 1. / 1), i), ii), iii)...
const LIST_MARKER = /^\s*((?:[-–•·])|(?:\d+[\.\)])|(?:[ivxlcdm]+\)))(\s+)/i;

function isListLine(line) {
  return LIST_MARKER.test(line.trim());
}

function stripListMarker(line) {
  return line.trim().replace(LIST_MARKER, "").trim();
}

// Normalización básica y eliminación de soft hyphen
function normalizeText(raw) {
  return (raw ?? "")
    .replace(/\u00AD/g, "")        // soft hyphen
    .replace(/[ \t]+/g, " ")       // espacios múltiples
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

// ¿Termina la línea como fin de frase?
function endsSentence(line) {
  return /[.!?:;]\s*$/.test((line || "").trim());
}

// Unir palabra cortada por guion al final de línea
function joinHyphenBreak(a, b) {
  if (/[—-]\s*$/.test(a)) {
    return a.replace(/[—-]\s*$/, "") + (b || "").replace(/^\s+/, "");
  }
  return `${a} ${b}`.replace(/\s+/g, " ");
}

// === Reconstrucción por coordenadas ===
function groupByLine(items, yTol = 2) {
  const lines = [];
  for (const it of items) {
    const y = Math.round(it.transform[5]); // y
    const x = it.transform[4];             // x
    const str = it.str ?? "";
    let bucket = lines.find(l => Math.abs(l.y - y) <= yTol);
    if (!bucket) {
      bucket = { y, segs: [] };
      lines.push(bucket);
    }
    bucket.segs.push({ x, str });
  }
  // y: descendente (pdfjs: arriba = y mayor); segs.x: ascendente
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) l.segs.sort((a, b) => a.x - b.x);
  return lines;
}

function joinLineSegments(segs) {
  let acc = "";
  for (const s of segs) {
    const t = normalizeText(s.str);
    if (!t) continue;
    acc = acc ? `${acc} ${t}` : t;
  }
  return normalizeText(acc);
}

function detectTwoColumns(lines) {
  // Heurística simple: detectar dos clústeres de x inicial
  const starts = lines.map(l => (l.segs[0]?.x ?? 0)).filter(Number.isFinite).sort((a, b) => a - b);
  if (starts.length < 6) return null;
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    if (gap > 40) return (starts[i] + starts[i - 1]) / 2;
  }
  return null;
}

function splitColumns(lines, splitX) {
  const left = [], right = [];
  for (const l of lines) {
    const x0 = l.segs[0]?.x ?? 0;
    (x0 < splitX ? left : right).push(l);
  }
  return { left, right };
}

// Pegar líneas consecutivas: une palabras cortadas y continuaciones de párrafo
function glueLines(lines) {
  const out = [];
  let acc = "";

  for (let i = 0; i < lines.length; i++) {
    const cur = normalizeText(lines[i]);
    if (!cur) continue;
    const next = normalizeText(lines[i + 1] ?? "");

    if (/[—-]\s*$/.test(cur) && next) {
      // palabra cortada: unir sin espacio
      const joined = joinHyphenBreak(cur, next);
      out.push(joined);
      i++; // consumimos next
      continue;
    }

    // Si no cierra frase y la siguiente no es heading, consideramos continuación
    if (!endsSentence(cur) && next && classifyHeading(next) === 0) {
      acc = acc ? joinHyphenBreak(acc, cur) : cur;
      // seguimos acumulando, no volcamos aún
      continue;
    }

    // cerrar bloque acumulado o volcar línea sola
    acc = acc ? joinHyphenBreak(acc, cur) : cur;
    out.push(acc);
    acc = "";
  }
  if (acc) out.push(acc);
  return out.map(normalizeText);
}

// Crear bloques (paragraph/list) sin filtros específicos
function toBlocks(gluedLines) {
  const blocks = [];
  let pAcc = [];

  const flushP = () => {
    const txt = normalizeText(pAcc.join(" "));
    if (txt) blocks.push({ type: "paragraph", text: txt });
    pAcc = [];
  };

  for (const lnRaw of gluedLines) {
    const ln = (lnRaw || "").trim();
    if (!ln) { flushP(); continue; }

    if (isListLine(ln)) {
      flushP();
      const marker = ln.match(LIST_MARKER)?.[1] ?? "";
      const rest = stripListMarker(ln);
      const last = blocks[blocks.length - 1];
      const item = `${marker} ${rest}`.trim();
      if (last && last.type === "list") last.items.push(item);
      else blocks.push({ type: "list", items: [item] });
      continue;
    }

    pAcc.push(ln);
  }
  flushP();
  return blocks;
}

function pushNode(root, stack, node) {
  while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
  const parent = stack[stack.length - 1];
  if (parent) {
    parent.children ??= [];
    parent.children.push(node);
  } else {
    root.push(node);
  }
  stack.push(node);
}

export async function extractStructuredFromPdf(uint8 /* Uint8Array */) {
  const loadingTask = getDocument({ data: uint8, disableWorker: true }); // worker off (Node)
  const pdf = await loadingTask.promise;

  const root = [];
  const stack = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();

    // 1) líneas por coordenada
    const grouped = groupByLine(tc.items);
    const rawLines = grouped.map(l => joinLineSegments(l.segs));

    // 2) ¿dos columnas? (si no, usa tal cual)
    let ordered = rawLines;
    const splitX = detectTwoColumns(grouped);
    if (splitX) {
      const { left, right } = splitColumns(grouped, splitX);
      const leftLines = left.map(l => joinLineSegments(l.segs));
      const rightLines = right.map(l => joinLineSegments(l.segs));
      ordered = [...leftLines, ...rightLines];
    }

    // 3) pegar y convertir en bloques
    const glued = glueLines(ordered);

    let i = 0;
    while (i < glued.length) {
      const line = glued[i];
      const lvl = classifyHeading(line);

      if (lvl > 0) {
        if (stack.length) stack[stack.length - 1].page_end = p;
        const node = { level: lvl, heading: line.trim(), page_start: p, page_end: p };
        pushNode(root, stack, node);
        i++;
        continue;
      }

      const body = [];
      while (i < glued.length && classifyHeading(glued[i]) === 0) {
        body.push(glued[i]);
        i++;
      }

      const blocks = toBlocks(body);
      if (blocks.length) {
        const current =
          stack[stack.length - 1] ||
          (() => {
            const anon = { level: 1, heading: "Untitled", page_start: p, page_end: p };
            root.push(anon);
            stack.push(anon);
            return anon;
          })();
        current.blocks ??= [];
        current.blocks.push(...blocks);
        current.page_end = p;
      }
    }
  }

  // Limpieza ligera: quitar items vacíos
  function prune(node) {
    if (node.blocks) {
      node.blocks = node.blocks
        .map(b => (b.type === "list" ? { ...b, items: (b.items || []).filter(x => x && x.trim()) } : b))
        .filter(b => (b.type === "paragraph" ? b.text && b.text.trim() : (b.items?.length ?? 0) > 0));
    }
    if (node.children) node.children.forEach(prune);
  }
  root.forEach(prune);

  return root;
}
