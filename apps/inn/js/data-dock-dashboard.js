// apps/inn/js/data-dock-dashboard.js
// Ahora este archivo SOLO pinta métricas y donuts.
// La gestión del select + aplicar vive en data-dock-core.js

import { initSourceSelect, reportLoadOk, reportLoadError } from "/data-dock/js/data-dock-core.js";

// Refs UI (select + botón)
const elSelect  = document.getElementById("promptSelect");
const elApply   = document.getElementById("applySourceBtn");

// Métricas
const elPreguntas = document.getElementById("metric-total-questions");
const elTemas     = document.getElementById("metric-total-topics");     // Temas = Domains
const elSubtemas  = document.getElementById("metric-total-subtemas");   // Subdomains
const elTopicos   = document.getElementById("metric-total-topicos");    // Topics

// Charts
const elDonutPreguntas = document.getElementById("donut-preguntas");
const elLegendPreg     = document.getElementById("legend-preguntas");
const elDonutTopicos   = document.getElementById("donut-topicos");
const elLegendTop      = document.getElementById("legend-topicos");

const nf = (n) => new Intl.NumberFormat("es-ES").format(n || 0);

// 🔸 Persistimos la “fuente aplicada” para que los tabs puedan reusarla
const APPLIED_KEY = "dataDock.appliedSource";
function setAppliedSource(src) {
  try { localStorage.setItem(APPLIED_KEY, JSON.stringify(src || null)); } catch {}
}

/* ===================================
   Normalización / extracción de datos
   =================================== */

// === NUEVA ESTRUCTURA (syllabus.data -> domains -> subdomains -> topics -> items) ===
function hasNewSyllabus(payload) {
  const s = payload?.syllabus;
  // Aceptamos .domains (nuevo) y .data (compatibilidad hacía atrás)
  return Array.isArray(s?.domains) || Array.isArray(s?.data);
}

function getDomainsNew(payload) {
  const s = payload?.syllabus;
  if (Array.isArray(s?.domains)) return s.domains;  // 👈 nuevo esquema
  if (Array.isArray(s?.data))    return s.data;     // compatibilidad con el anterior
  return [];
}

function extractQuestionsNew(payload) {
  const domains = getDomainsNew(payload);
  const items = [];
  for (const d of domains) {
    const subs = Array.isArray(d?.subdomains) ? d.subdomains : [];
    for (const s of subs) {
      const topics = Array.isArray(s?.topics) ? s.topics : [];
      for (const t of topics) {
        if (Array.isArray(t?.items)) items.push(...t.items);
      }
    }
  }
  return items;
}

function countDomainsNew(payload) {
  return getDomainsNew(payload).length;
}

function countUniqueSubdomainsNew(payload) {
  const set = new Set();
  const domains = getDomainsNew(payload);
  for (const d of domains) {
    const subs = Array.isArray(d?.subdomains) ? d.subdomains : [];
    for (const s of subs) {
      const name = (s?.subdomain ?? s?.title ?? "").toString().trim();
      if (name) set.add(name);
    }
  }
  return set.size;
}

function countUniqueTopicsNew(payload) {
  const set = new Set();
  const domains = getDomainsNew(payload);
  for (const d of domains) {
    const subs = Array.isArray(d?.subdomains) ? d.subdomains : [];
    for (const s of subs) {
      const topics = Array.isArray(s?.topics) ? s.topics : [];
      for (const t of topics) {
        const name = (t?.topic ?? t?.title ?? "").toString().trim();
        if (name) set.add(name);
      }
    }
  }
  return set.size;
}

function groupByDomainNew(payload) {
  // Devuelve [{ id: domainName, items: [...], topicsSet: Set }]
  const out = [];
  const domains = getDomainsNew(payload);
  for (const d of domains) {
    const domainName = (d?.domain ?? d?.title ?? "—").toString().trim() || "—";
    const items = [];
    const topicsSet = new Set();

    const subs = Array.isArray(d?.subdomains) ? d.subdomains : [];
    for (const s of subs) {
      const topics = Array.isArray(s?.topics) ? s.topics : [];
      for (const t of topics) {
        const tName = (t?.topic ?? t?.title ?? "").toString().trim();
        if (tName) topicsSet.add(tName);
        if (Array.isArray(t?.items)) items.push(...t.items);
      }
    }
    out.push({ id: domainName, items, topicsSet });
  }
  return out;
}

// === LEGADO / COMPAT: extractores antiguos (por si el JSON no es del nuevo tipo) ===
function extractQuestionsLegacy(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.items)) return payload.items;

  if (Array.isArray(payload.topics)) {
    return payload.topics.flatMap(t =>
      Array.isArray(t?.items)     ? t.items :
      Array.isArray(t?.questions) ? t.questions :
      Array.isArray(t?.data)      ? t.data : []
    );
  }
  if (payload.topics && Array.isArray(payload.topics.data)) {
    return payload.topics.data.flatMap(t =>
      Array.isArray(t?.items)     ? t.items :
      Array.isArray(t?.questions) ? t.questions :
      Array.isArray(t?.data)      ? t.data : []
    );
  }
  if (Array.isArray(payload.data)) {
    const arr = payload.data;
    const looksLikeQuestion =
      arr.length && (arr[0]?.Question || arr[0]?.question || arr[0]?.Options || arr[0]?.options);
    if (looksLikeQuestion) return arr;
    if (arr.length && Array.isArray(arr[0]?.items)) return arr.flatMap(t => t.items || []);
    return arr;
  }
  return [];
}

function extractTopicIdsLegacy(payload) {
  const ids = new Set();
  if (Array.isArray(payload?.topics)) {
    for (const t of payload.topics) {
      const id = (t && (t.id || t.slug || t.key || t.title)) ?? null;
      if (id) ids.add(String(id).trim());
    }
    return [...ids];
  }
  if (payload?.topics && Array.isArray(payload.topics.data)) {
    for (const t of payload.topics.data) {
      const id = (t && (t.id || t.slug || t.key || t.title)) ?? null;
      if (id) ids.add(String(id).trim());
    }
    return [...ids];
  }
  // Fallback: desde items
  const questions = extractQuestionsLegacy(payload);
  for (const q of questions) {
    const maybe =
      q?.topicId || q?.TopicId ||
      q?.topic?.id || q?.Topic?.id ||
      q?.Domain || q?.domain ||
      q?.Topic  || q?.topic;
    if (maybe) ids.add(String(maybe).trim());
  }
  return [...ids];
}

function countUniqueSubdomainsLegacy(questions) {
  const set = new Set();
  for (const q of questions) {
    const val = q?.Subdomain ?? q?.subdomain ?? null;
    if (val && String(val).trim()) set.add(String(val).trim());
  }
  return set.size;
}
function countUniqueTopicsFieldLegacy(questions) {
  const set = new Set();
  for (const q of questions) {
    const val = q?.Topic ?? q?.topic ?? null;
    if (val && String(val).trim()) set.add(String(val).trim());
  }
  return set.size;
}

function groupItemsByTemaLegacy(payload) {
  const out = [];
  const topicsArr =
    Array.isArray(payload?.topics) ? payload.topics :
    (payload?.topics && Array.isArray(payload.topics.data) ? payload.topics.data : null);

  if (topicsArr) {
    for (const t of topicsArr) {
      const id = (t && (t.id || t.slug || t.key || t.title)) ?? null;
      if (!id) continue;
      const items =
        Array.isArray(t?.items)     ? t.items :
        Array.isArray(t?.questions) ? t.questions :
        Array.isArray(t?.data)      ? t.data : [];
      out.push({ id: String(id).trim(), items, topicsSet: new Set() });
    }
    return out;
  }

  // Fallback: agrupar desde lista plana
  const items = extractQuestionsLegacy(payload);
  const map = new Map();
  for (const it of items) {
    const temaId =
      it?.topicId || it?.TopicId ||
      it?.topic?.id || it?.Topic?.id ||
      it?.Domain || it?.domain || '—';
    const key = String(temaId).trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  for (const [id, arr] of map.entries()) out.push({ id, items: arr, topicsSet: new Set() });
  return out;
}

/* ============================
   Agrupaciones para donuts
   ============================ */
function countPreguntasPorTema(groups) {
  const res = {};
  for (const g of groups) res[g.id] = Array.isArray(g.items) ? g.items.length : 0;
  return res;
}

function countTopicosPorTema(groups) {
  const res = {};
  for (const g of groups) {
    // Si viene de la nueva estructura, ya tenemos topicsSet precalculado
    if (g.topicsSet && g.topicsSet.size !== undefined) {
      res[g.id] = g.topicsSet.size;
      continue;
    }
    // LEGADO: contar desde items.Topic
    const set = new Set();
    for (const it of g.items) {
      const v = it?.Topic ?? it?.topic ?? null;
      if (v && String(v).trim()) set.add(String(v).trim());
    }
    res[g.id] = set.size;
  }
  return res;
}

/* ============================
   Render donut (SVG + leyenda)
   ============================ */

function renderDonut(containerId, legendId, countsObj, options = {}) {
  const container = document.getElementById(containerId);
  const legend = document.getElementById(legendId);
  if (!container) return;

  const size = options.size ?? 260;
  const thickness = options.thickness ?? 32;

  const pad = Math.max(6, Math.ceil(thickness / 2) + 4);
  const r = (size / 2) - pad;
  const rIn = r - thickness;
  const cx = size / 2, cy = size / 2;

  // 👉 Ahora NO filtramos por >0 para la LEYENDA
  const entriesAll = Object.entries(countsObj)
    .sort((a,b) => b[1] - a[1]);

  // Pero SÍ usamos una lista aparte para dibujar el donut (sin 0s)
  const entriesNonZero = entriesAll.filter(([_, v]) => v > 0);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", size);
  svg.style.display = "block";

  // Fondo
  const bg = document.createElementNS(svgNS, "circle");
  bg.setAttribute("cx", cx); bg.setAttribute("cy", cy);
  bg.setAttribute("r", r);
  bg.setAttribute("fill", "none");
  bg.setAttribute("stroke", "rgba(255,255,255,0.06)");
  bg.setAttribute("stroke-width", Math.max(thickness - 1, 1));
  svg.appendChild(bg);

  // Centro (agujero) – lo añadimos al final
  const hole = document.createElementNS(svgNS, "circle");
  hole.setAttribute("cx", cx); hole.setAttribute("cy", cy);
  hole.setAttribute("r", Math.max(rIn - 1, 0));
  hole.setAttribute("fill", "var(--panel)");

  // Paleta: damos color a TODAS las entradas (incluyendo 0)
  const colors = entriesAll.map((_, i) => `hsl(${(i * 360 / Math.max(entriesAll.length,1))|0} 70% 55%)`);
  const total = entriesNonZero.reduce((acc, [,v]) => acc + v, 0) || 1;

  if (entriesNonZero.length === 1) {
    // Caso 1 sola categoría >0: anillo completo
    const ring = document.createElementNS(svgNS, "circle");
    ring.setAttribute("cx", cx); ring.setAttribute("cy", cy);
    ring.setAttribute("r", (r + rIn) / 2);
    ring.setAttribute("fill", "none");
    // Color coincide con su posición en entriesAll
    const idx = entriesAll.findIndex(([k]) => k === entriesNonZero[0][0]);
    ring.setAttribute("stroke", colors[idx >= 0 ? idx : 0]);
    ring.setAttribute("stroke-width", thickness);
    ring.setAttribute("aria-label", `${entriesNonZero[0][0]}: ${entriesNonZero[0][1]}`);
    svg.appendChild(ring);
  } else {
    // Varios slices
    let angle = -Math.PI / 2;
    entriesNonZero.forEach(([label, value]) => {
      const slice = (value / total) * Math.PI * 2;
      if (slice <= 0) return;

      const eps = 1e-6;
      const startAngle = angle + eps;
      const endAngle = angle + slice - eps;
      angle += slice;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;

      const xi1 = cx + rIn * Math.cos(endAngle);
      const yi1 = cy + rIn * Math.sin(endAngle);
      const xi2 = cx + rIn * Math.cos(startAngle);
      const yi2 = cy + rIn * Math.sin(startAngle);

      const path = document.createElementNS(svgNS, "path");
      const d = [
        `M ${x1} ${y1}`,
        `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${xi1} ${yi1}`,
        `A ${rIn} ${rIn} 0 ${largeArc} 0 ${xi2} ${yi2}`,
        "Z"
      ].join(" ");
      path.setAttribute("d", d);

      // Color de este label según su índice en entriesAll (consistencia leyenda/donut)
      const idx = entriesAll.findIndex(([k]) => k === label);
      path.setAttribute("fill", colors[idx >= 0 ? idx : 0]);
      path.setAttribute("stroke", "rgba(0,0,0,0.08)");
      path.setAttribute("stroke-width", "1");
      path.setAttribute("aria-label", `${label}: ${value}`);
      svg.appendChild(path);
    });
  }

  // Centro
  svg.appendChild(hole);

  // Montar
  container.innerHTML = "";
  container.appendChild(svg);

  // Leyenda: siempre TODAS (incluyendo ceros)
  if (legend) {
    legend.innerHTML = "";
    entriesAll.forEach(([label, value], i) => {
      const row = document.createElement("div");
      row.className = "row" + (value === 0 ? " is-zero" : "");
      row.innerHTML = `
        <span class="swatch" style="background:${colors[i]}"></span>
        <span class="label" title="${label}">${label}</span>
        <span class="count">${value}</span>
      `;
      legend.appendChild(row);
    });
  }
}

/* =======================
   Carga / pintado métricas
   ======================= */
async function loadDashboardFor(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    let questions, temasCount, subtemasCount, topicosCount, groups;

    if (hasNewSyllabus(data)) {
      // NUEVO ESQUEMA
      questions      = extractQuestionsNew(data);
      temasCount     = countDomainsNew(data);          // Temas = Domains
      subtemasCount  = countUniqueSubdomainsNew(data); // Subdomains únicos
      topicosCount   = countUniqueTopicsNew(data);      // Topics únicos
      groups         = groupByDomainNew(data);          // grupos por Domain
    } else {
      // LEGADO
      questions      = extractQuestionsLegacy(data);
      const temaIds  = extractTopicIdsLegacy(data);
      temasCount     = temaIds.length;
      subtemasCount  = countUniqueSubdomainsLegacy(questions);
      topicosCount   = countUniqueTopicsFieldLegacy(questions);
      groups         = groupItemsByTemaLegacy(data);
    }

    elPreguntas.textContent = nf(questions.length);
    elTemas.textContent     = nf(temasCount);
    elSubtemas.textContent  = nf(subtemasCount);
    elTopicos.textContent   = nf(topicosCount);

    // Donuts
    const preguntasMap = countPreguntasPorTema(groups);
    if (elDonutPreguntas) {
      renderDonut("donut-preguntas", "legend-preguntas", preguntasMap, { size: 260, thickness: 32 });
    }

    const topicosMap = countTopicosPorTema(groups);
    if (elDonutTopicos) {
      renderDonut("donut-topicos", "legend-topicos", topicosMap, { size: 260, thickness: 32 });
    }

    // ✅ Feedback (marca el select como cargado)
    reportLoadOk({
      totalPreguntas: questions.length,
      totalTemas: temasCount,
      totalSubtemas: subtemasCount,
      totalTopicos: topicosCount
    });

  } catch (err) {
    console.error("Dashboard error:", err);
    elPreguntas.textContent = "—";
    elTemas.textContent     = "—";
    elSubtemas.textContent  = "—";
    elTopicos.textContent   = "—";
    elDonutPreguntas?.replaceChildren();
    elLegendPreg?.replaceChildren();
    elDonutTopicos?.replaceChildren();
    elLegendTop?.replaceChildren();

    reportLoadError(err?.message || "Error desconocido");
  }
}

/* =======================
   Boot
   ======================= */
function init() {
  // Inicializa el select en el CORE (solo guarda selección; no carga)
  initSourceSelect(elSelect, elApply);

  // Carga de datos cuando se pulse "Aplicar" (o cuando tabs re-emita)
  document.addEventListener("dataDock:sourceApplied", (ev) => {
    const src = ev.detail;
    if (src?.url) {
      // 🧠 Guarda la FUENTE APLICADA para coherencia al cambiar de pestañas
      setAppliedSource(src);
      loadDashboardFor(src.url);
    }
  });

  // 🔁 Refresco inmediato tras guardar/eliminar en Editor (sin cambiar de tab)
  document.addEventListener("dataDock:sourceUpdated", (ev) => {
    const url = ev.detail?.url;
    if (url) loadDashboardFor(url);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
