// server/routers/inn.js
import express from "express";
import multer from "multer";
import xlsx from "xlsx";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

// 📂 Config Multer: guardamos en /uploads de la raíz del proyecto
const upload = multer({ dest: path.join(process.cwd(), "uploads") });

// === Versión específica de la app Inn ===
const INN_VERSION = "Beta v0.5.0";

export default function createInnRouter(apiKey) {
  const router = express.Router();
  let client = null;

  if (apiKey) {
    client = new OpenAI({ apiKey });
    console.log("✅ OpenAI client inicializado para Inn");
  } else {
    console.warn("⚠️ No se pasó OPENAI_API_KEY a InnRouter");
  }

  // 📌 Endpoint de versión
  router.get("/version", (req, res) => {
    res.json({ version: INN_VERSION });
  });

  // 📌 Servir los HTML de la app Inn

  router.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "apps", "inn", "index.html"));
  });

  router.get("/ai-dock", (req, res) => {
    res.sendFile(path.join(process.cwd(), "apps", "inn", "ai-dock.html"));
  });

  router.get("/data-dock", (req, res) => {
    res.sendFile(path.join(process.cwd(), "apps", "inn", "data-dock.html"));
  });

  // 📂 Prompts
  router.get("/prompts", (req, res) => {
    const promptsDir = path.join(process.cwd(), "apps", "inn", "prompts");
    if (!fs.existsSync(promptsDir)) return res.json([]);
    const files = fs.readdirSync(promptsDir).filter(f => f.endsWith(".js"));
    res.json(files);
  });

  router.get("/prompts/:name", (req, res) => {
    const filePath = path.join(process.cwd(), "apps", "inn", "prompts", req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Prompt no encontrado.");
    }
    const content = fs.readFileSync(filePath, "utf8");
    res.json({ name: req.params.name, content });
  });

  router.post("/prompts/:name", (req, res) => {
    const filePath = path.join(process.cwd(), "apps", "inn", "prompts", req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Prompt no encontrado.");
    }
    fs.writeFileSync(filePath, req.body.content, "utf8");
    res.json({ success: true, message: `Prompt ${req.params.name} actualizado` });
  });

  // 📂 Procesar Excel → aplicar prompt seleccionado
  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      console.log("📩 /upload llamado");
      console.log("👉 req.file:", req.file);
      console.log("👉 req.body:", req.body);

      if (!client) {
        return res.status(500).send("❌ OpenAI API no está configurada.");
      }

      if (!req.file) {
        return res.status(400).send("❌ No se recibió ningún archivo.");
      }

      const selectedPrompt = req.body.prompt;
      if (!selectedPrompt) {
        return res.status(400).send("❌ Debes seleccionar un prompt antes de procesar el archivo.");
      }

      const filePath = path.join(process.cwd(), "apps", "inn", "prompts", selectedPrompt);
      const promptModule = await import(pathToFileURL(filePath).href);
      const activePrompt = promptModule.default;
      if (!activePrompt) {
        throw new Error(`El prompt ${selectedPrompt} no tiene un export default válido`);
      }

      console.log("👉 Excel recibido:", req.file.originalname);
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const worksheet = xlsx.utils.sheet_to_json(sheet, { defval: "" });

      console.log("👉 Número de filas en Excel:", worksheet.length);

      for (let row of worksheet) {
        for (let target of activePrompt.targetColumns) {
          const input = activePrompt.getInput(row, target);
          const prompt = activePrompt.buildPrompt(input);

          const response = await client.chat.completions.create({
            model: activePrompt.model || "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
          });

          row[target] = response.choices[0].message.content.trim();
        }
      }

      req.app.locals.lastData = worksheet;
      req.app.locals.outputFilename = req.file.originalname.replace(/\.xlsx$/, "_output.xlsx");

      res.json({ data: worksheet, filename: req.app.locals.outputFilename });
    } catch (err) {
      console.error("❌ Error en /upload:", err);
      res.status(500).send("Error procesando el archivo.");
    }
  });

  // 📂 Descargar Excel
  router.get("/download", (req, res) => {
    try {
      const data = req.app.locals.lastData;
      const filename = req.app.locals.outputFilename || "result_output.xlsx";

      if (!data) return res.status(400).send("No hay datos procesados.");

      const newSheet = xlsx.utils.json_to_sheet(data);
      const newWorkbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(newWorkbook, newSheet, "Result");

      const outputPath = path.join(process.cwd(), "uploads", filename);
      xlsx.writeFile(newWorkbook, outputPath);

      res.download(outputPath, filename);
    } catch (err) {
      console.error("❌ Error en /download:", err);
      res.status(500).send("Error generando la descarga.");
    }
  });

  return router;
}
