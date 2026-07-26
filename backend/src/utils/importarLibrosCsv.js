import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import Libro from "../models/Libro.js";

// Se lee del propio schema (no se duplica la lista acá) para que nunca
// pueda desincronizarse si el enum de Libro.js cambia.
const SUBTIPOS_VALIDOS = new Set(Libro.schema.path("subtipo").enumValues);

// Mismas columnas que el formulario de Libros.jsx, en formato plano para
// Excel/CSV — autores y materias van separados por ";" (no por "," como en
// el formulario) porque una coma es perfectamente válida dentro de un
// nombre de autor ("Borges, Jorge Luis") y el CSV ya usa la coma como
// separador de columnas.
const COLUMNAS = [
  "titulo",
  "subtitulo",
  "isbn",
  "autores",
  "editorial",
  "lugarPublicacion",
  "anio",
  "paginas",
  "materias",
  "subtipo",
  "urlAcceso",
  "portadaUrl",
  "notas",
  "ejemplares",
];

export function plantillaLibrosCsv() {
  const ejemplo = {
    titulo: "Ficciones",
    subtitulo: "",
    isbn: "9789500000000",
    autores: "Borges, Jorge Luis",
    editorial: "Emecé",
    lugarPublicacion: "Buenos Aires",
    anio: "1944",
    paginas: "203",
    materias: "Literatura argentina; Cuentos",
    subtipo: "impreso",
    urlAcceso: "",
    portadaUrl: "",
    notas: "Fila de ejemplo — borrala antes de subir tu propio archivo.",
    ejemplares: "BPSJ-000001,863 BOR;BPSJ-000002,863 BOR",
  };
  return stringify([ejemplo], { header: true, columns: COLUMNAS });
}

function aLista(texto) {
  return String(texto || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Misma convención que el textarea de ejemplares del formulario individual
// (ver frontend/src/ejemplaresTexto.js): la coma separa código de barras de
// signatura DENTRO de un ejemplar. Ahí el salto de línea separa un ejemplar
// del siguiente; acá, dentro de una sola celda de CSV, se usa ";" en su
// lugar — mismo separador que ya usan autores/materias en este mismo
// archivo para "varios valores en una celda", en vez de depender de saltos
// de línea embebidos dentro de una celda (frágil al editar en Excel).
function aEjemplares(texto) {
  return String(texto || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [codigoBarras, signatura] = item.split(",").map((s) => s.trim());
      return { codigoBarras, signatura };
    });
}

// Parsea el CSV subido y separa filas válidas (listas para Libro.create) de
// errores por fila — no aborta todo el archivo por una fila mala, cada una
// se valida de forma independiente.
//
// El "subtipo" es una clasificación cerrada (ver enum en Libro.js) pero
// nada garantiza que la planilla de alguien use exactamente esas palabras
// (ej. "Novela", "Manga", "eBook EPUB" en vez de "impreso"/"ebook") — en vez
// de hacer fallar toda la fila por eso, un valor no reconocido se avisa
// (`avisos`, no `errores`: la fila SÍ se crea) y cae al default del schema.
export function parseLibrosCsv(texto) {
  let filas;
  try {
    filas = parse(texto, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (err) {
    throw Object.assign(new Error(`No se pudo leer el CSV: ${err.message}`), { status: 400 });
  }

  const libros = [];
  const errores = [];
  const avisos = [];
  filas.forEach((fila, indice) => {
    // +1 por el encabezado, +1 porque una planilla empieza a contar desde 1.
    const numeroFila = indice + 2;
    const titulo = (fila.titulo || "").trim();
    if (!titulo) {
      errores.push({ fila: numeroFila, mensaje: "Falta el título." });
      return;
    }
    const subtipoOriginal = (fila.subtipo || "").trim();
    let subtipo = subtipoOriginal || undefined;
    if (subtipoOriginal && !SUBTIPOS_VALIDOS.has(subtipoOriginal)) {
      avisos.push({
        fila: numeroFila,
        mensaje: `Subtipo "${subtipoOriginal}" no reconocido — se cargó como "impreso". Podés corregirlo después editando el libro.`,
      });
      subtipo = undefined;
    }
    libros.push({
      _fila: numeroFila,
      titulo,
      subtitulo: (fila.subtitulo || "").trim(),
      isbn: (fila.isbn || "").trim(),
      autores: aLista(fila.autores),
      editorial: (fila.editorial || "").trim(),
      lugarPublicacion: (fila.lugarPublicacion || "").trim(),
      anio: (fila.anio || "").trim(),
      paginas: (fila.paginas || "").trim(),
      materias: aLista(fila.materias),
      subtipo,
      urlAcceso: (fila.urlAcceso || "").trim(),
      portadaUrl: (fila.portadaUrl || "").trim(),
      notas: (fila.notas || "").trim(),
      ejemplares: aEjemplares(fila.ejemplares),
    });
  });
  return { libros, errores, avisos };
}
