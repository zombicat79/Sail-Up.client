// server/routers/inn.js
import express from "express";
import path from "path";
import { INN_VERSION, initKB } from "./common.js";
import createAiDockRouter from "./ai-dock-router.js";
import createDataDockRouter from "./data-dock.js";
import createCaptainJsonRouter from "./captain-json.js";
import createPirateCaveRouter from "./pirate-cave.js";

export default function createInnRouter(openai) {
  const router = express.Router();

  // Inicializaciones (una vez)
  initKB();

  // Version
  router.get("/version", (_req, res) => {
    res.json({ version: INN_VERSION });
  });

  // Home de Inn (landing)
  router.get("/", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "apps", "inn", "index.html"));
  });

  // Sub-routers por servicio
  // ⬇️ Pasamos el cliente OpenAI a AI Dock para reutilizarlo
  router.use("/ai-dock",      createAiDockRouter(openai));   // /inn/ai-dock/...
  router.use("/data-dock",    createDataDockRouter());       // /inn/data-dock/...
  router.use("/captain-json", createCaptainJsonRouter());    // /inn/captain-json/...
  router.use("/pirate-cave",  createPirateCaveRouter());     // /inn/pirate-cave/...

  // Health
  router.get("/healthz", (_req, res) => res.json({ ok: true }));

  return router;
}
