import { Schema, model } from "mongoose";

// Las notificaciones no se guardan: se arman en el momento a partir de los
// pedidos, reservas y préstamos (ver notificaciones/). Lo único que se
// guarda es cuáles ya vio cada uno, para que la campana cuente solo las
// nuevas. Se borran solas a los 90 días: para entonces ya no se muestran.
const notificacionVistaSchema = new Schema({
  // "usuario:<id>" (staff) o "socio:<id>".
  destinatario: { type: String, required: true },
  clave: { type: String, required: true, maxlength: 200 },
  vistaEn: { type: Date, default: Date.now, expires: 90 * 24 * 60 * 60 },
});

notificacionVistaSchema.index({ destinatario: 1, clave: 1 }, { unique: true });

export default model("NotificacionVista", notificacionVistaSchema, "notificacionesvistas");
