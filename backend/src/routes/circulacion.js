import { Router } from "express";
import Solicitud from "../models/Solicitud.js";
import Prestamo from "../models/Prestamo.js";
import Ejemplar from "../models/Ejemplar.js";
import Socio from "../models/Socio.js";
import Biblioteca from "../models/Biblioteca.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { idempotente } from "../middleware/idempotencia.js";
import { CAMPOS_SOCIO_EN_CIRCULACION } from "../utils/datosSocio.js";
import { calcularVencimiento, puedeRenovar, estaVencido, superaMaxPrestamos, diasDeAtraso, calcularMulta } from "../circulacion/reglas.js";
import { politicaDeSocio, contarPrestamosEnCurso, mensajeMaxPrestamos } from "../circulacion/categorias.js";
import { esIdValido, requiereIdValido } from "../utils/objectId.js";
import { MODELOS_POR_TIPO } from "../circulacion/tiposCirculantes.js";
import { opcionDeConsulta, ErrorHttp } from "../utils/consulta.js";
import { FILTRO_PRESTABLE, ETIQUETAS_ESTADO, estadoVisible } from "../circulacion/ejemplares.js";
import { reservarParaSocio, asignarAReservaEnEspera, liberarEjemplarDe, ErrorReserva } from "../circulacion/reservas.js";

const router = Router();

router.use(requiereLogin, requiereBiblioteca);

// Busca Y reserva el ejemplar en una sola operación atómica — findOne +
// save por separado (como era antes) deja una ventana entre leer
// "disponible" y escribir "prestado" donde dos solicitudes simultáneas
// para el mismo ítem pueden pasar las dos, y se termina prestando el
// mismo ejemplar dos veces. findOneAndUpdate con el filtro
// estado:"disponible" hace que Mongo resuelva cuál de las dos gana.
async function elegirYReservarEjemplar(bibliotecaId, itemTipo, itemId, ejemplarId, estadoOrigen = "disponible") {
  // Un ejemplar libre además tiene que ser de préstamo y estar sano (ver
  // circulacion/ejemplares.js); uno ya reservado se eligió así al pedirlo.
  const filtro = { bibliotecaId, itemTipo, itemId, estado: estadoOrigen, ...(estadoOrigen === "disponible" ? FILTRO_PRESTABLE : {}) };
  if (ejemplarId) {
    if (!esIdValido(ejemplarId)) {
      throw Object.assign(new Error("ejemplarId inválido."), { status: 400 });
    }
    filtro._id = ejemplarId;
  }
  return Ejemplar.findOneAndUpdate(filtro, { estado: "prestado", ultimaVezVisto: new Date() }, { new: true });
}

// Reglas que le tocan a un socio de esta biblioteca según su categoría (ver
// circulacion/categorias.js). 404 si el socio no existe, está borrado o es
// de otra biblioteca — antes un socioId ajeno pasaba derecho y quedaba un
// préstamo cruzado entre bibliotecas.
async function socioYPolitica(req, socioId) {
  const socio = await Socio.findOne({ _id: socioId, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!socio) {
    throw Object.assign(new Error("Socio no encontrado en esta biblioteca."), { status: 404 });
  }
  const biblioteca = await Biblioteca.findById(req.usuario.bibliotecaId);
  return { socio, biblioteca, politica: await politicaDeSocio(socio, biblioteca) };
}

// La credencial vence (Socio.vigenteHasta, como la fecha de vencimiento de
// Koha): con la cuenta vencida no se presta ni se reserva hasta renovarla.
function exigirVigente(socio) {
  if (socio.vigenteHasta && socio.vigenteHasta < hoyIso()) {
    throw Object.assign(new Error(`La cuenta de ${socio.nombre} ${socio.apellido} venció el ${fechaCorta(socio.vigenteHasta)}. Renovala en su ficha para prestarle.`), {
      status: 409,
    });
  }
}

const hoyIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/San_Juan" }).format(new Date());
const fechaCorta = (iso) => iso.split("-").reverse().join("/");

// estadoOrigenEjemplar es "reservado" cuando se aprueba una Solicitud del
// OPAC (el ejemplar ya quedó reservado a nombre de esa solicitud puntual al
// crearla — ver POST /solicitudes en opac.js) y "disponible" (default) para
// un préstamo directo del staff, que nunca pasó por esa reserva previa.
// solicitudId: la solicitud que se está aprobando, para no contarla dos
// veces contra el máximo de préstamos de la categoría.
async function crearPrestamo(
  req,
  { socioId, itemTipo, itemId, ejemplarId, registradoPor, estadoOrigenEjemplar = "disponible", solicitudId }
) {
  if (!esIdValido(socioId) || !esIdValido(itemId)) {
    throw Object.assign(new Error("socioId o itemId inválido."), { status: 400 });
  }
  if (!MODELOS_POR_TIPO[itemTipo]) {
    throw Object.assign(new Error("itemTipo inválido."), { status: 400 });
  }
  const bibliotecaId = req.usuario.bibliotecaId;
  const { socio, politica } = await socioYPolitica(req, socioId);
  exigirVigente(socio);
  const conteo = { excluirSolicitudId: solicitudId };
  if (superaMaxPrestamos(politica, await contarPrestamosEnCurso(bibliotecaId, socioId, conteo))) {
    throw Object.assign(new Error(mensajeMaxPrestamos(politica)), { status: 409 });
  }
  const ejemplar = await elegirYReservarEjemplar(bibliotecaId, itemTipo, itemId, ejemplarId, estadoOrigenEjemplar);
  if (!ejemplar) {
    throw Object.assign(new Error("No hay ejemplares disponibles."), { status: 409 });
  }
  // El ejemplar ya quedó tomado — si algo falla de acá en adelante, hay
  // que devolverlo a mano (no hay transacciones en este setup) al estado
  // en que estaba: "disponible", o "reservado" si era de una solicitud que
  // sigue pendiente.
  const liberarEjemplar = () => Ejemplar.findByIdAndUpdate(ejemplar._id, { estado: estadoOrigenEjemplar });
  const fechaEntrega = new Date();
  let prestamo;
  try {
    prestamo = await Prestamo.create({
      bibliotecaId,
      socioId,
      itemTipo,
      itemId,
      ejemplarId: ejemplar._id,
      fechaEntrega,
      fechaVencimiento: calcularVencimiento(fechaEntrega, politica.diasPrestamo, politica),
      registradoPor,
    });
  } catch (err) {
    await liberarEjemplar();
    throw err;
  }
  // Segundo chequeo, ya con el préstamo creado: dos préstamos simultáneos
  // al mismo socio pueden pasar los dos el chequeo de arriba. Solo cuenta
  // lo creado hasta este préstamo, así que se deshace el último y no ambos.
  if (politica.maxPrestamos != null) {
    const enCurso = await contarPrestamosEnCurso(bibliotecaId, socioId, { ...conteo, hastaId: prestamo._id });
    if (enCurso > politica.maxPrestamos) {
      await Prestamo.deleteOne({ _id: prestamo._id });
      await liberarEjemplar();
      throw Object.assign(new Error(mensajeMaxPrestamos(politica)), { status: 409 });
    }
  }
  return prestamo;
}

// Renovar = correr el vencimiento con los días de la categoría del socio,
// si todavía le quedan renovaciones según esa misma categoría.
async function renovar(req, prestamo) {
  const { politica } = await socioYPolitica(req, prestamo.socioId);
  if (!puedeRenovar(prestamo, politica)) {
    throw Object.assign(new Error("Alcanzó el máximo de renovaciones."), { status: 409 });
  }
  // Solo si nadie lo tocó desde que se leyó (mismas renovaciones, sin
  // devolver): dos renovaciones simultáneas no pueden pasar el tope.
  const renovado = await Prestamo.findOneAndUpdate(
    { _id: prestamo._id, fechaDevolucion: null, renovaciones: prestamo.renovaciones },
    {
      $set: { fechaVencimiento: calcularVencimiento(new Date(), politica.diasPrestamo, politica) },
      $inc: { renovaciones: 1 },
    },
    { new: true }
  );
  if (!renovado) {
    throw Object.assign(
      new Error("El préstamo cambió mientras se renovaba (otra renovación o una devolución). Actualizá y probá de nuevo."),
      { status: 409 }
    );
  }
  return renovado;
}

// Adjunta el ítem (Libro o Seriada, según itemTipo) a cada solicitud/
// préstamo. No hay populate() en este proyecto (ver Model.find + Map en
// libros.js/opac.js) — acá hace falta además separar por itemTipo antes de
// consultar, ya que cada tipo vive en su propia colección.
async function adjuntarItems(docs) {
  const idsPorTipo = {};
  for (const tipo of Object.keys(MODELOS_POR_TIPO)) idsPorTipo[tipo] = [];
  for (const d of docs) {
    if (d.itemId && idsPorTipo[d.itemTipo]) idsPorTipo[d.itemTipo].push(d.itemId);
  }
  const itemPorTipoYId = {};
  for (const [tipo, Modelo] of Object.entries(MODELOS_POR_TIPO)) {
    const encontrados = await Modelo.find({ _id: { $in: idsPorTipo[tipo] } });
    itemPorTipoYId[tipo] = new Map(encontrados.map((i) => [String(i._id), i]));
  }
  return docs.map((d) => ({
    ...d.toObject(),
    item: d.itemId ? itemPorTipoYId[d.itemTipo]?.get(String(d.itemId)) || null : null,
  }));
}

// --- Solicitudes (cola de pedidos del OPAC) ---

// ?estado=pendiente|en_espera|aprobada|rechazada|cancelada|abiertas (las dos
// primeras), ?socioId= (los de un socio, para su ficha), ?itemTipo=&itemId=
// (la cola de reservas de un material).
router.get("/solicitudes", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId };
  const estado = opcionDeConsulta(req.query.estado, ["pendiente", "en_espera", "aprobada", "rechazada", "cancelada", "abiertas"], "estado");
  if (estado === "abiertas") filtro.estado = { $in: ["pendiente", "en_espera"] };
  else if (estado) filtro.estado = estado;
  if (req.query.socioId !== undefined) {
    if (!esIdValido(req.query.socioId)) throw new ErrorHttp(400, "socioId inválido.");
    filtro.socioId = req.query.socioId;
  }
  if (req.query.itemId !== undefined) {
    if (!esIdValido(req.query.itemId) || !MODELOS_POR_TIPO[req.query.itemTipo]) throw new ErrorHttp(400, "itemTipo o itemId inválido.");
    filtro.itemTipo = req.query.itemTipo;
    filtro.itemId = req.query.itemId;
  }
  const solicitudes = await Solicitud.find(filtro).sort({ fechaSolicitud: 1, _id: 1 });

  const socios = await Socio.find({ _id: { $in: solicitudes.map((s) => s.socioId) } }).select(CAMPOS_SOCIO_EN_CIRCULACION);
  const socioPorId = new Map(socios.map((s) => [String(s._id), s]));
  const conItems = await adjuntarItems(solicitudes);

  const ejemplares = await Ejemplar.find({ _id: { $in: solicitudes.map((s) => s.ejemplarId).filter(Boolean) } }).select("codigoBarras signatura");
  const ejemplarPorId = new Map(ejemplares.map((e) => [String(e._id), e]));
  res.json(
    conItems.map((s) => ({
      ...s,
      socio: socioPorId.get(String(s.socioId)) || null,
      ejemplar: s.ejemplarId ? ejemplarPorId.get(String(s.ejemplarId)) || null : null,
    }))
  );
});

// Reserva desde el mostrador (la pestaña "Reservas" de un material): aparta
// un ejemplar libre (uno puntual si se elige) o, si están todos prestados,
// la deja en espera. Ver circulacion/reservas.js.
router.post("/reservas", requierePermiso("prestamos"), idempotente, async (req, res) => {
  const { socioId, itemTipo, itemId, ejemplarId } = req.body || {};
  if (!esIdValido(socioId) || !esIdValido(itemId) || (ejemplarId && !esIdValido(ejemplarId))) {
    return res.status(400).json({ error: "socioId, itemId o ejemplarId inválido." });
  }
  try {
    const { socio, politica } = await socioYPolitica(req, socioId);
    exigirVigente(socio);
    const reserva = await reservarParaSocio({
      bibliotecaId: req.usuario.bibliotecaId,
      socioId,
      politica,
      itemTipo,
      itemId,
      ejemplarId: ejemplarId || null,
      origen: "staff",
      permitirEspera: true,
    });
    res.status(201).json(reserva);
  } catch (err) {
    if (err instanceof ErrorReserva || err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// Anular un pedido o una reserva abierta (también la de un socio que avisó
// que ya no lo necesita). Si tenía un ejemplar apartado, se libera y pasa a
// la siguiente reserva en espera, si hay.
router.post("/solicitudes/:id/cancelar", requierePermiso("prestamos"), requiereIdValido(), idempotente, async (req, res) => {
  const solicitud = await Solicitud.findOneAndUpdate(
    {
      _id: req.params.id,
      bibliotecaId: req.usuario.bibliotecaId,
      estado: { $in: ["pendiente", "en_espera"] },
      ...noBloqueada(new Date()),
    },
    { estado: "cancelada", fechaResolucion: new Date(), resueltoPor: req.usuario.id, notaStaff: req.body?.notaStaff },
    { new: true }
  );
  if (!solicitud) return respuestaSolicitudNoDisponible(req, res);
  const siguiente = await liberarEjemplarDe(solicitud);
  res.json({ ...solicitud.toObject(), reservaSiguiente: await resumenReserva(siguiente) });
});

// Cuánto dura el "candado" de una solicitud mientras se aprueba (ver
// Solicitud.bloqueadaHasta): de sobra para crear un préstamo, y corto si el
// proceso se corta a mitad de camino.
const BLOQUEO_SOLICITUD_MS = 30 * 1000;

function noBloqueada(ahora) {
  return { $or: [{ bloqueadaHasta: null }, { bloqueadaHasta: { $lt: ahora } }] };
}

// 409 si la solicitud sigue pendiente pero alguien la está resolviendo en
// este momento; 404 si no existe o ya se resolvió.
async function respuestaSolicitudNoDisponible(req, res) {
  const pendiente = await Solicitud.exists({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, estado: "pendiente" });
  if (pendiente) {
    return res.status(409).json({ error: "Otra persona está resolviendo esta solicitud en este momento. Actualizá en unos segundos." });
  }
  return res.status(404).json({ error: "Solicitud no encontrada o ya resuelta." });
}

router.post("/solicitudes/:id/aprobar", requierePermiso("prestamos"), requiereIdValido(), idempotente, async (req, res) => {
  // Se toma la solicitud de forma atómica antes de hacer nada: si dos
  // personas (o un doble clic) la aprueban a la vez, solo una avanza.
  const ahora = new Date();
  const solicitud = await Solicitud.findOneAndUpdate(
    { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, estado: "pendiente", ...noBloqueada(ahora) },
    { bloqueadaHasta: new Date(ahora.getTime() + BLOQUEO_SOLICITUD_MS) },
    { new: true }
  );
  if (!solicitud) return respuestaSolicitudNoDisponible(req, res);
  const liberar = () => Solicitud.updateOne({ _id: solicitud._id }, { bloqueadaHasta: null });

  try {
    if (solicitud.tipo === "prestamo") {
      // El ejemplar concreto ya quedó reservado al crear la solicitud (ver
      // POST /solicitudes en opac.js) — se usa ese mismo, no uno elegido de
      // nuevo acá, para no dejar el reservado original trabado para siempre.
      await crearPrestamo(req, {
        socioId: solicitud.socioId,
        itemTipo: solicitud.itemTipo,
        itemId: solicitud.itemId,
        ejemplarId: solicitud.ejemplarId,
        registradoPor: req.usuario.id,
        estadoOrigenEjemplar: "reservado",
        solicitudId: solicitud._id,
      });
    } else {
      const prestamo = await Prestamo.findOne({
        _id: solicitud.prestamoId,
        bibliotecaId: req.usuario.bibliotecaId,
      });
      if (!prestamo || prestamo.fechaDevolucion) {
        throw Object.assign(new Error("El préstamo ya no está activo."), { status: 409 });
      }
      await renovar(req, prestamo);
    }
  } catch (err) {
    await liberar();
    return res.status(err.status || 400).json({ error: err.message });
  }

  solicitud.estado = "aprobada";
  solicitud.fechaResolucion = new Date();
  solicitud.resueltoPor = req.usuario.id;
  solicitud.bloqueadaHasta = null;
  await solicitud.save();
  res.json(solicitud);
});

router.post("/solicitudes/:id/rechazar", requierePermiso("prestamos"), requiereIdValido(), idempotente, async (req, res) => {
  const solicitud = await Solicitud.findOneAndUpdate(
    { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, estado: "pendiente", ...noBloqueada(new Date()) },
    {
      estado: "rechazada",
      fechaResolucion: new Date(),
      notaStaff: req.body?.notaStaff,
      resueltoPor: req.usuario.id,
    },
    { new: true }
  );
  if (!solicitud) return respuestaSolicitudNoDisponible(req, res);
  // El ejemplar que quedó reservado al pedirla vuelve a estar libre (o pasa
  // a la siguiente reserva en espera): rechazar no puede dejarlo trabado.
  const siguiente = await liberarEjemplarDe(solicitud);
  res.json({ ...solicitud.toObject(), reservaSiguiente: await resumenReserva(siguiente) });
});

// --- Préstamos (vista de circulación del staff) ---

// Con { socioId, codigoBarras } (el lector de códigos del mostrador) o con
// { socioId, itemTipo, itemId[, ejemplarId] }. Un ejemplar apartado para
// una reserva de ESTE socio se le entrega (la reserva queda aprobada); uno
// apartado para otro, no.
router.post("/prestamos", requierePermiso("prestamos"), idempotente, async (req, res) => {
  let { socioId, itemTipo, itemId, ejemplarId } = req.body || {};
  const codigoBarras = typeof req.body?.codigoBarras === "string" ? req.body.codigoBarras.trim() : "";
  try {
    if (codigoBarras) {
      if (!esIdValido(socioId)) throw Object.assign(new Error("socioId inválido."), { status: 400 });
      const ejemplar = await Ejemplar.findOne({ bibliotecaId: req.usuario.bibliotecaId, codigoBarras });
      if (!ejemplar) throw Object.assign(new Error(`No hay ningún ejemplar con el código ${codigoBarras}.`), { status: 404 });
      ({ itemTipo, itemId } = ejemplar);
      ejemplarId = String(ejemplar._id);
      if (ejemplar.estado === "reservado") {
        const reserva = await Solicitud.findOne({ ejemplarId: ejemplar._id, tipo: "prestamo", estado: "pendiente" });
        if (reserva && String(reserva.socioId) === String(socioId)) {
          return res.status(201).json(await entregarReserva(req, reserva));
        }
        throw Object.assign(new Error("Ese ejemplar está apartado para la reserva de otro socio."), { status: 409 });
      }
      if (ejemplar.estado === "prestado") {
        throw Object.assign(new Error("Ese ejemplar figura prestado. Registrá primero la devolución."), { status: 409 });
      }
      const visible = estadoVisible(ejemplar);
      if (visible !== "disponible") {
        throw Object.assign(new Error(`Ese ejemplar no se presta: ${ETIQUETAS_ESTADO[visible].toLowerCase()}.`), { status: 409 });
      }
    } else if (!socioId || !itemTipo || !itemId) {
      return res.status(400).json({ error: "socioId y codigoBarras (o itemTipo e itemId) son obligatorios." });
    }
    const prestamo = await crearPrestamo(req, { socioId, itemTipo, itemId, ejemplarId, registradoPor: req.usuario.id });
    res.status(201).json(prestamo);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Aprobar una solicitud de préstamo = prestar el ejemplar que tenía apartado.
async function entregarReserva(req, solicitud) {
  const ahora = new Date();
  const tomada = await Solicitud.findOneAndUpdate(
    { _id: solicitud._id, estado: "pendiente", ...noBloqueada(ahora) },
    { bloqueadaHasta: new Date(ahora.getTime() + BLOQUEO_SOLICITUD_MS) },
    { new: true }
  );
  if (!tomada) throw Object.assign(new Error("Otra persona está resolviendo esa reserva en este momento."), { status: 409 });
  try {
    const prestamo = await crearPrestamo(req, {
      socioId: tomada.socioId,
      itemTipo: tomada.itemTipo,
      itemId: tomada.itemId,
      ejemplarId: tomada.ejemplarId,
      registradoPor: req.usuario.id,
      estadoOrigenEjemplar: "reservado",
      solicitudId: tomada._id,
    });
    await Solicitud.updateOne(
      { _id: tomada._id },
      { estado: "aprobada", fechaResolucion: new Date(), resueltoPor: req.usuario.id, bloqueadaHasta: null, entregadaEnMostrador: true }
    );
    return prestamo;
  } catch (err) {
    await Solicitud.updateOne({ _id: tomada._id }, { bloqueadaHasta: null });
    throw err;
  }
}

// Lo justo para avisarle al staff a quién apartarle un ejemplar.
async function resumenReserva(reserva) {
  if (!reserva) return null;
  const socio = await Socio.findById(reserva.socioId).select("numeroSocio nombre apellido");
  const ejemplar = await Ejemplar.findById(reserva.ejemplarId).select("codigoBarras");
  return {
    _id: reserva._id,
    socio: socio && { _id: socio._id, numeroSocio: socio.numeroSocio, nombre: socio.nombre, apellido: socio.apellido },
    codigoBarras: ejemplar?.codigoBarras ?? null,
  };
}

// Renovación directa desde el lado del staff (a diferencia de
// POST /solicitudes/:id/aprobar con tipo "renovacion", acá no hace falta
// que el socio la haya pedido primero por el OPAC).
router.post("/prestamos/:id/renovar", requierePermiso("prestamos"), requiereIdValido(), idempotente, async (req, res) => {
  const prestamo = await Prestamo.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId });
  if (!prestamo) {
    return res.status(404).json({ error: "No encontrado." });
  }
  if (prestamo.fechaDevolucion) {
    return res.status(409).json({ error: "Ese préstamo ya fue devuelto." });
  }
  try {
    res.json(await renovar(req, prestamo));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Atómico: leer "no devuelto" y marcarlo devuelto en dos pasos dejaba que
// dos devoluciones simultáneas del mismo préstamo pasaran las dos. Si
// alguien estaba esperando ese material, el ejemplar queda apartado para
// esa reserva y la respuesta lo dice (reservaSiguiente), para que el staff
// lo separe en vez de devolverlo al estante.
async function devolver(req, filtro) {
  const prestamo = await Prestamo.findOneAndUpdate(
    { ...filtro, bibliotecaId: req.usuario.bibliotecaId, fechaDevolucion: null },
    { fechaDevolucion: new Date(), devueltoPor: req.usuario.id },
    { new: true }
  );
  if (!prestamo) return null;
  await Ejemplar.updateOne({ _id: prestamo.ejemplarId, estado: "prestado" }, { estado: "disponible", ultimaVezVisto: new Date() });
  const siguiente = await asignarAReservaEnEspera(prestamo.ejemplarId);
  return { ...prestamo.toObject(), reservaSiguiente: await resumenReserva(siguiente) };
}

router.post("/prestamos/:id/devolucion", requierePermiso("devoluciones"), requiereIdValido(), idempotente, async (req, res) => {
  const devuelto = await devolver(req, { _id: req.params.id });
  if (!devuelto) {
    const existe = await Prestamo.exists({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId });
    return existe
      ? res.status(409).json({ error: "Ese préstamo ya fue devuelto." })
      : res.status(404).json({ error: "No encontrado." });
  }
  res.json(devuelto);
});

// Devolución con el lector de códigos: { codigoBarras }.
router.post("/devoluciones", requierePermiso("devoluciones"), idempotente, async (req, res) => {
  const codigoBarras = typeof req.body?.codigoBarras === "string" ? req.body.codigoBarras.trim() : "";
  if (!codigoBarras) return res.status(400).json({ error: "Falta el código de barras." });
  const ejemplar = await Ejemplar.findOne({ bibliotecaId: req.usuario.bibliotecaId, codigoBarras });
  if (!ejemplar) return res.status(404).json({ error: `No hay ningún ejemplar con el código ${codigoBarras}.` });
  const devuelto = await devolver(req, { ejemplarId: ejemplar._id });
  if (!devuelto) return res.status(409).json({ error: "Ese ejemplar no figura prestado." });
  const [socio] = await Socio.find({ _id: devuelto.socioId }).select(CAMPOS_SOCIO_EN_CIRCULACION);
  const [conItem] = await adjuntarItems([await Prestamo.findById(devuelto._id)]);
  res.json({ ...devuelto, item: conItem.item, socio: socio || null, codigoBarras });
});

// ?estado=activo|vencido|devuelto, ?socioId= (los de un socio), ?itemTipo=
// &itemId= (el historial de un material). Cada préstamo lleva su ejemplar,
// los días de atraso, la multa y cuántas renovaciones le quedan según la
// categoría del socio.
router.get("/prestamos", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId };
  if (req.query.estado === "activo" || req.query.estado === "vencido") filtro.fechaDevolucion = null;
  if (req.query.estado === "devuelto") filtro.fechaDevolucion = { $ne: null };
  if (req.query.socioId !== undefined) {
    if (!esIdValido(req.query.socioId)) throw new ErrorHttp(400, "socioId inválido.");
    filtro.socioId = req.query.socioId;
  }
  if (req.query.itemId !== undefined) {
    if (!esIdValido(req.query.itemId) || !MODELOS_POR_TIPO[req.query.itemTipo]) throw new ErrorHttp(400, "itemTipo o itemId inválido.");
    filtro.itemTipo = req.query.itemTipo;
    filtro.itemId = req.query.itemId;
  }
  const orden = req.query.estado === "devuelto" ? { fechaDevolucion: -1 } : { fechaVencimiento: 1 };
  const prestamos = await Prestamo.find(filtro).sort(orden).limit(req.query.estado === "devuelto" ? 500 : 0);

  const socios = await Socio.find({ _id: { $in: prestamos.map((p) => p.socioId) } }).select(CAMPOS_SOCIO_EN_CIRCULACION);
  const socioPorId = new Map(socios.map((s) => [String(s._id), s]));
  const conItems = await adjuntarItems(prestamos);

  const ejemplares = await Ejemplar.find({ _id: { $in: prestamos.map((p) => p.ejemplarId) } }).select("codigoBarras signatura numeroCopia");
  const ejemplarPorId = new Map(ejemplares.map((e) => [String(e._id), e]));
  const biblioteca = await Biblioteca.findById(req.usuario.bibliotecaId);
  const politicas = new Map();
  for (const socio of socios) politicas.set(String(socio._id), await politicaDeSocio(socio, biblioteca));
  let resultado = conItems.map((p) => {
    const politica = politicas.get(String(p.socioId)) || biblioteca;
    const activo = !p.fechaDevolucion;
    return {
      ...p,
      socio: socioPorId.get(String(p.socioId)) || null,
      ejemplar: ejemplarPorId.get(String(p.ejemplarId)) || null,
      vencido: activo && estaVencido(p),
      diasAtraso: activo ? diasDeAtraso(p, new Date(), politica) : 0,
      multa: activo ? calcularMulta(p, politica) : 0,
      renovacionesRestantes: Math.max(0, (politica.maxRenovaciones ?? 0) - p.renovaciones),
    };
  });
  if (req.query.estado === "vencido") {
    resultado = resultado.filter((p) => p.vencido);
  }
  res.json(resultado);
});

export default router;
