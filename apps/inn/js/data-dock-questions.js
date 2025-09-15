// /data-dock/js/data-dock-questions.js
// Editor de preguntas (formato nuevo, sin legacy)

import { reportLoadOk, reportLoadError } from "/data-dock/js/data-dock-core.js";

/* =========================
   Refs UI
   ========================= */
const selDomain = document.getElementById("editorDomain");
const selSub    = document.getElementById("editorSubdomain");
const selTopic  = document.getElementById("editorTopic");
const btnAdd    = document.getElementById("editorAdd");
const listEl    = document.getElementById("editorList");

/* =========================
   Estado
   ========================= */
let RAW = null;                 // JSON completo
let INDEX = null;               // Map Domain -> Map Sub -> Map Topic -> items[]
let CURRENT_URL = null;         // URL aplicada (para guardar)
let TYPE_SET = new Set(["DEFINITION"]);

/* =========================
   Utils
   ========================= */
const str = (v) => (v == null ? "" : String(v).trim());
const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const escapeHtml = (s) => (s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.className = "toast";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

/* =========================
   Lectura / escritura de items
   ========================= */
function readQuestion(it){ return it?.question ?? ""; }
function writeQuestion(it, val){ it.question = val ?? ""; }

function readType(it){ return str(it?.type ?? "DEFINITION"); }
function writeType(it, val){ it.type = val || "DEFINITION"; }

function readQId(it){ return str(it?.["question-id"] ?? ""); }
function writeQId(it, val){ it["question-id"] = str(val || ""); }

function readQImageFlag(it){ return !!it?.["question-image"]; }
function writeQImageFlag(it, on){ it["question-image"] = !!on; }

function readQImageUrl(it){ return it?.["question-image-url"] ?? ""; }
function writeQImageUrl(it, url){ it["question-image-url"] = url || ""; it["question-image"] = !!url; }

function readOptions(it){
  const raw = Array.isArray(it?.options) ? it.options : [];
  if (!raw.length) {
    // fallback 4 opciones con la 1 correcta
    return [1,2,3,4].map(i => ({ text: "", correct: i===1 }));
  }
  return raw.map((o, j) => {
    const i = j+1;
    return { text: String(o?.[`option${i}-text`] ?? ""), correct: !!o?.[`option${i}-correct`] };
  });
}
function ensureOptionSlots(it, min=4){
  if (!Array.isArray(it.options)) it.options = [];
  while (it.options.length < min) {
    const i = it.options.length+1;
    it.options.push({ [`option${i}-text`]: "", [`option${i}-correct`]: (i===1) });
  }
}
function writeOptionText(it, idx, val){
  ensureOptionSlots(it, Math.max(4, idx+1));
  const i = idx+1;
  it.options[idx][`option${i}-text`] = val ?? "";
}
function ensureOptionCorrectness(it){
  if (!Array.isArray(it.options)) return;
  it.options.forEach((o, j) => {
    const i = j+1;
    o[`option${i}-correct`] = (j === 0); // ⇦ siempre la 1 correcta
  });
}

function readSummaryByIndex(it, idx){
  const i = idx+1;
  return it?.summary?.[`summary${i}`] ?? "";
}
function writeSummaryByIndex(it, idx, val){
  const i = idx+1;
  if (!it.summary || typeof it.summary !== "object") it.summary = {};
  it.summary[`summary${i}`] = val ?? "";
}

/* =========================
   Carga + índice
   ========================= */
async function loadDataFrom(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  RAW = await res.json();

  if (!RAW?.syllabus?.domains || !Array.isArray(RAW.syllabus.domains)) {
    throw new Error("Formato inválido: falta syllabus.domains[]");
  }

  INDEX = buildIndexFromSyllabus(RAW);
  TYPE_SET = buildTypeSetFromIndex(INDEX);

  fillDomainSelect();
  listEl.innerHTML = "";
  // Oculta/inhabilita el botón Add hasta que haya selección completa
  btnAdd.disabled = true;
  btnAdd.hidden = true;
}

function buildIndexFromSyllabus(payload){
  // Map Domain -> Map Sub -> Map Topic -> items[] (por referencia)
  const idx = new Map();
  for (const d of payload.syllabus.domains) {
    const dName = str(d?.domain);
    if (!idx.has(dName)) idx.set(dName, new Map());
    const subMap = idx.get(dName);
    for (const s of (d.subdomains || [])) {
      const sName = str(s?.subdomain);
      if (!subMap.has(sName)) subMap.set(sName, new Map());
      const topMap = subMap.get(sName);
      for (const t of (s.topics || [])) {
        const tName = str(t?.topic);
        if (!topMap.has(tName)) topMap.set(tName, Array.isArray(t.items) ? t.items : []);
        if (!Array.isArray(topMap.get(tName))) topMap.set(tName, []);
      }
    }
  }
  return idx;
}

function buildTypeSetFromIndex(index){
  const s = new Set();
  for (const sub of index.values())
    for (const top of sub.values())
      for (const arr of top.values())
        for (const q of arr) {
          const t = str(q?.type);
          if (t) s.add(t);
        }
  if (!s.size) s.add("DEFINITION");
  return s;
}

/* =========================
   Selects en cascada (orden + formato)
   ========================= */
function clearSelect(sel, placeholder){
  sel.innerHTML = "";
  const ph = new Option(placeholder, "", true, true);
  ph.disabled = true;
  sel.appendChild(ph);
}

function fillDomainSelect(){
  clearSelect(selDomain, "Seleccionar módulo");
  const ds = RAW.syllabus.domains
    .map(d => ({ value: str(d.domain), order: Number(d["domain-order"] ?? 0) }))
    .sort((a,b)=> a.order - b.order || a.value.localeCompare(b.value,"es"));
  ds.forEach(d => selDomain.appendChild(new Option(`${d.order}. ${d.value}`, d.value)));
  selDomain.disabled = false;
  selSub.disabled = true; selTopic.disabled = true;
}

function fillSubSelect(domain){
  clearSelect(selSub, "Seleccionar unidad");
  clearSelect(selTopic, "Seleccionar tema");
  selTopic.disabled = true;

  const d = RAW.syllabus.domains.find(x => str(x.domain) === str(domain));
  if (!d) { selSub.disabled = true; return; }
  const dOrder = Number(d["domain-order"] ?? 0);
  (d.subdomains || [])
    .map(s => ({ value: str(s.subdomain), order: Number(s["subdomain-order"] ?? 0) }))
    .sort((a,b)=> a.order - b.order || a.value.localeCompare(b.value,"es"))
    .forEach(s => selSub.appendChild(new Option(`${dOrder}.${s.order}. ${s.value}`, s.value)));
  selSub.disabled = false;
}

function fillTopicSelect(domain, sub){
  clearSelect(selTopic, "Seleccionar tema");
  const d = RAW.syllabus.domains.find(x => str(x.domain) === str(domain));
  const s = d?.subdomains?.find(x => str(x.subdomain) === str(sub));
  if (!s) { selTopic.disabled = true; return; }
  (s.topics || [])
    .map(t => ({ value: str(t.topic), order: Number(t["topic-order"] ?? 0) }))
    .sort((a,b)=> a.order - b.order || a.value.localeCompare(b.value,"es"))
    .forEach(t => selTopic.appendChild(new Option(t.value, t.value)));
  selTopic.disabled = false;
}

// === Helpers para opciones numeradas (Meta)
function getDomainRecords(payload){
  return (payload?.syllabus?.domains || [])
    .map(d => ({
      value: str(d.domain),
      dOrder: Number(d["domain-order"] ?? 0),
      label: `${Number(d["domain-order"] ?? 0)}. ${str(d.domain)}`
    }))
    .sort((a,b)=> a.dOrder - b.dOrder || a.value.localeCompare(b.value,"es"));
}

function getSubdomainRecords(payload, domainValue){
  const d = (payload?.syllabus?.domains || []).find(x => str(x.domain) === str(domainValue));
  const dOrder = Number(d?.["domain-order"] ?? 0);
  return (d?.subdomains || [])
    .map(s => ({
      value: str(s.subdomain),
      sOrder: Number(s["subdomain-order"] ?? 0),
      dOrder,
      label: `${dOrder}.${Number(s["subdomain-order"] ?? 0)}. ${str(s.subdomain)}`
    }))
    .sort((a,b)=> a.sOrder - b.sOrder || a.value.localeCompare(b.value,"es"));
}

function getTopicRecords(payload, domainValue, subValue){
  const d = (payload?.syllabus?.domains || []).find(x => str(x.domain) === str(domainValue));
  const s = d?.subdomains?.find(x => str(x.subdomain) === str(subValue));
  return (s?.topics || [])
    .map(t => ({
      value: str(t.topic),
      tOrder: Number(t["topic-order"] ?? 0),
      label: str(t.topic)  // sin numeración
    }))
    .sort((a,b)=> a.tOrder - b.tOrder || a.value.localeCompare(b.value,"es"));
}

// Rellena un <select> con {value,label} y placeholder
function fillSelectLabeled(selectEl, records, placeholder, preselect){
  selectEl.innerHTML = "";
  const ph = new Option(placeholder, "", true, true);
  ph.disabled = true;
  selectEl.appendChild(ph);
  (records || []).forEach(r => {
    const opt = new Option(r.label, r.value, false, r.value === preselect);
    selectEl.appendChild(opt);
  });
}

/* =========================
   Render de lista
   ========================= */
function renderList(domain, sub, topic){
  const arr = INDEX.get(domain)?.get(sub)?.get(topic) || [];
  listEl.innerHTML = "";

  if (!arr.length) {
    listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">No hay preguntas para esta combinación.</p></div></article>`;
  }

  for (let i=0; i<arr.length; i++){
    const qOriginal = arr[i];

    const questionText = readQuestion(qOriginal);
    const opts = readOptions(qOriginal).slice(0,4);
    for (let k=0;k<4;k++) if (readSummaryByIndex(qOriginal,k) == null) writeSummaryByIndex(qOriginal,k,"");

    // Tarjeta
    const card = document.createElement("article");
    card.className = "msg assistant";
    const inner = document.createElement("div");
    inner.className = "msg-inner";
    card.appendChild(inner);

    const details = document.createElement("details");
    details.className = "qa qa--in-card";

    const summary = document.createElement("summary");

    const qrow = document.createElement("div");
    qrow.className = "qrow";

    const h2 = document.createElement("h2");
    h2.className = "title";
    h2.textContent = questionText || "(Pregunta sin enunciado)";

    // Botones inline
    const btnToggle = document.createElement("button");
    btnToggle.type = "button";
    btnToggle.className = "icon-btn";
    btnToggle.textContent = "✏️";
    btnToggle.title = "Editar";

    const btnDuplicate = document.createElement("button");
    btnDuplicate.type = "button";
    btnDuplicate.className = "icon-btn";
    btnDuplicate.textContent = "🧬";
    btnDuplicate.title = "Duplicar pregunta";
    btnDuplicate.addEventListener("click", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      try {
        const { arr: container, index } = findContainerForQuestion(RAW, qOriginal) || {};
        if (!container) return alert("No se encontró la pregunta para duplicar.");

        const copy = clone(qOriginal);
        writeQId(copy, ""); // limpiar question-id
        container.splice(index + 1, 0, copy);

        await saveFullJsonNormalized(RAW);
        document.dispatchEvent(new CustomEvent("dataDock:sourceUpdated", { detail: { url: CURRENT_URL } }));
        renderList(domain, sub, topic);
        toast("Pregunta duplicada.");
      } catch (e) {
        console.error(e);
        alert("❌ Error al duplicar.");
      }
    });

    const btnDeleteQuick = document.createElement("button");
    btnDeleteQuick.type = "button";
    btnDeleteQuick.className = "icon-btn";
    btnDeleteQuick.textContent = "🗑️";
    btnDeleteQuick.title = "Eliminar";
    btnDeleteQuick.addEventListener("click", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (!confirm("⚠️ ¿Eliminar esta pregunta?")) return;
      try {
        const ok = removeQuestionFromRAW(RAW, qOriginal);
        if (!ok) return alert("No se pudo localizar la pregunta.");

        await saveFullJsonNormalized(RAW);
        document.dispatchEvent(new CustomEvent("dataDock:sourceUpdated", { detail: { url: CURRENT_URL } }));
        renderList(domain, sub, topic);
        toast("Pregunta eliminada.");
      } catch (e) {
        console.error(e);
        alert("❌ Error al eliminar.");
      }
    });

    const actionsInline = document.createElement("div");
    actionsInline.className = "actions-inline";
    actionsInline.append(btnDuplicate, btnDeleteQuick, btnToggle);

    const headLeft = document.createElement("div");
    headLeft.className = "head-left";
    headLeft.append(h2); // ❌ sin chip de question-id

    const headRow = document.createElement("div");
    headRow.className = "head-row";
    headRow.append(headLeft, actionsInline);

    // Preview opciones (dentro del summary, se oculta al abrir)
    const qoptsList = document.createElement("div");
    qoptsList.className = "qopts-list";
    opts.forEach((o) => {
      const box = document.createElement("div");
      box.className = "opt opt-static";
      const span = document.createElement("span");
      span.className = "opt-text";
      span.textContent = o.text || "(vacía)";
      box.appendChild(span);
      qoptsList.appendChild(box);
    });

    summary.append(headRow, qoptsList);
    details.appendChild(summary);

    // === Panel de edición (DENTRO del <details>) con DRAFT ===
    const draft = clone(qOriginal);
    let hasUnsavedChanges = false;
    const markDirty = () => { hasUnsavedChanges = true; };

    const panel = document.createElement("div");
    panel.className = "edit-panel";

    // --- SECTION: Campos iniciales (hasta Opciones excl.) ---
    const secBasics = document.createElement("div");
    secBasics.className = "edit-panel-section";

    // question-id (solo en panel)
    secBasics.appendChild(blockInput("ID", readQId(draft), (val)=>{
      writeQId(draft, val);
      markDirty();
    }));

    // Question
    secBasics.appendChild(blockInput("Pregunta", readQuestion(draft), (val)=>{
      writeQuestion(draft, val);
      h2.textContent = val || "(Pregunta sin enunciado)"; // preview cabecera
      markDirty();
    }));

    // Type (select)
    secBasics.appendChild(blockSelect("Tipo de pregunta", TYPE_SET, readType(draft), (val)=>{ writeType(draft, val); markDirty(); }));

    // Imagen URL + Switch
    secBasics.appendChild(blockInput("Imagen (URL)", readQImageUrl(draft), (val)=>{
      writeQImageUrl(draft, val || "");
      markDirty();
    }));

    const thumbRow = document.createElement("div");
    thumbRow.className = "actions image-toggle";
    const thumbChk = document.createElement("input");
    thumbChk.type = "checkbox";
    thumbChk.checked = readQImageFlag(draft);
    thumbChk.addEventListener("change", ()=> { writeQImageFlag(draft, !!thumbChk.checked); markDirty(); });
    const thumbLbl = document.createElement("label");
    thumbLbl.textContent = "Imagen activa";
    thumbRow.append(thumbChk, thumbLbl);
    secBasics.appendChild(thumbRow);

    panel.appendChild(secBasics);

    // --- SECTION: Opciones ---
    const secOptions = document.createElement("div");
    secOptions.className = "edit-panel-section";
    ensureOptionCorrectness(draft);

    const opth = document.createElement("h4");
    opth.className = "title title-smaller";
    opth.textContent = "Opciones";
    secOptions.appendChild(opth);

    readOptions(draft).slice(0,4).forEach((o, idx) => {
      const label = idx === 0 ? `Opción ${idx+1} (Correcta)` : `Opción ${idx+1}`;
      secOptions.appendChild(blockInput(label, o.text, (val)=>{
        writeOptionText(draft, idx, val);
        ensureOptionCorrectness(draft);
        const box = qoptsList.children[idx];
        if (box) {
          const span = box.querySelector(".opt-text");
          if (span) span.textContent = val || "(vacía)";
        }
        markDirty();
      }));
    });

    panel.appendChild(secOptions);

    // --- SECTION: Summaries ---
    const secSummaries = document.createElement("div");
    secSummaries.className = "edit-panel-section";

    const sumh = document.createElement("h4");
    sumh.className = "title title-smaller";
    sumh.textContent = "Resúmenes";
    secSummaries.appendChild(sumh);

    for (let k=1; k<=4; k++){
      secSummaries.appendChild(blockInput(
        `Resumen ${k}`,
        String(readSummaryByIndex(draft, k-1) ?? ""),
        (val)=> { writeSummaryByIndex(draft, k-1, val); markDirty(); },
        true
      ));
    }

    panel.appendChild(secSummaries);

    // --- SECTION: Meta ---
    const secMeta = document.createElement("div");
    secMeta.className = "edit-panel-section";

    const metaH = document.createElement("h4");
    metaH.className = "title title-smaller";
    metaH.textContent = "Ubicación";
    secMeta.appendChild(metaH);

    const metaGrid = document.createElement("div");
    metaGrid.className = "meta-grid";

    const selD = document.createElement("select");
    selD.className = "ds-select";
    const selS2 = document.createElement("select");
    selS2.className = "ds-select";
    const selT2 = document.createElement("select");
    selT2.className = "ds-select";

    const enable = (el, on) => { el.disabled = !on; if (!on) el.value = ""; };

    // Valores actuales
    const curD = str(domain);
    const curS = str(sub);
    const curT = str(topic);

    // ① Domains (numerados)
    const dRecs = getDomainRecords(RAW);
    fillSelectLabeled(selD, dRecs, "Selecciona módulo", curD);
    enable(selD, true);

    // ② Subdomains (numerados)
    const sRecs = getSubdomainRecords(RAW, curD);
    fillSelectLabeled(selS2, sRecs, "Selecciona unidad", curS);
    enable(selS2, true);

    // ③ Topics (sin numeración)
    const tRecs = getTopicRecords(RAW, curD, curS);
    fillSelectLabeled(selT2, tRecs, "Selecciona tema", curT);
    enable(selT2, true);

    const moveNote = document.createElement("p");
    moveNote.className = "intro meta-note";
    moveNote.textContent = "🔁 Esta pregunta se moverá a la nueva categoría al guardar.";
    moveNote.hidden = true;

    const maybeShowMoveNote = () => {
      const d2 = selD.value, s2 = selS2.value, t2 = selT2.value;
      const differs = (d2!==domain || s2!==sub || t2!==topic);
      moveNote.hidden = !differs;
      if (differs) markDirty();
    };

    selD.addEventListener("change", () => {
      const d2 = selD.value || "";
      const sRecs2 = getSubdomainRecords(RAW, d2);
      fillSelectLabeled(selS2, sRecs2, "Selecciona unidad", "");
      enable(selS2, !!d2);

      fillSelectLabeled(selT2, [], "Selecciona tema", "");
      enable(selT2, false);
      maybeShowMoveNote();
    });

    selS2.addEventListener("change", () => {
      const d2 = selD.value || "";
      const s2 = selS2.value || "";
      const tRecs2 = getTopicRecords(RAW, d2, s2);
      fillSelectLabeled(selT2, tRecs2, "Selecciona tema", "");
      enable(selT2, !!(d2 && s2));
      maybeShowMoveNote();
    });

    selT2.addEventListener("change", () => maybeShowMoveNote());

    metaGrid.append(selD, selS2, selT2);
    secMeta.append(metaGrid, moveNote);
    panel.appendChild(secMeta);

    // --- FOOTER ---
    const footer = document.createElement("div");
    footer.className = "edit-panel-footer";

    const btnSave = document.createElement("button");
    btnSave.className = "btn btn-primary";
    btnSave.textContent = "Guardar cambios";

    btnSave.addEventListener("click", async ()=>{
      try {
        // Aplicar draft a original ANTES de mover/guardar
        ensureOptionCorrectness(draft);
        writeType(draft, readType(draft));     // normaliza type
        writeQId(draft, readQId(draft));       // asegura string

        // Copiar campos del draft al objeto original referenciado en el árbol
        applyDraftToOriginal(draft, qOriginal);

        const newD = str(selD.value || domain);
        const newS = str(selS2.value || sub);
        const newT = str(selT2.value || topic);

        const changedContainer = (newD!==domain || newS!==sub || newT!==topic);
        if (changedContainer) {
          moveQuestionBetweenContainers(RAW, qOriginal, domain, sub, topic, newD, newS, newT);
        }

        await saveFullJsonNormalized(RAW);
        document.dispatchEvent(new CustomEvent("dataDock:sourceUpdated", { detail: { url: CURRENT_URL } }));

        hasUnsavedChanges = false;

        // Cerrar panel y re-render
        details.open = false;
        renderList(domain, sub, topic);
      } catch(e){
        console.error(e);
        btnSave.textContent = "❌ Error";
        setTimeout(()=> btnSave.textContent = "Guardar cambios", 1200);
      }
    });

    footer.append(btnSave);
    panel.appendChild(footer);

    // Añadir panel dentro del details (como antes)
    details.appendChild(panel);

    // Evitar que el click en summary abra/cierre salvo botones
    summary.addEventListener("click", (e) => {
      if (!e.target.closest(".icon-btn")) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // Modo edición: alterna icono y botones, y oculta preview de opciones
    const setEditModeUI = (open) => {
      qoptsList.hidden = open;
      if (open) {
        btnToggle.textContent = "✖️";
        btnToggle.title = "Cerrar";
        btnDuplicate.hidden = true;
        btnDeleteQuick.hidden = true;
      } else {
        btnToggle.textContent = "✏️";
        btnToggle.title = "Editar";
        btnDuplicate.hidden = false;
        btnDeleteQuick.hidden = false;
      }
    };

    details.addEventListener("toggle", () => {
      setEditModeUI(details.open);
      // Si cerramos con cambios sin guardar, re-render para descartar DRAFT
      if (!details.open && hasUnsavedChanges) {
        renderList(domain, sub, topic);
      }
    });

    btnToggle.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      details.open = !details.open;
    });

    inner.appendChild(details);
    listEl.appendChild(card);
  }
}

/* =========================
   Aplicar draft a original
   ========================= */
function applyDraftToOriginal(draft, original){
  // Campos simples
  original["question-id"] = readQId(draft);
  original.type = readType(draft);
  original.question = readQuestion(draft);
  original["question-image"] = readQImageFlag(draft);
  original["question-image-url"] = readQImageUrl(draft);

  // Opciones (copiamos la estructura optionN-*)
  ensureOptionSlots(draft, 4);
  ensureOptionCorrectness(draft);
  original.options = clone(draft.options);

  // Summary
  original.summary = clone(draft.summary || {});
}

/* =========================
   Nueva pregunta (creación inmediata al pulsar Añadir)
   ========================= */
function getDomainImage(payload, domainName) {
  const d = (payload?.syllabus?.domains || []).find(x => str(x?.domain) === str(domainName));
  return d?.["domain-image"] || "";
}

async function createQuestionAndOpen(domain, sub, topic){
  const defaultThumb = getDomainImage(RAW, domain);

  const q = {
    "question-id": "",
    type: "DEFINITION",
    "question-image": !!defaultThumb,
    "question-image-url": defaultThumb || "",
    question: "",
    options: [
      { "option1-text": "", "option1-correct": true  },
      { "option2-text": "", "option2-correct": false },
      { "option3-text": "", "option3-correct": false },
      { "option4-text": "", "option4-correct": false }
    ],
    summary: { summary1: "", summary2: "", summary3: "", summary4: "" }
  };

  // Insertar al FINAL y guardar
  const arr = ensureTopicItemsArray(RAW, domain, sub, topic);
  ensureOptionCorrectness(q);
  writeType(q, readType(q));
  writeQId(q, readQId(q));
  arr.push(q); // ⬅️ al final

  await saveFullJsonNormalized(RAW);
  document.dispatchEvent(new CustomEvent("dataDock:sourceUpdated", { detail: { url: CURRENT_URL } }));

  // Re-render y abrir el último detalle
  renderList(domain, sub, topic);
  const all = listEl.querySelectorAll("details.qa");
  if (all.length) {
    const last = all[all.length - 1];
    last.open = true;
  }

  toast("Pregunta creada.");
}

/* =========================
   Helpers UI simples
   ========================= */
function blockInput(label, value, onInput, multiline=false){
  const box = document.createElement("div");
  box.className = "mt-block";
  const lab = document.createElement("label");
  lab.className = "title-smaller";
  lab.textContent = label;
  box.appendChild(lab);

  if (multiline) {
    const ta = document.createElement("textarea");
    ta.value = value || "";
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

function blockSelect(label, values, selected, onChange){
  const box = document.createElement("div");
  box.className = "mt-block";
  const lab = document.createElement("label");
  lab.className = "title-smaller";
  lab.textContent = label;
  box.appendChild(lab);

  const sel = document.createElement("select");
  sel.className = "ds-select";
  (Array.from(values || [])).sort((a,b)=>a.localeCompare(b,"es"))
    .forEach(v => sel.appendChild(new Option(v, v, false, v===selected)));
  sel.addEventListener("change", ()=> onChange(sel.value));
  box.appendChild(sel);
  return box;
}

/* =========================
   Árbol syllabus (crear/mover/buscar)
   ========================= */
function ensureTopicItemsArray(payload, domain, sub, topic) {
  if (!payload.syllabus) payload.syllabus = {};
  if (!Array.isArray(payload.syllabus.domains)) payload.syllabus.domains = [];
  const rootArr = payload.syllabus.domains;

  // domain
  let d = rootArr.find(x => str(x?.domain) === str(domain));
  if (!d) {
    d = { domain: str(domain), "domain-overview": "", "domain-image": "", subdomains: [] };
    rootArr.push(d);
  }

  // subdomain
  if (!Array.isArray(d.subdomains)) d.subdomains = [];
  let s = d.subdomains.find(x => str(x?.subdomain) === str(sub));
  if (!s) { s = { subdomain: str(sub), topics: [] }; d.subdomains.push(s); }

  // topic
  if (!Array.isArray(s.topics)) s.topics = [];
  let t = s.topics.find(x => str(x?.topic) === str(topic));
  if (!t) { t = { topic: str(topic), items: [] }; s.topics.push(t); }

  if (!Array.isArray(t.items)) t.items = [];
  return t.items;
}

function findContainerForQuestion(payload, target) {
  for (const d of (payload?.syllabus?.domains || [])) {
    for (const s of (d?.subdomains || [])) {
      for (const t of (s?.topics || [])) {
        const arr = Array.isArray(t?.items) ? t.items : [];
        const idx = arr.indexOf(target);
        if (idx >= 0) return { arr, index: idx };
      }
    }
  }
  return null;
}

function removeQuestionFromRAW(payload, q){
  const loc = findContainerForQuestion(payload, q);
  if (!loc || !loc.arr) return false;
  loc.arr.splice(loc.index, 1);
  return true;
}

function moveQuestionBetweenContainers(payload, q, _fromD, _fromS, _fromT, toD, toS, toT) {
  // quitar
  removeQuestionFromRAW(payload, q);
  // añadir
  const targetArr = ensureTopicItemsArray(payload, toD, toS, toT);
  targetArr.push(q);
  // reconstruir índice
  INDEX = buildIndexFromSyllabus(payload);
}

/* =========================
   Guardado (normalizado)
   ========================= */
function normalizeEntireTree(payload){
  for (const d of (payload?.syllabus?.domains || [])) {
    for (const s of (d?.subdomains || [])) {
      for (const t of (s?.topics || [])) {
        for (const it of (t?.items || [])) {
          const tval = str(it?.type ?? "DEFINITION") || "DEFINITION";
          it.type = tval;
          if (!("question-id" in it)) it["question-id"] = "";
          else it["question-id"] = str(it["question-id"]);
          ensureOptionSlots(it, 4);
          ensureOptionCorrectness(it);
        }
      }
    }
  }
}

async function saveFullJson(fullPayload){
  const file = (CURRENT_URL || "").split("/").pop();
  const target = `/data/${file}`;
  const res = await fetch(`/inn/data-dock/save?target=${encodeURIComponent(target)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fullPayload, null, 2)
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

async function saveFullJsonNormalized(fullPayload){
  normalizeEntireTree(fullPayload);
  return saveFullJson(fullPayload);
}

/* =========================
   Eventos de selects y core
   ========================= */
function updateAddVisibility(){
  const d = selDomain.value, s = selSub.value, t = selTopic.value;
  const ready = !!(d && s && t);
  btnAdd.disabled = !ready;
  btnAdd.hidden = !ready;
}

selDomain.addEventListener("change", () => {
  const d = selDomain.value;
  if (!d) {
    selSub.disabled = true; selTopic.disabled = true;
    listEl.innerHTML = "";
    updateAddVisibility();
    return;
  }
  fillSubSelect(d);
  listEl.innerHTML = "";
  updateAddVisibility();
});

selSub.addEventListener("change", () => {
  const d = selDomain.value, s = selSub.value;
  if (!d || !s) {
    selTopic.disabled = true;
    listEl.innerHTML = "";
    updateAddVisibility();
    return;
  }
  fillTopicSelect(d, s);
  listEl.innerHTML = "";
  updateAddVisibility();
});

selTopic.addEventListener("change", () => {
  const d = selDomain.value, s = selSub.value, t = selTopic.value;
  if (d && s && t) {
    renderList(d, s, t);
  } else {
    listEl.innerHTML = "";
  }
  updateAddVisibility();
});

btnAdd.addEventListener("click", async (e)=>{
  e.preventDefault();
  const d = selDomain.value, s = selSub.value, t = selTopic.value;
  if (d && s && t) {
    try {
      await createQuestionAndOpen(d, s, t); // creación inmediata + abrir panel
    } catch (err) {
      console.error(err);
      alert("❌ Error creando la pregunta.");
    }
  }
});

// Cargar cuando se aplique una fuente
document.addEventListener("dataDock:sourceApplied", async (ev) => {
  const src = ev.detail; // { id, label, url }
  if (!src?.url) return;
  CURRENT_URL = src.url;
  try {
    await loadDataFrom(src.url);
    reportLoadOk({ editor: "ok" });
  } catch (e) {
    console.error(e);
    reportLoadError(e?.message || "Error cargando editor");
    listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">❌ ${escapeHtml(e.message || "Error cargando los datos.")}</p></div></article>`;
  }
});
