// content-local.js
// En lugar de tener el contenido hardcodeado, lo cargamos desde el JSON en la raíz

export async function getLocalData() {
  try {
    const response = await fetch('./assets/json/sailup_per_questions.json'); // raíz = junto al index.html
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
