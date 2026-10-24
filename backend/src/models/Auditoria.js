import { Schema, model } from "mongoose";

// Registro de operaciones sensibles: quién hizo qué, sobre qué entidad,
// cuándo y con qué resultado. A propósito NO guarda los datos que se
// vieron o cambiaron (ni nombres de socios): solo identificadores, para que
// el propio registro no se convierta en otra copia de datos personales.
const auditoriaSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", default: null, index: true },
  actorId: { type: Schema.Types.ObjectId, required: true },
  actorRol: { type: String, required: true },
  // Ej. "socio.ver_datos_contacto". Formato <entidad>.<acción>.
  accion: { type: String, required: true },
  entidadTipo: { type: String, required: true },
  entidadId: { type: Schema.Types.ObjectId, required: true },
  resultado: { type: String, enum: ["ok", "denegado"], required: true },
  fecha: { type: Date, default: Date.now, index: true },
});

export default model("Auditoria", auditoriaSchema, "auditoria");
