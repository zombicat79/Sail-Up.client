import express from "express";
import multer from "multer";
import xlsx from "xlsx";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import { buildPrompt } from "./prompt.js";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const port = 3000;

// 🚀 Versión de la app (incrementada)
const APP_VERSION = "v0.1.0";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static("public"));

// Endpoint para que el frontend muestre la versión
app.get("/version", (req, res) => {
  res.json({ version: APP_VERSION });
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    // Leer Excel original
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const worksheet = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    // Procesar cada fila
    for (let row of worksheet) {
      const question = row["Question"] || "";

      // Para cada opción (1–4)
      for (let i = 1; i <= 4; i++) {
        const optionKey = `Option${i}_text`;
        const summaryKey = `Summary${i}`;
        const optionText = row[optionKey] || "";

        if (optionText && !row[summaryKey]) {
          const prompt = buildPrompt(question, optionText, row["Topic"]);

          const response = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
          });

          row[summaryKey] = response.choices[0].message.content.trim();
        }
      }
    }

    // Crear nuevo Excel con todas las columnas originales
    const newSheet = xlsx.utils.json_to_sheet(worksheet);
    const newWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWorkbook, newSheet, "Result");
    const outputPath = "uploads/result.xlsx";
    xlsx.writeFile(newWorkbook, outputPath);

    res.download(outputPath, "result.xlsx");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error procesando el archivo.");
  }
});

app.listen(port, () => {
  console.log(`🚀 App ${APP_VERSION} running at http://localhost:${port}`);
});
