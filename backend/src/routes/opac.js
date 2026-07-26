import { Router } from "express";
import bcrypt from "bcryptjs";
import Biblioteca from "../models/Biblioteca.js";
import Libro from "../models/Libro.js";
import Seriada from "../models/Seriada.js";
import RecursoElectronico from "../models/RecursoElectronico.js";
import MaterialSonoro from "../models/MaterialSonoro.js";
import MaterialAudiovisual from "../models/MaterialAudiovisual.js";
import MaterialCartografico from "../models/MaterialCartografico.js";
import MaterialGrafico from "../models/MaterialGrafico.js";
import MaterialDidactico from "../models/MaterialDidactico.js";
import Archivo from "../models/Archivo.js";
import Objeto from "../models/Objeto.js";
import Ejemplar from "../models/Ejemplar.js";
import Autor from "../models/Autor.js";
import Materia from "../models/Materia.js";
import Socio from "../models/Socio.js";
import Solicitud from "../models/Solicitud.js";
import Prestamo from "../models/Prestamo.js";
import {
  firmarTokenSocio,
  setCookieSesionSocio,
  limpiarCookieSesionSocio,
  requiereLoginSocio,
  requiereSocio,
} from "../middleware/auth.js";
import { puedeRenovar, estaVencido, calcularMulta } from "../circulacion/reglas.js";
import { esIdValido } from "../utils/objectId.js";
import { crearLimitadorLogin } from "../middleware/rateLimit.js";
import { MODELOS_POR_TIPO } from "../circulacion/tiposCirculantes.js";

// Montado en /api/opac/:codigo — el código de biblioteca reemplaza al
// subdominio que tendría una instancia Koha real (acá todas las
// bibliotecas comparten un mismo despliegue).
const router = Router({ mergeParams: true });

router.use(async (req, res, next) => {
  const biblioteca = await Biblioteca.findOne({ codigo: req.params.codigo });
  if (!biblioteca) {
    return res.status(404).json({ error: "Biblioteca no encontrada." });
  }
  req.biblioteca = biblioteca;
  next();
});

// --- Catálogo público: sin login, solo lectura ---
router.get("/libros", async (req, res) => {
  const libros = await Libro.find({ bibliotecaId: req.biblioteca._id, eliminadoEn: null }).sort({ titulo: 1 });
  const ejemplares = await Ejemplar.find({ bibliotecaId: req.biblioteca._id, itemTipo: "Libro" });
  const disponiblesPorLibro = new Map();
  for (const e of ejemplares) {
    const key = String(e.itemId);
    const actual = disponiblesPorLibro.get(key) || 0;
    disponiblesPorLibro.set(key, actual + (e.estado === "disponible" ? 1 : 0));
  }
  res.json(
    libros.map((l) => ({
      _id: l._id,
      isbn: l.isbn,
      titulo: l.titulo,
      subtitulo: l.subtitulo,
      autores: l.autores,
      editorial: l.editorial,
      anio: l.anio,
      materias: l.materias,
      subtipo: l.subtipo,
      urlAcceso: l.urlAcceso,
      portadaUrl: l.portadaUrl,
      ejemplaresDisponibles: disponiblesPorLibro.get(String(l._id)) || 0,
    }))
  );
});

router.get("/seriadas", async (req, res) => {
  const seriadas = await Seriada.find({ bibliotecaId: req.biblioteca._id, eliminadoEn: null }).sort({ titulo: 1 });
  const ejemplares = await Ejemplar.find({ bibliotecaId: req.biblioteca._id, itemTipo: "Seriada" });
  const disponiblesPorSeriada = new Map();
  for (const e of ejemplares) {
    const key = String(e.itemId);
    const actual = disponiblesPorSeriada.get(key) || 0;
    disponiblesPorSeriada.set(key, actual + (e.estado === "disponible" ? 1 : 0));
  }
  res.json(
    seriadas.map((s) => ({
      _id: s._id,
      issn: s.issn,
      titulo: s.titulo,
      subtitulo: s.subtitulo,
      autores: s.autores,
      editorial: s.editorial,
      periodicidad: s.periodicidad,
      materias: s.materias,
      portadaUrl: s.portadaUrl,
      ejemplaresDisponibles: disponiblesPorSeriada.get(String(s._id)) || 0,
    }))
  );
});

// Sin ejemplaresDisponibles ni "pedir préstamo": el acceso es directo por
// urlAcceso, público, no requiere sesión de socio ni pasa por Solicitud.
router.get("/recursosElectronicos", async (req, res) => {
  const recursos = await RecursoElectronico.find({ bibliotecaId: req.biblioteca._id, eliminadoEn: null }).sort({
    titulo: 1,
  });
  res.json(
    recursos.map((r) => ({
      _id: r._id,
      titulo: r.titulo,
      subtitulo: r.subtitulo,
      autores: r.autores,
      editorial: r.editorial,
      anio: r.anio,
      materias: r.materias,
      tipoRecurso: r.tipoRecurso,
      urlAcceso: r.urlAcceso,
      portadaUrl: r.portadaUrl,
    }))
  );
});

// Catálogo público genérico para un tipo circulante: mismo cómputo de
// ejemplaresDisponibles que ya usan /libros y /seriadas de arriba, con
// selección de campos propia por bucket (mapItem) ya que cada uno muestra
// columnas distintas en el OPAC.
function catalogoPublico({ Modelo, itemTipo, mapItem }) {
  return async (req, res) => {
    const items = await Modelo.find({ bibliotecaId: req.biblioteca._id, eliminadoEn: null }).sort({ titulo: 1 });
    const ejemplares = await Ejemplar.find({ bibliotecaId: req.biblioteca._id, itemTipo });
    const disponiblesPorItem = new Map();
    for (const e of ejemplares) {
      const key = String(e.itemId);
      const actual = disponiblesPorItem.get(key) || 0;
      disponiblesPorItem.set(key, actual + (e.estado === "disponible" ? 1 : 0));
    }
    res.json(items.map((it) => mapItem(it, disponiblesPorItem.get(String(it._id)) || 0)));
  };
}

router.get(
  "/materialSonoro",
  catalogoPublico({
    Modelo: MaterialSonoro,
    itemTipo: "MaterialSonoro",
    mapItem: (m, disponibles) => ({
      _id: m._id,
      titulo: m.titulo,
      subtitulo: m.subtitulo,
      autores: m.autores,
      editorial: m.editorial,
      anio: m.anio,
      subtipo: m.subtipo,
      urlAcceso: m.urlAcceso,
      materias: m.materias,
      portadaUrl: m.portadaUrl,
      ejemplaresDisponibles: disponibles,
    }),
  })
);

router.get(
  "/materialAudiovisual",
  catalogoPublico({
    Modelo: MaterialAudiovisual,
    itemTipo: "MaterialAudiovisual",
    mapItem: (m, disponibles) => ({
      _id: m._id,
      titulo: m.titulo,
      subtitulo: m.subtitulo,
      autores: m.autores,
      editorial: m.editorial,
      anio: m.anio,
      subtipo: m.subtipo,
      urlAcceso: m.urlAcceso,
      materias: m.materias,
      portadaUrl: m.portadaUrl,
      ejemplaresDisponibles: disponibles,
    }),
  })
);

router.get(
  "/materialCartografico",
  catalogoPublico({
    Modelo: MaterialCartografico,
    itemTipo: "MaterialCartografico",
    mapItem: (m, disponibles) => ({
      _id: m._id,
      titulo: m.titulo,
      subtitulo: m.subtitulo,
      autores: m.autores,
      subtipo: m.subtipo,
      escala: m.escala,
      materias: m.materias,
      portadaUrl: m.portadaUrl,
      ejemplaresDisponibles: disponibles,
    }),
  })
);

router.get(
  "/materialGrafico",
  catalogoPublico({
    Modelo: MaterialGrafico,
    itemTipo: "MaterialGrafico",
    mapItem: (m, disponibles) => ({
      _id: m._id,
      titulo: m.titulo,
      subtitulo: m.subtitulo,
      autores: m.autores,
      subtipo: m.subtipo,
      materias: m.materias,
      portadaUrl: m.portadaUrl,
      ejemplaresDisponibles: disponibles,
    }),
  })
);

router.get(
  "/materialDidactico",
  catalogoPublico({
    Modelo: MaterialDidactico,
    itemTipo: "MaterialDidactico",
    mapItem: (m, disponibles) => ({
      _id: m._id,
      titulo: m.titulo,
      subtitulo: m.subtitulo,
      subtipo: m.subtipo,
      edadRecomendada: m.edadRecomendada,
      materias: m.materias,
      portadaUrl: m.portadaUrl,
      ejemplaresDisponibles: disponibles,
    }),
  })
);

// Catálogo público de solo lectura, sin disponibilidad ni acción alguna —
// Archivo/Objeto no circulan y no tienen acceso digital: son piezas
// únicas que se consultan en la biblioteca, no un botón que apretar acá.
function catalogoSoloLectura({ Modelo, mapItem }) {
  return async (req, res) => {
    const items = await Modelo.find({ bibliotecaId: req.biblioteca._id, eliminadoEn: null }).sort({ titulo: 1 });
    res.json(items.map(mapItem));
  };
}

router.get(
  "/archivos",
  catalogoSoloLectura({
    Modelo: Archivo,
    mapItem: (a) => ({
      _id: a._id,
      titulo: a.titulo,
      subtitulo: a.subtitulo,
      subtipo: a.subtipo,
      nivelDescripcion: a.nivelDescripcion,
      fechaInicio: a.fechaInicio,
      fechaFin: a.fechaFin,
      materias: a.materias,
      portadaUrl: a.portadaUrl,
    }),
  })
);

router.get(
  "/objetos",
  catalogoSoloLectura({
    Modelo: Objeto,
    mapItem: (o) => ({
      _id: o._id,
      titulo: o.titulo,
      subtitulo: o.subtitulo,
      subtipo: o.subtipo,
      periodo: o.periodo,
      ubicacion: o.ubicacion,
      materias: o.materias,
      portadaUrl: o.portadaUrl,
    }),
  })
);

// Catálogo de autoridades de autor (ver BIBL-1 en AUDITORIA.md) — público,
// sin login, igual que el resto del catálogo: el frontend lo usa para
// agrupar "Borges, Jorge Luis" y "Borges, J.L." como un solo autor en el
// facetado, sin tocar los registros bibliográficos en sí (que siguen con
// autores en texto libre). Si la biblioteca no cargó ninguno, devuelve un
// array vacío y el OPAC sigue funcionando exactamente como antes.
router.get("/autores", async (req, res) => {
  const autores = await Autor.find({ bibliotecaId: req.biblioteca._id, eliminadoEn: null }).sort({
    formaAutorizada: 1,
  });
  res.json(autores.map((a) => ({ formaAutorizada: a.formaAutorizada, variantes: a.variantes })));
});

// Catálogo de autoridades de materia (ver BIBL-3 en AUDITORIA.md) — mismo
// criterio que /autores (BIBL-1): público, sin login, resuelve variantes a
// una forma autorizada al facetar/filtrar, sin tocar los registros
// bibliográficos en sí.
router.get("/materias", async (req, res) => {
  const materias = await Materia.find({ bibliotecaId: req.biblioteca._id, eliminadoEn: null }).sort({
    formaAutorizada: 1,
  });
  res.json(materias.map((m) => ({ formaAutorizada: m.formaAutorizada, variantes: m.variantes })));
});

// --- Login del socio ---
router.post("/login", crearLimitadorLogin(), async (req, res) => {
  const numeroSocio = typeof req.body?.numeroSocio === "string" ? req.body.numeroSocio.trim() : req.body?.numeroSocio;
  const { password } = req.body || {};
  if (typeof numeroSocio !== "string" || typeof password !== "string" || !numeroSocio || !password) {
    return res.status(400).json({ error: "Número de socio y contraseña son obligatorios." });
  }
  // El número de socio se guarda "trim" (ver models/Socio.js) — sin este
  // mismo trim acá, un espacio de más al tipearlo (o pegado desde otro
  // lado) hacía que el findOne exacto no encontrara nada y devolviera el
  // mismo error genérico que una contraseña incorrecta, indistinguible
  // para quien está probando. La contraseña NO se toca: un espacio ahí
  // podría ser parte real de la contraseña.
  const socio = await Socio.findOne({ bibliotecaId: req.biblioteca._id, numeroSocio, eliminadoEn: null });
  if (!socio || !socio.passwordHash || !(await bcrypt.compare(password, socio.passwordHash))) {
    return res.status(401).json({ error: "Número de socio o contraseña incorrectos." });
  }
  setCookieSesionSocio(res, firmarTokenSocio(socio));
  res.json({ numeroSocio: socio.numeroSocio, nombre: socio.nombre, apellido: socio.apellido });
});

router.post("/logout", (req, res) => {
  limpiarCookieSesionSocio(res);
  res.json({ ok: true });
});

// --- A partir de acá, requiere sesión de socio de ESTA biblioteca ---
router.use(requiereLoginSocio, requiereSocio);

router.get("/yo", (req, res) => {
  res.json({ numeroSocio: req.usuario.numeroSocio });
});

router.get("/mis-prestamos", async (req, res) => {
  const prestamos = await Prestamo.find({
    bibliotecaId: req.biblioteca._id,
    socioId: req.usuario.id,
  }).sort({ fechaEntrega: -1 });

  // Join manual separado por itemTipo (no hay populate() en este proyecto,
  // y cada tipo circulante vive en su propia colección — ver
  // circulacion/tiposCirculantes.js).
  const idsPorTipo = {};
  for (const tipo of Object.keys(MODELOS_POR_TIPO)) idsPorTipo[tipo] = [];
  for (const p of prestamos) idsPorTipo[p.itemTipo]?.push(p.itemId);
  const itemPorTipoYId = {};
  for (const [tipo, Modelo] of Object.entries(MODELOS_POR_TIPO)) {
    const encontrados = await Modelo.find({ _id: { $in: idsPorTipo[tipo] } });
    itemPorTipoYId[tipo] = new Map(encontrados.map((i) => [String(i._id), i]));
  }

  // vencido/multa: de solo lectura para el socio — puede ver si está
  // atrasado y cuánto le cobrarían, pero no hay ninguna ruta acá que le
  // permita cambiar ese estado (eso sigue siendo del staff: procesar la
  // devolución, ajustar la biblioteca, etc.).
  res.json(
    prestamos.map((p) => ({
      _id: p._id,
      item: itemPorTipoYId[p.itemTipo]?.get(String(p.itemId)) || null,
      fechaEntrega: p.fechaEntrega,
      fechaVencimiento: p.fechaVencimiento,
      fechaDevolucion: p.fechaDevolucion,
      renovaciones: p.renovaciones,
      vencido: estaVencido(p),
      multa: calcularMulta(p, req.biblioteca),
    }))
  );
});

router.get("/mis-solicitudes", async (req, res) => {
  const solicitudes = await Solicitud.find({
    bibliotecaId: req.biblioteca._id,
    socioId: req.usuario.id,
  }).sort({ fechaSolicitud: -1 });
  res.json(solicitudes);
});

router.post("/solicitudes", async (req, res) => {
  const { tipo, itemTipo, itemId, prestamoId } = req.body || {};
  let itemReservado = null;

  if (tipo === "prestamo") {
    if (!itemTipo || !itemId) return res.status(400).json({ error: "Faltan itemTipo/itemId." });
    if (!esIdValido(itemId)) return res.status(400).json({ error: "itemId inválido." });
    const Modelo = MODELOS_POR_TIPO[itemTipo];
    if (!Modelo) return res.status(400).json({ error: "itemTipo inválido." });
    const item = await Modelo.findOne({ _id: itemId, bibliotecaId: req.biblioteca._id, eliminadoEn: null });
    if (!item) return res.status(404).json({ error: "Ítem no encontrado." });
  } else if (tipo === "renovacion") {
    if (!prestamoId) return res.status(400).json({ error: "Falta prestamoId." });
    if (!esIdValido(prestamoId)) return res.status(400).json({ error: "prestamoId inválido." });
    const prestamo = await Prestamo.findOne({
      _id: prestamoId,
      bibliotecaId: req.biblioteca._id,
      socioId: req.usuario.id,
    });
    if (!prestamo) return res.status(404).json({ error: "Préstamo no encontrado." });
    if (prestamo.fechaDevolucion) {
      return res.status(409).json({ error: "Ese préstamo ya fue devuelto." });
    }
    if (!puedeRenovar(prestamo, req.biblioteca)) {
      return res.status(409).json({ error: "Este préstamo ya alcanzó el máximo de renovaciones." });
    }
  } else {
    return res.status(400).json({ error: "tipo debe ser 'prestamo' o 'renovacion'." });
  }

  const yaExiste = await Solicitud.findOne({
    bibliotecaId: req.biblioteca._id,
    socioId: req.usuario.id,
    tipo,
    estado: "pendiente",
    ...(tipo === "prestamo" ? { itemTipo, itemId } : { prestamoId }),
  });
  if (yaExiste) {
    return res.status(409).json({ error: "Ya tenés una solicitud pendiente igual a esta." });
  }

  if (tipo === "prestamo") {
    // Reserva atómica: si dos socios piden el último ejemplar disponible al
    // mismo tiempo, findOneAndUpdate con filtro estado:"disponible" hace que
    // Mongo resuelva cuál de los dos gana (mismo patrón que
    // elegirYReservarEjemplar en circulacion.js) — el otro recibe 409 en vez
    // de que las dos solicitudes queden pendientes por el mismo ejemplar.
    itemReservado = await Ejemplar.findOneAndUpdate(
      { bibliotecaId: req.biblioteca._id, itemTipo, itemId, estado: "disponible" },
      { estado: "reservado" },
      { new: true }
    );
    if (!itemReservado) {
      return res.status(409).json({ error: "No hay ejemplares disponibles ahora mismo." });
    }
  }

  let solicitud;
  try {
    solicitud = await Solicitud.create({
      bibliotecaId: req.biblioteca._id,
      socioId: req.usuario.id,
      tipo,
      itemTipo: tipo === "prestamo" ? itemTipo : undefined,
      itemId: tipo === "prestamo" ? itemId : undefined,
      ejemplarId: itemReservado ? itemReservado._id : undefined,
      prestamoId: tipo === "renovacion" ? prestamoId : undefined,
    });
  } catch (err) {
    // El ejemplar ya quedó reservado arriba — si crear la solicitud falla,
    // hay que liberarlo a mano (no hay transacciones en este setup) para no
    // dejarlo trabado en "reservado" sin ninguna solicitud asociada.
    if (itemReservado) {
      await Ejemplar.findByIdAndUpdate(itemReservado._id, { estado: "disponible" });
    }
    // Acá ya se validó todo lo que un socio puede escribir mal (tipo,
    // itemTipo/itemId, prestamoId) — si igual falla, es un error interno,
    // no algo que el socio pueda corregir. No hace falta mostrarle el
    // mensaje crudo de Mongoose, en inglés técnico (ver GOB-5 en
    // AUDITORIA.md) — se loguea server-side para que el staff/dev lo vea.
    console.error("Error al crear una solicitud de OPAC:", err);
    return res.status(400).json({ error: "No se pudo registrar el pedido. Probá de nuevo en un momento." });
  }
  res.status(201).json(solicitud);
});

export default router;
