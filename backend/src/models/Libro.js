import { Schema, model } from "mongoose";
import { esIsbnValido } from "../utils/validacionChecksums.js";

// Los ejemplares (copias físicas) viven en su propia colección
// (models/Ejemplar.js), no acá como array embebido — necesitan estado
// propio ("disponible"/"prestado") para que circulación funcione. La
// ruta de libros sigue aceptando un array "ejemplares" en el body por
// compatibilidad con el formulario existente, y crea los Ejemplar por
// detrás.
const libroSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  // Validación de dígito verificador (ISBN-10 u ISBN-13, ver BIBL-4 en
  // AUDITORIA.md) — no valida contra ningún catálogo externo, solo el
  // checksum matemático de la norma. Vacío sigue siendo válido (opcional).
  isbn: {
    type: String,
    trim: true,
    validate: {
      validator: esIsbnValido,
      message: (props) => `"${props.value}" no es un ISBN válido (el dígito verificador no coincide).`,
    },
  },
  titulo: { type: String, required: true, trim: true },
  subtitulo: { type: String, trim: true },
  // 245$c — mención de responsabilidad (ej. "por Jorge Luis Borges").
  mencionResponsabilidad: { type: String, trim: true },
  // 246 — forma variante del título (ej. título en la tapa distinto del de portada).
  tituloVariante: { type: String, trim: true },
  // 250$a — mención de edición (ej. "2a ed.", "Edición corregida y aumentada").
  edicion: { type: String, trim: true },
  autores: { type: [String], default: [] },
  // 110$b — entidad corporativa como autor (ej. para anuarios/informes/memorias
  // institucionales, donde el responsable es una institución y no una persona).
  autorCorporativo: { type: String, trim: true },
  editorial: { type: String, trim: true },
  lugarPublicacion: { type: String, trim: true },
  anio: { type: String, trim: true },
  paginas: { type: String, trim: true },
  // 300$b/$c/$e — resto de la descripción física, además de la extensión (paginas).
  detallesFisicos: { type: String, trim: true },
  dimensiones: { type: String, trim: true },
  materialComplementario: { type: String, trim: true },
  // 080$a — Clasificación Decimal Universal.
  cdu: { type: String, trim: true },
  // 082$a — Clasificación Decimal Dewey.
  dewey: { type: String, trim: true },
  // 490 — mención de serie a la que pertenece el libro (colección editorial).
  serie: { type: String, trim: true },
  serieVolumen: { type: String, trim: true },
  issn: { type: String, trim: true },
  materias: { type: [String], default: [] },
  notas: { type: String, trim: true },
  // 521$a — a qué público está dirigido (ej. "Para niños de 8 a 10 años").
  notaAudiencia: { type: String, trim: true },
  // 546$a — idioma(s) del contenido, cuando no es obvio o hay más de uno.
  notaIdioma: { type: String, trim: true },
  // 856$i — texto que acompaña al enlace de urlAcceso (ej. "Acceder al texto completo").
  urlInstruccion: { type: String, trim: true },
  // Subtipos dentro del bucket "Libros" (impreso sigue siendo el caso
  // común). urlAcceso solo tiene sentido para "digital"/"ebook" — mapea a
  // MARC 856 $u y es lo que el frontend usa para ofrecer "Acceder" en vez
  // de "Pedir préstamo" cuando el libro no tiene ejemplares físicos.
  subtipo: {
    type: String,
    enum: [
      "impreso", "digital", "ebook", "folleto", "manual", "diccionario",
      "enciclopedia", "tesis", "tesina", "monografia", "atlas", "anuario",
      "memoria", "informe",
    ],
    default: "impreso",
  },
  urlAcceso: { type: String, trim: true },
  // Opcional — portada/imagen para el catálogo del OPAC (ver
  // CatalogoPublico.jsx). Sin ella, el OPAC muestra un placeholder.
  portadaUrl: { type: String, trim: true },
  creado: { type: Date, default: Date.now },
  actualizado: { type: Date, default: Date.now },
  // Borrado lógico: null = activo. "Eliminar" desde la UI marca esto en
  // vez de borrar el documento — un clic de más no debería ser
  // irreversible al instante (ver GOB-2 en la auditoría).
  eliminadoEn: { type: Date, default: null },
  // Quién lo borró — ver CYBER-4bis en AUDITORIA.md.
  eliminadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
});

libroSchema.pre("save", function (next) {
  this.actualizado = new Date();
  next();
});

export default model("Libro", libroSchema);
