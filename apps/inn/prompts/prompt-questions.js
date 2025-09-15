// apps/inn/prompts/per-generate-question-addN-dedupe.js
// PER · Añadir N preguntas por topic (anti-duplicados + auto-filas)
// v2.4.1

/* =========================
   Ajustes rápidos del generador
   ========================= */
const GEN = {
  NEW_PER_TOPIC: 1,             // ← nº de PREGUNTAS nuevas por topic
  ONLY_WHEN_NO_EXISTING: true   // true → solo genera si el topic NO tiene preguntas previas en el Excel
};

/* =========================
   Utilidades de columnas y helpers
   ========================= */
const COLS = {
  question:  ["question", "Question"],
  option1:   ["option1-text", "option1_text", "Option1-text", "Option1_text"],
  option2:   ["option2-text", "option2_text", "Option2-text", "Option2_text"],
  option3:   ["option3-text", "option3_text", "Option3-text", "Option3_text"],
  option4:   ["option4-text", "option4_text", "Option4-text", "Option4_text"],
  topic:     ["topic", "Topic"],
  subdomain: ["subdomain", "Subdomain"],
};

function firstKey(row, variants){ for (const k of variants) if (k in row) return k; return variants[0]; }
function getVal(row, variants){ return row[firstKey(row, variants)]; }
function setVal(row, variants, v){ row[firstKey(row, variants)] = v; }

function isBlankRow(row){
  const q  = String(getVal(row, COLS.question) || "").trim();
  const o1 = String(getVal(row, COLS.option1)  || "").trim();
  const o2 = String(getVal(row, COLS.option2)  || "").trim();
  const o3 = String(getVal(row, COLS.option3)  || "").trim();
  const o4 = String(getVal(row, COLS.option4)  || "").trim();
  return !q && !o1 && !o2 && !o3 && !o4;
}
function normTopic(t){ return String(t || "").trim().toLowerCase(); }
function normalizeQ(s){
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9ñáéíóúü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   Estado por ejecución (memoria corta)
   ========================= */
const generatedCountByGroup = new Map(); // key -> count
const seenNormalizedByGroup = new Map(); // key -> Set<string>

function groupKey(sheetName, subdomain, topic){
  return `${sheetName} :: ${String(subdomain || "").trim().toLowerCase()} :: ${normTopic(topic)}`;
}
function getSeenSet(key){
  if (!seenNormalizedByGroup.has(key)) seenNormalizedByGroup.set(key, new Set());
  return seenNormalizedByGroup.get(key);
}
function incCount(key){
  generatedCountByGroup.set(key, (generatedCountByGroup.get(key) || 0) + 1);
}
function getCount(key){
  return generatedCountByGroup.get(key) || 0;
}

/* =========================
   Prompt
   ========================= */
export default {
  name: "PER · Añadir N preguntas por topic (anti-duplicados + auto-filas)",
  version: "2.4.1",
  model: "gpt-4o-mini",
  settings: GEN,

  params: { temperature: 0.25, top_p: 1, max_tokens: 420 },

  excel: {
    filterSheets: (sheetNames) => sheetNames,

    // 🔹 CREA hasta NEW_PER_TOPIC filas vacías por topic antes de llamar a OpenAI.
    expandRows: {
      desiredNewPerGroup: GEN.NEW_PER_TOPIC,

      // 🔑 Clave de agrupación: Hoja + Subdomain (lower) + Topic (lower)
      groupKey: (row, sheetName) => {
        const sub = String(row.Subdomain ?? row.subdomain ?? "").trim().toLowerCase();
        const tp  = String(row.Topic ?? row.topic ?? "").trim().toLowerCase();
        if (!tp) return null;
        return `${sheetName} :: ${sub} :: ${tp}`;
      },

      // 🧹 Filas vacías = sin enunciado ni opciones
      isBlankRow: (row) => {
        const q  = String(row.question || row.Question || "").trim();
        const o1 = String(row["option1-text"] || row.option1_text || "").trim();
        const o2 = String(row["option2-text"] || row.option2_text || "").trim();
        const o3 = String(row["option3-text"] || row.option3_text || "").trim();
        const o4 = String(row["option4-text"] || row.option4_text || "").trim();
        return !q && !o1 && !o2 && !o3 && !o4;
      },

      // 👕 Limpiar columnas de contenido en los clones
      clearColumns: [
        "question","Question",
        "option1-text","option2-text","option3-text","option4-text",
        "option1_text","option2_text","option3_text","option4_text"
      ],

      // 🧬 Fila base para clonar (última del grupo)
      cloneStrategy: (rowsInGroup) => rowsInGroup[rowsInGroup.length - 1] || {},
    },

    // 🧭 El router puede usar esta clave para construir el banco de existentes por topic
    groupKeyForDedupe: (row, sheetName) => {
      const sub = String(row.Subdomain ?? row.subdomain ?? "").trim().toLowerCase();
      const tp  = String(row.Topic ?? row.topic ?? "").trim().toLowerCase();
      if (!tp) return null;
      return `${sheetName} :: ${sub} :: ${tp}`;
    },

    // ✅ Builder propio del banco (robusto a Question/QUESTION y normaliza subdomain)
    buildDedupeBank: (rows, sheetName) => {
      const bank = new Map(); // key -> string[]
      if (!rows?.length) return bank;
      const keys = Object.keys(rows[0] || {});
      const qKeys = keys.filter(k => String(k).toLowerCase() === "question");
      if (!qKeys.length) return bank;

      const pickQ = (r) => {
        for (const k of qKeys) {
          const v = String(r[k] || "").trim();
          if (v) return v;
        }
        return "";
      };

      for (const r of rows) {
        const sub = String(r.Subdomain ?? r.subdomain ?? "").trim().toLowerCase();
        const tp  = String(r.Topic ?? r.topic ?? "").trim().toLowerCase();
        if (!tp) continue;
        const k = `${sheetName} :: ${sub} :: ${tp}`;
        const q = pickQ(r);
        if (!q) continue;
        if (!bank.has(k)) bank.set(k, []);
        bank.get(k).push(q);
      }
      return bank;
    },
  },

  // Procesaremos estas columnas; solo invocaremos al modelo en "question".
  targetColumns: ["question", "option1-text", "option2-text", "option3-text", "option4-text"],

  /**
   * @param existingQuestionsInGroup (opcional, array<string>)
   *  - Si el router NO lo pasa, será [] y el modo ONLY_WHEN_NO_EXISTING no podrá filtrar por histórico.
   */
  getInput(row, target, rIndex, sheetName, existingQuestionsInGroup = []) {
    const topicRaw = getVal(row, COLS.topic);
    const topicId  = normTopic(topicRaw);
    const sub      = String(getVal(row, COLS.subdomain) || "").trim();

    const summaries = ["summary1", "summary2", "summary3", "summary4"]
      .map(k => row[k]).filter(Boolean).map(String).join("\n- ");

    // Normaliza el banco existente si viene del router
    const normalizedBank = Array.isArray(existingQuestionsInGroup)
      ? existingQuestionsInGroup.map(q => normalizeQ(q)).filter(Boolean)
      : [];

    return {
      sheetName,
      subdomain: sub,
      topic: String(topicRaw || "").trim(),
      topicId,
      isRowBlank: isBlankRow(row),
      target,
      rIndex,
      rowRef: row,
      summaries,
      desiredNew: GEN.NEW_PER_TOPIC,
      normalizedBank,
      // Ayuda a la KB si está activada en el router
      optionText: `${String(topicRaw || "").trim()} ${summaries}`.trim(),
    };
  },

  buildRequest(input) {
    // Solo generamos en la columna "question"
    if (input.target !== "question") return null;

    // Solo en filas en blanco (las auto-filas recién creadas lo estarán)
    if (!input.isRowBlank) return null;

    // Si ya alcanzamos el cupo por topic, no hacemos más llamadas
    const key = groupKey(input.sheetName, input.subdomain, input.topic);
    if (getCount(key) >= input.desiredNew) return null;

    // Modo "solo si no existen previas"
    if (GEN.ONLY_WHEN_NO_EXISTING && input.normalizedBank.length > 0) {
      return null;
    }

    // Lista (acotada) de existentes para mostrárselas al modelo (anti-duplicados)
    const already = Array.from(new Set([
      ...input.normalizedBank,  // histórico (si el router lo pasó)
      ...getSeenSet(key),       // ya generadas en esta corrida
    ]));
    const bankPreview = already.slice(0, 30); // no saturar contexto

    const sys = `Eres un generador experto de preguntas tipo test para el examen PER (España).
- Devuelves SIEMPRE JSON válido, sin texto adicional.
- La opción 1 SIEMPRE es la correcta; 2–4 son plausibles e incorrectas.
- Evita cualquier pregunta idéntica o casi idéntica (misma semántica) a la lista prohibida proporcionada.
- Varía formulación, foco, datos numéricos y contexto.`;

    const user = [
      `Dominio (hoja): ${input.sheetName}`,
      `Subdominio: ${input.subdomain || "(sin subdominio)"}`,
      `Topic: ${input.topic}`,
      input.summaries ? `Notas del syllabus:\n- ${input.summaries}` : null,
      bankPreview.length
        ? `NO repitas / NO parafrasees estas preguntas (lista prohibida normalizada):\n- ${bankPreview.join("\n- ")}`
        : null,
      ``,
      `Genera UNA pregunta de 4 opciones sobre este topic.`,
      `Devuelve SOLO este JSON:`,
      `{"question":"...","options":["correcta","distractor 1","distractor 2","distractor 3"]}`
    ].filter(Boolean).join("\n");

    return {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ]
    };
  },

  postProcess(output, input, target) {
    // Parseo robusto de JSON del modelo
    const parseJson = (txt) => {
      const s = String(txt || "");
      try {
        const i = s.indexOf("{");
        const j = s.lastIndexOf("}");
        const core = (i >= 0 && j >= 0) ? s.slice(i, j + 1) : s;
        return JSON.parse(core);
      } catch {
        return { question: s.trim(), options: [] };
      }
    };

    if (target === "question") {
      // Si no está en blanco, no tocamos nada
      if (!input.isRowBlank) {
        return String(getVal(input.rowRef, COLS.question) || "");
      }

      const data = parseJson(output);
      const q = String(data.question || "").trim();
      const opts = Array.isArray(data.options) ? data.options.map(v => String(v || "").trim()) : [];
      while (opts.length < 4) opts.push("");

      const key = groupKey(input.sheetName, input.subdomain, input.topic);
      const nQ = normalizeQ(q);
      const bank = new Set(input.normalizedBank || []);
      const seen = getSeenSet(key);

      // Deduplicación: histórico + intra-ejecución
      if (!nQ || bank.has(nQ) || seen.has(nQ)) {
        return ""; // deja la celda vacía → podrás reintentar luego sin ensuciar
      }

      // Aceptamos y marcamos como visto
      seen.add(nQ);

      // Escribimos en la fila las opciones
      const row = input.rowRef;
      setVal(row, COLS.question, q);
      setVal(row, COLS.option1, opts[0] || "");
      setVal(row, COLS.option2, opts[1] || "");
      setVal(row, COLS.option3, opts[2] || "");
      setVal(row, COLS.option4, opts[3] || "");

      incCount(key);
      return q;
    }

    // Para option1–4 devolvemos lo ya escrito en la fila (no llamamos al modelo)
    const keyMap =
      (target === "option1-text" || target === "option1_text") ? COLS.option1 :
      (target === "option2-text" || target === "option2_text") ? COLS.option2 :
      (target === "option3-text" || target === "option3_text") ? COLS.option3 :
      (target === "option4-text" || target === "option4_text") ? COLS.option4 :
      COLS.question;

    return String(getVal(input.rowRef, keyMap) || "");
  }
};
