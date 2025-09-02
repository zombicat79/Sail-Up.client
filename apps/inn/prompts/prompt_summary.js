// apps/inn/prompts/prompt_summary.js
// v1.9 — DEFINITION-only, PER exam
// Goal: be agnostic; map each option to the exact PER syllabus term that matches its definition.
// S1 uses Topic + Question (correct concept). S2–S4 ignore Topic/Question and
// must choose the single closest PER syllabus term that exactly fits the option text.

export default {
  name: "prompt_summary",
  model: "gpt-4o-mini",
  targetColumns: ["Summary1", "Summary2", "Summary3", "Summary4"],
  version: "v1.9-definition-PER-canonical-term",
  params: { temperature: 0, top_p: 1, max_tokens: 110 },

  getInput: (row, target) => {
    const i = Number(String(target).replace("Summary", ""));
    return {
      type: String(row["Type"] || "").trim().toUpperCase(),
      topic: String(row["Topic"] || ""),
      question: String(row["Question"] || ""),
      optionText: String(row[`Option${i}_text`] || ""),
      summaryIndex: i
    };
  },

  buildRequest: ({ type, topic, question, optionText, summaryIndex }) => {
    if (type !== "DEFINITION") return null;
    if (!optionText) return null;

    // ---------- Summary1: correct answer (anchor to Topic) ----------
    if (summaryIndex === 1) {
      const userPromptS1 = `
You are tutoring students for the Spanish skipper exam (PER).

Inputs:
- QUESTION: ${question}
- TOPIC (correct target term): ${topic}
- OPTION (definition text for the correct answer; do NOT quote/echo): ${optionText}

Task (Summary1):
Explain in Spanish (es-ES), in 1–2 didactical sentences, the nautical concept corresponding to the TOPIC. Use the option text only as contextual support.

Strict rules for Summary1:
- Focus on the TOPIC (the correct concept for the question).
- Use the exact, canonical terminology used in the PER syllabus.
- Keep it concise (max 2 sentences), didactical, in Spanish (es-ES).
- Do NOT quote the option text, do NOT add meta comments, lists, or correctness notes.
      `.trim();

      return {
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant specialized in the Spanish skipper exam 'PER' (Patrón de Embarcaciones de Recreo). Follow instructions exactly."
          },
          { role: "user", content: userPromptS1 }
        ]
      };
    }

    // ---------- Summaries 2–4: distractors (map to closest exact PER term) ----------
    const userPromptSx = `
You are tutoring students for the Spanish skipper exam (PER).

Input:
- OPTION (definition text; do NOT quote/echo): ${optionText}

Task (Summaries 2–4):
This option is a distractor for the question, but it still corresponds to a valid nautical concept covered in PER preparation programs.
Identify the **single closest, exact canonical term from the PER syllabus** that matches this definition, and write a brief didactical explanation in Spanish (es-ES), 1–2 sentences.

Strict rules for Summaries 2–4:
- Ignore the question and topic entirely; do NOT mention or relate to them.
- Choose **one** exact PER syllabus term that best and specifically fits the definition.
- Prefer the **most specific** canonical term if several are plausible.
- If no term from the PER syllabus clearly matches, return exactly:
  "No corresponde al temario PER; es un distractor."
- Output Spanish (es-ES), max 2 sentences, didactical tone.
- Do NOT quote the option text; no lists, no meta comments, no correctness notes.
    `.trim();

    return {
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant specialized in the Spanish skipper exam 'PER' (Patrón de Embarcaciones de Recreo). Follow instructions exactly."
        },
        { role: "user", content: userPromptSx }
      ]
    };
  },

  postProcess: (raw) => {
    let out = String(raw || "").trim();
    if (out.startsWith('"') && out.endsWith('"')) out = out.slice(1, -1).trim();
    if (out && !/[.!?…]$/.test(out)) out += ".";
    return out.slice(0, 600);
  }
};
