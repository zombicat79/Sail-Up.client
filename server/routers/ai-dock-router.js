// server/routers/ai-dock-router.js
import express from "express";
import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import { pathToFileURL } from "url";

import { upload, KB } from "./common.js";
import { retrieveTopK } from "../../apps/inn/js/ai-dock-kb.js";

// Esquema de validación centralizado
const schemaPath = path.join(process.cwd(), "apps", "inn", "js", "ai-dock-excel-schema.js");
let SCHEMA = null;
try {
  const mod = await import(pathToFileURL(schemaPath).href);
  SCHEMA = mod.default;
} catch (e) {
  console.warn("⚠️ No se cargó el esquema SailUp:", e?.message);
}

function normalizeHeader(h) {
  return String(h || "").trim();
}

function validateWorkbook(workbook) {
  const errs = [];
  const warn = [];
  const info = [];

  if (!SCHEMA) {
    errs.push("No se pudo cargar el esquema SailUp.");
    return { ok: false, errs, warn, info };
  }

  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) {
    errs.push("El Excel no contiene hojas.");
    return { ok: false, errs, warn, info };
  }

  const requiredSheet = SCHEMA.requiredSheets || [];
  if (requiredSheet.length) {
    requiredSheet.forEach((r) => {
      if (!sheetNames.includes(r)) {
        errs.push(`Falta la hoja requerida: "${r}"`);
      }
    });
  }

  const perSheetRules = SCHEMA.perSheet || {};
  const defaultRule = SCHEMA.defaultSheetRule || null;

  sheetNames.forEach((sn) => {
    const sheet = workbook.Sheets[sn];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) {
      warn.push(`Hoja "${sn}" vacía.`);
      return;
    }
    const headers = Object.keys(rows[0]).map(normalizeHeader);

    const rule = perSheetRules[sn] || defaultRule;
    if (!rule) {
      warn.push(`Hoja "${sn}" no tiene regla de validación específica. Se permitirá el paso.`);
      return;
    }

    const requiredCols = (rule.requiredColumns || []).map(normalizeHeader);
    const atLeastOneOfGroups = rule.atLeastOneOfGroups || [];

    requiredCols.forEach((col) => {
      if (!headers.includes(col)) {
        errs.push(`Hoja "${sn}" → falta columna requerida "${col}"`);
      }
    });

    atLeastOneOfGroups.forEach((group) => {
      const hasOne = group.some((g) => headers.includes(normalizeHeader(g)));
      if (!hasOne) {
        errs.push(`Hoja "${sn}" → falta al menos una de estas columnas: ${group.join(" | ")}`);
      }
    });

    const missing = requiredCols.filter((c) => !headers.includes(c));
    if (!missing.length) {
      info.push(`Hoja "${sn}" OK · ${headers.length} columnas`);
    }
  });

  return { ok: errs.length === 0, errs, warn, info };
}

/* =========================
   Helpers de expansión de filas
   ========================= */

// Clon profundo simple para filas JSON
function deepCloneRow(row) {
  return JSON.parse(JSON.stringify(row || {}));
}

/**
 * Expansión clásica (no condicionada)
 */
function expandRowsForSheet(rows, sheetName, expandCfg) {
  try {
    if (!expandCfg) return rows;
    const {
      desiredNewPerGroup = 0,
      groupKey,
      isBlankRow,
      clearColumns = [],
      cloneStrategy,
    } = expandCfg || {};

    if (!desiredNewPerGroup || typeof groupKey !== "function" || typeof isBlankRow !== "function") {
      return rows;
    }

    // Agrupar por clave
    const groups = new Map(); // key -> { indices:[], rows:[], lastIndex, blankCount }
    rows.forEach((row, idx) => {
      const key = groupKey(row, sheetName);
      if (!key) return;
      let g = groups.get(key);
      if (!g) { g = { indices: [], rows: [], lastIndex: -1, blankCount: 0 }; groups.set(key, g); }
      g.indices.push(idx);
      g.rows.push(row);
      if (idx > g.lastIndex) g.lastIndex = idx;
      if (isBlankRow(row)) g.blankCount++;
    });

    if (groups.size === 0) return rows;

    // Insertar de izquierda a derecha para no romper índices
    const sortedGroups = Array.from(groups.entries()).sort((a,b) => a[1].lastIndex - b[1].lastIndex);

    let offset = 0;
    for (const [, g] of sortedGroups) {
      const needed = Math.max(0, desiredNewPerGroup - g.blankCount);
      if (needed === 0) continue;

      const baseRow = cloneStrategy ? cloneStrategy(g.rows) : (g.rows[g.rows.length - 1] || {});
      let insertPos = g.lastIndex + 1 + offset;

      for (let i = 0; i < needed; i++) {
        const clone = deepCloneRow(baseRow);
        for (const col of (expandCfg.clearColumns || [])) {
          if (Object.prototype.hasOwnProperty.call(clone, col)) clone[col] = "";
        }
        rows.splice(insertPos, 0, clone);
        insertPos++;
        offset++;
      }
    }
    return rows;
  } catch (e) {
    console.warn("expandRowsForSheet warning:", e?.message || e);
    return rows;
  }
}

/**
 * Expansión condicionada por banco histórico:
 *  - Si existingCountByKey[key] > 0  → NO crear clones para ese grupo
 *  - Si existingCountByKey[key] = 0  → crear clones hasta desiredNewPerGroup
 */
function expandRowsForSheetWithExisting(rows, sheetName, expandCfg, existingCountByKey) {
  try {
    if (!expandCfg) return rows;
    const {
      desiredNewPerGroup = 0,
      groupKey,
      isBlankRow,
      clearColumns = [],
      cloneStrategy,
    } = expandCfg || {};

    if (!desiredNewPerGroup || typeof groupKey !== "function" || typeof isBlankRow !== "function") {
      return rows;
    }

    const groups = new Map(); // key -> { indices:[], rows:[], lastIndex, blankCount }
    rows.forEach((row, idx) => {
      const key = groupKey(row, sheetName);
      if (!key) return;
      let g = groups.get(key);
      if (!g) { g = { indices: [], rows: [], lastIndex: -1, blankCount: 0 }; groups.set(key, g); }
      g.indices.push(idx);
      g.rows.push(row);
      if (idx > g.lastIndex) g.lastIndex = idx;
      if (isBlankRow(row)) g.blankCount++;
    });

    if (groups.size === 0) return rows;

    const sortedGroups = Array.from(groups.entries()).sort((a,b) => a[1].lastIndex - b[1].lastIndex);

    let offset = 0;
    for (const [key, g] of sortedGroups) {
      const existing = existingCountByKey.get(key) || 0;
      // Si ya hay preguntas previas en el grupo → no crear clones
      if (existing > 0) continue;

      const needed = Math.max(0, desiredNewPerGroup - g.blankCount);
      if (needed === 0) continue;

      const baseRow = cloneStrategy ? cloneStrategy(g.rows) : (g.rows[g.rows.length - 1] || {});
      let insertPos = g.lastIndex + 1 + offset;

      for (let i = 0; i < needed; i++) {
        const clone = deepCloneRow(baseRow);
        for (const col of clearColumns) {
          if (Object.prototype.hasOwnProperty.call(clone, col)) clone[col] = "";
        }
        rows.splice(insertPos, 0, clone);
        insertPos++;
        offset++;
      }
    }
    return rows;
  } catch (e) {
    console.warn("expandRowsForSheetWithExisting warning:", e?.message || e);
    return rows;
  }
}

export default function createAiDockRouter(openai) {
  const router = express.Router();

  if (!openai) {
    console.warn("⚠️ OpenAI client no disponible (AI Dock). Las rutas que lo usan devolverán 500.");
  }

  /* =========================
     Assets estáticos (JS/CSS del front)
     ========================= */
  router.use("/js",  express.static(path.join(process.cwd(), "apps", "inn", "js")));

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

  // Crear prompt nuevo
  router.post("/prompts", express.json(), (req, res) => {
    try {
      const { name, content } = req.body || {};
      if (!name || !name.endsWith(".js")) return res.status(400).send("Nombre inválido. Debe terminar en .js");
      if (!content || !String(content).trim()) return res.status(400).send("Contenido vacío.");

      const promptsDir = path.join(process.cwd(), "apps", "inn", "prompts");
      if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });

      const filePath = path.join(promptsDir, name);
      if (fs.existsSync(filePath)) return res.status(409).send("Ya existe un prompt con ese nombre.");

      fs.writeFileSync(filePath, content, "utf8");
      res.json({ ok: true, message: `Prompt ${name} creado` });
    } catch (e) {
      console.error("❌ Error creando prompt:", e);
      res.status(500).send("Error creando prompt.");
    }
  });

  // Actualizar prompt existente
  router.post("/prompts/:name", express.json(), (req, res) => {
    const filePath = path.join(process.cwd(), "apps", "inn", "prompts", req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).send("Prompt no encontrado.");
    fs.writeFileSync(filePath, req.body.content, "utf8");
    res.json({ success: true, message: `Prompt ${req.params.name} actualizado` });
  });

  // Servir plantilla de prompt
  router.get("/prompts-template", (_req, res) => {
    const p = path.join(process.cwd(), "apps", "inn", "prompts", "_TEMPLATE.js");
    if (!fs.existsSync(p)) return res.status(404).send("// Plantilla no encontrada");
    res.type("application/javascript").send(fs.readFileSync(p, "utf8"));
  });

  /* =========================
     Validación de Excel
     ========================= */
  router.post("/validate", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).send("No se recibió archivo.");
      const workbook = xlsx.readFile(req.file.path, { cellDates: false });
      const result = validateWorkbook(workbook);
      res.json(result);
    } catch (e) {
      console.error("❌ Error en validación:", e);
      res.status(500).send("Error validando el archivo.");
    }
  });

  /* =========================
     Procesar Excel con prompt seleccionado (multi-hoja)
     ========================= */
  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      if (!openai) return res.status(500).send("❌ OpenAI API no está configurada.");
      if (!req.file) return res.status(400).send("❌ No se recibió ningún archivo.");

      const selectedPrompt = req.body.prompt;
      if (!selectedPrompt) {
        return res.status(400).send("❌ Debes seleccionar un prompt antes de procesar el archivo.");
      }

      const workbook = xlsx.readFile(req.file.path, { cellDates: false });
      const validation = validateWorkbook(workbook);
      if (!validation.ok) {
        return res.status(400).json(validation);
      }

      // Cache-busting por mtime del prompt
      const filePath = path.join(process.cwd(), "apps", "inn", "prompts", selectedPrompt);
      const stat = fs.statSync(filePath);
      const fileUrl = pathToFileURL(filePath).href + `?v=${stat.mtimeMs}`;
      const promptModule = await import(fileUrl);
      const activePrompt = promptModule.default;
      if (!activePrompt) throw new Error(`El prompt ${selectedPrompt} no tiene un export default válido`);

      const defaultParams = { temperature: 0, top_p: 1, max_tokens: 100 };
      const model = activePrompt.model || "gpt-4o-mini";

      const allSheets = workbook.SheetNames || [];
      let targetSheetNames = allSheets;
      if (activePrompt.excel?.filterSheets) {
        try {
          const filtered = activePrompt.excel.filterSheets(allSheets);
          if (Array.isArray(filtered) && filtered.length) targetSheetNames = filtered;
        } catch (e) {
          console.warn("filterSheets error:", e?.message);
        }
      }

      const processedSheets = {};

      for (const sheetName of targetSheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        // --- 1) Leer filas crudas
        let rowsRaw = xlsx.utils.sheet_to_json(sheet, { defval: "" });
        if (!rowsRaw.length) {
          processedSheets[sheetName] = rowsRaw;
          continue;
        }

        // --- 2) Banco histórico PRE-expansión (agnóstico)
        let bankMapRaw = null; // Map<string, string[]>
        try {
          const gkf = activePrompt.excel?.groupKeyForDedupe;
          if (typeof gkf === "function") {
            if (typeof activePrompt.excel.buildDedupeBank === "function") {
              bankMapRaw = activePrompt.excel.buildDedupeBank(rowsRaw, sheetName) || null;
            } else {
              const firstRow = rowsRaw[0] || {};
              const keys = Object.keys(firstRow);
              const qKeys = keys.filter(k => String(k).trim().toLowerCase() === "question");
              if (qKeys.length) {
                bankMapRaw = new Map();
                for (const r of rowsRaw) {
                  const key = gkf(r, sheetName);
                  if (!key) continue;
                  // primer valor no vacío entre todas las posibles columnas "question"
                  let q = "";
                  for (const qk of qKeys) {
                    const v = String(r[qk] ?? "").trim();
                    if (v) { q = v; break; }
                  }
                  if (!q) continue;
                  if (!bankMapRaw.has(key)) bankMapRaw.set(key, []);
                  bankMapRaw.get(key).push(q);
                }
              }
            }
          }
        } catch (e) {
          console.warn(`dedupe bank (raw) warning [${sheetName}]:`, e?.message);
        }

        // --- 3) EXPANSIÓN condicionada (si procede)
        const expandCfg = activePrompt.excel?.expandRows;
        const onlyWhenNoExisting = activePrompt.settings?.ONLY_WHEN_NO_EXISTING === true;
        let rows = rowsRaw;

        if (expandCfg) {
          if (onlyWhenNoExisting && bankMapRaw) {
            // Construye mapa de conteos por key
            const existingCountByKey = new Map();
            for (const [k, arr] of bankMapRaw.entries()) {
              existingCountByKey.set(k, (arr || []).length);
            }
            const before = rows.length;
            rows = expandRowsForSheetWithExisting(rows, sheetName, expandCfg, existingCountByKey);
            const after = rows.length;
            if (after !== before) {
              console.log(`   ↕️ expandRows[${sheetName}] (condicional): ${before} → ${after} ( +${after - before} )`);
            }
          } else {
            // Expansión clásica
            const before = rows.length;
            rows = expandRowsForSheet(rows, sheetName, expandCfg);
            const after = rows.length;
            if (after !== before) {
              console.log(`   ↕️ expandRows[${sheetName}]: ${before} → ${after} ( +${after - before} )`);
            }
          }
        }

        // --- 4) targetColumns
        let targetColumns = activePrompt.targetColumns;
        if (typeof targetColumns === "function") {
          targetColumns = targetColumns(sheetName) || [];
        }
        if (!Array.isArray(targetColumns) || !targetColumns.length) {
          processedSheets[sheetName] = rows;
          continue;
        }

        console.log(`📄 ${req.file.originalname} · hoja: ${sheetName} · filas: ${rows.length} · prompt: ${activePrompt.name} (${activePrompt.version})`);

        // --- 5) Procesar filas (usando banco PRE-expansión para enforcement)
        for (let rIndex = 0; rIndex < rows.length; rIndex++) {
          const row = rows[rIndex];

          for (const target of targetColumns) {
            try {
              const getInputArity = activePrompt.getInput?.length ?? 0;

              // Resolver banco existente para ESTA fila (desde bankMapRaw PRE-expansión)
              let existingForRow = [];
              try {
                const gkf = activePrompt.excel?.groupKeyForDedupe;
                if (bankMapRaw && typeof gkf === "function") {
                  const k = gkf(row, sheetName);
                  if (k && bankMapRaw.has(k)) existingForRow = bankMapRaw.get(k);
                }
              } catch {}

              // 🔒 Enforcement agnóstico: si el prompt lo pide y el grupo ya tiene preguntas, NO generamos 'question'
              if (onlyWhenNoExisting && target === "question" && existingForRow.length > 0) {
                if (rIndex < 3) {
                  console.log(`⏭️  [${sheetName}:${rIndex}:${target}] skipped (ONLY_WHEN_NO_EXISTING + existing=${existingForRow.length})`);
                }
                row[target] = row[target] ?? "";
                continue;
              }

              const input =
                getInputArity >= 5
                  ? activePrompt.getInput(row, target, rIndex, sheetName, existingForRow)
                  : getInputArity >= 4
                    ? activePrompt.getInput(row, target, rIndex, sheetName)
                    : getInputArity >= 3
                      ? activePrompt.getInput(row, target, rIndex)
                      : activePrompt.getInput(row, target);

              let request = null;
              let using = null;

              if (typeof activePrompt.buildRequest === "function") {
                request = activePrompt.buildRequest(input, { sheetName, rowIndex: rIndex, column: target });
                using = "buildRequest";
              } else if (typeof activePrompt.buildPrompt === "function") {
                const promptStr = activePrompt.buildPrompt(input, { sheetName, rowIndex: rIndex, column: target });
                if (promptStr != null && String(promptStr).trim() !== "") {
                  request = { messages: [{ role: "user", content: String(promptStr) }] };
                }
                using = "buildPrompt";
              }

              if (!request) {
                row[target] = row[target] ?? "";
                if (rIndex < 3) {
                  console.log(`⏭️  [${sheetName}:${rIndex}:${target}] ${using} → request=null (celda sin cambios)`);
                }
                continue;
              }

              // === 🔎 Recuperación de contexto desde KB (opcional) ===
              try {
                if (KB?.passages?.length) {
                  const optionNow = input?.optionText || "";
                  const auxQuery = [row.topic, row.subdomain, input?.sheetName, row.question]
                    .filter(Boolean).join(" ");

                  const hits = retrieveTopK(KB.passages, optionNow, [auxQuery], 4);

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
                  }
                }
              } catch (ctxErr) {
                console.warn("KB retrieve warning:", ctxErr?.message);
              }
              // === fin KB ===

              // 6) Llamada a OpenAI
              const params = {
                model,
                messages: request.messages || [],
                temperature: activePrompt.params?.temperature ?? defaultParams.temperature,
                top_p: activePrompt.params?.top_p ?? defaultParams.top_p,
                max_tokens: activePrompt.params?.max_tokens ?? defaultParams.max_tokens,
                ...request,
              };
              delete params.messages?.messages;

              const response = await openai.chat.completions.create(params);
              let output = response.choices?.[0]?.message?.content ?? "";

              // 7) postProcess opcional
              if (typeof activePrompt.postProcess === "function") {
                output = activePrompt.postProcess(output, input, target, { sheetName, rowIndex: rIndex });
              }

              row[target] = String(output).trim();
            } catch (cellErr) {
              console.error(`❌ Error procesando celda [${sheetName} · fila ${rIndex} · ${target}]:`, cellErr?.message || cellErr);
              row[target] = String(row[target] ?? "");
            }
          }
        }

        processedSheets[sheetName] = rows;
      }

      req.app.locals.lastWorkbook = { sheets: processedSheets, sheetOrder: targetSheetNames };
      const base = req.file.originalname.replace(/\.xlsx$/i, "");
      req.app.locals.outputFilename = `${base}_processed.xlsx`;

      const firstSheetWithData = targetSheetNames.find(sn => (processedSheets[sn] || []).length) || targetSheetNames[0];
      const previewRows = (processedSheets[firstSheetWithData] || []).slice(0, 200);
      res.json({
        ok: true,
        previewSheetName: firstSheetWithData,
        previewRows,
        filename: req.app.locals.outputFilename
      });

    } catch (err) {
      console.error("❌ Error en /inn/upload:", err);
      res.status(500).send("Error procesando el archivo.");
    }
  });

  /* =========================
     Descargar Excel (multi-hoja preservada)
     ========================= */
  router.get("/download", (req, res) => {
    try {
      const store = req.app.locals.lastWorkbook;
      const filename = req.app.locals.outputFilename || "result_output.xlsx";
      if (!store?.sheets) return res.status(400).send("No hay datos procesados.");

      const newWorkbook = xlsx.utils.book_new();
      const order = store.sheetOrder || Object.keys(store.sheets);

      order.forEach((sn) => {
        const data = store.sheets[sn] || [];
        const newSheet = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(newWorkbook, newSheet, sn.substring(0,31));
      });

      const outputPath = path.join(process.cwd(), "uploads", filename);
      xlsx.writeFile(newWorkbook, outputPath);
      res.download(outputPath, filename);
    } catch (err) {
      console.error("❌ Error en /inn/download:", err);
      res.status(500).send("Error generando la descarga.");
    }
  });

  /* =========================
     Test de KB
     ========================= */
  router.get("/kb-test", (req, res) => {
    try {
      const q = String(req.query.q || "bita");
      if (KB?.passages?.length === 0) return res.status(500).json({ ok: false, error: "KB no cargada" });
      const hits = retrieveTopK(KB.passages, q, [], 2);
      res.json({ ok: true, q, hits: hits.map(h => ({ trail: h.headingTrail, text: h.text })) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
}
