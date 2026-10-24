import { Schema, model } from "mongoose";

// Una operación de circulación ya ejecutada con una Idempotency-Key (ver
// middleware/idempotencia.js): si el mismo pedido vuelve a llegar —un
// reintento porque se cortó la conexión antes de ver la respuesta— se
// devuelve la respuesta guardada en vez de prestar, devolver o renovar dos
// veces. Duran 24 h (índice TTL): alcanza para cualquier reintento real.
const claveIdempotenciaSchema = new Schema({
  clave: { type: String, required: true },
  // "<rol>:<id>" de quien hizo el pedido (staff o socio): la misma clave de
  // dos personas distintas son dos operaciones distintas.
  actor: { type: String, required: true },
  // Método + ruta, y un hash del cuerpo: la misma clave con otro pedido es
  // un error del cliente, no un reintento.
  ruta: { type: String, required: true },
  huella: { type: String, required: true },
  estado: { type: String, enum: ["en_curso", "completa"], default: "en_curso" },
  status: { type: Number, default: null },
  cuerpo: { type: Schema.Types.Mixed, default: null },
  creada: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

claveIdempotenciaSchema.index({ actor: 1, clave: 1 }, { unique: true });

export default model("ClaveIdempotencia", claveIdempotenciaSchema, "clavesidempotencia");
