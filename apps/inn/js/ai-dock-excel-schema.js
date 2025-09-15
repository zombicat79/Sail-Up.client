// apps/inn/js/ai-dock-excel-schema.js
// Esquema adaptado al Excel real (sailup_per_syllabus.xlsx)

export default {
  // Hojas especiales con esquema propio
  perSheet: {
    syllabus: {
      requiredColumns: ["course", "course-overview", "course-image", "scope", "language"],
      atLeastOneOfGroups: []
    },
    domains: {
      requiredColumns: ["domain-order", "domain-id", "domain", "domain-overview", "domain-image"],
      atLeastOneOfGroups: []
    }
  },

  // Regla por defecto para HOJAS DE PREGUNTAS (todas las demás)
  // (nomenclatura, ripa, balizamiento, etc.)
  defaultSheetRule: {
    requiredColumns: [
      "subdomain",
      "topic",
      "question"
    ],
    atLeastOneOfGroups: [
      ["option1-text"],
      ["option2-text"],
      ["option3-text"],
      ["option4-text"]
    ]
    // NOTA: campos como "type", "summary1..4", "question-image", etc. son opcionales.
  }
};
