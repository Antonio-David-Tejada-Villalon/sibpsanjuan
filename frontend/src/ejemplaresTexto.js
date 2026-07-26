// Parser del textarea de ejemplares, compartido entre Libros.jsx y (a
// futuro) Seriadas.jsx: newline separa ejemplares, coma dentro de una línea
// separa código de barras de signatura — al revés que Autores/Materias,
// donde la coma separa cada ítem de la lista. Ver el textarea en Libros.jsx
// para la explicación que ve el usuario.
export function aEjemplares(texto) {
  return texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const [codigoBarras, signatura] = linea.split(",").map((s) => s.trim());
      return { codigoBarras, signatura };
    });
}
