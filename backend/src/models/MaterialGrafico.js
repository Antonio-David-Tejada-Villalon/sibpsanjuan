import { Schema, model } from "mongoose";
import { camposComunes, aplicarTimestampActualizado } from "./camposComunes.js";

// Material gráfico (fotografías, postales, láminas, afiches, grabados,
// ilustraciones). Circula igual que Libro/Seriada — sin variante digital en
// el alcance actual.
const materialGraficoSchema = new Schema({
  ...camposComunes(),
  autores: { type: [String], default: [] }, // fotógrafo/a, artista
  anio: { type: String, trim: true },
  subtipo: {
    type: String,
    enum: ["fotografia", "postal", "lamina", "afiche", "grabado", "ilustracion"],
    default: "fotografia",
  },
  tecnica: { type: String, trim: true }, // ej. "blanco y negro", "grabado en madera" — MARC 340 $a
});

aplicarTimestampActualizado(materialGraficoSchema);

export default model("MaterialGrafico", materialGraficoSchema);
