import { Schema, model } from "mongoose";
import { camposComunes, aplicarTimestampActualizado } from "./camposComunes.js";
import { esIssnValido } from "../utils/validacionChecksums.js";

// Publicaciones seriadas (revistas, diarios, periódicos, boletines,
// gacetas, journals científicos, newsletters). Circula igual que Libro:
// reusa Ejemplar/Prestamo/Solicitud sin cambios de forma (ver
// models/Ejemplar.js — itemTipo:"Seriada").
const seriadaSchema = new Schema({
  ...camposComunes(),
  // Validación de dígito verificador (ver BIBL-4 en AUDITORIA.md) — mismo
  // criterio que Libro.isbn: solo el checksum de la norma, vacío sigue
  // siendo válido.
  issn: {
    type: String,
    trim: true,
    validate: {
      validator: esIssnValido,
      message: (props) => `"${props.value}" no es un ISSN válido (el dígito verificador no coincide).`,
    },
  },
  // Entidad responsable (institución/editor) — a diferencia de Libro, acá
  // no se asume autoría personal; ver marc/marcxml.js (710, no 100).
  autores: { type: [String], default: [] },
  editorial: { type: String, trim: true },
  lugarPublicacion: { type: String, trim: true },
  periodicidad: {
    type: String,
    enum: [
      "diaria", "semanal", "quincenal", "mensual", "bimestral",
      "trimestral", "cuatrimestral", "semestral", "anual", "irregular",
    ],
    default: "irregular",
  },
  numeracionInicial: { type: String, trim: true }, // ej. "Vol. 1, no. 1"
  anioInicio: { type: String, trim: true },
  anioFin: { type: String, trim: true }, // vacío = sigue publicándose
});

aplicarTimestampActualizado(seriadaSchema);

export default model("Seriada", seriadaSchema);
