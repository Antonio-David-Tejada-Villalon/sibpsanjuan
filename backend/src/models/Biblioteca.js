import { Schema, model } from "mongoose";

const bibliotecaSchema = new Schema({
  nombre: { type: String, required: true, trim: true },
  // Identifica a la biblioteca en la URL del OPAC (/opac/<código>) — en la
  // práctica es el número de registro que le otorgan (ej. de CONABIP para
  // una biblioteca popular), no un slug inventado, así que acepta números
  // puros ("100") además de texto ("bpsanjuan").
  codigo: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    match: /^[a-z0-9]{1,20}$/,
  },
  // Reglas de circulación de esta biblioteca. Editables después de creada
  // (ver PUT /api/bibliotecas/:id/circulacion) por su superbibliotecario, o
  // por admin/supervisor con esta biblioteca en su alcance.
  diasPrestamo: { type: Number, default: 14, min: 1 },
  maxRenovaciones: { type: Number, default: 2, min: 0 },
  // 0 = no cobra multa, solo marca el préstamo como atrasado.
  multaPorDiaVencido: { type: Number, default: 0, min: 0 },
  // true (default) = cuenta ese día como uno más del préstamo, igual que
  // siempre. false = lo saltea tanto para calcular cuándo vence un préstamo
  // nuevo como para contar días de atraso de uno vencido (ver
  // circulacion/reglas.js) — para bibliotecas que cierran sábados y/o
  // domingos y no quieren que esos días "corran" contra el socio.
  contarSabados: { type: Boolean, default: true },
  contarDomingos: { type: Boolean, default: true },
  creado: { type: Date, default: Date.now },
});

export default model("Biblioteca", bibliotecaSchema);
