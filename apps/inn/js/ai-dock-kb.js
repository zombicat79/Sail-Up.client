// apps/inn/js/ai-dock-kb.js
// Helper de Knowledge Base para AI Dock
// Soporta 3 formatos de JSON:
//  A) Árbol: [{ heading, blocks:[{type,text|items}], children:[...] }]
//  B) Plano: [{ Domain, Subdomain, Topic, Content }]
//  C) Chapters: [{ chapter, title, sections:[{ section, title, content:[...] }] }]
// - Aplana a pasajes { headingTrail[], text }
// - Trocea pasajes largos (~600 chars)
// - Recupera top-K por términos (score agnóstico mejorado)

import fs from "node:fs/promises";
import path from "node:path";

// ====== A) Aplanado de formato ÁRBOL ======
function flattenTreeToPassages(tree) {
  const out = [];
  function visit(node, trail = []) {
    const title = (node.heading || "").trim();
    const nextTrail = title ? [...trail, title] : trail;

    if (Array.isArray(node.blocks)) {
      for (const b of node.blocks) {
        if (b.type === "paragraph" && b.text && b.text.trim()) {
          out.push({ kind: "paragraph", headingTrail: nextTrail, text: b.text.trim() });
        } else if (b.type === "list" && Array.isArray(b.items)) {
          for (const it of b.items) {
            const t = String(it || "").trim();
            if (t) out.push({ kind: "listItem", headingTrail: nextTrail, text: t });
          }
        } else if (b.type === "definition" && b.term && b.text) {
          const trailDef = b.term ? [...nextTrail, b.term.trim()] : nextTrail;
          out.push({ kind: "definition", headingTrail: trailDef, text: String(b.text).trim() });
        }
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(ch => visit(ch, nextTrail));
  }
  (tree || []).forEach(n => visit(n, []));
  return out;
}

// ====== B) Aplanado de formato PLANO ======
function flattenFlatArrayToPassages(rows) {
  // Espera objetos: { Domain?, Subdomain?, Topic?, Content }
  const out = [];
  for (const r of rows || []) {
    const domain = (r.Domain ?? r.domain ?? "").toString().trim();
    const sub = (r.Subdomain ?? r.subdomain ?? "").toString().trim();
    const topic = (r.Topic ?? r.topic ?? "").toString().trim();
    const content = (r.Content ?? r.content ?? "").toString().trim();
    if (!content) continue;
    const trail = [domain, sub, topic].filter(Boolean);
    out.push({ kind: "paragraph", headingTrail: trail, text: content });
  }
  return out;
}

// ====== C) Aplanado de formato CHAPTERS ======
function flattenChaptersToPassages(chapters) {
  // chapters: [{ chapter, title, sections:[{ section, title, content:[{type, ...}] }] }]
  const out = [];
  for (const ch of chapters || []) {
    const chNum = (ch.chapter ?? "").toString().trim();
    const chTitle = (ch.title ?? "").toString().trim();
    const chTrail = [ [chNum, chTitle].filter(Boolean).join(" ").trim() ].filter(Boolean);

    const sections = Array.isArray(ch.sections) ? ch.sections : [];
    for (const sec of sections) {
      const sNum = (sec.section ?? "").toString().trim();
      const sTitle = (sec.title ?? "").toString().trim();
      const secTrail = [...chTrail, [sNum, sTitle].filter(Boolean).join(" ").trim()].filter(Boolean);

      const content = Array.isArray(sec.content) ? sec.content : [];
      for (const b of content) {
        if (!b) continue;
        const type = (b.type || "").toString();
        if (type === "definition" && b.term && b.text) {
          const trail = [...secTrail, String(b.term).trim()];
          out.push({ kind: "definition", headingTrail: trail, text: String(b.text).trim() });
        } else if (type === "list" && Array.isArray(b.items)) {
          for (const it of b.items) {
            const t = String(it || "").trim();
            if (t) out.push({ kind: "listItem", headingTrail: secTrail, text: t });
          }
        } else if (type === "heading" && b.title) {
          const trail = [...secTrail, String(b.title).trim()];
          // Lo guardamos como un pequeño pasaje (útil para recuperar anchors)
          out.push({ kind: "heading", headingTrail: trail, text: "" });
        } else if (b.text) {
          out.push({ kind: type || "paragraph", headingTrail: secTrail, text: String(b.text).trim() });
        }
      }
    }
  }
  return out;
}

// ====== Utilidades comunes ======
function chunkPassages(passages, maxLen = 600) {
  const chunks = [];
  for (const p of passages) {
    const txt = p.text || "";
    if (txt.length <= maxLen) { chunks.push(p); continue; }
    const parts = txt.split(/(?<=[.!?])\s+/);
    let acc = "";
    for (const fr of parts) {
      if ((acc + " " + fr).trim().length > maxLen) {
        if (acc.trim()) chunks.push({ ...p, text: acc.trim() });
        acc = fr;
      } else {
        acc = acc ? acc + " " + fr : fr;
      }
    }
    if (acc.trim()) chunks.push({ ...p, text: acc.trim() });
  }
  return chunks;
}

// === Scoring agnóstico robusto (tildes, singular/plural, solapamiento de tokens) ===
function deaccent(s = "") {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function tokenize(s = "") {
  return deaccent(String(s).toLowerCase())
    .split(/[^a-záéíóúüñ0-9]+/i)
    .filter(Boolean);
}
function singularize(token) {
  // Heurística simple y agnóstica
  if (token.endsWith("ces") && token.length > 4) return token.slice(0, -3) + "z"; // luces -> luz
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
  return token;
}
function normTokens(s) {
  return tokenize(s).map(singularize);
}

function score(text, terms) {
  const ctxText = String(text || "");
  const ctxTokens = new Set(normTokens(ctxText));
  const queryRaw = (terms || []).join(" ");
  const qTokens = new Set(normTokens(queryRaw));

  // Coincidencias exactas por token
  let exact = 0;
  for (const qt of qTokens) if (ctxTokens.has(qt)) exact++;

  // Solapamiento tipo Jaccard
  const inter = new Set([...qTokens].filter(t => ctxTokens.has(t))).size;
  const union = new Set([...qTokens, ...ctxTokens]).size || 1;
  const jacc = inter / union;

  // Bonus por longitud moderada
  const brevity = ctxText.length < 800 ? 0.5 : 0;

  // Puntito por substring (cubre compuestos)
  const tDeacc = deaccent(ctxText.toLowerCase());
  let substr = 0;
  for (const term of (terms || [])) {
    const q = deaccent(String(term || "").toLowerCase().trim());
    if (!q) continue;
    if (tDeacc.includes(q)) substr += 0.25;
  }

  return exact * 2.5 + jacc * 3 + brevity + substr;
}

export function retrieveTopK(passages, query, extraTerms = [], k = 3) {
  const terms = []
    .concat(query || "")
    .concat(extraTerms || [])
    .join(" ")
    .split(/[,\s/|]+/)
    .filter(Boolean);

  return (passages || [])
    .map(p => ({
      ...p,
      _score: score(`${(p.headingTrail || []).join(" · ")} — ${p.text}`, terms),
    }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, k);
}

export async function loadKB(jsonPath) {
  const abs = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
  const raw = await fs.readFile(abs, "utf8");
  const data = JSON.parse(raw);

  let passages = [];

  if (Array.isArray(data)) {
    // Detecta plano, árbol o chapters a partir del primer elemento
    const first = data[0] || {};
    const looksFlat =
      typeof first === "object" &&
      ("Content" in first || "content" in first) &&
      !("blocks" in first || "children" in first || "heading" in first) &&
      !("sections" in first || "chapter" in first);

    const looksChapters =
      typeof first === "object" &&
      ("chapter" in first || "sections" in first);

    if (looksFlat) {
      passages = flattenFlatArrayToPassages(data);
    } else if (looksChapters) {
      passages = flattenChaptersToPassages(data);
    } else {
      passages = flattenTreeToPassages(data);
    }
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.chapters)) {
      passages = flattenChaptersToPassages(data.chapters);
    } else {
      passages = flattenTreeToPassages([data]);
    }
  } else {
    passages = [];
  }

  passages = chunkPassages(passages);
  return { passages };
}
