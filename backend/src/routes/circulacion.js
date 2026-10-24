import { Router } from "express";
import Solicitud from "../models/Solicitud.js";
import Prestamo from "../models/Prestamo.js";
import Ejemplar from "../models/Ejemplar.js";
import Socio from "../models/Socio.js";
import Biblioteca from "../models/Biblioteca.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { calcularVencimiento, puedeRenovar, estaVencido, superaMaxPrestamos } from "../circulacion/reglas.js";
import { politicaDeSocio, contarPrestamosEnCurso, mensajeMaxPrestamos } from "../circulacion/categorias.js";
import { esIdValido, requiereIdValido } from "../utils/objectId.js";
import { MODELOS_POR_TIPO } from "../circulacion/tiposCirculantes.js";
import { opcionDeConsulta } from "../utils/consulta.js";

const router = Router();

router.use(requiereLogin, requiereBiblioteca);

// Busca Y reserva el ejemplar en una sola operación atómica — findOne +
// save por separado (como era antes) deja una ventana entre leer
// "disponible" y escribir "prestado" donde dos solicitudes simultáneas
// para el mismo ítem pueden pasar las dos, y se termina prestando el
// mismo ejemplar dos veces. findOneAndUpdate con el filtro
// estado:"disponible" hace que Mongo resuelva cuál de las dos gana.
async function elegirYReservarEjemplar(bibliotecaId, itemTipo, itemId, ejemplarId, estadoOrigen = "disponible") {
  const filtro = { bibliotecaId, itemTipo, itemId, estado: estadoOrigen };
  if (ejemplarId) {
    if (!esIdValido(ejemplarId)) {
      throw Object.assign(new Error("ejemplarId inválido."), { status: 400 });
    }
    filtro._id = ejemplarId;
  }
  return Ejemplar.findOneAndUpdate(filtro, { estado: "prestado" }, { new: true });
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
  return { socio, politica: await politicaDeSocio(socio, biblioteca) };
}

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
  const { politica } = await socioYPolitica(req, socioId);
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
  prestamo.fechaVencimiento = calcularVencimiento(new Date(), politica.diasPrestamo, politica);
  prestamo.renovaciones += 1;
  await prestamo.save();
  return prestamo;
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

router.get("/solicitudes", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId };
  const estado = opcionDeConsulta(req.query.estado, ["pendiente", "aprobada", "rechazada"], "estado");
  if (estado) filtro.estado = estado;
  const solicitudes = await Solicitud.find(filtro).sort({ fechaSolicitud: 1 });

  const socios = await Socio.find({ _id: { $in: solicitudes.map((s) => s.socioId) } }).select("-passwordHash");
  const socioPorId = new Map(socios.map((s) => [String(s._id), s]));
  const conItems = await adjuntarItems(solicitudes);

  res.json(
    conItems.map((s) => ({
      ...s,
      socio: socioPorId.get(String(s.socioId)) || null,
    }))
  );
});

router.post("/solicitudes/:id/aprobar", requierePermiso("prestamos"), requiereIdValido(), async (req, res) => {
  const solicitud = await Solicitud.findOne({
    _id: req.params.id,
    bibliotecaId: req.usuario.bibliotecaId,
    estado: "pendiente",
  });
  if (!solicitud) {
    return res.status(404).json({ error: "Solicitud no encontrada o ya resuelta." });
  }

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
        return res.status(409).json({ error: "El préstamo ya no está activo." });
      }
      await renovar(req, prestamo);
    }
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  solicitud.estado = "aprobada";
  solicitud.fechaResolucion = new Date();
  solicitud.resueltoPor = req.usuario.id;
  await solicitud.save();
  res.json(solicitud);
});

router.post("/solicitudes/:id/rechazar", requierePermiso("prestamos"), requiereIdValido(), async (req, res) => {
  const solicitud = await Solicitud.findOneAndUpdate(
    { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, estado: "pendiente" },
    {
      estado: "rechazada",
      fechaResolucion: new Date(),
      notaStaff: req.body?.notaStaff,
      resueltoPor: req.usuario.id,
    },
    { new: true }
  );
  if (!solicitud) {
    return res.status(404).json({ error: "Solicitud no encontrada o ya resuelta." });
  }
  // El ejemplar que quedó reservado al pedirla (ver POST /solicitudes en
  // opac.js) vuelve a estar disponible — rechazar no debería dejarlo
  // trabado en "reservado" para siempre.
  if (solicitud.tipo === "prestamo" && solicitud.ejemplarId) {
    await Ejemplar.findByIdAndUpdate(solicitud.ejemplarId, { estado: "disponible" });
  }
  res.json(solicitud);
});

// --- Préstamos (vista de circulación del staff) ---

router.post("/prestamos", requierePermiso("prestamos"), async (req, res) => {
  const { socioId, itemTipo, itemId, ejemplarId } = req.body || {};
  if (!socioId || !itemTipo || !itemId) {
    return res.status(400).json({ error: "socioId, itemTipo e itemId son obligatorios." });
  }
  try {
    const prestamo = await crearPrestamo(req, { socioId, itemTipo, itemId, ejemplarId, registradoPor: req.usuario.id });
    res.status(201).json(prestamo);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Renovación directa desde el lado del staff (a diferencia de
// POST /solicitudes/:id/aprobar con tipo "renovacion", acá no hace falta
// que el socio la haya pedido primero por el OPAC).
router.post("/prestamos/:id/renovar", requierePermiso("prestamos"), requiereIdValido(), async (req, res) => {
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

router.post("/prestamos/:id/devolucion", requierePermiso("devoluciones"), requiereIdValido(), async (req, res) => {
  const prestamo = await Prestamo.findOne({
    _id: req.params.id,
    bibliotecaId: req.usuario.bibliotecaId,
  });
  if (!prestamo) {
    return res.status(404).json({ error: "No encontrado." });
  }
  if (prestamo.fechaDevolucion) {
    return res.status(409).json({ error: "Ese préstamo ya fue devuelto." });
  }
  prestamo.fechaDevolucion = new Date();
  prestamo.devueltoPor = req.usuario.id;
  await prestamo.save();
  await Ejemplar.findByIdAndUpdate(prestamo.ejemplarId, { estado: "disponible" });
  res.json(prestamo);
});

router.get("/prestamos", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId };
  if (req.query.estado === "activo") filtro.fechaDevolucion = null;
  const prestamos = await Prestamo.find(filtro).sort({ fechaVencimiento: 1 });

  const socios = await Socio.find({ _id: { $in: prestamos.map((p) => p.socioId) } }).select("-passwordHash");
  const socioPorId = new Map(socios.map((s) => [String(s._id), s]));
  const conItems = await adjuntarItems(prestamos);

  let resultado = conItems.map((p) => ({
    ...p,
    socio: socioPorId.get(String(p.socioId)) || null,
    vencido: estaVencido(p),
  }));
  if (req.query.estado === "vencido") {
    resultado = resultado.filter((p) => p.vencido);
  }
  res.json(resultado);
});

export default router;
