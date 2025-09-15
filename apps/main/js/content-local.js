// /apps/main/content-local.js
// Cargamos el contenido desde /public/data (ruta del router main)

export async function getLocalData() {
  try {
    const response = await fetch('/data/sailup_per_syllabus.json'); // ajusta el filename si toca
    if (!response.ok) {
      throw new Error('No se pudo cargar el archivo.');
    }
    const data = await response.json();
    return data; // ← devolvemos el payload completo (con syllabus.data)
  } catch (error) {
    console.error('❌ Error cargando JSON local:', error);
    // Fallback vacío en el nuevo esquema
    return { syllabus: { data: [] } };
  }
}
