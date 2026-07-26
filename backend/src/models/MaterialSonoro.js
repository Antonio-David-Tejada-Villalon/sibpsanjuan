import { Schema, model } from "mongoose";
import { camposComunes, aplicarTimestampActualizado } from "./camposComunes.js";

// Material sonoro (CD, vinilo, cassette, audiolibros, podcast, MP3, música
// digital). Circula igual que Libro/Seriada (ver models/Ejemplar.js), salvo
// los subtipos intrínsecamente digitales (podcast, mp3, musica_digital),
// que además pueden llevar urlAcceso y no necesitan ejemplares — mismo
// patrón que Libro con subtipo "digital"/"ebook" (ver Libro.js).
const materialSonoroSchema = new Schema({
  ...camposComunes(),
  autores: { type: [String], default: [] }, // intérprete(s)/compositor(es)
  editorial: { type: String, trim: true }, // sello discográfico
  anio: { type: String, trim: true },
  subtipo: {
    type: String,
    enum: ["cd", "vinilo", "cassette", "audiolibro", "podcast", "mp3", "musica_digital"],
    default: "cd",
  },
  duracion: { type: String, trim: true }, // ej. "01:32:00" — mapea a MARC 306
  urlAcceso: { type: String, trim: true }, // solo relevante si subtipo es podcast/mp3/musica_digital
});

aplicarTimestampActualizado(materialSonoroSchema);

export default model("MaterialSonoro", materialSonoroSchema);
