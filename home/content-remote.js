// content-remote.js
// Lógica para obtener contenido desde el servidor (Node.js + MongoDB)

export async function getQuestions() {
  try {
    const res = await fetch("http://backend.zombiecat.dev/sail-up/api/v1/topics");
    if (!res.ok) throw new Error("Error en la API");
    const data = await res.json();

    // 🔹 Devolvemos los datos en el mismo formato que content-local.js
    return { topics: data };
  } catch (err) {
    console.error("Error cargando preguntas remotas:", err);
    return { topics: [] };
  }
}
