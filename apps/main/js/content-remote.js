// /apps/main/content-remote.js
// Lógica para obtener contenido desde el servidor (Node.js + MongoDB)

export async function getQuestions() {
  try {
    const res = await fetch("http://localhost:3000/api/v1/topics");
    if (!res.ok) throw new Error("Error en la API");
    const data = await res.json();

    // 🔹 Normalizamos a la nueva forma esperada: syllabus.data = [...]
    // Si tu API ya devuelve { syllabus: { data: [...] } }, devuelve tal cual.
    if (Array.isArray(data?.syllabus?.data)) {
      return data;
    }

    // Si la API devuelve un array de dominios directamente, lo envolvemos:
    if (Array.isArray(data)) {
      return { syllabus: { data } };
    }

    // Si devuelve { data: [...] }
    if (Array.isArray(data?.data)) {
      return { syllabus: { data: data.data } };
    }

    // Fallback
    return { syllabus: { data: [] } };
  } catch (err) {
    console.error("Error cargando preguntas remotas:", err);
    return { syllabus: { data: [] } };
  }
}
