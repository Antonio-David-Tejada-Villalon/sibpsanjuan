import { Schema, model } from "mongoose";
import { camposComunes, aplicarTimestampActualizado } from "./camposComunes.js";

// PDF, EPUB, MOBI, HTML, sitios web, bases de datos, software. A propósito
// NO tiene Ejemplar/Prestamo/Solicitud — se accede vía urlAcceso, no se
// "pide prestado". Esa ausencia (nunca aparece en
// circulacion/tiposCirculantes.js, no tiene ruta de ejemplares) es la
// forma en que este bucket queda marcado como no circulante, en vez de un
// campo booleano en el propio documento.
const recursoElectronicoSchema = new Schema({
  ...camposComunes(),
  autores: { type: [String], default: [] },
  editorial: { type: String, trim: true },
  anio: { type: String, trim: true },
  tipoRecurso: {
    type: String,
    enum: ["pdf", "epub", "mobi", "html", "sitio_web", "base_de_datos", "software"],
    required: true,
  },
  urlAcceso: { type: String, required: true, trim: true },
});

aplicarTimestampActualizado(recursoElectronicoSchema);

export default model("RecursoElectronico", recursoElectronicoSchema);
