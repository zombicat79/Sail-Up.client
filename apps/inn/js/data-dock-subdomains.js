// /data-dock/js/data-dock-subdomains.js
// Gestión de Subdomains (Materias) para un Domain seleccionado.
// - Select Domain (autoload al cambiar)
// - Lista de materias con chips de topics (ordenados por topic-order)
// - Acciones: Duplicar / Eliminar / Editar (en abierto oculta duplicar/eliminar y chips)
// - Panel de edición:
//     · Orden de la materia (subdomain-order) [editable]  ← AHORA PRIMERO
//     · Título de la materia (subdomain)
//     · Gestor de topics: nombre + orden con flechas ↑/↓ (topic-order calculado al guardar)
// - Guardar:
//     · Persiste subdomain, reubica por subdomain-order y renumera 1..N
//     · Persiste topics en el orden del editor (topic-order = 1..N)
//     · Reordena la lista y cierra el panel
// - Cerrar sin guardar:
//     · Re-renderiza el domain para descartar cambios locales (topics y chips vuelven al orden original)
// - Crear/Duplicar materia: subdomain-order = siguiente disponible y abre en edición
// - Persistencia: /inn/data-dock/save?target=/data/<file>.json
//
// Requiere: data-dock-core.js (getAppliedSource)

import { getAppliedSource } from "/data-dock/js/data-dock-core.js";

// UI refs
const selDomain = document.getElementById("subdDomain");
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
const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

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
function getDomainOrder(domainName){
  const d = DOMAIN_MAP.get(str(domainName));
  const n = Number(d?.["domain-order"]);
  return Number.isFinite(n) ? n : null;
}
function getSubdomainsOf(domainName){
  const d = DOMAIN_MAP.get(str(domainName));
  return Array.isArray(d?.subdomains) ? d.subdomains : [];
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
function ensureUniqueSubdomainName(domainName, desired, skipIndex = -1) {
  const arr = ensureSubdomainsArray(domainName) || [];
  const existing = new Set(
    arr.map((s, i) => (i === skipIndex ? null : str(s?.subdomain))).filter(Boolean)
  );
  let base = str(desired) || "Nueva materia";
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}
function ensureUniqueTopicName(topics, desired, skipIndex = -1) {
  const existing = new Set(
    topics.map((t, i) => (i === skipIndex ? null : str(t?.topic))).filter(Boolean)
  );
  let base = str(desired) || "Nuevo topic";
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ===== Orden y meta para domains/subdomains/topics =====
function toOrderNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : Infinity; // sin orden definido → al final
}
function getDomainMetaList(payload) {
  // Devuelve [{ name, order }] leyendo "domain" y "domain-order"
  return (getDomains(payload) || [])
    .map(d => ({
      name: str(d?.domain),
      order: toOrderNumber(d?.["domain-order"])
    }))
    .filter(x => !!x.name);
}
function sortByOrderThenName(a, b) {
  // 1º por order (asc), 2º por nombre (A→Z, locale "es")
  if (a.order !== b.order) return a.order - b.order;
  return a.name.localeCompare(b.name, "es");
}
function nextSubdomainOrder(domainName) {
  const subs = getSubdomainsOf(domainName);
  let max = 0;
  for (const s of subs) {
    const n = Number(s?.["subdomain-order"]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}
function formatSubTitle(domainOrder, subOrder, name){
  const parts = [];
  if (Number.isFinite(domainOrder)) parts.push(domainOrder);
  if (Number.isFinite(subOrder)) parts.push(subOrder);
  return parts.length ? `${parts.join(".")}. ${name}` : name;
}

// --- Orden para topics (solo para chips / vista cerrada) ---
function getSortedTopicsByOrderName(topics){
  // No muta el array original: orden por topic-order, y desempate por nombre
  return [...(Array.isArray(topics) ? topics : [])].sort((a, b) => {
    const ao = toOrderNumber(a?.["topic-order"]);
    const bo = toOrderNumber(b?.["topic-order"]);
    if (ao !== bo) return ao - bo;
    const an = str(a?.topic);
    const bn = str(b?.topic);
    return an.localeCompare(bn, "es");
  });
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

// ===== Select Domain =====
function clearSelect(sel, placeholder){
  sel.innerHTML = "";
  const opt = new Option(placeholder, "", true, true);
  opt.disabled = true;
  sel.appendChild(opt);
}
function fillDomainSelect(){
  const prev = selDomain?.value || "";
  clearSelect(selDomain, "Seleccionar módulo");

  const meta = getDomainMetaList(RAW).sort(sortByOrderThenName);

  meta.forEach(({ name, order }) => {
    const label = (Number.isFinite(order) ? `${order}. ` : "") + name;
    selDomain.appendChild(new Option(label, name, false, name === prev));
  });

  selDomain.disabled = false;
  btnAdd.disabled = true; // hasta que el usuario seleccione un domain
}
function currentDomainName(){
  return str(selDomain?.value);
}

// ===== Render listado =====
function renderSubdomainList(domainName, opts = {}){
  const { openIndex = null, openNode = null } = opts;

  listEl.innerHTML = "";

  // Sort por subdomain-order (asc), tie-break por nombre
  const subsRaw = getSubdomainsOf(domainName);
  const metaSubs = subsRaw.map((node, i) => ({
    node,
    name: str(node?.subdomain) || "",
    order: toOrderNumber(node?.["subdomain-order"]),
    idx: i
  })).sort((a,b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name, "es");
  });

  if (!metaSubs.length) {
    btnAdd.disabled = false;
    listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">No hay materias para este domain.</p></div></article>`;
    return;
  }

  const dOrder = getDomainOrder(domainName);

  metaSubs.forEach((meta) => {
    const subNode = meta.node;
    const subName = meta.name || "(Sin nombre)";
    const subOrderFinite = Number(subNode?.["subdomain-order"]);
    const subOrder = Number.isFinite(subOrderFinite) ? subOrderFinite : null;
    const topicsRef = ensureTopicsArray(subNode);

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
    title.textContent = formatSubTitle(dOrder, subOrder, subName);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";

    // Duplicar
    const btnDup = document.createElement("button");
    btnDup.className = "icon-btn";
    btnDup.type = "button";
    btnDup.title = "Duplicar";
    btnDup.textContent = "🧬";
    btnDup.addEventListener("click", async (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      const arr = ensureSubdomainsArray(domainName);
      const copy = clone(subNode);
      copy.subdomain = ensureUniqueSubdomainName(domainName, `${subName} (copia)`, meta.idx);
      // Asignar nuevo subdomain-order al final
      copy["subdomain-order"] = nextSubdomainOrder(domainName);
      arr.splice(meta.idx + 1, 0, copy);
      try {
        await saveFullJson(RAW);
        renderSubdomainList(domainName, { openNode: copy });
        toast("Materia duplicada.");
      } catch (e) { console.error(e); alert("❌ Error al duplicar."); }
    });

    // Eliminar
    const btnDel = document.createElement("button");
    btnDel.className = "icon-btn";
    btnDel.type = "button";
    btnDel.title = "Eliminar";
    btnDel.textContent = "🗑️";
    btnDel.addEventListener("click", async (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      if (!confirm("⚠️ ¿Eliminar esta materia? Se borrarán también sus topics e items.")) return;
      const arr = ensureSubdomainsArray(domainName);
      if (!arr) return;
      const where = arr.indexOf(subNode);
      if (where >= 0) arr.splice(where, 1);
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

    // Chips (solo cuando está cerrado) — ordenados por topic-order
    const tagWrap = document.createElement("div");
    tagWrap.className = "tag-group";
    if (topicsRef.length === 0) {
      const none = document.createElement("span");
      none.className = "muted";
      none.textContent = "— (Sin temas)";
      tagWrap.appendChild(none);
    } else {
      getSortedTopicsByOrderName(topicsRef).forEach(t => {
        const tg = document.createElement("span");
        tg.className = "tag";
        tg.textContent = str(t?.topic) || "(Sin nombre)";
        tagWrap.appendChild(tg);
      });
    }

    summary.append(row, tagWrap);
    details.appendChild(summary);

    // --- Divider justo después del header ---
    const divider = document.createElement("hr");
    divider.className = "divider";
    divider.style.margin = "16px 0";
    details.appendChild(divider);

    // ==============================
    // Panel de edición (stack 16)
    // ==============================
    const editWrap = document.createElement("div");
    editWrap.className = "stack-16";

    // Copia de trabajo de topics: NO tocar el array original hasta Guardar
    let editableTopics = (Array.isArray(topicsRef) ? topicsRef.map(t => clone(t)) : []);
    // subdomain-order editable (número) — usar copia local para UI
    let editableSubOrder = Number.isFinite(subOrder) ? subOrder : "";

    // ---- Orden de la materia (PRIMERO) ----
    const orderBlock = document.createElement("div");
    orderBlock.className = "mt-block";
    const orderLab = document.createElement("label");
    orderLab.className = "title-smaller";
    orderLab.style.display = "block";
    orderLab.style.marginBottom = "6px";
    orderLab.textContent = "Numeración";
    orderBlock.appendChild(orderLab);
    const orderInp = document.createElement("input");
    orderInp.type = "number";
    orderInp.min = "1";
    orderInp.step = "1";
    orderInp.className = "file-name";
    orderInp.value = editableSubOrder === "" ? "" : String(editableSubOrder);
    orderInp.placeholder = "Ej. 1";
    orderInp.addEventListener("input", ()=>{
      const v = Number(orderInp.value);
      editableSubOrder = Number.isFinite(v) && v > 0 ? v : "";
    });
    orderBlock.appendChild(orderInp);
    editWrap.appendChild(orderBlock);

    // ---- Título de la materia (después del orden) ----
    const nameInputBlock = blockInput("Unidad", subName, (val)=>{
      // Solo actualiza el título visual del summary
      title.textContent = formatSubTitle(getDomainOrder(domainName), subOrder, val || "(Sin nombre)");
    });
    editWrap.appendChild(nameInputBlock);

    // Gestor de topics
    const topicsBox = document.createElement("div");
    topicsBox.className = "stack-16";

    const lab = document.createElement("label");
    lab.className = "title-smaller";
    lab.textContent = "Temas";
    topicsBox.appendChild(lab);

    const list = document.createElement("div");
    list.className = "topics-editor stack-16";
    topicsBox.appendChild(list);

    // Para “chips” de la vista cerrada (aunque están ocultos cuando está abierto)
    function rerenderChips() {
      tagWrap.innerHTML = "";
      if (!editableTopics.length) {
        const s = document.createElement("span");
        s.className = "muted"; s.textContent = "— (Sin temas)";
        tagWrap.appendChild(s);
      } else {
        editableTopics.forEach((tt) => {
          const chip = document.createElement("span");
          chip.className = "tag";
          chip.textContent = str(tt?.topic) || "(Sin nombre)";
          tagWrap.appendChild(chip);
        });
      }
    }

    function swap(arr, i, j){
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }

    function renderTopicsEditor(){
      list.innerHTML = "";
      editableTopics.forEach((t, j) => {
        const row = document.createElement("div");
        row.className = "actions";
        row.style.gap = "8px";
        row.style.alignItems = "center";

        // Badge con posición 1..N
        const badge = document.createElement("div");
        badge.textContent = String(j + 1);
        badge.style.minWidth = "28px";
        badge.style.height = "28px";
        badge.style.border = "1px solid var(--border)";
        badge.style.borderRadius = "8px";
        badge.style.display = "flex";
        badge.style.alignItems = "center";
        badge.style.justifyContent = "center";
        badge.style.background = "var(--panel-2)";
        row.appendChild(badge);

        // Input de nombre
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "file-name";
        inp.value = str(t?.topic) || "";
        inp.placeholder = "Nombre del topic";
        row.appendChild(inp);

        // Controles ↑ ↓
        const orderCtrls = document.createElement("div");
        orderCtrls.className = "actions";
        orderCtrls.style.gap = "6px";

        const upBtn = document.createElement("button");
        upBtn.className = "btn";
        upBtn.type = "button";
        upBtn.textContent = "↑";
        upBtn.disabled = (j === 0);
        upBtn.addEventListener("click", ()=>{
          if (j > 0) {
            swap(editableTopics, j, j-1);
            renderTopicsEditor();
            rerenderChips();
          }
        });

        const downBtn = document.createElement("button");
        downBtn.className = "btn";
        downBtn.type = "button";
        downBtn.textContent = "↓";
        downBtn.disabled = (j === editableTopics.length - 1);
        downBtn.addEventListener("click", ()=>{
          if (j < editableTopics.length - 1) {
            swap(editableTopics, j, j+1);
            renderTopicsEditor();
            rerenderChips();
          }
        });

        orderCtrls.append(upBtn, downBtn);
        row.appendChild(orderCtrls);

        // Eliminar topic
        const btnRemove = document.createElement("button");
        btnRemove.className = "btn";
        btnRemove.type = "button";
        btnRemove.textContent = "Eliminar";
        btnRemove.addEventListener("click", ()=>{
          editableTopics.splice(j,1);
          renderTopicsEditor();
          rerenderChips();
        });
        row.appendChild(btnRemove);

        // Sincroniza nombre en la copia local
        inp.addEventListener("change", ()=>{
          const desired = inp.value;
          const unique = ensureUniqueTopicName(editableTopics, desired, j);
          t.topic = unique;
          if (unique !== desired) inp.value = unique;
          rerenderChips();
        });
        inp.addEventListener("input", ()=>{
          t.topic = inp.value;
        });

        list.appendChild(row);
      });
    }
    renderTopicsEditor();

    // Añadir topic
    const addTopicRow = document.createElement("div");
    addTopicRow.className = "actions";
    addTopicRow.style.gap = "8px";

    const addTopicInput = document.createElement("input");
    addTopicInput.type = "text";
    addTopicInput.className = "file-name add-topic-input";
    addTopicInput.placeholder = "Ej. Popa";
    addTopicInput.style.flex = "0 0 30%";
    addTopicInput.style.minWidth = "200px";

    const addTopicBtn = document.createElement("button");
    addTopicBtn.className = "btn";
    addTopicBtn.textContent = "➕ Añadir tema";

    addTopicBtn.addEventListener("click", ()=>{
      const desired = str(addTopicInput.value);
      if (!desired) return;
      const unique = ensureUniqueTopicName(editableTopics, desired, -1);
      // Se re-numerará al guardar; aquí solo añadimos al final local
      editableTopics.push({ topic: unique, items: [] });
      addTopicInput.value = "";
      renderTopicsEditor();
      rerenderChips();
    });

    addTopicRow.append(addTopicInput, addTopicBtn);
    topicsBox.appendChild(addTopicRow);
    editWrap.appendChild(topicsBox);

    // Acciones guardar
    const actionsEdit = document.createElement("div");
    actionsEdit.className = "actions edit-panel-footer";
    const btnSave = document.createElement("button");
    btnSave.className = "btn btn-primary";
    btnSave.textContent = "Guardar cambios";

    btnSave.addEventListener("click", async ()=>{
      try {
        // 1) Guardar nombre de la materia (único dentro del domain)
        const inputTitle = nameInputBlock.querySelector('input[type="text"]');
        const desiredName = str(inputTitle?.value);
        const arr = ensureSubdomainsArray(domainName);
        const currentIndex = arr.indexOf(subNode);
        subNode.subdomain = ensureUniqueSubdomainName(domainName, desiredName, currentIndex);

        // 2) Reposición por subdomain-order y renumeración 1..N
        const working = arr.slice();                   // copia superficial
        const oldPos = currentIndex;
        const node = working.splice(oldPos, 1)[0];     // quitar actual

        let targetPos = oldPos;
        if (editableSubOrder !== "" && Number.isFinite(Number(editableSubOrder)) && Number(editableSubOrder) > 0) {
          targetPos = Math.max(0, Math.min(working.length, Number(editableSubOrder) - 1));
        }
        working.splice(targetPos, 0, node);

        // Renumerar 1..N
        working.forEach((s, i) => { s["subdomain-order"] = i + 1; });

        // Sobrescribir el array original en el JSON (misma referencia de d.subdomains)
        arr.length = 0;
        working.forEach(s => arr.push(s));

        // 3) Persistir topics con topic-order = posición 1..N (a partir del editor)
        subNode.topics = editableTopics.map((t, idx) => ({
          ...t,
          "topic-order": idx + 1,
          items: Array.isArray(t.items) ? t.items : []
        }));

        await saveFullJson(RAW);
        toast("Cambios guardados.");

        // Re-render general (ordenado) y cerrar panel
        renderSubdomainList(domainName);
      } catch (e) {
        console.error(e);
        btnSave.textContent = "❌ Error";
        setTimeout(()=> btnSave.textContent = "Guardar cambios", 1200);
        return;
      }
    });

    actionsEdit.append(btnSave);
    editWrap.appendChild(actionsEdit);

    details.appendChild(editWrap);

    // Toggle: al abrir, ocultamos duplicar/eliminar y los tags; al cerrar, DESCARTAMOS cambios locales
    details.addEventListener("toggle", () => {
      const open = details.open;
      const wasOpen = !open; // si estamos cerrando ahora
      btnDup.style.display = open ? "none" : "";
      btnDel.style.display = open ? "none" : "";
      tagWrap.hidden = open;
      btnEdit.textContent = open ? "✖️" : "✏️";
      btnEdit.title = open ? "Cerrar" : "Editar";
      divider.style.display = open ? "" : "none";

      // 🔁 Si el usuario cierra SIN guardar, re-renderizamos todo el domain
      //     para descartar el estado local (editableTopics, chips, etc.).
      if (!open) {
        // Protección para evitar parpadeos múltiples si hubiera varios detalles
        // Aquí re-renderizamos solo una vez el domain actual.
        renderSubdomainList(domainName);
      }
    });

    // Evitar que todo el summary sea clicable
    summary.addEventListener("click", (e) => {
      if (!e.target.closest(".icon-btn")) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    listEl.appendChild(card);

    // Abrir el acordeón si coincide referencia o índice (compat)
    const shouldOpen =
      (openNode && openNode === subNode) ||
      (openIndex !== null && openIndex === meta.idx);
    if (shouldOpen) {
      details.open = true;
    }
  });

  btnAdd.disabled = false;
}

// ===== Crear nueva materia =====
function createNewSubdomain(domainName){
  const arr = ensureSubdomainsArray(domainName);
  const baseName = "Nuevo temario";
  const unique = ensureUniqueSubdomainName(domainName, baseName, -1);
  const node = { subdomain: unique, topics: [] };
  // asignar un subdomain-order al final
  node["subdomain-order"] = nextSubdomainOrder(domainName);
  arr.push(node);
  return node;
}

// ===== Eventos UI =====
// Autoload al cambiar el select de Domain
selDomain?.addEventListener("change", ()=>{
  const d = currentDomainName();
  if (!d) {
    // Sin selección → bloque oculto y CTA deshabilitado
    if (blockEl) blockEl.hidden = true;
    listEl.innerHTML = "";
    btnAdd.disabled = true;
    return;
  }
  // Con selección → mostramos bloque y renderizamos
  if (blockEl) blockEl.hidden = false;
  renderSubdomainList(d);
  btnAdd.disabled = false;
});

btnAdd?.addEventListener("click", async (e)=>{
  e.preventDefault();
  const d = currentDomainName();
  if (!d) return;
  try {
    const newNode = createNewSubdomain(d);
    await saveFullJson(RAW);
    if (blockEl) blockEl.hidden = false;
    renderSubdomainList(d, { openNode: newNode });
    toast("Temario cread0.");
  } catch (e) {
    console.error(e);
    alert("❌ Error creando el temario.");
  }
});

// ===== Integración con el Core: cuando se aplique una fuente, cargamos =====
document.addEventListener("dataDock:sourceApplied", async (ev) => {
  const src = ev.detail; // { id, label, url }
  if (!src?.url) return;
  CURRENT_URL = src.url;
  try {
    await loadFrom(src.url);
    // Estado inicial: bloque oculto hasta que el usuario seleccione un Domain
    if (blockEl) blockEl.hidden = true;
    listEl.innerHTML = "";
    btnAdd.disabled = true;
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
    // Si el Domain previo sigue existiendo, mantenlo seleccionado sin autoload
    if (prevDomain && getDomainNames(RAW).includes(prevDomain)) {
      selDomain.value = prevDomain;
      // no renderizamos automáticamente: el autoload se hace en change
    } else {
      // limpiar selección
      selDomain.selectedIndex = 0; // placeholder
      if (blockEl) blockEl.hidden = true;
      listEl.innerHTML = "";
      btnAdd.disabled = true;
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
