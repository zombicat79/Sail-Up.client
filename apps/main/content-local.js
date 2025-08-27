// content-local.js
// Cargamos el contenido desde el JSON en la carpeta /apps/main/assets/json

export async function getLocalData() {
  try {
    // ✅ Usamos ruta absoluta respecto al subpath /main
    const response = await fetch('/data/sailup_per_questions.json');
    if (!response.ok) {
      throw new Error('No se pudo cargar el archivo sailup_per_questions.json');
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Error cargando JSON local:', error);
    return { topics: { data: [] } }; // fallback vacío
  }
}
