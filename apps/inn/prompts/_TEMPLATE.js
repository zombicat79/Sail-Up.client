// apps/inn/prompts/_TEMPLATE.js
// Plantilla lista para tus hojas de preguntas reales (columnas en minúscula)

export default {
  name: "TEMPLATE – Clasificar tipo de pregunta",
  version: "0.2.0",
  model: "gpt-4o-mini",

  params: {
    temperature: 0,
    top_p: 1,
    max_tokens: 120
  },

  // Procesar todas las hojas salvo las “meta”
  excel: {
    filterSheets: (sheetNames) =>
      sheetNames.filter(sn => !["syllabus","domains"].includes(sn))
  },

  // Podemos escribir en "type" (o cambia a ["summary1","summary2",...] en otro prompt)
  targetColumns: (sheetName) => ["type"],

  // Construir el input a partir de una fila del Excel real
  getInput: (row, target, rowIndex, sheetName) => {
    const options = [
      row["option1-text"],
      row["option2-text"],
      row["option3-text"],
      row["option4-text"]
    ].filter(Boolean);

    return {
      sheetName,           // lo tomamos como "domain"
      rowIndex,
      target,
      domain: sheetName,   // dominio = nombre de hoja (nomenclatura, ripa, etc.)
      subdomain: row.subdomain,
      topic: row.topic,
      question: row.question,
      options,
      optionText: options[0] || "" // ayuda para recuperar contexto KB si aplica
    };
  },

  // Construye la request (recomendado)
  buildRequest: (input) => {
    const sys = "Eres un asistente conciso y riguroso. Responde solo con la salida solicitada.";
    const user = [
      `Dominio (hoja): ${input.sheetName}`,
      input.subdomain ? `Subdominio: ${input.subdomain}` : "",
      input.topic ? `Tema: ${input.topic}` : "",
      `Pregunta: ${input.question}`,
      input.options?.length ? `Opciones:\n- ${input.options.join("\n- ")}` : "",
      `Tarea: Clasifica el tipo de pregunta en {TERM|DEFINITION|LOCATION|IMAGE|OTHER}.`,
      `Salida: SOLO una palabra en mayúsculas (TERM/DEFINITION/LOCATION/IMAGE/OTHER).`
    ].filter(Boolean).join("\n");

    return {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ]
    };
  },

  // Limpia y normaliza
  postProcess: (output) => {
    const v = String(output || "").trim().toUpperCase();
    const ALLOWED = ["TERM","DEFINITION","LOCATION","IMAGE","OTHER","UNKNOWN"];
    if (ALLOWED.includes(v)) return v;
    // Permite sobreescribir UNKNOWN si el prompt no acierta
    return "UNKNOWN";
  }
};
