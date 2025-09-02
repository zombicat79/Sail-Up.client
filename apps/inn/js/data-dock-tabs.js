// apps/inn/js/data-dock-tabs.js
import { getCurrentSource } from "/data-dock/js/data-dock-core.js";

const menu = document.getElementById("data-dock-menu");
const tabs = menu ? [...menu.querySelectorAll('[data-tab]')] : [];

// 🔸 Clave donde guardamos la “fuente aplicada”
const APPLIED_KEY = "dataDock.appliedSource";
function getAppliedSource() {
  try {
    const s = localStorage.getItem(APPLIED_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

// 🔹 Construye el mapa de secciones automáticamente desde los tabs (id esperado: `${id}-section`)
function buildSections() {
  const map = {};
  tabs.forEach(a => {
    const id = a.dataset.tab;
    const el = document.getElementById(`${id}-section`);
    if (el) map[id] = el;
  });
  return map;
}

let sections = buildSections();

function showTab(tabId) {
  if (!tabs.length) return;

  // Activa el estado visual del tab
  tabs.forEach(a => a.classList.toggle('active', a.dataset.tab === tabId));

  // Muestra/oculta secciones en base al id "xxx-section"
  Object.entries(sections).forEach(([id, el]) => {
    if (!el) return;
    if (id === tabId) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  });

  // 🔔 Notificar que se activó un tab (por si otro módulo lo necesita)
  document.dispatchEvent(new CustomEvent("dataDock:tabActivated", {
    detail: { name: tabId }
  }));

  // ✅ Al entrar en Dashboard, re-aplicamos SIEMPRE la *fuente aplicada* (no la seleccionada)
  if (tabId === "dashboard") {
    const applied = getAppliedSource();
    // Fallback a la seleccionada solo si no hay aplicada aún (primer arranque)
    const selectEl = document.getElementById("promptSelect");
    const src = applied || getCurrentSource(selectEl);
    if (src) {
      document.dispatchEvent(new CustomEvent("dataDock:sourceApplied", { detail: src }));
    }
  }
}

function pickFromHash() {
  const h = (location.hash || "#dashboard").replace("#", "");
  return sections[h] ? h : "dashboard";
}

function init() {
  // Recalcular secciones por si el DOM cambió (renombres como "questions", etc.)
  sections = buildSections();

  // Click en tabs
  tabs.forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = a.dataset.tab;
      history.replaceState(null, "", `#${tabId}`);
      showTab(tabId);
    });
  });

  // Soporte hash directo / refresh
  window.addEventListener("hashchange", () => showTab(pickFromHash()));

  // 🔁 Si el editor guarda/elimina y estás en Dashboard, reaplica la *aplicada*
  document.addEventListener("dataDock:sourceUpdated", () => {
    const current = pickFromHash();
    if (current !== "dashboard") return;
    const applied = getAppliedSource();
    const selectEl = document.getElementById("promptSelect");
    const src = applied || getCurrentSource(selectEl);
    if (src) {
      document.dispatchEvent(new CustomEvent("dataDock:sourceApplied", { detail: src }));
    }
  });

  // Arranque
  showTab(pickFromHash());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
