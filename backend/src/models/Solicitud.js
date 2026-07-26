import { Schema, model } from "mongoose";
import { MODELOS_POR_TIPO } from "../circulacion/tiposCirculantes.js";

const solicitudSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  socioId: { type: Schema.Types.ObjectId, ref: "Socio", required: true, index: true },
  tipo: { type: String, enum: ["prestamo", "renovacion"], required: true },
  // Uno u otro según "tipo": itemTipo/itemId para pedir un préstamo nuevo
  // (mismo mecanismo polimórfico que Ejemplar/Prestamo — ver Ejemplar.js),
  // prestamoId para pedir renovar uno que ya tiene.
  itemTipo: { type: String, enum: Object.keys(MODELOS_POR_TIPO) },
  itemId: { type: Schema.Types.ObjectId, refPath: "itemTipo" },
  // Solo para tipo "prestamo": el ejemplar concreto que quedó reservado al
  // crear la solicitud (ver POST /solicitudes en routes/opac.js) — al
  // aprobar se usa este mismo, no uno elegido de nuevo, y al rechazar se
  // libera de vuelta a "disponible".
  ejemplarId: { type: Schema.Types.ObjectId, ref: "Ejemplar", default: null },
  prestamoId: { type: Schema.Types.ObjectId, ref: "Prestamo" },
  estado: { type: String, enum: ["pendiente", "aprobada", "rechazada"], default: "pendiente" },
  notaStaff: { type: String, trim: true },
  fechaSolicitud: { type: Date, default: Date.now },
  fechaResolucion: { type: Date },
  // Usuario de biblioteca (staff) que aprobó o rechazó — null mientras está
  // pendiente. Sin esto no hay forma de reconstruir quién resolvió qué.
  resueltoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
});

export default model("Solicitud", solicitudSchema);
