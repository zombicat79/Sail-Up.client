// server/routers/inn/common.js
import fs from "fs";
import path from "path";
import multer from "multer";
import { loadKB, retrieveTopK } from "../../apps/inn/js/ai-dock-kb.js";

export const INN_VERSION = "Beta v0.6.0"; // bump centralizado

/* =========================
   Upload (compartido)
   ========================= */
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Si quieres conservar nombres originales, cambia a diskStorage;
export const upload = multer({ dest: UPLOADS_DIR });

/* =========================
   KB compartida (carga única)
   ========================= */
// Permite override por ENV
const KB_PATH = process.env.INN_KB_PATH || path.join("uploads", "PER_structured.json");

export let KB = null;

// Guards para evitar recargas y condiciones de carrera
let _kbInitDone = false;
let _kbInitPromise = null;

export async function initKB() {
  if (_kbInitDone) return KB;
  if (_kbInitPromise) return _kbInitPromise;

  _kbInitPromise = (async () => {
    try {
      KB = await loadKB(KB_PATH);
      _kbInitDone = true;
      const n = KB?.passages?.length || 0;
      console.log(`🔎 KB cargada: ${n} pasajes (${KB_PATH})`);
      return KB;
    } catch (e) {
      console.warn("⚠️ KB no cargada (Inn seguirá sin contexto):", e?.message);
      // No marcamos como done para poder reintentar si se llama de nuevo
      _kbInitPromise = null;
      return null;
    }
  })();

  return _kbInitPromise;
}

// Helper para garantizar que la KB esté lista cuando se necesite
export async function getKB() {
  if (!_kbInitDone) await initKB();
  return KB;
}

/* =========================
   Helpers comunes
   ========================= */
export function truncate(str, n = 600) {
  const s = String(str ?? "");
  return s.length > n ? s.slice(0, n) + " …[truncated]" : s;
}
