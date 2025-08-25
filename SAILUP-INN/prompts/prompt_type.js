export default {
  name: "prompt_type",
  model: "gpt-4o-mini",
  targetColumns: ["Type"],
  version: "v2.3",

  getInput: (row, target, rowIndex) => {
    return {
      option1: row["Option1_text"] || "",
      option2: row["Option2_text"] || "",
      option3: row["Option3_text"] || "",
      option4: row["Option4_text"] || ""
    };
  },

  buildPrompt: (input) => {
    return `
Clasifica la pregunta según el tipo de sus opciones de respuesta.

Categorías posibles:
TERM, DEFINITION, LOCATION, TRUE, FALSE, UNKNOWN

Reglas rápidas:
- TERM → opciones = sustantivos o nombres muy cortos (ej: "Orinque", "Caña", "Estay").
- DEFINITION → opciones = frases explicativas, incluso si son cortas, o si empiezan con verbos (ej: "Arrastrar el ancla por el fondo", "Es una pieza que...").  
  Si las respuestas son cortas pero parecen dar una definición (ej: "Un bolardo", "Unión del timón con la embarcación"), clasifícalo como DEFINITION.
- LOCATION → opciones = lugares o posiciones (ej: "En el muelle", "A proa").
- TRUE → opciones = Verdadero/Falso, y la opción 1 es Verdadero.
- FALSE → opciones = Verdadero/Falso, y la opción 1 es Falso.
- UNKNOWN → solo si NO encaja en ninguna categoría.

Opciones de respuesta:
1. ${input.option1}
2. ${input.option2}
3. ${input.option3}
4. ${input.option4}

Responde SOLO con una palabra exacta: TERM, DEFINITION, LOCATION, TRUE, FALSE o UNKNOWN.
`;
  }
};
