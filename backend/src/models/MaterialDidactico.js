import { Schema, model } from "mongoose";
import { camposComunes, aplicarTimestampActualizado } from "./camposComunes.js";

// Material didáctico (juegos educativos, kits escolares, rompecabezas,
// material Montessori, material manipulativo). Circula igual que
// Libro/Seriada. En MARC21 es el bucket más atípico: Leader/06 "o" (kit) no
// tiene una configuración de 008/18-34 propia definida por LC — se usa la
// de Mixed Materials, en su mayoría sin codificar (ver marc/marcxml.js).
const materialDidacticoSchema = new Schema({
  ...camposComunes(),
  subtipo: {
    type: String,
    enum: ["juego_educativo", "kit_escolar", "rompecabezas", "material_montessori", "material_manipulativo"],
    default: "juego_educativo",
  },
  componentes: { type: String, trim: true }, // qué incluye el kit/juego — MARC 300 $e
  edadRecomendada: { type: String, trim: true }, // ej. "6-9 años" — MARC 521 $a
});

aplicarTimestampActualizado(materialDidacticoSchema);

export default model("MaterialDidactico", materialDidacticoSchema);
