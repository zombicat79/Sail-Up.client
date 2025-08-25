export function buildPrompt(question, optionText, topic) {
  return `
Pregunta: "${question}"
Opción: "${optionText}"

Tarea:
Redacta una explicación breve, clara y didáctica en español sobre esta opción, usando la pregunta como contexto.
- Identifica el concepto principal y resáltalo con <strong>.
- No incluyas prefijos como "Pregunta:", "Resumen:" ni repitas literalmente la opción.
- Devuelve únicamente el texto de la explicación, sin etiquetas extra (<html>, <body>, <p>).
- Si la opción corresponde al concepto correcto: ofrece una definición breve y útil.
- Si corresponde a un concepto náutico real pero no es la respuesta correcta: explica ese concepto correctamente y diferéncialo del principal de la pregunta.
- Si describe algo inexistente en náutica: no inventes definiciones. En su lugar, aclara el concepto correcto en relación con la pregunta.
- Estilo: ficha de estudio, formal y accesible, máximo 2–3 frases. Texto corrido, sin saltos de línea.

Ejemplo esperado:
La <strong>gaza</strong> es un lazo que se forma en el chicote de un cabo al unirlo con el firme mediante un nudo, normalmente un as de guía. No debe confundirse con el seno (curvatura del cabo) ni con el chicote (extremo libre).
`;
}
