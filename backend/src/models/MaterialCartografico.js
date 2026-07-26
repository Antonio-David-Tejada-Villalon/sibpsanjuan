import { Schema, model } from "mongoose";
import { camposComunes, aplicarTimestampActualizado } from "./camposComunes.js";

// Material cartográfico (mapas, planos, cartas topográficas, globos
// terráqueos). Circula igual que Libro/Seriada — no tiene variante digital
// en el alcance actual, así que no lleva urlAcceso (a diferencia de
// Sonoro/Audiovisual).
const materialCartograficoSchema = new Schema({
  ...camposComunes(),
  autores: { type: [String], default: [] },
  editorial: { type: String, trim: true },
  anio: { type: String, trim: true },
  subtipo: {
    type: String,
    enum: ["mapa", "plano", "carta_topografica", "globo_terraqueo"],
    default: "mapa",
  },
  escala: { type: String, trim: true }, // ej. "1:50.000" — mapea a MARC 255 $a
  proyeccion: { type: String, trim: true }, // MARC 255 $b
  coordenadas: { type: String, trim: true }, // MARC 255 $c
});

aplicarTimestampActualizado(materialCartograficoSchema);

export default model("MaterialCartografico", materialCartograficoSchema);
