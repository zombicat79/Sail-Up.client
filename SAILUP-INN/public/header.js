async function loadHeader() {
  try {
    // Cargar el header
    const res = await fetch("header.html");
    if (!res.ok) throw new Error("No se pudo cargar header.html");
    const html = await res.text();
    document.getElementById("header-placeholder").innerHTML = html;

    // Activar el tab actual según la URL
    const current = location.pathname.split("/").pop();
    document.querySelectorAll(".tab").forEach(tab => {
      if (tab.getAttribute("href") === current) {
        tab.classList.add("active");
      }
    });

    // Obtener versión del backend
    const vres = await fetch("/version");
    if (!vres.ok) throw new Error("No se pudo obtener versión");
    const data = await vres.json();
    const version = data.version;

    // Actualizar brand en la barra
    document.getElementById("brand").textContent = `⚓ SailUp Inn (Beta) ${version}`;

    // Actualizar título de la pestaña del navegador
    const section = current === "json.html" ? "Json" : "Prompts";
    document.title = `SailUp Inn – ${section} (Beta ${version})`;

  } catch (err) {
    console.error("Error cargando header:", err);
  }
}

loadHeader();