// server/routers/inn/ai-dock.js
import express from "express";
import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import { pathToFileURL } from "url";

import { upload, KB, truncate } from "./common.js";
import { retrieveTopK } from "../../apps/inn/js/ai-dock-kb.js";

export default function createAiDockRouter(openai) {
  const router = express.Router();

  if (!openai) {
    console.warn("⚠️ OpenAI client no disponible (AI Dock). Las rutas que lo usan devolverán 500.");
  }

  /* =========================
     UI
     ========================= */
  router.get("/", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "apps", "inn", "ai-dock.html"));
  });

  /* =========================
     Prompts CRUD
     ========================= */
  router.get("/prompts", (_req, res) => {
    const promptsDir = path.join(process.cwd(), "apps", "inn", "prompts");
    if (!fs.existsSync(promptsDir)) return res.json([]);
    const files = fs.readdirSync(promptsDir).filter(f => f.endsWith(".js"));
    res.json(files);
  });

  router.get("/prompts/:name", (req, res) => {
    const filePath = path.join(process.cwd(), "apps", "inn", "prompts", req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).send("Prompt no encontrado.");
    const content = fs.readFileSync(filePath, "utf8");
    res.json({ name: req.params.name, content });
  });

  router.post("/prompts/:name", (req, res) => {
    const filePath = path.join(process.cwd(), "apps", "inn", "prompts", req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).send("Prompt no encontrado.");
    fs.writeFileSync(filePath, req.body.content, "utf8");
    res.json({ success: true, message: `Prompt ${req.params.name} actualizado` });
  });

  /* =========================
     Procesar Excel con prompt seleccionado
     ========================= */
  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      if (!openai) return res.status(500).send("❌ OpenAI API no está configurada.");
      if (!req.file) return res.status(400).send("❌ No se recibió ningún archivo.");

      const selectedPrompt = req.body.prompt;
      if (!selectedPrompt) {
        return res.status(400).send("❌ Debes seleccionar un prompt antes de procesar el archivo.");
      }

      const filePath = path.join(process.cwd(), "apps", "inn", "prompts", selectedPrompt);
      const promptModule = await import(pathToFileURL(filePath).href);
      const activePrompt = promptModule.default;
      if (!activePrompt) throw new Error(`El prompt ${selectedPrompt} no tiene un export default válido`);

      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const worksheet = xlsx.utils.sheet_to_json(sheet, { defval: "" });

      console.log(`📄 ${req.file.originalname} · filas: ${worksheet.length} · prompt: ${activePrompt.name} (${activePrompt.version})`);

      // Defaults deterministas
      const defaultParams = {
        temperature: 0,
        top_p: 1,
        max_tokens: 100
      };

      for (let rIndex = 0; rIndex < worksheet.length; rIndex++) {
        const row = worksheet[rIndex];

        for (const target of activePrompt.targetColumns) {
          try {
            // 1) Input por celda
            const input =
              activePrompt.getInput?.length >= 3
                ? activePrompt.getInput(row, target, rIndex)
                : activePrompt.getInput(row, target);

            // 2) Construir request
            let request = null;
            let using = null;

            if (typeof activePrompt.buildRequest === "function") {
              request = activePrompt.buildRequest(input);
              using = "buildRequest";
            } else if (typeof activePrompt.buildPrompt === "function") {
              const promptStr = activePrompt.buildPrompt(input);
              if (promptStr != null && String(promptStr).trim() !== "") {
                request = { messages: [{ role: "user", content: String(promptStr) }] };
              }
              using = "buildPrompt";
            }

            // 3) Si el prompt decide NO procesar
            if (!request) {
              row[target] = "";
              if (rIndex < 3) {
                console.log(`⏭️  [${rIndex}:${target}] ${using} → request=null (celda vacía)`);
              }
              continue;
            }

            // === 🔎 Recuperación de contexto desde KB (agnóstico, por opción actual) ===
            try {
              if (KB?.passages?.length) {
                const optionNow = input?.optionText || ""; // consulta principal
                const auxQuery = [row.Topic, row.Subdomain, row.Domain, row.Question]
                  .filter(Boolean).join(" ");

                const hits = retrieveTopK(
                  KB.passages,
                  optionNow,     // centrado en la definición de la opción actual
                  [auxQuery],    // ayuda a desempatar
                  4              // K=4; ajusta según tamaño de KB
                );

                const context = hits.map((h, idx) =>
                  `[#${idx + 1}] ${h.headingTrail.join(" > ")}\n${h.text}`
                ).join("\n\n");

                if (context) {
                  const ctxMsgs = [
                    { role: "system", content: "Use the Context below as primary source. If it doesn't cover the answer, be conservative and do not invent specifics." },
                    { role: "user", content: `Context:\n${context}` },
                  ];
                  if (Array.isArray(request.messages)) {
                    request.messages = [...ctxMsgs, ...request.messages];
                  } else {
                    request.messages = ctxMsgs;
                  }
                  if (rIndex < 3) {
                    console.log(`   KB hits: ${hits.length}`);
                    console.log("   KB top:", (hits[0]?.headingTrail || []).join(" > "), "—", (hits[0]?.text || "").slice(0, 120));
                  }
                } else if (rIndex < 3) {
                  console.log("   KB Context vacío ⚠️ (0 coincidencias o KB vacía)");
                }
              }
            } catch (ctxErr) {
              console.warn("KB retrieve warning:", ctxErr?.message);
            }
            // === fin inyección KB ===

            // 4) LOGS de depuración
            if (rIndex < 3) {
              console.log(`▶️  Procesando celda ${rIndex}:${target}`);
              console.log("   Input:", {
                summaryIndex: input?.summaryIndex,
                type: input?.type,
                topic: truncate(input?.topic, 120),
                question: truncate(input?.question, 120),
                optionText: truncate(input?.optionText, 120)
              });
              if (request.messages) {
                console.log("   Mensajes →");
                request.messages.forEach((m, k) => {
                  console.log(`     [${k}] ${m.role}: ${truncate(m.content, 400)}`);
                });
              } else {
                console.log("   Request sin messages:", request);
              }
            }

            // 5) Llamada a OpenAI (cliente inyectado)
            const params = {
              model: activePrompt.model || "gpt-4o-mini",
              messages: request.messages || [],
              temperature: activePrompt.params?.temperature ?? defaultParams.temperature,
              top_p: activePrompt.params?.top_p ?? defaultParams.top_p,
              max_tokens: activePrompt.params?.max_tokens ?? defaultParams.max_tokens,
              ...request,
            };
            delete params.messages?.messages;

            const response = await openai.chat.completions.create(params);
            let output = response.choices?.[0]?.message?.content ?? "";

            // 6) postProcess opcional
            if (typeof activePrompt.postProcess === "function") {
              output = activePrompt.postProcess(output, input, target);
            }

            row[target] = String(output).trim();
          } catch (cellErr) {
            console.error(`❌ Error procesando celda [fila ${rIndex}, ${target}]:`, cellErr?.message || cellErr);
            row[target] = "";
          }
        }
      }

      req.app.locals.lastData = worksheet;
      req.app.locals.outputFilename = req.file.originalname.replace(/\.xlsx$/, "_output.xlsx");
      res.json({ data: worksheet, filename: req.app.locals.outputFilename });
    } catch (err) {
      console.error("❌ Error en /inn/ai-dock/upload:", err);
      res.status(500).send("Error procesando el archivo.");
    }
  });

  /* =========================
     Descargar Excel
     ========================= */
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
      console.error("❌ Error en /inn/ai-dock/download:", err);
      res.status(500).send("Error generando la descarga.");
    }
  });

  /* =========================
     Test de KB (opcional)
     ========================= */
  router.get("/kb-test", (req, res) => {
    try {
      const q = String(req.query.q || "bita");
      if (!KB?.passages?.length) return res.status(500).json({ ok: false, error: "KB no cargada" });
      const hits = retrieveTopK(KB.passages, q, [], 2);
      res.json({ ok: true, q, hits: hits.map(h => ({ trail: h.headingTrail, text: h.text })) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
}
