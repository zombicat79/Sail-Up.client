// /data-dock/js/data-dock-syllabus.js
// Syllabus (Temario) — SOLO Domains
// UI/UX igual a "Materias": listado en tarjetas con acordeón por ítem,
// acciones Duplicar / Eliminar / Editar en la cabecera, editor inline al abrir,
// y "Añadir tema" abre directamente en edición.
//
// Estructura esperada del JSON:
// QUESTIONS.syllabus.domains = [
//   { domain, "domain-id", "domain-overview", "domain-image", subdomains: [...] }
// ]
//
// Persistencia: POST /inn/data-dock/save?target=/data/<file>.json
// Integración: data-dock-core.js (getAppliedSource)

import { getAppliedSource } from "/data-dock/js/data-dock-core.js";

// ===== UI refs =====
const listEl = document.getElementById("domains-list");
const btnAdd = document.getElementById("btn-add-domain");

// ===== Estado =====
let RAW = null;            // JSON completo
let CURRENT_URL = null;    // URL del JSON aplicado
let DOMAINS = [];          // alias a QUESTIONS.syllabus.domains

// ===== Utils =====
const str = (v) => (v == null ? "" : String(v));
const trim = (v) => str(v).trim();

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed", bottom: "16px", right: "16px",
    background: "var(--panel-2)", border: "1px solid var(--border)",
    padding: "8px 10px", borderRadius: "8px", color: "var(--text)",
    boxShadow: "var(--shadow, 0 8px 24px rgba(0,0,0,.35))", zIndex: 9999
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

function slugify(s) {
  return trim(s)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function cleanTitleForDomain(s) {
  // Quita prefijos numerados tipo "1. " o "02) "
  return trim(s).replace(/^\s*\d+\s*[\.\-\)]\s*/, "");
}

function ensureStructure(payload) {
  if (!payload) payload = {};
  if (!payload.syllabus) payload.syllabus = {};
  if (!Array.isArray(payload.syllabus.domains)) payload.syllabus.domains = [];
  return payload;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

// ===== Carga / guardado =====
async function loadFrom(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  RAW = await res.json();
  RAW = ensureStructure(RAW);
  DOMAINS = RAW.syllabus.domains;
  renderDomains({ preserveOpen: false });
}

async function saveFullJson(fullPayload) {
  const lastSlash = (CURRENT_URL || "").lastIndexOf("/");
  const file = (CURRENT_URL || "").slice(lastSlash + 1);
  const target = `/data/${file}`;

  const res = await fetch(`/inn/data-dock/save?target=${encodeURIComponent(target)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fullPayload, null, 2)
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

// ===== Render =====
function iconBtn(emoji, title) {
  const b = document.createElement("button");
  b.className = "icon-btn";
  b.type = "button";
  b.title = title;
  b.textContent = emoji;
  return b;
}

function blockInput(label, value, onInput, opts = {}) {
  const { multiline = false, placeholder = "", className = "" } = opts;
  const box = document.createElement("div");
  box.className = "mt-block";
  const lab = document.createElement("label");
  lab.className = "title-smaller";
  lab.style.display = "block";
  lab.style.marginBottom = "6px";
  lab.textContent = label;
  box.appendChild(lab);

  if (multiline) {
    const ta = document.createElement("textarea");
    ta.value = value || "";
    ta.placeholder = placeholder || "";
    ta.style.width = "100%";
    ta.style.minHeight = "90px";
    ta.className = `preview-box ${className}`.trim();
    ta.addEventListener("input", () => onInput(ta.value));
    box.appendChild(ta);
  } else {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = value || "";
    inp.placeholder = placeholder || "";
    inp.className = `file-name ${className}`.trim();
    inp.addEventListener("input", () => onInput(inp.value));
    box.appendChild(inp);
  }
  return box;
}

function renderDomains({ openIndex = null, preserveOpen = true } = {}) {
  // Mantener qué acordeones están abiertos si se pide
  const openSet = new Set();
  if (preserveOpen) {
    listEl.querySelectorAll("details.qa").forEach((d, idx) => {
      if (d.open) openSet.add(idx);
    });
  }

  listEl.innerHTML = "";

  if (!DOMAINS.length) {
    const empty = document.createElement("div");
    empty.className = "preview-box empty";
    empty.textContent = "No hay temas. Añade el primero.";
    listEl.appendChild(empty);
    btnAdd.disabled = false;
    return;
  }

  DOMAINS.forEach((node, idx) => {
    const domainTitle = str(node?.domain) || "(Sin título)";
    const domainId = str(node?.["domain-id"]);
    const domainDesc = str(node?.["domain-overview"]);
    const domainImg = str(node?.["domain-image"]);

    const card = document.createElement("article");
    card.className = "msg";
    const inner = document.createElement("div");
    inner.className = "msg-inner";
    card.appendChild(inner);

    const details = document.createElement("details");
    details.className = "qa qa--in-card";
    inner.appendChild(details);

    // ----- summary (cabecera + acciones) -----
    const summary = document.createElement("summary");

    // Fila 1: título + acciones
    const row = document.createElement("div");
    row.className = "qrow";
    row.style.alignItems = "flex-start";

    const title = document.createElement("h2");
    title.className = "title";
    title.textContent = domainTitle;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";

    const btnDup = iconBtn("🧬", "Duplicar tema");
    btnDup.addEventListener("click", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const clone = (typeof structuredClone === "function")
        ? structuredClone(node)
        : JSON.parse(JSON.stringify(node));
      clone.domain = `${domainTitle} (copia)`;
      if (clone["domain-id"]) clone["domain-id"] = `${clone["domain-id"]}-copy`;
      DOMAINS.splice(idx + 1, 0, clone);
      try {
        await saveFullJson(RAW);
        renderDomains({ openIndex: idx + 1 });
        toast("Tema duplicado.");
      } catch (e) { console.error(e); alert("❌ Error al duplicar."); }
    });

    const btnDel = iconBtn("🗑️", "Eliminar tema");
    btnDel.addEventListener("click", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (!confirm("⚠️ ¿Eliminar este tema? (no borra preguntas)")) return;
      DOMAINS.splice(idx, 1);
      try {
        await saveFullJson(RAW);
        renderDomains();
        toast("Tema eliminado.");
      } catch (e) { console.error(e); alert("❌ Error al eliminar."); }
    });

    const btnEdit = iconBtn("✏️", "Editar");
    btnEdit.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      details.open = !details.open;
    });

    actions.append(btnDup, btnDel, btnEdit);
    row.append(title, actions);

    // Fila 2: descripción (debajo del título+acciones)
    const desc = document.createElement("div");
    desc.className = "muted";
    desc.style.fontSize = "1rem";       // mismo que <p>
    desc.style.marginTop = "8px";       // espacio con fila 1
    desc.style.whiteSpace = "pre-wrap"; // permite saltos de línea
    desc.style.lineHeight = "1.5";
    desc.textContent = domainDesc || "—";

    summary.append(row, desc);
    details.appendChild(summary);

    // Divider bajo header cuando está abierto
    const divider = document.createElement("hr");
    divider.className = "divider";
    divider.style.margin = "16px 0";
    divider.style.display = "none";
    details.appendChild(divider);

    // ----- Panel de edición -----
    const editWrap = document.createElement("div");
    editWrap.className = "stack-16";

    // Domain / Title
    editWrap.appendChild(
      blockInput("Domain / Title *", domainTitle, (val) => {
        const clean = cleanTitleForDomain(val || "");
        node.domain = clean;
        title.textContent = clean || "(Sin título)";
      }, { placeholder: "Ej. Nomenclatura náutica" })
    );

    // Domain ID
    editWrap.appendChild(
      blockInput("Domain ID", domainId, (val) => {
        node["domain-id"] = trim(val);
      }, { placeholder: "p.ej. nomenclatura" })
    );

    // Descripción (multilínea)
    editWrap.appendChild(
      blockInput("Descripción", domainDesc, (val) => {
        node["domain-overview"] = val;
        // sincroniza preview de la lista
        desc.textContent = val || "—";
      }, { multiline: true, placeholder: "Breve descripción del tema" })
    );

    // Imagen (URL)
    editWrap.appendChild(
      blockInput("Imagen (URL)", domainImg, (val) => {
        node["domain-image"] = trim(val);
      }, { placeholder: "https://…" })
    );

    // Acciones guardar
    const actionsEdit = document.createElement("div");
    actionsEdit.className = "actions";
    const btnSave = document.createElement("button");
    btnSave.className = "btn btn-primary";
    btnSave.textContent = "Guardar cambios";
    btnSave.addEventListener("click", async () => {
      if (!trim(node["domain-id"])) node["domain-id"] = slugify(node.domain || "");
      try {
        await saveFullJson(RAW);
        btnSave.textContent = "✅ Guardado";
        setTimeout(() => btnSave.textContent = "Guardar cambios", 1200);
        renderDomains({ preserveOpen: true });
        toast("Cambios guardados.");
      } catch (e) {
        console.error(e);
        btnSave.textContent = "❌ Error";
        setTimeout(() => btnSave.textContent = "Guardar cambios", 1200);
      }
    });
    actionsEdit.append(btnSave);
    editWrap.appendChild(actionsEdit);

    details.appendChild(editWrap);

    // Toggle: al abrir, ocultamos dup/eliminar y la descripción; cambiamos botón y mostramos divider
    details.addEventListener("toggle", () => {
      const open = details.open;
      btnDup.style.display = open ? "none" : "";
      btnDel.style.display = open ? "none" : "";
      desc.hidden = open;                    // 🔹 como los tags en Materias
      btnEdit.textContent = open ? "✖️" : "✏️";
      btnEdit.title = open ? "Cerrar" : "Editar";
      divider.style.display = open ? "" : "none";
    });

    listEl.appendChild(card);

    // Reabrir según estado anterior / índice solicitado
    if ((openIndex != null && openIndex === idx) || (preserveOpen && openSet.has(idx))) {
      details.open = true;
    }
  });

  btnAdd.disabled = false;
}

// ===== Crear nuevo Domain =====
function createNewDomain() {
  const node = {
    domain: "Nuevo tema",
    "domain-id": "",
    "domain-overview": "",
    "domain-image": "",
    subdomains: [] // se mantiene por compatibilidad, pero no se edita aquí
  };
  DOMAINS.push(node);
  return DOMAINS.length - 1; // índice
}

// ===== Eventos UI =====
btnAdd?.addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    const idx = createNewDomain();
    await saveFullJson(RAW);
    renderDomains({ openIndex: idx });
    toast("Tema creado.");
  } catch (err) {
    console.error(err);
    alert("❌ Error creando el tema.");
  }
});

// ===== Integración con el Core =====
document.addEventListener("dataDock:sourceApplied", async (ev) => {
  const src = ev.detail; // { id, label, url }
  if (!src?.url) return;
  CURRENT_URL = src.url;
  try {
    await loadFrom(src.url);
    btnAdd.disabled = false;
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">❌ ${escapeHtml(e.message || "Error cargando los datos.")}</p></div></article>`;
  }
});

// Cuando otra sección guarda/cambia el JSON, recargamos si esta pestaña estuviera activa
document.addEventListener("dataDock:sourceUpdated", async () => {
  const activeHash = (location.hash || "#dashboard").replace("#", "");
  if (activeHash !== "syllabus") return;
  const src = getAppliedSource();
  if (!src?.url) return;

  // Intentar preservar aperturas por título
  const openTitles = Array.from(listEl.querySelectorAll("details.qa"))
    .map((d, idx) => d.open ? trim(DOMAINS[idx]?.domain) : null)
    .filter(Boolean);

  try {
    await loadFrom(src.url);
    // Reabrir los que coincidan por título
    listEl.querySelectorAll("details.qa").forEach((d, idx) => {
      if (openTitles.includes(trim(DOMAINS[idx]?.domain))) d.open = true;
    });
  } catch (e) {
    console.error(e);
  }
});

// Carga inicial si ya está activo el tab al entrar
(function bootIfActive() {
  const isActive = document.querySelector('.nav .tab.active[data-tab="syllabus"]');
  if (!isActive) return;
  const src = getAppliedSource();
  if (!src?.url) return;
  CURRENT_URL = src.url;
  loadFrom(src.url).catch(e => {
    console.error(e);
    listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">❌ ${escapeHtml(e.message || "Error cargando los datos.")}</p></div></article>`;
  });
})();
