import { Schema, model } from "mongoose";
import { MODELOS_POR_TIPO } from "../circulacion/tiposCirculantes.js";

// Un ejemplar es una copia concreta de un material (el "ítem" de Koha, su
// campo 952): el registro bibliográfico dice qué es la obra; el ejemplar,
// qué copia es, dónde está y si se puede prestar. Ver
// circulacion/ejemplares.js para las reglas de qué copia circula.
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
  codigoBarras: { type: String, trim: true, required: true }, // 952$p
  signatura: { type: String, trim: true }, // 952$o
  numeroCopia: { type: String, trim: true, maxlength: 20 }, // 952$t
  // Ubicación en la biblioteca: estante, sala, colección (952$c).
  ubicacion: { type: String, trim: true, maxlength: 80 },
  // Situación de circulación, la maneja el sistema. "reservado": apartado
  // para un pedido o una reserva (ver models/Solicitud.js).
  estado: { type: String, enum: ["disponible", "reservado", "prestado"], default: "disponible" },
  // Si se presta (952$7 y 952$5 de Koha): "sala" se consulta solo en la
  // biblioteca; "no_prestable", por ejemplo, un ejemplar de referencia.
  uso: { type: String, enum: ["prestamo", "sala", "no_prestable"], default: "prestamo" },
  // Estado físico (952$4, $1 y $0): cualquiera distinto de "" lo saca de
  // circulación hasta que se corrija.
  condicion: { type: String, enum: ["", "danado", "reparacion", "extraviado", "retirado"], default: "" },
  fechaAdquisicion: { type: String, trim: true, match: /^(\d{4}-\d{2}-\d{2})?$/ }, // 952$d
  fuenteAdquisicion: { type: String, trim: true, maxlength: 120 }, // 952$e: compra, donación…
  precio: { type: Number, min: 0 }, // 952$g
  numeroInventario: { type: String, trim: true, maxlength: 40 }, // 952$i
  notaPublica: { type: String, trim: true, maxlength: 500 }, // 952$z
  notaInterna: { type: String, trim: true, maxlength: 500 }, // 952$x
  // La última vez que alguien lo tuvo en la mano: se actualiza al prestarlo,
  // devolverlo o apartarlo (952$r).
  ultimaVezVisto: { type: Date, default: Date.now },
  creado: { type: Date, default: Date.now },
});

ejemplarSchema.index({ bibliotecaId: 1, itemTipo: 1, itemId: 1 });
// Único por biblioteca, no globalmente: dos bibliotecas distintas pueden
// usar el mismo esquema de códigos de barra sin pisarse.
ejemplarSchema.index({ bibliotecaId: 1, codigoBarras: 1 }, { unique: true });

export default model("Ejemplar", ejemplarSchema);
