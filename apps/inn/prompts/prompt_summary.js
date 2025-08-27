export default {
  name: "prompt_summary",
  model: "gpt-4o",
  targetColumns: ["Summary1", "Summary2", "Summary3", "Summary4"],
  version: "v2.0", // 🔹 actualiza aquí cada vez que cambies el prompt

  getInput: (row, target, rowIndex) => {
    const i = target.replace("Summary", "");
    return {
      question: row["Question"] || "",
      optionText: row[`Option${i}_text`] || "",
      topic: row["Topic"] || "",
      isFirst: rowIndex === 0 && target === "Summary1" // 🔹 Solo la primera celda
    };
  },

  buildPrompt: (question, optionText, topic, isFirst, version) => {
    const versionNote = isFirst
      ? `\n\n⚓ Nota: Esta explicación fue generada con la versión de prompt ${version}.`
      : "";

    return `
Pregunta: "${question}"
Opción: "${optionText}"
Tema: "${topic}"

Tarea:
Genera un resumen breve (máx. 2 frases) en español sobre esta opción.

Fase 1 · Clasificación
Determina el tipo de pregunta según el contexto:
- "definición": cuando pide qué es algo.
- "función": cuando pregunta para qué sirve o qué hace.
- "localización": cuando pregunta dónde se encuentra.
- "verdadero_falso": cuando hay solo 2 opciones o el formato es de V/F.
- "genérico": cualquier otro caso.

Fase 2 · Explicación
Redacta el texto según el tipo:
- definición → ofrece una definición clara de <strong>${topic}</strong>.
- función → describe su uso o propósito.
- localización → indica la ubicación habitual en la embarcación.
- verdadero_falso → explica el concepto sin mencionar si es verdadero o falso.
- genérico → redacta una explicación breve en tono didáctico.

Reglas:
- Resalta siempre el concepto principal con <strong>.
- Si la opción corresponde a un concepto náutico real pero incorrecto: explica qué significa realmente ese concepto.
- Si es inventada o no corresponde a la náutica: no inventes; aclara qué sería lo correcto.
- Estilo: ficha de estudio, tono didáctico.
- Extensión: máximo 2 frases.${versionNote}
`;
  }
};
