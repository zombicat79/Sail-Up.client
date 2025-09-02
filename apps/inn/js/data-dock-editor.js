// /data-dock/js/data-dock-editor.js
// Editor de preguntas (SOLO nuevo formato):
// syllabus.domains[].subdomains[].topics[].items[]
// item: { Type, question, "question-image", "question-image-url", options[], summary{} }
//
// - Selects en cascada basados en syllabus (incluye categorías sin preguntas)
// - Edición in-place
// - Crear / Duplicar / Eliminar preguntas
// - Mover pregunta entre Domain/Subdomain/Topic al guardar
// - Guarda en /inn/data-dock/save?target=/data/<file>.json

import { getAppliedSource, reportLoadOk, reportLoadError } from "/data-dock/js/data-dock-core.js";

// UI refs
const selDomain = document.getElementById("editorDomain");
const selSub    = document.getElementById("editorSubdomain");
const selTopic  = document.getElementById("editorTopic");
const btnLoad   = document.getElementById("editorLoad");
const btnAdd    = document.getElementById("editorAdd");
const listEl    = document.getElementById("editorList");

// Estado
let RAW = null;                 // JSON completo
let INDEX = null;               // Map Domain -> Map Sub -> Map Topic -> items[] (por referencia)
let TAXONOMY = null;            // { domains:Set, subdomainsByDomain:Map, topicsByPair:Map }
let CURRENT_URL = null;         // URL del JSON aplicado
let TYPE_SET = new Set(["DEFINITION"]);

// Utils
const str = (v) => (v == null ? "" : String(v).trim());
const escapeHtml = (s) => (s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed", bottom: "16px", right: "16px",
    background: "var(--panel-2)", border: "1px solid var(--border)",
    padding: "8px 10px", borderRadius: "8px",
    boxShadow: "var(--shadow, 0 8px 24px rgba(0,0,0,.35))", zIndex: 9999
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

/* =========================
   Helpers formato NUEVO
   ========================= */
function getSyllabusDomains(payload) {
  const ds = payload?.syllabus?.domains;
  if (!Array.isArray(ds)) throw new Error("Formato inválido: falta syllabus.domains[]");
  return ds;
}

function getDomainImage(payload, domainName) {
  const ds = getSyllabusDomains(payload);
  const d = ds.find(x => str(x?.domain) === str(domainName));
  return d?.["domain-image"] || "";
}

// Item: lecturas/escrituras (nuevo formato)
function readQuestion(it){ return it?.question ?? ""; }
function writeQuestion(it, val){ it.question = val ?? ""; }

function readType(it){ return str(it?.Type ?? "DEFINITION"); }
function writeType(it, val){ it.Type = val || "DEFINITION"; }

function readQImageFlag(it){ return !!it?.["question-image"]; }
function writeQImageFlag(it, on){ it["question-image"] = !!on; }

function readQImageUrl(it){ return it?.["question-image-url"] ?? ""; }
function writeQImageUrl(it, url){ it["question-image-url"] = url || ""; it["question-image"] = !!url; }

function readOptions(it){
  const out = [];
  const raw = Array.isArray(it?.options) ? it.options : [];
  // Si no hay options, devolvemos 4 huecos
  if (!raw.length) {
    for (let i=1;i<=4;i++) out.push({ text: "", correct: i===1 });
    return out;
  }
  raw.forEach((o, j) => {
    const i = j + 1;
    out.push({
      text: String(o?.[`option${i}-text`] ?? ""),
      correct: !!o?.[`option${i}-correct`]
    });
  });
  return out;
}

function ensureOptionSlots(it, min=4){
  if (!Array.isArray(it.options)) it.options = [];
  while (it.options.length < min) {
    const i = it.options.length + 1;
    it.options.push({ [`option${i}-text`]: "", [`option${i}-correct`]: (i===1) });
  }
}

function writeOptionText(it, idx, val){
  ensureOptionSlots(it, Math.max(4, idx+1));
  const i = idx + 1;
  it.options[idx][`option${i}-text`] = val ?? "";
  // la corrección la fijamos en ensureOptionCorrectness
}

function ensureOptionCorrectness(it){
  if (!Array.isArray(it.options)) return;
  it.options.forEach((o, j) => {
    const i = j + 1;
    o[`option${i}-correct`] = (j === 0);
  });
}

function readSummaryByIndex(it, idx){
  const i = idx + 1;
  return it?.summary?.[`summary${i}`] ?? "";
}
function writeSummaryByIndex(it, idx, val){
  const i = idx + 1;
  if (!it.summary || typeof it.summary !== "object") it.summary = {};
  it.summary[`summary${i}`] = val ?? "";
}

/* =========================
   Carga + índice + taxonomía
   ========================= */
async function loadDataFrom(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  RAW = await res.json();

  // Valida dominio raíz
  getSyllabusDomains(RAW);

  INDEX = buildIndexFromSyllabus(RAW);
  TAXONOMY = buildTaxonomyFromSyllabus(RAW);
  TYPE_SET = buildTypeSetFromItems(INDEX);
  fillDomainSelect(INDEX);
  listEl.innerHTML = ""; // limpia UI previa
}

function buildIndexFromSyllabus(payload) {
  // Map Domain -> Map Sub -> Map Topic -> items[] (referencias directas)
  const idx = new Map();
  const domains = getSyllabusDomains(payload);
  for (const d of domains) {
    const dName = str(d?.domain);
    if (!idx.has(dName)) idx.set(dName, new Map());
    const subMap = idx.get(dName);

    const subs = Array.isArray(d?.subdomains) ? d.subdomains : [];
    for (const s of subs) {
      const sName = str(s?.subdomain);
      if (!subMap.has(sName)) subMap.set(sName, new Map());
      const topMap = subMap.get(sName);

      const topics = Array.isArray(s?.topics) ? s.topics : [];
      for (const t of topics) {
        const tName = str(t?.topic);
        if (!topMap.has(tName)) topMap.set(tName, Array.isArray(t?.items) ? t.items : []);
        if (!Array.isArray(topMap.get(tName))) topMap.set(tName, []);
      }
    }
  }
  return idx;
}

function buildTaxonomyFromSyllabus(payload) {
  const domains = new Set();
  const subdomainsByDomain = new Map();
  const topicsByPair = new Map();

  const ds = getSyllabusDomains(payload);
  for (const d of ds) {
    const dn = str(d?.domain);
    if (!dn) continue;
    domains.add(dn);
    if (!subdomainsByDomain.has(dn)) subdomainsByDomain.set(dn, new Set());

    const subs = Array.isArray(d?.subdomains) ? d.subdomains : [];
    for (const s of subs) {
      const sn = str(s?.subdomain);
      subdomainsByDomain.get(dn).add(sn);
      const key = `${dn}||${sn}`;
      if (!topicsByPair.has(key)) topicsByPair.set(key, new Set());
      const tops = Array.isArray(s?.topics) ? s.topics : [];
      for (const t of tops) {
        const tn = str(t?.topic);
        topicsByPair.get(key).add(tn);
      }
    }
  }
  return { domains, subdomainsByDomain, topicsByPair };
}

function buildTypeSetFromItems(index) {
  const s = new Set();
  for (const sub of index.values()) {
    for (const top of sub.values()) {
      for (const arr of top.values()) {
        for (const q of arr) {
          const t = str(q?.Type);
          if (t) s.add(t);
        }
      }
    }
  }
  if (!s.size) s.add("DEFINITION");
  return s;
}

/* =========================
   Selects en cascada
   ========================= */
function clearSelect(sel, placeholder){
  sel.innerHTML = "";
  const opt = new Option(placeholder, "", true, true);
  opt.disabled = true;
  sel.appendChild(opt);
}

function fillDomainSelect(idx){
  clearSelect(selDomain, "Selecciona Domain");
  [...idx.keys()].filter(Boolean).sort((a,b)=>a.localeCompare(b,"es"))
    .forEach(d => selDomain.appendChild(new Option(d, d)));
  selDomain.disabled = false;
  selSub.disabled = true; selTopic.disabled = true; btnLoad.disabled = true; btnAdd.disabled = true;
}

function fillSubSelect(domain){
  clearSelect(selSub, "Selecciona Subdomain");
  clearSelect(selTopic, "Selecciona Topic");
  selTopic.disabled = true;

  const subs = INDEX.get(domain);
  if (!subs) { selSub.disabled = true; return; }
  [...subs.keys()].filter(Boolean).sort((a,b)=>a.localeCompare(b,"es"))
    .forEach(s => selSub.appendChild(new Option(s, s)));
  selSub.disabled = false;
}

function fillTopicSelect(domain, sub){
  clearSelect(selTopic, "Selecciona Topic");
  const tops = INDEX.get(domain)?.get(sub);
  if (!tops) { selTopic.disabled = true; return; }
  [...tops.keys()].filter(Boolean).sort((a,b)=>a.localeCompare(b,"es"))
    .forEach(t => selTopic.appendChild(new Option(t, t)));
  selTopic.disabled = false;
}

/* =========================
   Render de lista (acordeón)
   ========================= */
function renderList(domain, sub, topic){
  const arr = INDEX.get(domain)?.get(sub)?.get(topic) || [];
  listEl.innerHTML = "";

  if (!arr.length) {
    listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">No hay preguntas para esta combinación.</p></div></article>`;
  }

  for (let i=0; i<arr.length; i++){
    const q = arr[i];

    const questionText = readQuestion(q);
    const opts = readOptions(q).slice(0,4);
    // Asegura estructura visible de 4 summaries
    for (let k=0;k<4;k++) if (readSummaryByIndex(q,k) == null) writeSummaryByIndex(q,k,"");

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

    // Acciones inline
    const btnToggle = document.createElement("button");
    btnToggle.type = "button";
    btnToggle.className = "icon-btn";
    btnToggle.textContent = "✏️";
    btnToggle.title = "Editar";
    btnToggle.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      details.open = !details.open;
    });

    const btnDuplicate = document.createElement("button");
    btnDuplicate.type = "button";
    btnDuplicate.className = "icon-btn";
    btnDuplicate.textContent = "🧬";
    btnDuplicate.title = "Duplicar pregunta";
    btnDuplicate.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        const { arr: container, index } = findContainerForQuestion(RAW, q) || {};
        if (!container) return alert("No se encontró la pregunta para duplicar.");

        const clone = (typeof structuredClone === "function") ? structuredClone(q) : JSON.parse(JSON.stringify(q));
        container.splice(index + 1, 0, clone);

        await saveFullJson(RAW);
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
    btnDeleteQuick.title = "Eliminar pregunta";
    btnDeleteQuick.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!confirm("⚠️ ¿Eliminar esta pregunta?")) return;

      try {
        const ok = removeQuestionFromRAW(RAW, q);
        if (!ok) return alert("No se pudo localizar la pregunta.");

        await saveFullJson(RAW);
        document.dispatchEvent(new CustomEvent("dataDock:sourceUpdated", { detail: { url: CURRENT_URL } }));
        renderList(domain, sub, topic);
        toast("Pregunta eliminada.");
      } catch (e) {
        console.error(e);
        alert("❌ Error al eliminar.");
      }
    });

    const actionsInline = document.createElement("div");
    actionsInline.style.display = "flex";
    actionsInline.style.gap = "6px";
    actionsInline.append(btnDuplicate, btnDeleteQuick, btnToggle);

    qrow.append(h2, actionsInline);

    // Opciones preview
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

    summary.append(qrow, qoptsList);
    details.appendChild(summary);

    // Bloque edición
    const wrap = document.createElement("div");
    wrap.className = "mt-block stack-16";

    // Question
    wrap.appendChild(blockInput("Question", questionText, (val)=>{
      writeQuestion(q, val);
      h2.textContent = val || "(Pregunta sin enunciado)";
    }));

    // Type
    const currentType = readType(q);
    wrap.appendChild(blockSelect("Type", TYPE_SET, currentType, (val)=> writeType(q, val)));

    // Imagen de pregunta
    const curImgUrl = readQImageUrl(q);
    wrap.appendChild(blockInput("Imagen (URL)", curImgUrl, (val)=>{
      writeQImageUrl(q, val || "");
    }));
    const thumbRow = document.createElement("div");
    thumbRow.className = "actions";
    const thumbChk = document.createElement("input");
    thumbChk.type = "checkbox";
    thumbChk.checked = readQImageFlag(q);
    thumbChk.addEventListener("change", ()=> writeQImageFlag(q, !!thumbChk.checked));
    const thumbLbl = document.createElement("label");
    thumbLbl.textContent = "Imagen activa";
    thumbRow.append(thumbChk, thumbLbl);
    wrap.appendChild(thumbRow);

    // Opciones (1..4; la 1 es correcta)
    const opth = document.createElement("h4");
    opth.className = "title title-smaller";
    opth.textContent = "Opciones";
    wrap.appendChild(opth);

    ensureOptionCorrectness(q);
    readOptions(q).slice(0,4).forEach((o, idx) => {
      const label = idx === 0 ? `Opción ${idx+1} (Correcta)` : `Opción ${idx+1}`;
      wrap.appendChild(blockInput(label, o.text, (val)=>{
        writeOptionText(q, idx, val);
        const box = qoptsList.children[idx];
        if (box) {
          const span = box.querySelector(".opt-text");
          if (span) span.textContent = val || "(vacía)";
        }
      }));
    });

    // Summaries 1..4
    const sumh = document.createElement("h4");
    sumh.className = "title title-smaller";
    sumh.textContent = "Summaries";
    wrap.appendChild(sumh);
    for (let k=1; k<=4; k++){
      wrap.appendChild(blockInput(
        `Summary ${k}`,
        String(readSummaryByIndex(q, k-1) ?? ""),
        (val)=> writeSummaryByIndex(q, k-1, val),
        true
      ));
    }

    // Meta (mover)
    const metaH = document.createElement("h4");
    metaH.className = "title title-smaller";
    metaH.textContent = "Meta";
    wrap.appendChild(metaH);

    const metaGrid = document.createElement("div");
    metaGrid.className = "meta-grid";

    const selD = document.createElement("select");
    selD.className = "ds-select";
    const selS2 = document.createElement("select");
    selS2.className = "ds-select";
    const selT2 = document.createElement("select");
    selT2.className = "ds-select";

    const fillSelect = (el, values, placeholder, preselect) => {
      el.innerHTML = "";
      const ph = new Option(placeholder, "", true, true);
      ph.disabled = true;
      el.appendChild(ph);
      (values ? Array.from(values) : []).sort((a,b)=>a.localeCompare(b,"es"))
        .forEach(v => el.appendChild(new Option(v, v, false, v===preselect)));
    };
    const enable = (el, on) => { el.disabled = !on; if (!on) el.value = ""; };

    const curD = str(domain);
    const curS = str(sub);
    const curT = str(topic);

    fillSelect(selD, TAXONOMY.domains, "Selecciona Domain", curD);
    const sSet = TAXONOMY.subdomainsByDomain.get(curD) || new Set([curS]);
    fillSelect(selS2, sSet, "Selecciona Subdomain", curS);
    enable(selS2, true);

    const key = `${curD}||${curS}`;
    const tSet = TAXONOMY.topicsByPair.get(key) || new Set([curT]);
    fillSelect(selT2, tSet, "Selecciona Topic", curT);
    enable(selT2, true);

    const moveNote = document.createElement("p");
    moveNote.className = "intro meta-note";
    moveNote.textContent = "🔁 Esta pregunta se moverá a la nueva categoría al guardar.";
    moveNote.style.display = "none";

    const maybeShowMoveNote = () => {
      const d2 = selD.value, s2 = selS2.value, t2 = selT2.value;
      const differs = (d2!==domain || s2!==sub || t2!==topic);
      moveNote.style.display = differs ? "" : "none";
    };

    selD.addEventListener("change", () => {
      const d2 = selD.value || "";
      const sSet2 = d2 ? TAXONOMY.subdomainsByDomain.get(d2) : null;
      fillSelect(selS2, sSet2 || [], "Selecciona Subdomain", "");
      enable(selS2, !!d2);
      fillSelect(selT2, [], "Selecciona Topic", "");
      enable(selT2, false);
      maybeShowMoveNote();
    });
    selS2.addEventListener("change", () => {
      const d2 = selD.value || "";
      const s2 = selS2.value || "";
      const key2 = `${d2}||${s2}`;
      const tSet2 = TAXONOMY.topicsByPair.get(key2);
      fillSelect(selT2, tSet2 || [], "Selecciona Topic", "");
      enable(selT2, !!(d2 && s2));
      maybeShowMoveNote();
    });
    selT2.addEventListener("change", () => maybeShowMoveNote());

    metaGrid.append(selD, selS2, selT2);
    wrap.append(metaGrid, moveNote);

    // Acciones (guardar / eliminar)
    const actions = document.createElement("div");
    actions.className = "actions";
    const btnSave = document.createElement("button");
    btnSave.className = "btn btn-primary";
    btnSave.textContent = "Guardar cambios";

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn";
    btnDelete.textContent = "Eliminar pregunta";

    btnSave.addEventListener("click", async ()=>{
      try {
        const newD = str(selD.value || domain);
        const newS = str(selS2.value || sub);
        const newT = str(selT2.value || topic);

        const changed = (newD!==domain || newS!==sub || newT!==topic);

        // Garantiza consistencia de correct
        ensureOptionCorrectness(q);

        if (changed) {
          moveQuestionBetweenContainers(RAW, q, domain, sub, topic, newD, newS, newT);
        }

        await saveFullJson(RAW);
        document.dispatchEvent(new CustomEvent("dataDock:sourceUpdated", { detail: { url: CURRENT_URL } }));

        if (changed) {
          card.remove();
          if (!listEl.children.length) {
            listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">No hay preguntas para esta combinación.</p></div></article>`;
          }
        }
        btnSave.textContent = "✅ Guardado";
        setTimeout(()=> btnSave.textContent = "Guardar cambios", 1200);
      } catch(e){
        console.error(e);
        btnSave.textContent = "❌ Error";
      }
    });

    btnDelete.addEventListener("click", async ()=>{
      if (!confirm("⚠️ ¿Eliminar esta pregunta?")) return;
      try {
        const ok = removeQuestionFromRAW(RAW, q);
        if (!ok) return alert("No se pudo localizar la pregunta.");
        await saveFullJson(RAW);
        document.dispatchEvent(new CustomEvent("dataDock:sourceUpdated", { detail: { url: CURRENT_URL } }));
        card.remove();
        if (!listEl.children.length) {
          listEl.innerHTML = `<article class="msg assistant"><div class="msg-inner"><p class="intro">No hay preguntas para esta combinación.</p></div></article>`;
        }
      } catch (e) {
        console.error(e);
        alert("❌ Error al eliminar.");
      }
    });

    actions.append(btnSave, btnDelete);
    wrap.appendChild(actions);

    details.appendChild(wrap);

    details.addEventListener("toggle", () => {
      if (details.open) {
        btnToggle.textContent = "✖️";
        qoptsList.hidden = true;
      } else {
        btnToggle.textContent = "✏️";
        qoptsList.hidden = false;
      }
    });

    // Evitar que el summary entero sea clicable
    summary.addEventListener("click", (e) => {
      if (!e.target.closest(".icon-btn")) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    inner.appendChild(details);
    listEl.appendChild(card);
  }
}

/* =========================
   Nueva pregunta
   ========================= */
function renderCreateCard(domain, sub, topic){
  const defaultThumb = getDomainImage(RAW, domain);

  const q = {
    Type: "DEFINITION",
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

  const card = document.createElement("article");
  card.className = "msg assistant";
  const inner = document.createElement("div");
  inner.className = "msg-inner";
  card.appendChild(inner);

  const titleH = document.createElement("h2");
  titleH.className = "title";
  titleH.textContent = "(Nueva pregunta)";
  inner.appendChild(titleH);

  const wrap = document.createElement("div");
  wrap.className = "mt-block stack-16";

  wrap.appendChild(blockInput("Question", "", (val)=>{ q.question = val; titleH.textContent = val || "(Nueva pregunta)"; }));
  wrap.appendChild(blockSelect("Type", TYPE_SET, q.Type, (val)=>{ q.Type = val || "DEFINITION"; }));
  wrap.appendChild(blockInput("Imagen (URL)", defaultThumb, (val)=>{ writeQImageUrl(q, val || ""); }));

  // Switch imagen
  const thumbRow = document.createElement("div");
  thumbRow.className = "actions";
  const thumbChk = document.createElement("input"); thumbChk.type = "checkbox"; thumbChk.checked = q["question-image"];
  thumbChk.addEventListener("change", ()=>{ writeQImageFlag(q, !!thumbChk.checked); });
  const thumbLbl = document.createElement("label"); thumbLbl.textContent = "Imagen activa";
  thumbRow.append(thumbChk, thumbLbl);
  wrap.appendChild(thumbRow);

  // Opciones
  const opth = document.createElement("h4"); opth.className = "title title-smaller"; opth.textContent = "Opciones";
  wrap.appendChild(opth);
  ensureOptionSlots(q, 4);
  q.options.forEach((o, idx) => {
    const i = idx + 1;
    const label = idx === 0 ? `Opción ${i} (Correcta)` : `Opción ${i}`;
    const kText = `option${i}-text`;
    wrap.appendChild(blockInput(label, o[kText] || "", (val)=>{ writeOptionText(q, idx, val); ensureOptionCorrectness(q); }));
  });

  // Summaries
  const sumh = document.createElement("h4"); sumh.className = "title title-smaller"; sumh.textContent = "Summaries";
  wrap.appendChild(sumh);
  for (let i=1;i<=4;i++){
    const key = `summary${i}`;
    wrap.appendChild(blockInput(`Summary ${i}`, q.summary[key], (val)=>{ q.summary[key] = val; }, true));
  }

  // Acciones
  const actions = document.createElement("div");
  actions.className = "actions";
  const btnCreate = document.createElement("button"); btnCreate.className = "btn btn-primary"; btnCreate.textContent = "Crear pregunta";
  const btnCancel = document.createElement("button"); btnCancel.className = "btn"; btnCancel.textContent = "Cancelar";

  btnCancel.addEventListener("click", (e)=>{ e.preventDefault(); card.remove(); });

  btnCreate.addEventListener("click", async (e)=>{
    e.preventDefault();
    const d = str(domain), s = str(sub), t = str(topic);
    if (!d || !s || !t) return alert("Selecciona Domain, Subdomain y Topic.");
    try {
      const arr = ensureTopicItemsArray(RAW, d, s, t);
      ensureOptionCorrectness(q);
      arr.push(q);

      await saveFullJson(RAW);
      document.dispatchEvent(new CustomEvent("dataDock:sourceUpdated", { detail: { url: CURRENT_URL } }));
      card.remove();
      renderList(d, s, t);
      toast("Pregunta creada.");
    } catch (err) {
      console.error(err);
      alert("❌ Error creando la pregunta.");
    }
  });

  actions.append(btnCreate, btnCancel);
  wrap.appendChild(actions);

  inner.appendChild(wrap);
  listEl.prepend(card);
}

/* =========================
   Helpers UI simples
   ========================= */
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

function blockSelect(label, values, selected, onChange){
  const box = document.createElement("div");
  box.className = "mt-block";
  const lab = document.createElement("label");
  lab.className = "title-smaller";
  lab.style.display = "block";
  lab.style.marginBottom = "6px";
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
   Operaciones sobre el árbol (solo formato nuevo)
   ========================= */
function ensureTopicItemsArray(payload, domain, sub, topic) {
  // Crea Domain/Subdomain/Topic si faltan, y devuelve items[] por referencia
  if (!payload.syllabus) payload.syllabus = {};
  if (!Array.isArray(payload.syllabus.domains)) payload.syllabus.domains = [];
  const rootArr = payload.syllabus.domains;

  // Buscar/crear domain
  let d = rootArr.find(x => str(x?.domain) === str(domain));
  if (!d) {
    d = { domain: str(domain), "domain-overview": "", "domain-image": "", subdomains: [] };
    rootArr.push(d);
  }

  // Buscar/crear subdomain
  if (!Array.isArray(d.subdomains)) d.subdomains = [];
  let s = d.subdomains.find(x => str(x?.subdomain) === str(sub));
  if (!s) { s = { subdomain: str(sub), topics: [] }; d.subdomains.push(s); }

  // Buscar/crear topic
  if (!Array.isArray(s.topics)) s.topics = [];
  let t = s.topics.find(x => str(x?.topic) === str(topic));
  if (!t) { t = { topic: str(topic), items: [] }; s.topics.push(t); }

  if (!Array.isArray(t.items)) t.items = [];
  return t.items;
}

function findContainerForQuestion(payload, target) {
  const ds = getSyllabusDomains(payload);
  for (const d of ds) {
    const subs = Array.isArray(d?.subdomains) ? d.subdomains : [];
    for (const s of subs) {
      const tops = Array.isArray(s?.topics) ? s.topics : [];
      for (const t of tops) {
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
  // Quitar de donde esté actualmente
  removeQuestionFromRAW(payload, q);
  // Añadir en destino
  const targetArr = ensureTopicItemsArray(payload, toD, toS, toT);
  targetArr.push(q);

  // Re-generar índice/taxonomía por si hemos creado nodos nuevos
  INDEX = buildIndexFromSyllabus(payload);
  TAXONOMY = buildTaxonomyFromSyllabus(payload);
}

/* =========================
   Guardado
   ========================= */
async function saveFullJson(fullPayload){
  // target = /data/<filename>.json
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

/* =========================
   Eventos UI (filtros + core)
   ========================= */
function updateLoadAndAddButtons() {
  const d = selDomain.value, s = selSub.value, t = selTopic.value;
  btnLoad.disabled = !(d && s && t);
  btnAdd.disabled  = !(d && s && t);
}

selDomain.addEventListener("change", () => {
  const d = selDomain.value;
  if (!d) { selSub.disabled = true; selTopic.disabled = true; btnLoad.disabled = true; btnAdd.disabled = true; return; }
  fillSubSelect(d);
  updateLoadAndAddButtons();
});
selSub.addEventListener("change", () => {
  const d = selDomain.value, s = selSub.value;
  if (!d || !s) { selTopic.disabled = true; btnLoad.disabled = true; btnAdd.disabled = true; return; }
  fillTopicSelect(d, s);
  updateLoadAndAddButtons();
});
selTopic.addEventListener("change", () => updateLoadAndAddButtons());

btnLoad.addEventListener("click", (e) => {
  e.preventDefault();
  const d = selDomain.value, s = selSub.value, t = selTopic.value;
  if (!d || !s || !t) return;
  renderList(d, s, t);
  btnAdd.disabled = false;
});

btnAdd?.addEventListener("click", (e) => {
  e.preventDefault();
  const d = str(selDomain.value), s = str(selSub.value), t = str(selTopic.value);
  if (!d || !s || !t) return alert("Selecciona Domain, Subdomain y Topic.");
  renderCreateCard(d, s, t);
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
