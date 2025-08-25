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

// 🚀 Versión de la app
const APP_VERSION = "v0.2.0";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static("public"));

// Endpoint de versión
app.get("/version", (req, res) => {
  res.json({ version: APP_VERSION });
});

// Procesar Excel → devolver JSON con datos procesados
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
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
          });

          row[summaryKey] = response.choices[0].message.content.trim();
        }
      }
    }

    // Guardamos datos procesados en memoria de sesión (simulación rápida)
    req.app.locals.lastData = worksheet;
    req.app.locals.outputFilename = outputFilename;

    // Devolvemos JSON al navegador
    res.json({ data: worksheet, filename: outputFilename });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error procesando el archivo.");
  }
});

// Descargar Excel solo cuando el usuario pulse el botón
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
