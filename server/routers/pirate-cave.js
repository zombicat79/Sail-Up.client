// server/routers/pirate-cave.js
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { extractStructuredFromPdf } from "../../apps/inn/js/pirate-cave-extract.js";

const upload = multer({ dest: path.join(process.cwd(), "uploads") });

export default function createPirateCaveRouter() {
  const router = express.Router();

  // UI (vista de Pirate Cave)
  router.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "apps", "inn", "pirate-cave.html"));
  });

  // Importar PDF → JSON
  router.post("/pdf", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).send("No file uploaded.");

      // ⬇️ Cambio clave: Buffer → Uint8Array antes de pasar a pdfjs
      const buf = fs.readFileSync(req.file.path);
      const data = new Uint8Array(buf);
      const tree = await extractStructuredFromPdf(data);

      const outName = req.file.originalname.replace(/\.(pdf|PDF)$/, "_structured.json");
      const outPath = path.join(process.cwd(), "uploads", outName);
      fs.writeFileSync(outPath, JSON.stringify(tree, null, 2), "utf8");

      res.json({ ok: true, filename: outName, items: Array.isArray(tree) ? tree.length : 0 });
    } catch (err) {
      console.error("Pirate Cave importer error:", err);
      res.status(500).send("Importer failed.");
    }
  });

  // Descargar JSON generado
  router.get("/download/:filename", (req, res) => {
    const outPath = path.join(process.cwd(), "uploads", req.params.filename);
    if (!fs.existsSync(outPath)) return res.status(404).send("File not found.");
    res.download(outPath);
  });

  return router;
}
