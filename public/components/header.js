// apps/inn/components/header.js
async function loadHeader() {
  try {
    // Cargar el HTML base del header
    const res = await fetch("/components/header.html");
    if (!res.ok) throw new Error("No se pudo cargar header.html");
    const html = await res.text();
    document.getElementById("header-placeholder").innerHTML = html;

    // Detectar app por pathname
    const path = location.pathname.toLowerCase();
    let app = "main";
    if (path.startsWith("/inn") || path.startsWith("/pirate-cave")) app = "inn";
    if (path.startsWith("/main")) app = "main";

    // Config logo/tabs
    const config = {
      main: {
        logo: "⛵ SailUp",
        defaultSection: "Inicio",
        titlePrefix: "SailUp",
        tabs: [
          { label: "Inicio", href: "/main" }
        ]
      },
      inn: {
        logo: "⚓️ SailUp Inn",
        defaultSection: "Inicio",
        titlePrefix: "SailUp Inn",
        tabs: [
          { label: "Inicio", href: "/inn" },
          { label: "Data Dock", href: "/inn/data-dock" },
          { label: "Pirate Cave", href: "/inn/pirate-cave" },
          { label: "AI Dock", href: "/inn/ai-dock" },
          { label: "Captain JSON", href: "/inn/captain-json" },
          { label: "SailUp", href: "/main", external: true }
        ]
      }
    };

    const currentConfig = config[app];

    // Renderizar logo
    document.getElementById("brand").textContent = currentConfig.logo;

// Renderizar tabs
    const nav = document.querySelector('[data-role="topnav"]');
    nav.innerHTML = currentConfig.tabs
    .map(t => {
      const isExternal = t.external ? " tab-external" : "";
      const target = t.external ? ' target="_blank" rel="noopener"' : "";
      return `<a class="tab${isExternal}" href="${t.href}"${target}>${t.label}</a>`;
    })
    .join("");

// === Activar tab actual (solo en el HEADER) ===
    const normalize = p => (p || "/").replace(/\/+$/, "") || "/";
    const currentPath = normalize(location.pathname);

// ⚠️ OJO: ahora buscamos SOLO dentro del header:
    const headerTabs = Array.from(document.querySelectorAll('[data-role="topnav"] .tab'))
    .filter(a => !a.classList.contains("tab-external"));

    const isExactHome = href =>
    href === "/" || href === "/inn" || href === "/main";

    const matchScore = (href, pathNow) => {
      const h = normalize(href);
      if (isExactHome(h)) return pathNow === h ? 10_000 : -1;
      if (pathNow === h) return h.length + 1;
      if (pathNow.startsWith(h + "/")) return h.length;
      return -1;
    };

    let best = { score: -1, el: null };
    headerTabs.forEach(a => {
      const href = a.getAttribute("href");
      const score = matchScore(href, currentPath);
      if (score > best.score) best = { score, el: a };
    });

// 🔒 solo tocamos las tabs del header
    headerTabs.forEach(a => {
      a.classList.remove("active");
      a.removeAttribute("aria-current");
    });
    if (best.el) {
      best.el.classList.add("active");
      best.el.setAttribute("aria-current", "page");
    }

    // === Versión backend ===
    const vres = await fetch(`/${app}/version`);
    if (!vres.ok) throw new Error(`No se pudo obtener versión de ${app}`);
    const data = await vres.json();
    const version = data.version;

    // Brand con versión
    document.getElementById("brand").textContent =
  `${currentConfig.logo} (${version})`;

    // Título del navegador con la MISMA lógica de coincidencia
  let section = currentConfig.defaultSection;
  let bestTab = { score: -1, label: section };
  currentConfig.tabs.forEach(t => {
    if (t.external) return;
    const s = matchScore(t.href, currentPath);
    if (s > bestTab.score) bestTab = { score: s, label: t.label };
  });
  section = bestTab.label;

  document.title = `${currentConfig.titlePrefix} – ${section} (Beta ${version})`;

} catch (err) {
  console.error("Error cargando header:", err);
}
}

loadHeader();
