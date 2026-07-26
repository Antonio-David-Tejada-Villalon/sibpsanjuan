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
  autores: { type: [String], default: [] },
  editorial: { type: String, trim: true },
  lugarPublicacion: { type: String, trim: true },
  anio: { type: String, trim: true },
  paginas: { type: String, trim: true },
  materias: { type: [String], default: [] },
  notas: { type: String, trim: true },
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
