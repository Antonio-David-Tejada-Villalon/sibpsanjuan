import { Schema, model } from "mongoose";

const socioSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  numeroSocio: { type: String, required: true, trim: true },
  apellido: { type: String, required: true, trim: true },
  nombre: { type: String, required: true, trim: true },
  dni: { type: String, trim: true },
  direccion: { type: String, trim: true },
  localidad: { type: String, trim: true },
  categoria: { type: String, trim: true, default: "ADULTO" },
  fechaNacimiento: { type: String, trim: true },
  telefono: { type: String, trim: true },
  email: { type: String, trim: true },
  // Nulo hasta que el staff le da de alta un login de OPAC.
  passwordHash: { type: String, default: null },
  creado: { type: Date, default: Date.now },
  actualizado: { type: Date, default: Date.now },
  // Borrado lógico: null = activo (ver GOB-2 en la auditoría — mismo
  // criterio que Libro).
  eliminadoEn: { type: Date, default: null },
  // Quién lo borró — ver CYBER-4bis en AUDITORIA.md.
  eliminadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
});

// Único solo entre socios activos — parcial a propósito: si no, borrar
// (lógicamente) un socio y volver a cargar el mismo numeroSocio después
// chocaría contra el índice, porque el documento "eliminado" seguiría
// existiendo físicamente.
socioSchema.index(
  { bibliotecaId: 1, numeroSocio: 1 },
  { unique: true, partialFilterExpression: { eliminadoEn: null } }
);

socioSchema.pre("save", function (next) {
  this.actualizado = new Date();
  next();
});

export default model("Socio", socioSchema);
