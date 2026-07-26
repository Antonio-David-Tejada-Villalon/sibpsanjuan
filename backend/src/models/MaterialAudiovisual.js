import { Schema, model } from "mongoose";
import { camposComunes, aplicarTimestampActualizado } from "./camposComunes.js";

// Material audiovisual (DVD, BluRay, VHS, documentales, películas, videos
// educativos, streaming). Circula igual que Libro/Seriada, salvo el subtipo
// "streaming" (intrínsecamente digital), que puede llevar urlAcceso y no
// necesita ejemplares — mismo patrón que Material sonoro/Libro digital.
const materialAudiovisualSchema = new Schema({
  ...camposComunes(),
  autores: { type: [String], default: [] }, // director(es)
  editorial: { type: String, trim: true }, // productora/distribuidora
  anio: { type: String, trim: true },
  subtipo: {
    type: String,
    enum: ["dvd", "bluray", "vhs", "documental", "pelicula", "video_educativo", "streaming"],
    default: "dvd",
  },
  duracion: { type: String, trim: true }, // ej. "01:32:00" — mapea a MARC 306
  urlAcceso: { type: String, trim: true }, // solo relevante si subtipo es "streaming"
});

aplicarTimestampActualizado(materialAudiovisualSchema);

export default model("MaterialAudiovisual", materialAudiovisualSchema);
