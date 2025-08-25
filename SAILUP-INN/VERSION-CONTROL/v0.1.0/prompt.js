export function buildPrompt(question, optionText, topic) {
  return `
Pregunta: "${question}"
Opción: "${optionText}"

Tarea: Escribe una explicación breve, didáctica y formal en español sobre esta opción.
- Si la opción es correcta, explica por qué lo es.
- Si la opción es incorrecta, explica el concepto correcto en su lugar, sin mencionar que es incorrecta.
- Usa un único párrafo en HTML.
- Utiliza <strong> para resaltar el concepto principal (ejemplo: <strong>${topic}</strong>).
`;
}