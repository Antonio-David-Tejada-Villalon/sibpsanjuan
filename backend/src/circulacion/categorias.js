import Categoria from "../models/Categoria.js";
import Prestamo from "../models/Prestamo.js";
import Solicitud from "../models/Solicitud.js";
import { resolverPolitica } from "./reglas.js";

// Las dos categorías con las que arranca toda biblioteca nueva (ver POST
// /bibliotecas) y que scripts/migrar-categorias.js agrega a las que ya
// existían. Sin reglas propias: hasta que alguien las configure, se
// comportan exactamente como la regla general de la biblioteca.
export const CATEGORIAS_BASE = [
  { codigo: "ALUMNO", nombre: "Alumno", datosMinimos: true },
  { codigo: "DOCENTE", nombre: "Docente", datosMinimos: false },
];

export function normalizarCodigoCategoria(valor) {
  return typeof valor === "string" ? valor.trim().toUpperCase() : "";
}

// Idempotente: crea solo las que falten, sin tocar las que ya existen
// (aunque alguien les haya cambiado el nombre o las reglas).
export async function asegurarCategorias(bibliotecaId, categorias = CATEGORIAS_BASE) {
  for (const { codigo, nombre, datosMinimos = false } of categorias) {
    await Categoria.updateOne(
      { bibliotecaId, codigo, eliminadoEn: null },
      { $setOnInsert: { bibliotecaId, codigo, nombre, datosMinimos } },
      { upsert: true }
    );
  }
}

export async function buscarCategoria(bibliotecaId, codigo) {
  const normalizado = normalizarCodigoCategoria(codigo);
  if (!normalizado) return null;
  return Categoria.findOne({ bibliotecaId, codigo: normalizado, eliminadoEn: null });
}

export async function politicaDeSocio(socio, biblioteca) {
  const categoria = await buscarCategoria(biblioteca._id, socio?.categoria);
  return resolverPolitica(biblioteca, categoria);
}

// Lo que cuenta contra maxPrestamos: los préstamos sin devolver y los
// pedidos de préstamo del OPAC que todavía esperan respuesta (cada uno ya
// tiene un ejemplar reservado a su nombre). hastaId limita la cuenta a lo
// creado hasta ese documento inclusive — sirve para el chequeo de después
// de crear (ver circulacion.js y opac.js): si dos pedidos del mismo socio
// entran a la vez y los dos pasan el chequeo previo, solo se deshace el
// que llegó último, no los dos. excluirSolicitudId: al aprobar un pedido,
// ese pedido sigue "pendiente" hasta que se crea su préstamo — sin
// excluirlo se contaría dos veces.
export async function contarPrestamosEnCurso(bibliotecaId, socioId, { hastaId, excluirSolicitudId } = {}) {
  const hasta = hastaId ? { $lte: hastaId } : null;
  const filtroSolicitud = { bibliotecaId, socioId, tipo: "prestamo", estado: "pendiente" };
  if (hasta || excluirSolicitudId) {
    filtroSolicitud._id = { ...hasta, ...(excluirSolicitudId ? { $ne: excluirSolicitudId } : {}) };
  }
  const [activos, pendientes] = await Promise.all([
    Prestamo.countDocuments({ bibliotecaId, socioId, fechaDevolucion: null, ...(hasta ? { _id: hasta } : {}) }),
    Solicitud.countDocuments(filtroSolicitud),
  ]);
  return activos + pendientes;
}

export function mensajeMaxPrestamos(politica) {
  const quien = politica.categoria ? `la categoría ${politica.categoria.nombre}` : "esta biblioteca";
  const n = politica.maxPrestamos;
  return `Llegó al máximo de ${n} ${n === 1 ? "préstamo" : "préstamos"} a la vez de ${quien} (cuentan también los pedidos pendientes).`;
}
