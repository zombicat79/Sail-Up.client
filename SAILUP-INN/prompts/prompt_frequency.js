export default {
  name: "prompt_frequency",
  model: "gpt-4o-mini",
  targetColumns: ["Frequency"],

  getInput: (row, target) => {
    return { question: "", optionText: "", topic: "" };
  },

  buildPrompt: () => `
Devuelve siempre el texto "Test".
`
};