// data-dock-core.js · único origen de verdad para fuentes + auto-apply inicial

// 🔹 FUENTES (ids SIEMPRE únicos)
const DATA_SOURCES = [
  { id: "per-syllabus", label: "PER — Preguntas", url: "/data/sailup_per_syllabus.json" },
  { id: "pnb-syllabus", label: "PNB — Preguntas", url: "/data/sailup_pnb_syllabus.json" },
];

// 🔹 LocalStorage keys
const SELECTED_KEY = "dataDock.selectedSource";     // lo que está seleccionado en el <select>
const APPLIED_KEY  = "dataDock.appliedSource";      // la última fuente realmente cargada
const LABELS_CACHE_KEY = "dataDock.labelsCache";    // cache de títulos por url

// 🔹 Helpers LS (seleccionado)
function getSavedId() {
  try { return localStorage.getItem(SELECTED_KEY); } catch { return null; }
}
function setSavedId(id) {
  try { localStorage.setItem(SELECTED_KEY, id); } catch {}
}

// 🔹 Helpers LS (aplicado)
function setAppliedSource(src) {
  try { localStorage.setItem(APPLIED_KEY, JSON.stringify(src || null)); } catch {}
}
export function getAppliedSource() {
  try {
    const raw = localStorage.getItem(APPLIED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// 🔹 Cache simple de labels (por URL) para evitar refetch constante
function readLabelsCache() {
  try {
    const raw = localStorage.getItem(LABELS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeLabelsCache(cacheObj) {
  try { localStorage.setItem(LABELS_CACHE_KEY, JSON.stringify(cacheObj || {})); } catch {}
}

// 🔹 Lee el "course" desde el JSON
async function fetchCourseLabel(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.syllabus?.course || null;
}

// 🔹 Devuelve el objeto fuente actual a partir del <select> (seleccionada)
export function getCurrentSource(selectEl) {
  if (!selectEl) return null;
  const id = selectEl.value;
  return DATA_SOURCES.find(s => s.id === id) || null;
}

// 🔹 Helper: obtener la fuente seleccionada desde el LS (sin tocar el DOM)
function getSourceFromStorage() {
  const id = getSavedId();
  return DATA_SOURCES.find(s => s.id === id) || null;
}

// 🔹 Exports para que los módulos notifiquen al core (mantener por compat.)
export function reportLoadOk(meta = {}) {
  const source = getAppliedSource() || getSourceFromStorage();
  document.dispatchEvent(new CustomEvent("dataDock:dataLoaded", {
    detail: { source, meta }
  }));
}
export function reportLoadError(message = "Error desconocido") {
  const source = getAppliedSource() || getSourceFromStorage();
  document.dispatchEvent(new CustomEvent("dataDock:dataError", {
    detail: { source, message }
  }));
}

// 🔹 Rellena el <select> y cablea el botón “Aplicar”
//     - Inserta opciones con fallback (label estático)
//     - En paralelo resuelve el "course" desde cada JSON y actualiza el texto
export function initSourceSelect(selectEl, applyBtn) {
  if (!selectEl) return null;

  // Limpia dinámicos previos
  [...selectEl.querySelectorAll("option[data-dynamic]")].forEach(o => o.remove());

  // Cache inicial
  const cache = readLabelsCache();

  // Inyecta opciones con fallback inmediato (rápido en pantalla)
  for (const s of DATA_SOURCES) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = cache[s.url] || s.label; // fallback al label existente hasta resolver
    opt.setAttribute("data-dynamic", "1");
    opt.dataset.url = s.url;
    selectEl.appendChild(opt);
  }

  // Selección inicial: última guardada o primera
  const saved = getSavedId();
  const exists = DATA_SOURCES.some(s => s.id === saved);
  selectEl.value = exists ? saved : (DATA_SOURCES[0]?.id || "");
  if (selectEl.value) setSavedId(selectEl.value);

  // Cambiar el select SOLO guarda; NO carga (y resetea el icono de estado)
  selectEl.addEventListener("change", () => {
    const src = getCurrentSource(selectEl);
    if (src) setSavedId(src.id);
    // reset visual (✅/❌) hasta la siguiente carga
    selectEl.classList.remove("loaded", "error");
  });

  // Click en Aplicar → guarda como *aplicada* y emite evento global
  applyBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const src = getCurrentSource(selectEl);
    if (!src) return;
    setSavedId(src.id);
    setAppliedSource(src); // ✅ lo marcamos como la fuente realmente aplicada
    // reset visual al (re)aplicar; el ✅ lo pondremos SOLO cuando llegue dataLoaded
    selectEl.classList.remove("loaded", "error");
    document.dispatchEvent(new CustomEvent("dataDock:sourceApplied", { detail: src }));
  });

  // 🔸 Resolver labels “course” en paralelo y actualizar opciones
  (async () => {
    let changed = false;
    await Promise.all(
      [...selectEl.querySelectorAll("option[data-dynamic]")].map(async (opt) => {
        const url = opt.dataset.url;
        if (!url) return;
        try {
          const course = await fetchCourseLabel(url);
          if (course && opt.textContent !== course) {
            opt.textContent = course;
            cache[url] = course;
            changed = true;
          }
        } catch {
          // Silencioso: dejamos el fallback (label estático o cache previa)
        }
      })
    );
    if (changed) writeLabelsCache(cache);
  })();

  return getCurrentSource(selectEl);
}

// 🔹 Auto-apply inicial: al terminar de cargar la página
//    - respeta la fuente seleccionada (última usada o primera de la lista)
//    - NO requiere tocar dashboard/editor
window.addEventListener("load", () => {
  const selectEl = document.getElementById("promptSelect");
  const applyBtn = document.getElementById("applySourceBtn");
  // Asegúrate de haber llamado antes a initSourceSelect(...)
  if (!selectEl || !applyBtn) return;

  // Si ya hay una fuente aplicada previa, úsala; si no, aplica la seleccionada
  const applied = getAppliedSource();
  const toApply = applied || getCurrentSource(selectEl);
  if (toApply) {
    document.dispatchEvent(new CustomEvent("dataDock:sourceApplied", { detail: toApply }));
  }
});

// === Feedback de carga en el <select> ===
//    ✅ SOLO añadimos "loaded" si el select muestra la misma fuente que la aplicada.
//    Si el usuario cambió el select en otra pestaña sin aplicar, NO mostramos el ✅.
document.addEventListener("dataDock:dataLoaded", () => {
  const select = document.getElementById("promptSelect");
  if (!select) return;
  const applied = getAppliedSource();
  if (applied && select.value === applied.id) {
    select.classList.remove("error");
    select.classList.add("loaded");
  } else {
    select.classList.remove("loaded");
  }
});

document.addEventListener("dataDock:dataError", () => {
  const select = document.getElementById("promptSelect");
  if (!select) return;
  const applied = getAppliedSource();
  if (applied && select.value === applied.id) {
    select.classList.remove("loaded");
    select.classList.add("error");
  } else {
    select.classList.remove("error");
  }
});
