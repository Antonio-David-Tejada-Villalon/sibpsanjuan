import { Schema, model } from "mongoose";

// Portada procesada de un ítem del catálogo (ver portadas/servicio.js): dos
// WebP ya achicados y sin metadatos, guardados en la base y no en disco —
// el disco del hosting gratuito se borra en cada despliegue. Cada uno pesa
// unas decenas de KB. El OPAC los sirve desde
// /api/opac/:codigo/portadas/:itemId/(grande|miniatura).webp; el navegador
// nunca pide la imagen al sitio de origen.
const portadaSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  itemTipo: { type: String, required: true },
  itemId: { type: Schema.Types.ObjectId, required: true, unique: true },
  // De dónde salió, para dar el crédito que corresponde y para saber qué
  // reglas de conservación aplican (ver expiraEn).
  fuente: { type: String, enum: ["openlibrary", "googlebooks", "url"], required: true },
  origen: { type: String, required: true },
  grande: { type: Buffer, required: true },
  miniatura: { type: Buffer, required: true },
  ancho: { type: Number, required: true },
  alto: { type: Number, required: true },
  // Hash corto del contenido: va en la URL pública (?v=...), así el
  // navegador puede guardarla en caché mucho tiempo y una portada nueva
  // nunca muestra la vieja.
  version: { type: String, required: true },
  // Solo Google Books: hasta cuándo permite conservarla su cabecera de caché
  // (Términos de las APIs de Google, §5e). Vencida, deja de mostrarse.
  expiraEn: { type: Date, default: null },
  actualizadaPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
  actualizada: { type: Date, default: Date.now },
});

export default model("Portada", portadaSchema);
