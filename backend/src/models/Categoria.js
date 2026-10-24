import { Schema, model } from "mongoose";

function entero(mensaje) {
  return { validator: (v) => v === null || v === undefined || Number.isInteger(v), message: mensaje };
}

// Categoría de socio (ej. ALUMNO, DOCENTE) con sus propias reglas de
// circulación. Cada regla en null = "usa la de la biblioteca" (ver
// resolverPolitica en circulacion/reglas.js): así una categoría recién
// creada no inventa ningún límite, y si la biblioteca cambia su regla
// general, las categorías que no la pisaron la siguen.
const categoriaSchema = new Schema({
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
  // Es lo que se guarda en Socio.categoria y lo que sale como categorycode
  // en el CSV de socios para Koha (ver export/patronesCsv.js) — Koha lo
  // limita a 10 caracteres. No se puede cambiar una vez creada: dejaría a
  // sus socios apuntando a un código que ya no existe.
  codigo: {
    type: String,
    required: [true, "El código es obligatorio."],
    trim: true,
    uppercase: true,
    match: [/^[A-Z0-9_-]{1,10}$/, "El código va en mayúsculas, sin espacios, hasta 10 letras o números (ej. ALUMNO)."],
  },
  nombre: { type: String, required: [true, "El nombre es obligatorio."], trim: true, maxlength: 60 },
  diasPrestamo: {
    type: Number,
    default: null,
    min: [1, "Los días de préstamo tienen que ser al menos 1."],
    validate: entero("Los días de préstamo tienen que ser un número entero."),
  },
  maxRenovaciones: {
    type: Number,
    default: null,
    min: [0, "Las renovaciones máximas no pueden ser negativas."],
    validate: entero("Las renovaciones máximas tienen que ser un número entero."),
  },
  multaPorDiaVencido: {
    type: Number,
    default: null,
    min: [0, "La multa por día no puede ser negativa."],
  },
  // Préstamos activos a la vez (contando los pedidos pendientes del OPAC).
  // null = sin tope, que es como funcionaba todo antes de las categorías.
  maxPrestamos: {
    type: Number,
    default: null,
    min: [1, "El máximo de préstamos tiene que ser al menos 1."],
    validate: entero("El máximo de préstamos tiene que ser un número entero."),
  },
  // Categoría de menores (Alumno): al cargar sus socios se piden solo los
  // datos necesarios — legajo, apellido y nombre, curso y, si hace falta,
  // un correo — y la API rechaza DNI, domicilio, teléfono y fecha de
  // nacimiento (ver routes/socios.js). No borra lo que ya estuviera cargado.
  datosMinimos: { type: Boolean, default: false },
  creado: { type: Date, default: Date.now },
  actualizado: { type: Date, default: Date.now },
  eliminadoEn: { type: Date, default: null },
  eliminadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
});

// Único solo entre categorías activas — mismo criterio que numeroSocio en
// models/Socio.js.
categoriaSchema.index(
  { bibliotecaId: 1, codigo: 1 },
  { unique: true, partialFilterExpression: { eliminadoEn: null } }
);

categoriaSchema.pre("save", function (next) {
  this.actualizado = new Date();
  next();
});

export default model("Categoria", categoriaSchema);
