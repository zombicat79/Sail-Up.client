// server/app.js
import dotenv from "dotenv";
import path from "path";
import express from "express";

import createInnRouter from "./routers/inn.js";
import mainRouter from "./routers/main.js"; // ✅ lo volvemos a montar

// Forzamos ruta absoluta al .env
dotenv.config({ path: path.join(process.cwd(), ".env") });

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY no encontrada. Los endpoints que usan OpenAI no funcionarán.");
} else {
  console.log("✅ OPENAI_API_KEY cargada correctamente.");
}

app.use(express.json());

// Archivos estáticos globales (css, assets, data, etc.)
app.use(express.static(path.join(process.cwd(), "public")));

// 🔹 Montamos routers
app.use("/inn", createInnRouter(process.env.OPENAI_API_KEY));

// Main: API (version, data, etc.)
app.use("/main", mainRouter);

// Main: estáticos (index.html, js, etc.)
app.use("/main", express.static(path.join(process.cwd(), "apps/main")));

// Ruta raíz → redirige a Main por defecto
app.get("/", (req, res) => {
  res.redirect("/main");
});

app.listen(port, () => {
  console.log(`🚀 SailUp Apps running at http://localhost:${port}`);
});
