import express from "express";
import multer from "multer";
import xlsx from "xlsx";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { buildPrompt } from "./prompts/prompt_summary.js"; // prompt principal

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const port = 3000;

// 🚀 Versión de la app
const APP_VERSION = "v0.3.1";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static("public"));
app.use(express.json()); // Para manejar JSON en POST

// Endpoint de versión
app.get("/version", (req, res) => {
  res.json({ version: APP_VERSION });
});

// 📂 Listar archivos en carpeta prompts
app.get("/prompts", (req, res) => {
  const promptsDir = path.join(process.cwd(), "prompts");
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith(".js") || f.endsWith(".txt"));
  res.json(files);
});

// 📂 Leer archivo de prompt
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

// Procesar Excel → devolver JSON
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const originalFilename = req.file.originalname;
    let outputFilename = "";

    if (originalFilename.includes("input")) {
      outputFilename = originalFilename.replace("input", "output");
    } else {
      outputFilename = originalFilename.replace(/\.xlsx$/, "") + "_output.xlsx";
    }

    // Leer Excel original
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const worksheet = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    // Procesar cada fila
    for (let row of worksheet) {
      const question = row["Question"] || "";

      for (let i = 1; i <= 4; i++) {
        const optionKey = `Option${i}_text`;
        const summaryKey = `Summary${i}`;
        const optionText = row[optionKey] || "";

        if (optionText && !row[summaryKey]) {
          const prompt = buildPrompt(question, optionText, row["Topic"]);

          const response = await client.chat.completions.create({
            model: "gpt-4o", // 👉 cambiamos a gpt-4o
            messages: [{ role: "user", content: prompt }]
          });

          row[summaryKey] = response.choices[0].message.content.trim();
        }
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
  console.log(`🚀 App ${APP_VERSION} running at http://localhost:${port}`);
});
