// server/routers/inn/data-dock.js
import express from "express";
import path from "path";
import fs from "fs/promises";

export default function createDataDockRouter() {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "apps", "inn", "data-dock.html"));
  });

  // 🔸 Guardar cambios: escribe en el JSON indicado por ?target=/data/xxx.json
  router.post("/save", express.json({ limit: "50mb" }), async (req, res) => {
    try {
      const target = String(req.query.target || "");

      // Validaciones de seguridad (solo permitimos escribir en /public/data/*.json)
      // Normaliza la ruta (POSIX) y fuerza prefijo /data/
      const normalized = target.replace(/\\/g, "/");
      if (!normalized.startsWith("/data/")) {
        return res.status(400).send("Missing or invalid 'target' (must start with /data/)");
      }

      const filename = path.posix.basename(normalized);
      if (!/^[\w.-]+\.json$/.test(filename)) {
        return res.status(400).send("Invalid filename");
      }

      const outPath = path.join(process.cwd(), "public", "data", filename);

      const body = req.body;
      if (!body || typeof body !== "object") {
        return res.status(400).send("Invalid JSON payload");
      }

      await fs.writeFile(outPath, JSON.stringify(body, null, 2), "utf8");
      res.json({ ok: true, file: filename });
    } catch (err) {
      console.error("Save error:", err);
      res.status(500).send("Error writing file");
    }
  });

  return router;
}
