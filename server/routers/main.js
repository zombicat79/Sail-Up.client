// server/routers/main.js
import express from "express";
import path from "path";

const router = express.Router();

// === Versión específica de la app Main ===
const MAIN_VERSION = "Beta v0.5.0";

// 📌 Endpoint de versión
router.get("/version", (req, res) => {
  res.json({ version: MAIN_VERSION });
});

// 📌 Servir HTML principal de Main (frontend)
router.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "apps", "main", "index.html"));
});

// 📌 Endpoint para servir archivos de datos desde /public/data
router.get("/data/:file", (req, res) => {
  const file = req.params.file;
  const filePath = path.join(process.cwd(), "public", "data", file);

  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send("Archivo de datos no encontrado.");
    }
  });
});

export default router;
