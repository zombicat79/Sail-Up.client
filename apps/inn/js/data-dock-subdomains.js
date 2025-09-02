// /data-dock/js/data-dock-subdomains.js
// Gestión de Subdomains (Materias) para un Domain seleccionado.
// - Select Domain + botón Cargar
// - Lista de materias (subdomains) con tags de topics (solo visibles en cerrado)
// - Acciones: Duplicar / Eliminar / Editar (en abierto oculta duplicar/eliminar y los tags)
// - Edición en acordeón: título de la materia + gestor de topics (añadir/renombrar/borrar)
// - Al crear una materia nueva: se abre directamente en modo edición
// - Persistencia: /inn/data-dock/save?target=/data/<file>.json
//
// Requiere: data-dock-core.js (getAppliedSource)

import { getAppliedSource } from "/data-dock/js/data-dock-core.js";

// UI refs
const selDomain = document.getElementById("subdDomain");
const btnLoad   = document.getElementById("subdLoad");
const listEl    = document.getElementById("subdList");
const btnAdd    = document.getElementById("subdAdd");
const blockEl   = document.getElementById("subdBlock");

// Estado
let RAW = null;                 // JSON completo
let CURRENT_URL = null;         // URL del JSON aplicado
let DOMAIN_MAP = new Map();     // Map DomainName -> DomainNode (referencia directa)

// Utils simples
const str = (v) => (v == null ? "" : String(v).trim());
const escapeHtml = (s) => (s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
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

// ===== Helpers de formato =====
function getDomains(payload) {
  const arr = payload?.syllabus?.domains;
  if (!Array.isArray(arr)) throw new Error("Formato inválido: falta syllabus.domains[]");
  return arr;
}
function rebuildDomainMap(payload){
  DOMAIN_MAP.clear();
  for (const d of getDomains(payload)) {
    const name = str(d?.domain);
    if (name) DOMAIN_MAP.set(name, d);
  }
}
function getDomainNames(payload){
  return getDomains(payload).map(d => str(d?.domain)).filter(Boolean);
}
function getSubdomainsOf(domainName){
  const d = DOMAIN_MAP.get(str(domainName));
  const subs = Array.isArray(d?.subdomains) ? d.subdomains : [];
  return subs;
}
function ensureSubdomainsArray(domainName){
  const d = DOMAIN_MAP.get(str(domainName));
  if (!d) return null;
  if (!Array.isArray(d.subdomains)) d.subdomains = [];
  return d.subdomains;
}
function ensureTopicsArray(subNode){
  if (!Array.isArray(subNode.topics)) subNode.topics = [];
  return subNode.topics;
}

// ===== Carga / guardado =====
async function loadFrom(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  RAW = await res.json();
  rebuildDomainMap(RAW);
  fillDomainSelect();
}
async function saveFullJson(fullPayload){
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

// ===== Select Domain + botones =====
function clearSelect(sel, placeholder){
  sel.innerHTML = "";
  const opt = new Option(placeholder, "", true, true);
  opt.disabled = true;
  sel.appendChild(opt);
}
function fillDomainSelect(){
  clearSelect(selDomain, "Selecciona Domain");
  getDomainNames(RAW).sort((a,b)=>a.localeCompare(b,"es"))
    .forEach(name => selDomain.appendChild(new Option(name, name)));
  selDomain.disabled = false;
  btnLoad.disabled = !selDomain.value;
  btnAdd.disabled = true; // hasta cargar lista
}
function currentDomainName(){
  return str(selDomain?.value);
}

// ===== Render listado =====
function renderSubdomainList(domainName, opts = {}){
  const { openIndex = null } = opts;

  listEl.innerHTML = "";
  const subs = getSubdomainsOf(domainName);
  if (!subs?.length) {
    // Lista vacía: dejamos el contenedor visible, CTA habilitado
    btnAdd.disabled = false;
    listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">No hay materias para este domain.</p></div></article>`;
    return;
  }

  subs.forEach((subNode, idx) => {
    const subName = str(subNode?.subdomain) || "(Sin nombre)";
    const topics = ensureTopicsArray(subNode);

    const card = document.createElement("article");
    card.className = "msg";
    const inner = document.createElement("div");
    inner.className = "msg-inner";
    card.appendChild(inner);

    const details = document.createElement("details");
    details.className = "qa qa--in-card";
    inner.appendChild(details);

    // --- summary (cabecera + acciones) ---
    const summary = document.createElement("summary");

    const row = document.createElement("div");
    row.className = "qrow";

    const title = document.createElement("h2");
    title.className = "title";
    title.textContent = subName;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";

    // Duplicar
    const btnDup = document.createElement("button");
    btnDup.className = "icon-btn";
    btnDup.type = "button";
    btnDup.title = "Duplicar materia";
    btnDup.textContent = "🧬";
    btnDup.addEventListener("click", async (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      const arr = ensureSubdomainsArray(domainName);
      const clone = (typeof structuredClone === "function") ? structuredClone(subNode) : JSON.parse(JSON.stringify(subNode));
      arr.splice(idx + 1, 0, clone);
      try {
        await saveFullJson(RAW);
        renderSubdomainList(domainName);
        toast("Materia duplicada.");
      } catch (e) { console.error(e); alert("❌ Error al duplicar."); }
    });

    // Eliminar
    const btnDel = document.createElement("button");
    btnDel.className = "icon-btn";
    btnDel.type = "button";
    btnDel.title = "Eliminar materia";
    btnDel.textContent = "🗑️";
    btnDel.addEventListener("click", async (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      if (!confirm("⚠️ ¿Eliminar esta materia? Se borrarán también sus topics e items.")) return;
      const arr = ensureSubdomainsArray(domainName);
      if (!arr) return;
      arr.splice(idx, 1);
      try {
        await saveFullJson(RAW);
        renderSubdomainList(domainName);
        toast("Materia eliminada.");
      } catch (e) { console.error(e); alert("❌ Error al eliminar."); }
    });

    // Editar (toggle acordeón)
    const btnEdit = document.createElement("button");
    btnEdit.className = "icon-btn";
    btnEdit.type = "button";
    btnEdit.title = "Editar";
    btnEdit.textContent = "✏️";
    btnEdit.addEventListener("click", (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      details.open = !details.open;
    });

    actions.append(btnDup, btnDel, btnEdit);
    row.append(title, actions);

    // Tags (solo cuando está cerrado)
    const tagWrap = document.createElement("div");
    tagWrap.className = "tag-group";
    if (topics.length === 0) {
      const none = document.createElement("span");
      none.className = "muted";
      none.textContent = "— (sin topics)";
      tagWrap.appendChild(none);
    } else {
      topics.forEach(t => {
        const tg = document.createElement("span");
        tg.className = "tag";
        tg.textContent = str(t?.topic) || "(sin nombre)";
        tagWrap.appendChild(tg);
      });
    }

    summary.append(row, tagWrap);
    details.appendChild(summary);

    // --- Divider justo después del header (título + botón cerrar) ---
    const divider = document.createElement("hr");
    divider.className = "divider";
    divider.style.margin = "16px 0";
    details.appendChild(divider);

    // --- Panel de edición (stack 16) ---
    const editWrap = document.createElement("div");
    editWrap.className = "stack-16";

    // Campo: nombre del subdomain
    editWrap.appendChild(blockInput("Título de la materia", subName, (val)=>{
      title.textContent = val || "(Sin nombre)";
    }));

    // Gestor de topics (tags)
    const topicsBox = document.createElement("div");
    topicsBox.className = "stack-16";

    const lab = document.createElement("label");
    lab.className = "title-smaller";
    lab.textContent = "Topics (tags)";
    topicsBox.appendChild(lab);

    const list = document.createElement("div");
    list.className = "topics-editor stack-16";
    topicsBox.appendChild(list);

    function renderTopicsEditor(){
      list.innerHTML = "";
      topics.forEach((t, j) => {
        const row = document.createElement("div");
        row.className = "actions";
        row.style.gap = "8px";

        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "file-name";
        inp.value = str(t?.topic) || "";
        inp.placeholder = "Nombre del topic";
        row.appendChild(inp);

        const btnRemove = document.createElement("button");
        btnRemove.className = "btn";
        btnRemove.type = "button";
        btnRemove.textContent = "Eliminar";
        btnRemove.addEventListener("click", ()=>{
          topics.splice(j,1);
          renderTopicsEditor();
          // Actualiza chips (visibles solo en cerrado)
          tagWrap.innerHTML = "";
          if (!topics.length) {
            const s = document.createElement("span");
            s.className = "muted"; s.textContent = "— (sin topics)";
            tagWrap.appendChild(s);
          } else {
            topics.forEach(tt => {
              const chip = document.createElement("span");
              chip.className = "tag";
              chip.textContent = str(tt?.topic) || "(sin nombre)";
              tagWrap.appendChild(chip);
            });
          }
        });
        row.appendChild(btnRemove);

        // sincroniza chip en vivo
        inp.addEventListener("input", ()=>{
          t.topic = inp.value;
          const chip = tagWrap.children[j];
          if (chip && chip.classList.contains("tag")) {
            chip.textContent = inp.value || "(sin nombre)";
          }
        });

        list.appendChild(row);
      });
    }
    renderTopicsEditor();

    // Añadir topic (input 20% de ancho)
    const addTopicRow = document.createElement("div");
    addTopicRow.className = "actions";
    addTopicRow.style.gap = "8px";

    const addTopicInput = document.createElement("input");
    addTopicInput.type = "text";
    addTopicInput.className = "file-name add-topic-input";
    addTopicInput.placeholder = "Nuevo topic…";
    // 20% del ancho del contenedor
    addTopicInput.style.flex = "0 0 30%";
    addTopicInput.style.minWidth = "200px";

    const addTopicBtn = document.createElement("button");
    addTopicBtn.className = "btn";
    addTopicBtn.textContent = "➕ Añadir topic";

    addTopicBtn.addEventListener("click", ()=>{
      const name = str(addTopicInput.value);
      if (!name) return;
      topics.push({ topic: name, items: [] });
      addTopicInput.value = "";
      renderTopicsEditor();
      // Actualiza chips
      const chip = document.createElement("span");
      chip.className = "tag";
      chip.textContent = name;
      if (tagWrap.firstChild && tagWrap.firstChild.classList?.contains("muted")) {
        tagWrap.innerHTML = "";
      }
      tagWrap.appendChild(chip);
    });

    addTopicRow.append(addTopicInput, addTopicBtn);
    topicsBox.appendChild(addTopicRow);
    editWrap.appendChild(topicsBox);

    // Acciones guardar (sin botón cerrar abajo)
    const actionsEdit = document.createElement("div");
    actionsEdit.className = "actions";
    const btnSave = document.createElement("button");
    btnSave.className = "btn btn-primary";
    btnSave.textContent = "Guardar cambios";

    btnSave.addEventListener("click", async ()=>{
      try {
        // 1) Guardar nombre de la materia
        const inputTitle = editWrap.querySelector('input[type="text"]');
        const newName = str(inputTitle?.value);
        subNode.subdomain = newName;

        // 2) Topics ya vinculados por referencia
        ensureTopicsArray(subNode);

        await saveFullJson(RAW);
        btnSave.textContent = "✅ Guardado";
        setTimeout(()=> btnSave.textContent = "Guardar cambios", 1200);
        renderSubdomainList(domainName); // refresco
      } catch (e) {
        console.error(e);
        btnSave.textContent = "❌ Error";
      }
    });

    actionsEdit.append(btnSave);
    editWrap.appendChild(actionsEdit);

    details.appendChild(editWrap);

    // Toggle: al abrir, ocultamos duplicar/eliminar y los tags; añadimos divider
    details.addEventListener("toggle", () => {
      const open = details.open;
      btnDup.style.display = open ? "none" : "";
      btnDel.style.display = open ? "none" : "";
      tagWrap.hidden = open;
      btnEdit.textContent = open ? "✖️" : "✏️";
      btnEdit.title = open ? "Cerrar" : "Editar";
      divider.style.display = open ? "" : "none";
    });

    // Evitar que todo el summary sea clicable
    summary.addEventListener("click", (e) => {
      if (!e.target.closest(".icon-btn")) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    listEl.appendChild(card);

    // Abrir en edición si coincide con el índice solicitado
    if (openIndex !== null && openIndex === idx) {
      details.open = true;
    }
  });

  btnAdd.disabled = false;
}

// ===== Crear nueva materia =====
function createNewSubdomain(domainName){
  const arr = ensureSubdomainsArray(domainName);
  const base = { subdomain: "Nueva materia", topics: [] };
  arr.push(base);
  return base;
}

// ===== Eventos UI =====
selDomain?.addEventListener("change", ()=>{
  btnLoad.disabled = !selDomain.value;
});

btnLoad?.addEventListener("click", (e)=>{
  e.preventDefault();
  const d = currentDomainName();
  if (!d) return;
  // Mostrar bloque completo (título + lista + CTA)
  if (blockEl) blockEl.hidden = false;
  renderSubdomainList(d);
});

btnAdd?.addEventListener("click", async (e)=>{
  e.preventDefault();
  const d = currentDomainName();
  if (!d) return;
  try {
    createNewSubdomain(d);
    const arr = ensureSubdomainsArray(d);
    const newIndex = arr.length - 1; // última añadida
    await saveFullJson(RAW);
    if (blockEl) blockEl.hidden = false; // asegurar visible
    renderSubdomainList(d, { openIndex: newIndex }); // abrir edición directamente
    toast("Materia creada.");
  } catch (e) {
    console.error(e);
    alert("❌ Error creando la materia.");
  }
});

// ===== Integración con el Core: cuando se aplique una fuente, cargamos =====
document.addEventListener("dataDock:sourceApplied", async (ev) => {
  const src = ev.detail; // { id, label, url }
  if (!src?.url) return;
  CURRENT_URL = src.url;
  try {
    await loadFrom(src.url);
    // Ajustes UI iniciales: bloque oculto hasta pulsar "Cargar"
    btnLoad.disabled = !selDomain.value;
    btnAdd.disabled = true;
    if (blockEl) blockEl.hidden = true;
    listEl.innerHTML = "";
  } catch (e) {
    console.error(e);
    if (blockEl) blockEl.hidden = false;
    listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">❌ ${escapeHtml(e.message || "Error cargando los datos.")}</p></div></article>`;
  }
});

// Cuando otra sección guarda/cambia el JSON, recargamos si esta pestaña estuviera activa
document.addEventListener("dataDock:sourceUpdated", async () => {
  const activeHash = (location.hash || "#dashboard").replace("#","");
  if (activeHash !== "subdomains") return;
  const src = getAppliedSource();
  if (!src?.url) return;
  const prevDomain = currentDomainName();
  try {
    await loadFrom(src.url);
    if (prevDomain && getDomainNames(RAW).includes(prevDomain)) {
      selDomain.value = prevDomain;
      btnLoad.disabled = false;
      // No forzamos render para respetar que el usuario decida cuándo cargar
    } else {
      btnLoad.disabled = !selDomain.value;
      if (blockEl) blockEl.hidden = true;
      listEl.innerHTML = "";
    }
  } catch (e) {
    console.error(e);
  }
});

// ===== Pequeños helpers UI =====
function blockInput(label, value, onInput, multiline=false){
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
    ta.style.width = "100%";
    ta.style.minHeight = "90px";
    ta.className = "preview-box";
    ta.addEventListener("input", ()=> onInput(ta.value));
    box.appendChild(ta);
  } else {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = value || "";
    inp.className = "file-name";
    inp.addEventListener("input", ()=> onInput(inp.value));
    box.appendChild(inp);
  }
  return box;
}
