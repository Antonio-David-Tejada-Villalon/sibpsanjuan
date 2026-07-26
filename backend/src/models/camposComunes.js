import { Schema } from "mongoose";

// Campos que comparten todos los tipos de material catalogables (Libro,
// Seriada, RecursoElectronico, ...). Es un objeto plano para spread dentro
// del schema de cada modelo (`new Schema({ ...camposComunes(), ...propios })`),
// no un mecanismo de herencia/discriminator — cada modelo sigue siendo un
// archivo concreto e independiente, solo se evita repetir estas líneas.
export function camposComunes() {
  return {
    bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true, index: true },
    titulo: { type: String, required: true, trim: true },
    subtitulo: { type: String, trim: true },
    // Opcional — portada/imagen para el catálogo del OPAC (ver
    // CatalogoPublico.jsx). Sin ella, el OPAC muestra un placeholder, igual
    // que Koha con "No hay imagen de cubierta disponible".
    portadaUrl: { type: String, trim: true },
    materias: { type: [String], default: [] },
    notas: { type: String, trim: true },
    creado: { type: Date, default: Date.now },
    actualizado: { type: Date, default: Date.now },
    // Borrado lógico: null = activo (mismo patrón que Libro/Socio).
    eliminadoEn: { type: Date, default: null },
    // Quién lo borró — antes solo quedaba el "cuándo" (ver CYBER-4bis en
    // AUDITORIA.md). No `required`: los documentos ya existentes antes de
    // este campo, y cualquier soft-delete futuro que por algún motivo no
    // tenga un actor autenticado, simplemente quedan null.
    eliminadoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
  };
}

// Cada modelo llama esto sobre su propio schema para bumpear "actualizado" —
// no se puede compartir un pre("save") vía objeto literal, así que queda
// como función aparte, pero igual de explícita en cada archivo que la usa.
export function aplicarTimestampActualizado(schema) {
  schema.pre("save", function (next) {
    this.actualizado = new Date();
    next();
  });
}
