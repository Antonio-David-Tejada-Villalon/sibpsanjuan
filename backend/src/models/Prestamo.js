import { Schema, model } from "mongoose";
import { MODELOS_POR_TIPO } from "../circulacion/tiposCirculantes.js";

const prestamoSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  socioId: { type: Schema.Types.ObjectId, ref: "Socio", required: true, index: true },
  // itemTipo/itemId: mismo mecanismo polimórfico que Ejemplar (ver ese
  // archivo) — el préstamo referencia cualquier tipo de material circulante.
  itemTipo: { type: String, enum: Object.keys(MODELOS_POR_TIPO), required: true },
  itemId: { type: Schema.Types.ObjectId, required: true, refPath: "itemTipo" },
  ejemplarId: { type: Schema.Types.ObjectId, ref: "Ejemplar", required: true },
  fechaEntrega: { type: Date, default: Date.now },
  fechaVencimiento: { type: Date, required: true },
  fechaDevolucion: { type: Date, default: null }, // null = préstamo activo
  renovaciones: { type: Number, default: 0 },
  // Usuario de biblioteca (staff) que registró el préstamo (directo o vía
  // aprobación de solicitud) y el que procesó la devolución — sin esto no
  // hay forma de reconstruir responsabilidades dentro de una biblioteca.
  registradoPor: { type: Schema.Types.ObjectId, ref: "Usuario" },
  devueltoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
});

export default model("Prestamo", prestamoSchema);
