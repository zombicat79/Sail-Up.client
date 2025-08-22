// content-local.js
// Contenido hardcodeado extraído de app.js

export const LOCAL_DATA = {
  topics: {
    data: [
      {
        id: 'nomenclatura',
        title: '1. Nomenclatura náutica',
        description: 'Conjunto de términos que identifican las partes y elementos de una embarcación. Permite comunicarse con precisión a bordo y comprender maniobras, equipos y estructuras del barco.',
        image: 'assets/img/sailup-nomenclatura-nautica.jpg',
        items: [
          {
            Domain: "Nomenclatura náutica",
            Subdomain: "Terminología",
            Topic: "Adrizar",
            Frequency: "High",
            Thumbnail: true,
            Thumbnail_url: "assets/img/sailup-nomenclatura-nautica.jpg",
            Question: "Una embarcación está adrizada cuando...",
            Options: [
              { text: "No tiene escora.", correct: true },
              { text: "Está en varadero", correct: false },
              { text: "Apenas se mueve.", correct: false },
              { text: "Navega contra el viento.", correct: false }
            ],
            Summary: {
              Summary1: "Una embarcación está **adrizada** cuando navega vertical y equilibrada, sin inclinación lateral respecto a la vertical; en otras palabras, sin escora.",
              Summary2: "Se dice que una embarcación está en varadero cuando ha sido sacada del agua y se encuentra en tierra, en un astillero o dique, para realizar trabajos de mantenimiento, reparación o invernaje.",
              Summary3: "En náutica, la expresión “apenas se mueve” indica que el barco lleva una arrancada muy pequeña o casi nula, es decir, prácticamente no avanza con respecto al agua.",
              Summary4: "Una embarcación “navega contra el viento” cuando avanza en dirección al viento o lo más cercano posible a él, lo que implica mayor resistencia y necesidad de ajustar el gobierno."
            }
          },
          {
            Domain: "Nomenclatura náutica",
            Subdomain: "Casco",
            Topic: "Aleta",
            Frequency: 'High',
            Thumbnail: false,
            Thumbnail_url: "",
            Question: "Se denomina aleta a...",
            Options: [
              { text: "La parte posterior del costado que converge y cierra el casco por detrás.", correct: true },
              { text: "Una parte frontal de la línea de flotación.", correct: false },
              { text: "La zona direccional del barco.", correct: false },
              { text: "La parte bidireccional.", correct: false }
            ],
            Summary: {
              Summary1: "La **aleta** es el tramo del costado situado hacia popa que converge hacia el espejo, cerrando el casco por su parte posterior.",
              Summary2: "La parte frontal de la línea de flotación corresponde a la proa, que es la zona delantera del barco y la que primero corta las olas al navegar.",
              Summary3: "La “zona direccional del barco” hace referencia al timón y la pala de gobierno, situados en popa y encargados de controlar el rumbo, no a la aleta.",
              Summary4: "La expresión “parte bidireccional” no se emplea en náutica para designar ninguna sección del casco, por lo que no describe ningún elemento estructural real."
            }
          }
          // 🔹 Aquí sigue todo el resto del bloque extraído tal cual de app.js...
        ]
      } 
    ]
  }
}