import { Schema, model } from "mongoose";

// Imágenes del CMS del OPAC (logos de la institución). Mismo criterio que
// las portadas (ver models/Portada.js): se suben, se decodifican y se
// vuelven a codificar como WebP sin metadatos, y se guardan en la base —
// no en el disco del hosting, que se borra en cada despliegue. Nunca se
// modifican: una versión vieja del contenido sigue apuntando a su logo.
const imagenCmsSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  datos: { type: Buffer, required: true },
  ancho: { type: Number, required: true },
  alto: { type: Number, required: true },
  bytes: { type: Number, required: true },
  subidaPor: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
  subidaEn: { type: Date, default: Date.now },
});

export default model("ImagenCms", imagenCmsSchema, "imagenescms");
