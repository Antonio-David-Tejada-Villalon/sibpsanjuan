import { Schema, model } from "mongoose";

// Contenido público del OPAC de una biblioteca (identidad, contacto, avisos
// y páginas), versionado: cada documento es una versión. Como mucho hay un
// borrador (lo que se está editando) y una publicada (lo que ve el
// público); las anteriores quedan archivadas como historial y se pueden
// restaurar como borrador. Ver routes/contenido.js.
//
// "datos" ya llega validado y normalizado por contenido/validar.js: acá se
// guarda tal cual, para que una versión vieja nunca cambie aunque cambien
// las reglas de validación.
const contenidoOpacSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  version: { type: Number, required: true },
  estado: { type: String, enum: ["borrador", "publicada", "archivada"], required: true },
  datos: { type: Schema.Types.Mixed, required: true },
  creadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
  creadoEn: { type: Date, default: Date.now },
  actualizadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
  actualizadoEn: { type: Date, default: Date.now },
  publicadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
  publicadoEn: { type: Date, default: null },
  // Restaurada desde otra versión (historial): de cuál.
  restauradaDe: { type: Number, default: null },
});

contenidoOpacSchema.index({ bibliotecaId: 1, version: 1 }, { unique: true });
// Un solo borrador y una sola publicada por biblioteca.
contenidoOpacSchema.index(
  { bibliotecaId: 1, estado: 1 },
  { unique: true, partialFilterExpression: { estado: { $in: ["borrador", "publicada"] } } }
);

export default model("ContenidoOpac", contenidoOpacSchema, "contenidosopac");
