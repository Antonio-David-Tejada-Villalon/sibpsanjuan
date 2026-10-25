import mongoose from "mongoose";
import Solicitud from "../models/Solicitud.js";
import Prestamo from "../models/Prestamo.js";
import Socio from "../models/Socio.js";
import Categoria from "../models/Categoria.js";
import Ejemplar from "../models/Ejemplar.js";
import NotificacionVista from "../models/NotificacionVista.js";
import { titulosDe } from "../opac/catalogo.js";
import { diasDeAtraso } from "../circulacion/reglas.js";
import { CAMPOS_SOCIO_EN_CIRCULACION } from "../utils/datosSocio.js";

// Notificaciones del personal (la campana del panel) y del socio (la del
// OPAC). No se guardan: se arman en el momento a partir de pedidos,
// reservas y préstamos, así que lo resuelto deja de aparecer solo. Cada una
// tiene una clave estable para saber si ya se vio (NotificacionVista).

const DIA = 24 * 60 * 60 * 1000;
const ZONA = "America/Argentina/San_Juan";
const RECIENTE = 14 * DIA; // cuánto tiempo se le sigue mostrando al socio lo que ya se resolvió
const SIN_RETIRAR = 3 * DIA; // a partir de cuándo una reserva apartada se marca "sin retirar"

const fechaLarga = (d) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: ZONA }).format(d);
const diaIso = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);
const nombreDe = (socio) => (socio ? `${socio.nombre} ${socio.apellido}` : "Un socio que ya no está");
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Un pedido del OPAC que apartó un ejemplar al pedirse, frente a una
// reserva (del mostrador, o que estuvo en espera hasta que volvió uno): la
// reserva ya está lista para que el socio pase a buscarla.
function esPedido(solicitud) {
  return solicitud.origen !== "staff" && Math.abs(new Date(solicitud.fechaDisponible || 0) - new Date(solicitud.fechaSolicitud)) < 60 * 1000;
}

async function titulosPara(solicitudes, prestamos) {
  const prestamoPorId = new Map(prestamos.map((p) => [String(p._id), p]));
  const materialDe = (s) => (s.tipo === "renovacion" ? prestamoPorId.get(String(s.prestamoId)) || {} : s);
  const titulos = await titulosDe([...solicitudes.map(materialDe), ...prestamos]);
  return { titulo: (x) => titulos.get(String(materialDe(x).itemId))?.titulo || "un material que ya no está en el catálogo", materialDe };
}

export async function notificacionesDelStaff(bibliotecaId, { circulacion, socios }) {
  const lista = [];
  const ahora = new Date();
  if (circulacion) {
    const [abiertas, vencidos] = await Promise.all([
      Solicitud.find({ bibliotecaId, estado: "pendiente" }).sort({ fechaSolicitud: 1 }).limit(300),
      Prestamo.find({ bibliotecaId, fechaDevolucion: null, fechaVencimiento: { $lt: ahora } }).sort({ fechaVencimiento: 1 }).limit(300),
    ]);
    const prestamosRenovados = await Prestamo.find({ _id: { $in: abiertas.filter((s) => s.tipo === "renovacion").map((s) => s.prestamoId) } }).select(
      "itemTipo itemId fechaVencimiento"
    );
    const [sociosDe, ejemplares] = await Promise.all([
      Socio.find({ _id: { $in: [...abiertas, ...vencidos].map((x) => x.socioId) } }).select(CAMPOS_SOCIO_EN_CIRCULACION),
      Ejemplar.find({ _id: { $in: abiertas.map((s) => s.ejemplarId).filter(Boolean) } }).select("codigoBarras"),
    ]);
    const socioPorId = new Map(sociosDe.map((s) => [String(s._id), s]));
    const codigoPorId = new Map(ejemplares.map((e) => [String(e._id), e.codigoBarras]));
    const { titulo } = await titulosPara(abiertas, [...vencidos, ...prestamosRenovados]);

    for (const s of abiertas) {
      const socio = socioPorId.get(String(s.socioId));
      const base = { solicitudId: String(s._id), socioId: String(s.socioId), enlace: `/socios/${s.socioId}` };
      if (s.tipo === "renovacion") {
        lista.push({
          ...base,
          clave: `renovacion:${s._id}`,
          tipo: "renovacion",
          titulo: `${nombreDe(socio)} pidió renovar «${titulo(s)}»`,
          detalle: "Aprobalo para correr el vencimiento, o rechazalo.",
          fecha: s.fechaSolicitud,
          acciones: ["aprobar", "rechazar"],
        });
      } else if (esPedido(s)) {
        lista.push({
          ...base,
          clave: `pedido:${s._id}`,
          tipo: "pedido",
          titulo: `${nombreDe(socio)} pidió «${titulo(s)}»`,
          detalle: `Ejemplar ${codigoPorId.get(String(s.ejemplarId)) || ""} apartado. Aprobalo para prestárselo, o rechazalo.`,
          fecha: s.fechaSolicitud,
          acciones: ["aprobar", "rechazar"],
        });
      } else {
        const desde = new Date(s.fechaDisponible || s.fechaSolicitud);
        const viejo = ahora - desde > SIN_RETIRAR;
        lista.push({
          ...base,
          clave: `reserva:${s._id}:${viejo ? "vieja" : "lista"}`,
          tipo: viejo ? "reserva_sin_retirar" : "reserva_lista",
          titulo: `${viejo ? "Sin retirar: " : ""}«${titulo(s)}» está apartado para ${nombreDe(socio)}`,
          detalle: `Ejemplar ${codigoPorId.get(String(s.ejemplarId)) || ""}, apartado desde el ${fechaLarga(desde)}. Prestáselo cuando venga, o cancelá la reserva.`,
          fecha: desde,
          acciones: ["aprobar", "cancelar"],
        });
      }
    }

    for (const p of vencidos) {
      const dias = diasDeAtraso(p, ahora);
      lista.push({
        clave: `vencido:${p._id}:${diaIso(p.fechaVencimiento)}`,
        tipo: "vencido",
        titulo: `«${titulo(p)}» de ${nombreDe(socioPorId.get(String(p.socioId)))} está vencido`,
        detalle: `Venció el ${fechaLarga(p.fechaVencimiento)} (${plural(dias, "día", "días")} de atraso).`,
        fecha: p.fechaVencimiento,
        enlace: `/socios/${p.socioId}`,
        socioId: String(p.socioId),
      });
    }
  }

  if (socios) {
    // Socios con un código de categoría que nadie dio de alta (cargados
    // antes de las categorías): siguen con las reglas generales.
    const [codigos, enUso] = await Promise.all([
      Categoria.find({ bibliotecaId, eliminadoEn: null }).distinct("codigo"),
      Socio.aggregate([{ $match: { bibliotecaId: new mongoose.Types.ObjectId(String(bibliotecaId)), eliminadoEn: null } }, { $group: { _id: "$categoria", n: { $sum: 1 } } }]),
    ]);
    const huerfanas = enUso.filter((c) => c._id && !codigos.includes(c._id));
    if (huerfanas.length) {
      const total = huerfanas.reduce((a, c) => a + c.n, 0);
      lista.push({
        clave: `sistema:categorias:${huerfanas.map((c) => `${c._id}=${c.n}`).join(",")}`,
        tipo: "sistema",
        titulo: `${plural(total, "socio tiene", "socios tienen")} una categoría que no existe (${huerfanas.map((c) => c._id).join(", ")})`,
        detalle: "Se les aplican las reglas generales de la biblioteca. Asignales Alumno, Docente u otra categoría desde su ficha.",
        fecha: ahora,
        enlace: "/socios",
      });
    }
  }
  return lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

export async function notificacionesDelSocio(socio, ahora = new Date()) {
  const lista = [];
  const [prestamos, solicitudes] = await Promise.all([
    Prestamo.find({ socioId: socio._id, fechaDevolucion: null }).sort({ fechaVencimiento: 1 }),
    Solicitud.find({
      socioId: socio._id,
      $or: [{ estado: "pendiente" }, { estado: { $in: ["aprobada", "rechazada", "cancelada"] }, fechaResolucion: { $gte: new Date(ahora - RECIENTE) } }],
    }).sort({ fechaSolicitud: -1 }),
  ]);
  const renovados = await Prestamo.find({ _id: { $in: solicitudes.filter((s) => s.tipo === "renovacion").map((s) => s.prestamoId) } }).select(
    "itemTipo itemId fechaVencimiento"
  );
  const { titulo } = await titulosPara(solicitudes, [...prestamos, ...renovados]);
  const renovadoPorId = new Map(renovados.map((p) => [String(p._id), p]));

  const hoy = diaIso(ahora);
  const manana = diaIso(new Date(ahora.getTime() + DIA));
  for (const p of prestamos) {
    const vence = diaIso(p.fechaVencimiento);
    if (p.fechaVencimiento < ahora) {
      lista.push({
        clave: `vencido:${p._id}:${vence}`,
        tipo: "vencido",
        titulo: `«${titulo(p)}» está vencido`,
        detalle: `Venció el ${fechaLarga(p.fechaVencimiento)}. Devolvelo o pedí renovarlo.`,
        fecha: p.fechaVencimiento,
        enlace: "mis-prestamos",
      });
    } else if (p.fechaVencimiento - ahora <= 2 * DIA) {
      const cuando = vence === hoy ? "hoy" : vence === manana ? "mañana" : `el ${fechaLarga(p.fechaVencimiento)}`;
      lista.push({
        clave: `vence:${p._id}:${vence}`,
        tipo: "vence_pronto",
        titulo: `«${titulo(p)}» vence ${cuando}`,
        detalle: "Pedí renovarlo desde Mis préstamos, o devolvelo a tiempo.",
        fecha: ahora,
        enlace: "mis-prestamos",
      });
    }
  }

  for (const s of solicitudes) {
    if (s.estado === "pendiente" && s.tipo === "prestamo" && !esPedido(s)) {
      lista.push({
        clave: `lista:${s._id}`,
        tipo: "reserva_lista",
        titulo: `«${titulo(s)}» ya está apartado para vos`,
        detalle: "Pasá a buscarlo por la biblioteca.",
        fecha: s.fechaDisponible || s.fechaSolicitud,
        enlace: "cuenta",
      });
    } else if (s.estado === "aprobada" && s.tipo === "prestamo" && !s.entregadaEnMostrador) {
      lista.push({
        clave: `aprobada:${s._id}`,
        tipo: "aprobada",
        titulo: `Aceptaron tu pedido de «${titulo(s)}»`,
        detalle: "Pasá a buscarlo por la biblioteca.",
        fecha: s.fechaResolucion,
        enlace: "mis-prestamos",
      });
    } else if (s.estado === "aprobada" && s.tipo === "renovacion") {
      const renovado = renovadoPorId.get(String(s.prestamoId));
      lista.push({
        clave: `renovada:${s._id}`,
        tipo: "renovada",
        titulo: `Se renovó «${titulo(s)}»`,
        detalle: renovado ? `Ahora vence el ${fechaLarga(renovado.fechaVencimiento)}.` : "",
        fecha: s.fechaResolucion,
        enlace: "mis-prestamos",
      });
    } else if (s.estado === "rechazada") {
      lista.push({
        clave: `rechazada:${s._id}`,
        tipo: "rechazada",
        titulo: s.tipo === "renovacion" ? `No se pudo renovar «${titulo(s)}»` : `No se aceptó tu pedido de «${titulo(s)}»`,
        detalle: s.notaStaff ? `Nota de la biblioteca: ${s.notaStaff}` : "Consultá en la biblioteca.",
        fecha: s.fechaResolucion,
        enlace: "cuenta",
      });
    } else if (s.estado === "cancelada" && s.resueltoPor) {
      lista.push({
        clave: `cancelada:${s._id}`,
        tipo: "cancelada",
        titulo: `La biblioteca canceló tu reserva de «${titulo(s)}»`,
        detalle: s.notaStaff ? `Nota de la biblioteca: ${s.notaStaff}` : "Consultá en la biblioteca.",
        fecha: s.fechaResolucion,
        enlace: "cuenta",
      });
    }
  }
  return lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

// Marca cuáles ya vio el destinatario y cuenta las nuevas.
export async function conLeidas(destinatario, lista) {
  const vistas = await NotificacionVista.find({ destinatario, clave: { $in: lista.map((n) => n.clave) } }).distinct("clave");
  const leidas = new Set(vistas);
  const notificaciones = lista.map((n) => ({ ...n, leida: leidas.has(n.clave) }));
  return { noLeidas: notificaciones.filter((n) => !n.leida).length, notificaciones };
}

export async function marcarVistas(destinatario, claves) {
  const validas = [...new Set(claves.filter((c) => typeof c === "string" && c.length > 0 && c.length <= 200))].slice(0, 500);
  if (!validas.length) return;
  await NotificacionVista.bulkWrite(
    validas.map((clave) => ({
      updateOne: { filter: { destinatario, clave }, update: { $setOnInsert: { destinatario, clave, vistaEn: new Date() } }, upsert: true },
    })),
    { ordered: false }
  );
}
