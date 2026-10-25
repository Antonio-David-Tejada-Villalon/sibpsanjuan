import Ejemplar from "../models/Ejemplar.js";
import Solicitud from "../models/Solicitud.js";
import Prestamo from "../models/Prestamo.js";
import { MODELOS_POR_TIPO } from "./tiposCirculantes.js";
import { FILTRO_PRESTABLE } from "./ejemplares.js";
import { superaMaxPrestamos } from "./reglas.js";
import { contarPrestamosEnCurso, mensajeMaxPrestamos } from "./categorias.js";

// Pedidos y reservas, como las reservas de Koha. Un pedido (del OPAC) o una
// reserva (del mostrador) aparta un ejemplar libre y queda pendiente hasta
// que el staff lo entrega (aprobar = prestar). Si no hay ninguno libre pero
// hay copias prestadas, la reserva queda en espera: cuando vuelve una, la
// más vieja se queda con ese ejemplar (ver asignarAReservaEnEspera).

// codigo: para que cada pantalla lo diga a su manera (el OPAC le habla al
// socio de "vos"; el mostrador, del socio en tercera persona).
export class ErrorReserva extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export async function reservarParaSocio({
  bibliotecaId,
  socioId,
  politica,
  itemTipo,
  itemId,
  ejemplarId = null,
  origen,
  permitirEspera,
  mensajeMaximo = mensajeMaxPrestamos,
}) {
  const Modelo = MODELOS_POR_TIPO[itemTipo];
  if (!Modelo) throw new ErrorReserva(400, "tipo", "Ese tipo de material no se presta.");
  const item = await Modelo.exists({ _id: itemId, bibliotecaId, eliminadoEn: null });
  if (!item) throw new ErrorReserva(404, "no_encontrado", "Material no encontrado.");
  const yaPedido = await Solicitud.exists({
    bibliotecaId,
    socioId,
    tipo: "prestamo",
    itemTipo,
    itemId,
    estado: { $in: ["pendiente", "en_espera"] },
  });
  if (yaPedido) throw new ErrorReserva(409, "duplicado", "Ya hay un pedido o una reserva de este material a nombre de este socio.");
  if (await Prestamo.exists({ bibliotecaId, socioId, itemTipo, itemId, fechaDevolucion: null })) {
    throw new ErrorReserva(409, "ya_prestado", "Ya tiene prestado un ejemplar de este material.");
  }

  const delMaterial = { bibliotecaId, itemTipo, itemId, ...FILTRO_PRESTABLE };
  const libre = { ...delMaterial, estado: "disponible", ...(ejemplarId ? { _id: ejemplarId } : {}) };
  if (await Ejemplar.exists(libre)) {
    // Un pedido con ejemplar apartado cuenta como un préstamo más.
    if (superaMaxPrestamos(politica, await contarPrestamosEnCurso(bibliotecaId, socioId))) {
      throw new ErrorReserva(409, "maximo", mensajeMaximo(politica));
    }
    // Atómico: si dos piden el último ejemplar a la vez, uno solo se lo lleva.
    const ejemplar = await Ejemplar.findOneAndUpdate(libre, { estado: "reservado", ultimaVezVisto: new Date() }, { new: true });
    if (ejemplar) {
      try {
        return await Solicitud.create({
          bibliotecaId,
          socioId,
          tipo: "prestamo",
          itemTipo,
          itemId,
          ejemplarId: ejemplar._id,
          origen,
          fechaDisponible: new Date(),
        });
      } catch (err) {
        await Ejemplar.updateOne({ _id: ejemplar._id }, { estado: "disponible" });
        if (err.code === 11000) throw new ErrorReserva(409, "duplicado", "Ya hay un pedido pendiente igual a este.");
        throw err;
      }
    }
  }
  if (ejemplarId) throw new ErrorReserva(409, "ocupado", "Ese ejemplar ya no está libre.");
  // Sin ejemplar libre: en espera, solo si hay copias que vuelvan a circular.
  const vuelveAlguno = await Ejemplar.exists({ ...delMaterial, estado: { $in: ["prestado", "reservado"] } });
  if (!permitirEspera || !vuelveAlguno) {
    throw new ErrorReserva(
      409,
      "sin_ejemplares",
      vuelveAlguno ? "No hay ejemplares disponibles ahora mismo." : "No hay ejemplares de este material que se puedan prestar."
    );
  }
  return Solicitud.create({ bibliotecaId, socioId, tipo: "prestamo", itemTipo, itemId, origen, estado: "en_espera" });
}

// Un ejemplar que acaba de quedar libre (devuelto, o liberado de un pedido
// rechazado o cancelado) pasa a la reserva en espera más vieja de su
// material. Devuelve esa solicitud, o null si nadie lo estaba esperando.
export async function asignarAReservaEnEspera(ejemplarId) {
  const ejemplar = await Ejemplar.findById(ejemplarId);
  if (!ejemplar || ejemplar.estado !== "disponible") return null;
  const enEspera = await Solicitud.find({
    bibliotecaId: ejemplar.bibliotecaId,
    tipo: "prestamo",
    itemTipo: ejemplar.itemTipo,
    itemId: ejemplar.itemId,
    estado: "en_espera",
  })
    .sort({ fechaSolicitud: 1, _id: 1 })
    .limit(5);
  for (const reserva of enEspera) {
    const apartado = await Ejemplar.findOneAndUpdate(
      { _id: ejemplar._id, estado: "disponible", ...FILTRO_PRESTABLE },
      { estado: "reservado", ultimaVezVisto: new Date() },
      { new: true }
    );
    if (!apartado) return null;
    const asignada = await Solicitud.findOneAndUpdate(
      { _id: reserva._id, estado: "en_espera" },
      { estado: "pendiente", ejemplarId: ejemplar._id, fechaDisponible: new Date() },
      { new: true }
    );
    if (asignada) return asignada;
    // La cancelaron mientras tanto: el ejemplar vuelve a estar libre para la siguiente.
    await Ejemplar.updateOne({ _id: ejemplar._id }, { estado: "disponible" });
  }
  return null;
}

// Rechazar o cancelar: si tenía un ejemplar apartado, se libera (y pasa a
// la siguiente reserva en espera, si hay). Devuelve la reserva que lo
// recibió, si alguna.
export async function liberarEjemplarDe(solicitud) {
  if (solicitud.tipo !== "prestamo" || !solicitud.ejemplarId) return null;
  await Ejemplar.updateOne({ _id: solicitud.ejemplarId, estado: "reservado" }, { estado: "disponible" });
  return asignarAReservaEnEspera(solicitud.ejemplarId);
}
