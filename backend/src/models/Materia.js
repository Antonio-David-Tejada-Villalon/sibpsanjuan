import { Schema, model } from "mongoose";

// Catálogo simple de formas normalizadas de materia (ver BIBL-3 en
// AUDITORIA.md) — mismo criterio que Autor.js (BIBL-1): no es un
// vocabulario controlado completo (LEMB u otro tesauro formal), a
// propósito, solo lo mínimo para que "Historia argentina" e "Historia de
// la Argentina" se agrupen como una sola materia en el facetado del OPAC,
// sin tocar ningún registro bibliográfico existente (Libro.materias,
// Seriada.materias, etc. siguen siendo texto libre — esto es una capa de
// resolución en el momento de leer, no una reescritura de los datos ya
// cargados).
const materiaSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  // La forma "correcta"/preferida con la que agrupar — ej. "Historia argentina".
  formaAutorizada: { type: String, required: true, trim: true },
  // Otras formas con las que puede aparecer citada en un registro
  // bibliográfico — ej. ["Historia de la Argentina", "Argentina - Historia"].
  variantes: { type: [String], default: [] },
  creado: { type: Date, default: Date.now },
  // Borrado lógico, mismo criterio que el resto del sistema (ver GOB-2).
  eliminadoEn: { type: Date, default: null },
  eliminadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
});

// Única por biblioteca, no globalmente — mismo criterio que Autor.js.
materiaSchema.index(
  { bibliotecaId: 1, formaAutorizada: 1 },
  { unique: true, partialFilterExpression: { eliminadoEn: null } }
);

export default model("Materia", materiaSchema);
