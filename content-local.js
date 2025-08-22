// content-local.js
// Contenido hardcodeado extraído de app.js

export const DATA = {
  topics: [
    {
      id: 'nomenclatura',
      title: 'Nomenclatura náutica',
      description: 'Partes del barco, casco, jarcia y términos básicos.',
      items: [
        {
          "Domain": "Nomenclatura náutica",
          "Subdomain": "Terminología",
          "Topic": "Adrizar",
          "Question": "Una embarcación está adrizada cuando...",
          "Options": [
            { "Option 1": "No tiene escora.", "correct": true },
            { "Option 2": "Está en varadero", "correct": false },
            { "Option 3": "Apenas se mueve.", "correct": false },
            { "Option 4": "Navega contra el viento.", "correct": false }
          ],
          "Summary": {
            "Summary 1": "Una embarcación está **adrizada** cuando navega vertical y equilibrada, sin inclinación lateral respecto a la vertical; en otras palabras, sin escora.",
            "Summary 2": "Se dice que una embarcación está en varadero cuando ha sido sacada del agua y se encuentra en tierra, en un astillero o dique, para realizar trabajos de mantenimiento, reparación o invernaje.",
            "Summary 3": "En náutica, la expresión “apenas se mueve” indica que el barco lleva una arrancada muy pequeña o casi nula, es decir, prácticamente no avanza con respecto al agua.",
            "Summary 4": "Una embarcación “navega contra el viento” cuando avanza en dirección al viento o lo más cercano posible a él, lo que implica mayor resistencia y necesidad de ajustar el gobierno."
          }
        },
        {
          "Domain": "Nomenclatura náutica",
          "Subdomain": "Casco",
          "Topic": "Aleta",
          "Question": "Se denomina aleta a...",
          "Options": [
            { "Option 1": "La parte posterior del costado que converge y cierra el casco por detrás.", "correct": true },
            { "Option 2": "Una parte frontal de la línea de flotación.", "correct": false },
            { "Option 3": "La zona direccional del barco.", "correct": false },
            { "Option 4": "La parte bidireccional.", "correct": false }
          ],
          "Summary": {
            "Summary 1": "La **aleta** es el tramo del costado situado hacia popa que converge hacia el espejo, cerrando el casco por su parte posterior.",
            "Summary 2": "La parte frontal de la línea de flotación corresponde a la proa, que es la zona delantera del barco y la que primero corta las olas al navegar.",
            "Summary 3": "La “zona direccional del barco” hace referencia al timón y la pala de gobierno, situados en popa y encargados de controlar el rumbo, no a la aleta.",
            "Summary 4": "La expresión “parte bidireccional” no se emplea en náutica para designar ninguna sección del casco, por lo que no describe ningún elemento estructural real."
          }
        }
        // 🔹 Aquí sigue todo el resto del bloque extraído tal cual de app.js...
      ]
    }
  ]
};
