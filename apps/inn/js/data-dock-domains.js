// /data-dock/js/data-dock-domains.js
// Syllabus (Temario) — SOLO Domains
// UI/UX igual a "Materias": listado en tarjetas con acordeón por ítem,
// acciones Duplicar / Eliminar / Editar en la cabecera, editor inline al abrir,
// y "Añadir tema" abre directamente en edición.
//
// Estructura esperada del JSON:
// QUESTIONS.syllabus.domains = [
//   { domain, "domain-id", "domain-overview", "domain-image", "domain-order", subdomains: [...] }
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
const str  = (v) => (v == null ? "" : String(v));
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
  // Asegura domain-order secuencial si falta
  payload.syllabus.domains.forEach((d, i) => {
    if (!trim(str(d["domain-order"]))) d["domain-order"] = String(i + 1);
  });
  return payload;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

// ===== Orden / reorden helpers =====
function normalizeOrders() {
  DOMAINS.forEach((d, i) => d["domain-order"] = String(i + 1));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function moveDomainToOrder(targetNode, desiredOrder) {
  const max = DOMAINS.length;
  const newPos = clamp(Number(desiredOrder) || 1, 1, max) - 1;

  const oldIndex = DOMAINS.indexOf(targetNode);
  if (oldIndex < 0) return;

  // Mover en el array
  DOMAINS.splice(oldIndex, 1);
  DOMAINS.splice(newPos, 0, targetNode);

  // Renumerar correlativamente
  normalizeOrders();
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
  const { multiline = false, placeholder = "", className = "", type = "text", min, max, step } = opts;
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
    ta.addEventListener("input", () => onInput(ta.value, ta));
    box.appendChild(ta);
  } else {
    const inp = document.createElement("input");
    inp.type = type || "text";
    if (type === "number") {
      if (min != null)  inp.min = String(min);
      if (max != null)  inp.max = String(max);
      if (step != null) inp.step = String(step);
      // Evita scroll numérico accidental
      inp.addEventListener("wheel", e => inp === document.activeElement && e.preventDefault(), { passive:false });
    }
    inp.value = value ?? "";
    inp.placeholder = placeholder || "";
    inp.className = `file-name ${className}`.trim();
    inp.addEventListener("input", () => onInput(inp.value, inp));
    box.appendChild(inp);
  }
  return box;
}

function renderDomains({ openIndex = null, preserveOpen = true } = {}) {
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
    empty.textContent = "No hay módulos. Añade el primero.";
    listEl.appendChild(empty);
    btnAdd.disabled = false;
    return;
  }

  DOMAINS.forEach((node, idx) => {
    const domainTitle = str(node?.domain) || "(Sin título)";
    const domainOrder = trim(str(node?.["domain-order"]));
    const domainDesc = str(node?.["domain-overview"]);
    const domainImg  = str(node?.["domain-image"]);

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
    const orderPrefix = domainOrder ? `${domainOrder}. ` : "";
    title.textContent = `${orderPrefix}${domainTitle}`;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";

    const btnDup = iconBtn("🧬", "Duplicar");
    btnDup.addEventListener("click", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const clone = (typeof structuredClone === "function")
      ? structuredClone(node)
      : JSON.parse(JSON.stringify(node));
      clone.domain = `${domainTitle} (copia)`;
      // Insertamos detrás y renumeramos
      DOMAINS.splice(idx + 1, 0, clone);
      normalizeOrders();
      try {
        await saveFullJson(RAW);
        const newIndex = DOMAINS.indexOf(clone);
        renderDomains({ openIndex: newIndex });
        toast("Módulo duplicado.");
      } catch (e) { console.error(e); alert("❌ Error al duplicar."); }
    });

    const btnDel = iconBtn("🗑️", "Eliminar");
    btnDel.addEventListener("click", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (!confirm("⚠️ ¿Eliminar este módulo?")) return;
      DOMAINS.splice(idx, 1);
      normalizeOrders();
      try {
        await saveFullJson(RAW);
        renderDomains();
        toast("Módulo eliminado.");
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
    desc.style.fontSize = "1rem";
    desc.style.marginTop = "0px";
    desc.style.whiteSpace = "pre-wrap";
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

    // --- BORRADOR LOCAL (no toca node hasta guardar) ---
    const draft = {
      domain: domainTitle,
      "domain-id": node["domain-id"] || "",
      "domain-overview": domainDesc || "",
      "domain-image": domainImg || "",
      "domain-order": domainOrder || String(idx + 1),
    };
    let hasSaved = false;

    // (A) Número de tema (domain-order) — permite borrar mientras escribes
    const orderBlock = blockInput(
      "Numeración",
      draft["domain-order"],
      (val) => {
    // Permite vacío mientras se teclea
        const raw    = String(val ?? "");
    const digits = raw.replace(/[^\d]/g, ""); // filtramos pero NO forzamos a 1
    draft["domain-order"] = digits;           // puede quedar "" temporalmente

    // Vista previa del título (sin mover ni tocar node)
    const prefix = digits ? `${digits}. ` : "";
    const clean  = cleanTitleForDomain(draft.domain || domainTitle) || "(Sin título)";
    title.textContent = `${prefix}${clean}`;
  },
  { type: "number", min: 1, step: 1, placeholder: "1, 2, 3…" }
  );

    // Normaliza SOLO al perder el foco (si queda vacío o fuera de rango)
    (() => {
      const inp = orderBlock.querySelector('input[type="number"]');
      if (!inp) return;
      inp.addEventListener("blur", () => {
    // Si está vacío, no “saltes” a 1 por sorpresa: usa el orden actual
        const currentOrder = String(DOMAINS.indexOf(node) + 1);
        let digits = String(draft["domain-order"] || "").replace(/[^\d]/g, "");
        if (!digits) digits = currentOrder;

    // Clamp al rango 1..N
        const max = DOMAINS.length;
        let n = Math.min(Math.max(parseInt(digits, 10) || 1, 1), max);
        draft["domain-order"] = String(n);

    // Refleja normalizado en UI
        inp.value = String(n);
        const clean  = cleanTitleForDomain(draft.domain || domainTitle) || "(Sin título)";
        title.textContent = `${n}. ${clean}`;
      });
    })();
    editWrap.appendChild(orderBlock);


    // (B) Domain / Title
    const titleBlock = blockInput(
      "Módulo",
      draft.domain,
      (val) => {
        draft.domain = cleanTitleForDomain(val || "");
        const prefix = (draft["domain-order"] && Number(draft["domain-order"]) > 0) ? `${draft["domain-order"]}. ` : "";
        title.textContent = `${prefix}${draft.domain || "(Sin título)"}`;
      },
      { placeholder: "Ej. Nomenclatura náutica" }
      );
    editWrap.appendChild(titleBlock);

    // (C) Domain ID (solo en edición)
    const idBlock = blockInput(
      "ID",
      draft["domain-id"],
      (val) => { draft["domain-id"] = trim(val); },
      { placeholder: "Ej. nomenclatura" }
      );
    editWrap.appendChild(idBlock);

    // (D) Descripción (multilínea)
    const descBlock = blockInput(
      "Descripción",
      draft["domain-overview"],
      (val) => {
        draft["domain-overview"] = val;
        // Vista previa del listado (no persiste)
        desc.textContent = val || "—";
      },
      { multiline: true, placeholder: "Breve descripción del módulo" }
      );
    editWrap.appendChild(descBlock);

    // (E) Imagen (URL)
    const imgBlock = blockInput(
      "Imagen (URL)",
      draft["domain-image"],
      (val) => { draft["domain-image"] = trim(val); },
      { placeholder: "https://…" }
      );
    editWrap.appendChild(imgBlock);

    // Acciones guardar
    const actionsEdit = document.createElement("div");
    actionsEdit.className = "actions edit-panel-footer";
    const btnSave = document.createElement("button");
    btnSave.className = "btn btn-primary";
    btnSave.textContent = "Guardar cambios";
    btnSave.addEventListener("click", async () => {
      // 1) Aplicar borrador al node
      node.domain = draft.domain;
      node["domain-id"] = trim(draft["domain-id"]) || slugify(draft.domain || "");
      node["domain-overview"] = draft["domain-overview"];
      node["domain-image"] = draft["domain-image"];

      // 2) Reordenar si procede
      const beforeIndex = DOMAINS.indexOf(node);
      const desired = Number(draft["domain-order"]);
      moveDomainToOrder(node, Number.isFinite(desired) && desired > 0 ? desired : (beforeIndex + 1));
      const afterIndex = DOMAINS.indexOf(node);

      try {
        await saveFullJson(RAW);
        hasSaved = true;
        btnSave.textContent = "✅ Guardado";
        setTimeout(() => btnSave.textContent = "Guardar cambios", 1200);
        // Re-render y CERRAR panel tras guardar
        renderDomains({ preserveOpen: false });
        toast("Cambios guardados.");
      } catch (e) {
        console.error(e);
        btnSave.textContent = "❌ Error";
        setTimeout(() => btnSave.textContent = "Guardar cambios", 1200);
        // Revertir orden si falló
        if (afterIndex !== beforeIndex) {
          DOMAINS.splice(afterIndex, 1);
          DOMAINS.splice(beforeIndex, 0, node);
          normalizeOrders();
        }
      }
    });
    actionsEdit.append(btnSave);
    editWrap.appendChild(actionsEdit);

    details.appendChild(editWrap);

    // --- Helpers para resetear si se cierra sin guardar ---
    function resetInputsAndPreviewFromNode() {
      const persistedOrder = trim(str(node["domain-order"])) || String(DOMAINS.indexOf(node) + 1);
      const persistedTitle = str(node.domain) || "(Sin título)";
      const persistedDesc  = str(node["domain-overview"]) || "";

      // Reset preview del listado
      title.textContent = `${persistedOrder ? persistedOrder + ". " : ""}${persistedTitle}`;
      desc.textContent  = persistedDesc || "—";

      // Reset inputs del panel
      const orderInput = orderBlock.querySelector('input[type="number"]');
      const titleInput = titleBlock.querySelector('input[type="text"]');
      const idInput    = idBlock.querySelector('input[type="text"]');
      const descArea   = descBlock.querySelector('textarea');
      const imgInput   = imgBlock.querySelector('input[type="text"]');

      if (orderInput) orderInput.value = persistedOrder;
      if (titleInput) titleInput.value = persistedTitle;
      if (idInput)    idInput.value    = str(node["domain-id"] || "");
      if (descArea)   descArea.value   = persistedDesc;
      if (imgInput)   imgInput.value   = str(node["domain-image"] || "");

      // Reset borrador
      draft["domain-order"]   = persistedOrder;
      draft.domain            = persistedTitle;
      draft["domain-id"]      = str(node["domain-id"] || "");
      draft["domain-overview"]= persistedDesc;
      draft["domain-image"]   = str(node["domain-image"] || "");
    }

    // Toggle: al abrir, ocultamos dup/eliminar y la descripción; divider visible
    // Al CERRAR sin guardar → resetear a valores persistidos
    details.addEventListener("toggle", () => {
      const open = details.open;
      btnDup.style.display = open ? "none" : "";
      btnDel.style.display = open ? "none" : "";
      desc.hidden = open;
      btnEdit.textContent = open ? "✖️" : "✏️";
      btnEdit.title = open ? "Cerrar" : "Editar";
      divider.style.display = open ? "" : "none";

      // Si se cierra sin guardar, resetea
      if (!open && !hasSaved) {
        resetInputsAndPreviewFromNode();
      }
      // Si se vuelve a abrir después de cerrar sin guardar, el draft ya está reseteado
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
    domain: "Nuevo módulo",
    "domain-id": "",
    "domain-overview": "",
    "domain-image": "",
    "domain-order": String(DOMAINS.length + 1),
    subdomains: []
  };
  DOMAINS.push(node);
  return DOMAINS.length - 1;
}

// ===== Eventos UI =====
btnAdd?.addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    const idx = createNewDomain();
    await saveFullJson(RAW);
    renderDomains({ openIndex: idx });
    toast("Módulo creado.");
  } catch (err) {
    console.error(err);
    alert("❌ Error creando el módulo.");
  }
});

// ===== Integración con el Core =====
document.addEventListener("dataDock:sourceApplied", async (ev) => {
  const src = ev.detail;
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

document.addEventListener("dataDock:sourceUpdated", async () => {
  const activeHash = (location.hash || "#dashboard").replace("#", "");
  if (activeHash !== "syllabus") return;
  const src = getAppliedSource();
  if (!src?.url) return;

  const openTitles = Array.from(listEl.querySelectorAll("details.qa"))
  .map((d, idx) => d.open ? trim(DOMAINS[idx]?.domain) : null)
  .filter(Boolean);

  try {
    await loadFrom(src.url);
    listEl.querySelectorAll("details.qa").forEach((d, idx) => {
      if (openTitles.includes(trim(DOMAINS[idx]?.domain))) d.open = true;
    });
  } catch (e) {
    console.error(e);
  }
});

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
