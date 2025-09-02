// server/app.js
import dotenv from "dotenv";
import path from "path";
import express from "express";
import OpenAI from "openai";

import mainRouter from "./routers/main.js";
import createInnRouter from "./routers/inn.js";

import createPirateCaveRouter from "./routers/pirate-cave.js";
import createAiDockRouter from "./routers/ai-dock.js";
import createDataDockRouter from "./routers/data-dock.js";
import createCaptainJsonRouter from "./routers/captain-json.js";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const app = express();
const port = process.env.PORT || 3000;

// ⬇️ AUMENTA EL LÍMITE GLOBAL DEL BODY
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// OpenAI (único cliente)
let openai = null;
if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY no encontrada. Los endpoints que usan OpenAI no funcionarán.");
} else {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("✅ OPENAI_API_KEY cargada y cliente OpenAI inicializado.");
}

app.use(express.json());

// === Estáticos globales (sirve /assets, /css, /components, /data, etc. desde /public) ===
app.use(express.static(path.join(process.cwd(), "public")));

// === MAIN: estáticos + router ===
app.use("/main", express.static(path.join(process.cwd(), "apps", "main")));
app.use("/main", mainRouter);

// === INN: router base (gestiona /inn/) ===
app.use("/inn", createInnRouter(openai));

// === Apps/servicios específicos ===
// NOTA: Mantengo las rutas tal como las tienes (funcionando).
app.use("/pirate-cave", createPirateCaveRouter());
app.use("/data-dock", createDataDockRouter());
app.use("/captain-json", createCaptainJsonRouter());
app.use("/inn", createAiDockRouter(openai));

// ✅ Data Dock: exponer assets de la app (JS/CSS/HTML auxiliares) desde apps/inn bajo /data-dock/*
app.use(
  "/data-dock",
  express.static(path.join(process.cwd(), "apps", "inn"), { index: false })
);

// Home → Main
app.get("/", (_req, res) => res.redirect("/main"));

app.listen(port, () => {
  console.log(`🚀 SailUp Apps running at http://localhost:${port}`);
});
