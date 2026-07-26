import { Schema, model } from "mongoose";

// Los 5 permisos individualmente otorgables a un "bibliotecario" por su
// superbibliotecario — ver circulacion.js/opac.js/libros.js/socios.js/
// export.js para dónde se chequea cada uno vía requierePermiso().
export const PERMISOS_BIBLIOTECARIO = ["catalogar", "prestamos", "devoluciones", "socios", "exportar"];

const usuarioSchema = new Schema({
  usuario: { type: String, required: true, trim: true, unique: true },
  passwordHash: { type: String, required: true },
  // Jerarquía de 4 niveles (ver utils/jerarquia.js para el rango entre
  // ellos): admin (global) > supervisor (varias bibliotecas) >
  // superbibliotecario (una biblioteca, acceso completo ahí) >
  // bibliotecario (una biblioteca, acceso según "permisos").
  rol: {
    type: String,
    enum: ["admin", "supervisor", "superbibliotecario", "bibliotecario"],
    required: true,
  },
  // superbibliotecario/bibliotecario: una sola biblioteca, igual que el
  // viejo rol "biblioteca" — sin este campo no cambia de forma, así que
  // ninguna ruta que ya lee bibliotecaId como escalar necesita cambiar.
  bibliotecaId: {
    type: Schema.Types.ObjectId,
    ref: "Biblioteca",
    required: function () {
      return this.rol === "superbibliotecario" || this.rol === "bibliotecario";
    },
    default: null,
  },
  // supervisor: varias bibliotecas a la vez — por eso no puede compartir
  // el campo bibliotecaId de arriba. default: undefined (no "[]") para que
  // el resto de los roles ni siquiera lo lleven en el documento.
  bibliotecasSupervisadas: {
    type: [{ type: Schema.Types.ObjectId, ref: "Biblioteca" }],
    default: undefined,
  },
  // Única capacidad admin-otorgable a un supervisor por ahora: crear
  // bibliotecas nuevas (no solo gestionar las que ya tiene asignadas). Se
  // suman más flags booleanos así si hacen falta — no un motor genérico.
  puedeCrearBibliotecas: { type: Boolean, default: false },
  // Requerido solo para "bibliotecario" — lo asigna su superbibliotecario.
  permisos: {
    type: {
      catalogar: { type: Boolean, default: false },
      prestamos: { type: Boolean, default: false },
      devoluciones: { type: Boolean, default: false },
      socios: { type: Boolean, default: false },
      exportar: { type: Boolean, default: false },
    },
    required: function () {
      return this.rol === "bibliotecario";
    },
    default: undefined,
  },
  creado: { type: Date, default: Date.now },
});

export default model("Usuario", usuarioSchema);
