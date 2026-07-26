import { Schema, model } from "mongoose";

// Catálogo simple de formas normalizadas de autor (ver BIBL-1 en
// AUDITORIA.md) — no es un módulo de autoridades MARC21 completo, a
// propósito: solo lo mínimo para que "Borges, Jorge Luis" y "Borges, J.L."
// se agrupen como una sola persona en el facetado del OPAC, sin tocar
// ningún registro bibliográfico existente (Libro.autores, Seriada.autores,
// etc. siguen siendo texto libre — esto es una capa de resolución en el
// momento de leer, no una reescritura de los datos ya cargados).
const autorSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  // La forma "correcta"/preferida con la que agrupar — ej. "Borges, Jorge Luis".
  formaAutorizada: { type: String, required: true, trim: true },
  // Otras formas con las que puede aparecer citado en un registro
  // bibliográfico — ej. ["Borges, J.L.", "Jorge Luis Borges"].
  variantes: { type: [String], default: [] },
  creado: { type: Date, default: Date.now },
  // Borrado lógico, mismo criterio que el resto del sistema (ver GOB-2).
  eliminadoEn: { type: Date, default: null },
  eliminadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
});

// Única por biblioteca, no globalmente: dos bibliotecas pueden tener cada
// una su propio registro para el mismo autor, sin pisarse. Parcial (solo
// entre activos) por el mismo motivo que numeroSocio en Socio.js.
autorSchema.index(
  { bibliotecaId: 1, formaAutorizada: 1 },
  { unique: true, partialFilterExpression: { eliminadoEn: null } }
);

export default model("Autor", autorSchema);
