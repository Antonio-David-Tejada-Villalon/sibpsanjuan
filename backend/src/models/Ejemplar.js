import { Schema, model } from "mongoose";
import { MODELOS_POR_TIPO } from "../circulacion/tiposCirculantes.js";

const ejemplarSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  // itemTipo/itemId reemplazan al antiguo libroId fijo: cualquier tipo de
  // material circulante se referencia igual, sin volver a tocar este
  // modelo. itemTipo es el nombre exacto del modelo Mongoose
  // correspondiente (para que refPath lo resuelva) — el enum se deriva de
  // circulacion/tiposCirculantes.js, que es el único lugar que hace falta
  // tocar para sumar un tipo circulante nuevo.
  itemTipo: { type: String, enum: Object.keys(MODELOS_POR_TIPO), required: true },
  itemId: { type: Schema.Types.ObjectId, required: true, refPath: "itemTipo", index: true },
  codigoBarras: { type: String, trim: true, required: true },
  signatura: { type: String, trim: true },
  // "reservado": el socio pidió este ejemplar puntual desde el OPAC y está
  // apartado hasta que el staff apruebe o rechace la Solicitud (ver
  // routes/opac.js POST /solicitudes) — no cuenta como disponible en el
  // catálogo, pero tampoco es un préstamo todavía.
  estado: { type: String, enum: ["disponible", "reservado", "prestado"], default: "disponible" },
});

ejemplarSchema.index({ bibliotecaId: 1, itemTipo: 1, itemId: 1 });
// Único por biblioteca, no globalmente: dos bibliotecas distintas pueden
// usar el mismo esquema de códigos de barra sin pisarse.
ejemplarSchema.index({ bibliotecaId: 1, codigoBarras: 1 }, { unique: true });

export default model("Ejemplar", ejemplarSchema);
