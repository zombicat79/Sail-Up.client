// apps/inn/js/ai-dock.js
// Cliente de AI Dock™ (UI + llamadas al backend)
// Requiere endpoints en server/routers/inn/ai-dock-router.js

/* =========================
   Refs
   ========================= */
const promptSelect      = document.getElementById("promptSelect");
const createPromptBtn   = document.getElementById("createPromptBtn");
const createPromptRow   = document.getElementById("createPromptRow");
const newPromptName     = document.getElementById("newPromptName");
const useTemplateBtn    = document.getElementById("useTemplateBtn");
const promptEditor      = document.getElementById("promptEditor");
const savePromptBtn     = document.getElementById("savePromptBtn");

const form              = document.getElementById("uploadForm");
const statusEl          = document.getElementById("status");
const tableContainer    = document.getElementById("table-container");
const downloadBtn       = document.getElementById("downloadBtn");
const fileInput         = document.getElementById("fileInput");
const fileName          = document.getElementById("fileName");
const processBtn        = document.getElementById("processBtn");

const validationBox     = document.getElementById("validationBox");
const validationSummary = document.getElementById("validationSummary");
const validationDetails = document.getElementById("validationDetails");
const resultsPreview    = document.getElementById("resultsPreview");

/* =========================
   Estado
   ========================= */
let LOADED_PROMPT = "";              // nombre del prompt seleccionado
let IS_CREATING   = false;           // modo crear prompt
let VALIDATION    = { ok:false, errs:[], warn:[], info:[] };
let ORIGINAL_PROMPT_CONTENT = "";    // línea base para detectar cambios
let LAST_SELECTED_PROMPT = "";       // último prompt estable (para revertir si cancelas)

/* =========================
   Init: cargar lista de prompts
   ========================= */
fetch("/inn/prompts")
  .then(res => res.json())
  .then(files => {
    files.forEach(f => {
      const option = document.createElement("option");
      option.value = f;
      option.textContent = f;
      promptSelect.appendChild(option);
    });
  });

/* =========================
   Helpers de UI/estado
   ========================= */
function setCreateMode(on) {
  IS_CREATING = !!on;
  createPromptRow.hidden = !on;
  createPromptBtn.disabled = !!on;   // desactiva "Nuevo prompt" mientras creamos
}

function setEditorContent(content) {
  promptEditor.value = content || "";
  ORIGINAL_PROMPT_CONTENT = promptEditor.value;
  updateSaveState();
}

function hasUnsavedChanges() {
  return promptEditor.value !== ORIGINAL_PROMPT_CONTENT;
}

function updateSaveState() {
  const hasChanges = hasUnsavedChanges();
  savePromptBtn.disabled = !hasChanges;
}

promptEditor.addEventListener("input", updateSaveState);

function ensureSafeToDiscardChanges() {
  if (!hasUnsavedChanges()) return true;
  return confirm("Tienes cambios sin guardar en el prompt actual. Si continúas, perderás esos cambios. ¿Deseas continuar sin guardar?");
}

/* =========================
   Prompt: auto-carga al seleccionar / crear / guardar
   ========================= */
async function loadSelectedPrompt(name) {
  if (!name) return;

  setCreateMode(false);                     // salir de modo crear (reactiva "Nuevo prompt")
  promptSelect.classList.remove("loaded", "error");

  const res = await fetch(`/inn/prompts/${encodeURIComponent(name)}`);
  if (!res.ok) {
    promptSelect.classList.add("error");
    alert("❌ Error cargando el prompt.");
    return;
  }
  const data = await res.json();

  LOADED_PROMPT = name;
  setEditorContent(data.content || "");
  promptSelect.classList.add("loaded");
  checkProcessReady();

  LAST_SELECTED_PROMPT = name;
  promptSelect.value = name;
}

// Auto-carga al cambiar el select con protección de cambios
promptSelect.addEventListener("change", async () => {
  const selected = promptSelect.value;
  if (!selected) return;

  if (selected !== LAST_SELECTED_PROMPT && !ensureSafeToDiscardChanges()) {
    // Revertir selección si el usuario cancela
    if (LAST_SELECTED_PROMPT) {
      promptSelect.value = LAST_SELECTED_PROMPT;
    } else {
      const placeholder = promptSelect.querySelector('option[disabled][selected]');
      if (placeholder) promptSelect.value = "";
    }
    return;
  }

  await loadSelectedPrompt(selected);
});

createPromptBtn.addEventListener("click", () => {
  if (!ensureSafeToDiscardChanges()) return;

  setCreateMode(true);
  LOADED_PROMPT = "";
  promptSelect.value = "";
  promptSelect.classList.remove("loaded", "error");
  setEditorContent("");          // base vacía; sin cambios → guardar desactivado
  checkProcessReady();

  LAST_SELECTED_PROMPT = "";
});

useTemplateBtn.addEventListener("click", async () => {
  const res = await fetch("/inn/prompts-template");
  if (!res.ok) return alert("❌ No se pudo cargar la plantilla.");
  const text = await res.text();
  // Cargar plantilla en el editor (esto cuenta como cambio → botón activo)
  promptEditor.value = text;
  updateSaveState();
});

savePromptBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  const content = promptEditor.value;

  if (IS_CREATING) {
    const name = (newPromptName.value || "").trim();
    if (!name.endsWith(".js")) return alert("El nombre debe terminar en .js");
    if (!name.match(/^[a-z0-9._-]+\.js$/i)) return alert("Nombre de archivo inválido.");

    const res = await fetch(`/inn/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content })
    });
    if (!res.ok) {
      promptSelect.classList.add("error");
      return alert("❌ Error creando el prompt");
    }
    alert("✅ Prompt creado");

    // refrescar selector + seleccionar el nuevo + auto-cargarlo (resetea base y desactiva guardar)
    const files = await (await fetch("/inn/prompts")).json();
    promptSelect.innerHTML = '<option value="" disabled selected>Seleccionar prompt</option>';
    files.forEach(f => {
      const option = document.createElement("option");
      option.value = f; option.textContent = f;
      promptSelect.appendChild(option);
    });

    promptSelect.value = name;
    await loadSelectedPrompt(name); // setCreateMode(false) ocurre dentro
    return;
  }

  if (!LOADED_PROMPT) return alert("Selecciona un prompt o crea uno nuevo.");
  const res = await fetch(`/inn/prompts/${encodeURIComponent(LOADED_PROMPT)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (res.ok) {
    alert("✅ Prompt actualizado");
    ORIGINAL_PROMPT_CONTENT = promptEditor.value; // nueva base
    updateSaveState();                             // desactiva "Guardar cambios"
    promptSelect.classList.add("loaded");
    promptSelect.classList.remove("error");
  } else {
    promptSelect.classList.add("error");
    alert("❌ Error guardando el prompt");
  }
});

/* =========================
   Advertencia al salir de la página (opcional)
   ========================= */
window.addEventListener("beforeunload", (e) => {
  if (!hasUnsavedChanges()) return;
  e.preventDefault();
  e.returnValue = ""; // necesario para mostrar el diálogo nativo
});

/* =========================
   Validación schema (validation box oculto hasta elegir archivo)
   ========================= */
fileInput.addEventListener("change", async () => {
  fileName.value = fileInput.files.length ? fileInput.files[0].name : "Ningún archivo seleccionado";

  if (fileInput.files.length) {
    validationBox.hidden = false;
    await validateFile();
  } else {
    validationBox.hidden = true;
    VALIDATION = { ok:false, errs:[], warn:[], info:[] };
    validationSummary.textContent = "Sin archivo.";
    validationDetails.innerHTML = "";
  }

  checkProcessReady();
});

async function validateFile() {
  validationSummary.innerHTML = '<span class="spinner">🛟</span> Validando...';
  validationDetails.innerHTML = "";
  VALIDATION = { ok:false, errs:[], warn:[], info:[] };

  if (!fileInput.files.length) {
    validationBox.hidden = true;
    validationSummary.textContent = "Sin archivo.";
    validationDetails.innerHTML = "";
    return;
  }
  validationBox.hidden = false;

  const fd = new FormData(); fd.append("file", fileInput.files[0]);
  const res = await fetch("/inn/validate", { method: "POST", body: fd });
  if (!res.ok) {
    validationSummary.innerHTML = '<span class="badge err">❌ Error de validación</span>';
    const t = await res.text();
    validationDetails.innerHTML = `<pre class="code">${t}</pre>`;
    VALIDATION.ok = false;
    return;
  }
  const out = await res.json();
  VALIDATION = out;

  const badges = [];
  if (out.ok) badges.push('<span class="badge ok">✅ Formato validado y listo para usar!</span>');
  if (out.warn?.length) badges.push(`<span class="badge warn">⚠️ Se han detectado ${out.warn.length} avisos.</span>`);
  if (out.errs?.length) badges.push(`<span class="badge err">❌ Formato incorrecto. Hay ${out.errs.length} errores que deben corregirse para poder procesar el archivo.</span>`);
  validationSummary.innerHTML = badges.join(" ");

  const parts = [];
  if (out.info?.length) parts.push("<h4>Info</h4><ul>" + out.info.map(i=>`<li>${i}</li>`).join("") + "</ul>");
  if (out.warn?.length) parts.push("<h4>Avisos</h4><ul>" + out.warn.map(i=>`<li>${i}</li>`).join("") + "</ul>");
  if (out.errs?.length) parts.push("<h4>Errores</h4><ul class='danger'>" + out.errs.map(i=>`<li>${i}</li>`).join("") + "</ul>");
  validationDetails.innerHTML = parts.join("");
}

/* =========================
   Procesar archivo
   ========================= */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  processFile();
});
processBtn.addEventListener("click", (e) => {
  e.preventDefault();
  processFile();
});

async function processFile() {
  const selectedPrompt = promptSelect.value;
  if (!selectedPrompt && !LOADED_PROMPT) {
    alert("⚠️ Debes seleccionar o crear un prompt antes de procesar.");
    return;
  }
  if (!VALIDATION.ok) {
    alert("⚠️ El archivo no supera la validación del esquema SailUp.");
    return;
  }
  if (!fileInput.files.length) {
    alert("⚠️ Falta el Excel.");
    return;
  }

  // Feedback: spinner junto al título de resultados
  statusEl.innerHTML = '<span class="spinner">🛟</span> Procesando...';

  // Evitar doble submit
  processBtn.disabled = true;
  fileInput.disabled = true;
  promptSelect.disabled = true;
  savePromptBtn.disabled = true;

  const fd = new FormData();
  fd.append("file", fileInput.files[0]);
  fd.append("prompt", LOADED_PROMPT || selectedPrompt);

  try {
    const response = await fetch("/inn/upload", { method: "POST", body: fd });
    if (response.ok) {
      const result = await response.json();
      statusEl.innerHTML = '<span class="success">✅ Procesado correctamente</span>';
      renderTable(result.previewSheetName, result.previewRows || []);
      downloadBtn.style.display = "inline-block";
      downloadBtn.disabled = false;
    } else {
      let msg = '❌ Error procesando el archivo.';
      try {
        const data = await response.json();
        if (data?.errs?.length) msg += `\n• ${data.errs.join('\n• ')}`;
      } catch {
        try { msg += `\n${await response.text()}`; } catch {}
      }
      statusEl.innerHTML = `<span class="danger">${msg}</span>`;
    }
  } catch {
    statusEl.innerHTML = '<span class="danger">❌ Error de red.</span>';
  } finally {
    processBtn.disabled = false;
    fileInput.disabled = false;
    promptSelect.disabled = false;
    // El botón Guardar permanece deshabilitado si no hay cambios sin guardar
    updateSaveState();
  }
}

function renderTable(sheetName, data) {
  if (!data.length) {
    tableContainer.innerHTML = "";
    resultsPreview.classList.add("empty");
    downloadBtn.disabled = true;
    return;
  }
  resultsPreview.classList.remove("empty");
  const keys = Object.keys(data[0]);
  let html = `<div class="muted small">Vista previa de hoja: <strong>${sheetName}</strong> (primeras filas)</div>`;
  html += "<table><thead><tr>";
  keys.forEach(k => html += `<th>${k}</th>`);
  html += "</tr></thead><tbody>";
  data.forEach(row => {
    html += "<tr>";
    keys.forEach(k => html += `<td>${row[k] ?? ""}</td>`);
    html += "</tr>";
  });
  html += "</tbody></table>";
  tableContainer.innerHTML = html;
}

downloadBtn.addEventListener("click", () => window.location.href = "/inn/download");

/* =========================
   Habilitación CTA
   ========================= */
function checkProcessReady() {
  const hasFile = fileInput.files.length > 0;
  const hasPrompt = (LOADED_PROMPT || promptSelect.value) !== "";
  const valid = !!VALIDATION.ok;
  processBtn.disabled = !(hasFile && hasPrompt && valid);
}

// Nota: el change del select ya maneja confirmación y carga; aquí mantenemos solo el refresh del CTA.
promptSelect.addEventListener("change", () => {
  promptSelect.classList.remove("error");
  checkProcessReady();
});
