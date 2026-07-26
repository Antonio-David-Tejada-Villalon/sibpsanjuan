import { Schema, model } from "mongoose";
import { camposComunes, aplicarTimestampActualizado } from "./camposComunes.js";

// Objetos de museo (obras de arte, medallas, objetos históricos,
// maquetas). A propósito NO sigue un estándar de registro de colecciones
// completo (Spectrum/Object ID) — es captura simplificada con los campos
// más esenciales de procedencia/condición, igual de honesto que el resto
// del proyecto sobre lo que no cubre.
//
// No circula (ver circulacion/tiposCirculantes.js — este modelo
// deliberadamente no aparece ahí) ni tiene export MARC, mismo criterio
// que Archivo.js: son piezas únicas que se consultan/exhiben, no se
// prestan, y MARC21 no las describe bien.
const objetoSchema = new Schema({
  ...camposComunes(),
  subtipo: {
    type: String,
    enum: ["obra_de_arte", "medalla", "objeto_historico", "maqueta"],
    default: "objeto_historico",
  },
  numeroInventario: { type: String, trim: true },
  procedencia: { type: String, trim: true }, // de dónde proviene / quién lo donó
  estadoConservacion: {
    type: String,
    enum: ["excelente", "bueno", "regular", "malo"],
    default: "bueno",
  },
  ubicacion: { type: String, trim: true }, // dónde está guardado/exhibido físicamente
  periodo: { type: String, trim: true }, // fecha o período de creación
  materiales: { type: String, trim: true }, // de qué está hecho
  dimensiones: { type: String, trim: true },
});

aplicarTimestampActualizado(objetoSchema);

export default model("Objeto", objetoSchema);
