import express from "express";
import multer from "multer";
import xlsx from "xlsx";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const port = 3000;

// 🚀 Versión de la app
const APP_VERSION = "v0.3.2";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static("public"));
app.use(express.json());

// Endpoint de versión
app.get("/version", (req, res) => {
  res.json({ version: APP_VERSION });
});

// 📂 Listar archivos de prompts
app.get("/prompts", (req, res) => {
  const promptsDir = path.join(process.cwd(), "prompts");
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith(".js"));
  res.json(files);
});

// 📂 Leer contenido de un prompt
app.get("/prompts/:name", (req, res) => {
  const filePath = path.join(process.cwd(), "prompts", req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Prompt no encontrado.");
  }
  const content = fs.readFileSync(filePath, "utf8");
  res.json({ name: req.params.name, content });
});

// 📂 Guardar cambios en un prompt
app.post("/prompts/:name", (req, res) => {
  const filePath = path.join(process.cwd(), "prompts", req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Prompt no encontrado.");
  }
  fs.writeFileSync(filePath, req.body.content, "utf8");
  res.json({ success: true, message: `Prompt ${req.params.name} actualizado` });
});

// Procesar Excel → aplicar prompt seleccionado
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const selectedPrompt = req.body.prompt || "prompt_summary.js";
    const promptModule = await import(`./prompts/${selectedPrompt}`);
    const activePrompt = promptModule.default;

    const originalFilename = req.file.originalname;
    let outputFilename = originalFilename.includes("input")
      ? originalFilename.replace("input", "output")
      : originalFilename.replace(/\.xlsx$/, "") + "_output.xlsx";

    // Leer Excel original
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const worksheet = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    // Procesar cada fila según el prompt activo
    for (let row of worksheet) {
      for (let target of activePrompt.targetColumns) {
        // 👉 cada prompt define cómo obtener sus inputs
        const { question, optionText, topic } = activePrompt.getInput(row, target);

        const prompt = activePrompt.buildPrompt(question, optionText, topic);
        const response = await client.chat.completions.create({
          model: activePrompt.model || "gpt-4o",
          messages: [{ role: "user", content: prompt }]
        });

        row[target] = response.choices[0].message.content.trim();
      }
    }

    // Guardar en memoria temporal
    req.app.locals.lastData = worksheet;
    req.app.locals.outputFilename = outputFilename;

    // Devolver JSON al frontend
    res.json({ data: worksheet, filename: outputFilename });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error procesando el archivo.");
  }
});

// Descargar Excel
app.get("/download", (req, res) => {
  try {
    const data = req.app.locals.lastData;
    const filename = req.app.locals.outputFilename || "result_output.xlsx";

    if (!data) {
      return res.status(400).send("No hay datos procesados.");
    }

    const newSheet = xlsx.utils.json_to_sheet(data);
    const newWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWorkbook, newSheet, "Result");
    const outputPath = "uploads/" + filename;
    xlsx.writeFile(newWorkbook, outputPath);

    res.download(outputPath, filename);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generando la descarga.");
  }
});

app.listen(port, () => {
  console.log(`🚀 SailUp Inn ${APP_VERSION} running at http://localhost:${port}`);
});
