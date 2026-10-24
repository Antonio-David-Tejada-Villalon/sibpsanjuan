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
import Portada from "../models/Portada.js";
import ContenidoOpac from "../models/ContenidoOpac.js";
import ImagenCms from "../models/ImagenCms.js";
import { contenidoInicial } from "../contenido/validar.js";
import { contenidoPublico } from "../contenido/publico.js";
import { TIPOS, ORDENES, buscarEnCatalogo, fichaDeMaterial, titulosDe } from "../opac/catalogo.js";
import { textoDeConsulta, opcionDeConsulta, listaDeConsulta, enteroDeConsulta, ErrorHttp } from "../utils/consulta.js";
import { filtroVigente } from "../portadas/servicio.js";
import {
  firmarTokenSocio,
  setCookieSesionSocio,
  limpiarCookieSesionSocio,
  requiereLoginSocio,
  requiereSocio,
} from "../middleware/auth.js";
import { puedeRenovar, estaVencido, calcularMulta, resolverPolitica, superaMaxPrestamos } from "../circulacion/reglas.js";
import { politicaDeSocio, contarPrestamosEnCurso } from "../circulacion/categorias.js";
import { esIdValido } from "../utils/objectId.js";
import { crearLimitadorLogin } from "../middleware/rateLimit.js";
import { idempotente } from "../middleware/idempotencia.js";
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
// Cada ítem del catálogo lleva "portada": la versión de su portada
// procesada (para pedir /portadas/<id>/<tamaño>.webp?v=<versión>) o null, y
// entonces el OPAC dibuja una tapa tipográfica. Nunca sale la URL externa
// que haya cargado el staff (portadaUrl): el navegador no le pide imágenes
// a terceros.
async function conPortadas(lista) {
  const portadas = await Portada.find({ itemId: { $in: lista.map((i) => i._id) }, ...filtroVigente() }).select(
    "itemId version fuente"
  );
  const porItem = new Map(portadas.map((p) => [String(p.itemId), p]));
  return lista.map(({ portadaUrl, ...item }) => {
    const portada = porItem.get(String(item._id));
    // portadaFuente: para el crédito en la ficha (Open Library, Google Books).
    return { ...item, portada: portada?.version ?? null, portadaFuente: portada?.fuente ?? null };
  });
}

router.get("/libros", async (req, res) => {
  const libros = await Libro.find({ bibliotecaId: req.biblioteca._id, eliminadoEn: null }).sort({ titulo: 1 });
  const ejemplares = await Ejemplar.find({ bibliotecaId: req.biblioteca._id, itemTipo: "Libro" });
  const disponiblesPorLibro = new Map();
  for (const e of ejemplares) {
    const key = String(e.itemId);
    const actual = disponiblesPorLibro.get(key) || 0;
    disponiblesPorLibro.set(key, actual + (e.estado === "disponible" ? 1 : 0));
  }
  res.json(await conPortadas(
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
  ));
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
  res.json(await conPortadas(
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
  ));
});

// Sin ejemplaresDisponibles ni "pedir préstamo": el acceso es directo por
// urlAcceso, público, no requiere sesión de socio ni pasa por Solicitud.
router.get("/recursosElectronicos", async (req, res) => {
  const recursos = await RecursoElectronico.find({ bibliotecaId: req.biblioteca._id, eliminadoEn: null }).sort({
    titulo: 1,
  });
  res.json(await conPortadas(
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
  ));
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
    res.json(await conPortadas(items.map((it) => mapItem(it, disponiblesPorItem.get(String(it._id)) || 0))));
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
    res.json(await conPortadas(items.map((it) => mapItem(it))));
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

// Portadas procesadas (ver models/Portada.js), públicas como el resto del
// catálogo. Con ?v=<versión> la URL cambia cuando cambia la imagen, así que
// se puede guardar en caché un año — salvo las de Google Books, que no
// pueden quedar guardadas más allá de lo que permite su caché (expiraEn).
const TAMANOS_PORTADA = { "grande.webp": "grande", "miniatura.webp": "miniatura" };

router.get("/portadas/:itemId/:archivo", async (req, res) => {
  const tamano = TAMANOS_PORTADA[req.params.archivo];
  if (!tamano || !esIdValido(req.params.itemId)) {
    return res.status(404).json({ error: "Portada no encontrada." });
  }
  const ahora = new Date();
  const portada = await Portada.findOne({
    itemId: req.params.itemId,
    bibliotecaId: req.biblioteca._id,
    ...filtroVigente(ahora),
  }).select(`${tamano} version expiraEn`);
  if (!portada) return res.status(404).json({ error: "Portada no encontrada." });
  const UN_ANIO = 365 * 24 * 60 * 60;
  const hastaQueVence = portada.expiraEn ? Math.floor((portada.expiraEn - ahora) / 1000) : UN_ANIO;
  const segundos = req.query.v === portada.version ? Math.min(UN_ANIO, hastaQueVence) : Math.min(300, hastaQueVence);
  res.set("Content-Type", "image/webp");
  res.set("Cache-Control", `public, max-age=${segundos}${segundos === UN_ANIO ? ", immutable" : ""}`);
  res.send(portada[tamano]);
});

// --- Búsqueda y fichas (ver opac/catalogo.js) ---

// Una página de resultados con sus facetas. Todo opcional:
// ?q=texto&tipo=Libro&tipo=Seriada&autor=...&materia=...&disponible=1
// &orden=relevancia|titulo|anio|disponibilidad&pagina=2&porPagina=24
router.get("/buscar", async (req, res) => {
  const tipos = listaDeConsulta(req.query.tipo, "tipo", { maximo: 10 });
  if (tipos.some((t) => !TIPOS[t])) {
    throw new ErrorHttp(400, `El parámetro "tipo" tiene que ser uno de: ${Object.keys(TIPOS).join(", ")}.`);
  }
  const resultado = await buscarEnCatalogo(req.biblioteca, {
    q: textoDeConsulta(req.query.q).slice(0, 200),
    tipos,
    autores: listaDeConsulta(req.query.autor, "autor"),
    materias: listaDeConsulta(req.query.materia, "materia"),
    soloDisponibles: req.query.disponible === "1",
    orden: opcionDeConsulta(req.query.orden, ORDENES, "orden") || "relevancia",
    pagina: enteroDeConsulta(req.query.pagina, { minimo: 1, maximo: 10_000, defecto: 1 }),
    porPagina: enteroDeConsulta(req.query.porPagina, { minimo: 1, maximo: 48, defecto: 24 }),
  });
  res.json(resultado);
});

router.get("/items/:tipo/:id", async (req, res) => {
  const ficha = esIdValido(req.params.id) ? await fichaDeMaterial(req.biblioteca, req.params.tipo, req.params.id) : null;
  if (!ficha) return res.status(404).json({ error: "Material no encontrado." });
  res.json(ficha);
});

// --- Contenido publicado desde el CMS (ver routes/contenido.js) ---

async function datosPublicados(biblioteca) {
  const publicada = await ContenidoOpac.findOne({ bibliotecaId: biblioteca._id, estado: "publicada" }).select("datos version");
  return { datos: publicada?.datos ?? contenidoInicial(biblioteca), version: publicada?.version ?? null };
}

// Identidad, contacto, avisos vigentes e índice de páginas. Mientras la
// biblioteca no publique nada: su nombre y el acento del sistema de diseño.
router.get("/contenido", async (req, res) => {
  const { datos, version } = await datosPublicados(req.biblioteca);
  res.set("Cache-Control", "public, max-age=60");
  res.json({ ...contenidoPublico(datos, req.biblioteca.codigo), version });
});

router.get("/paginas/:slug", async (req, res) => {
  const { datos } = await datosPublicados(req.biblioteca);
  const pagina = datos.paginas.find((p) => p.slug && p.slug === req.params.slug);
  if (!pagina) return res.status(404).json({ error: "Página no encontrada." });
  res.set("Cache-Control", "public, max-age=60");
  res.json(pagina);
});

// Logos del CMS: nunca cambian (una imagen nueva es otro id), así que se
// pueden guardar en caché un año.
router.get("/imagenes/:archivo", async (req, res) => {
  const [, id] = /^([0-9a-f]{24})\.webp$/.exec(req.params.archivo) || [];
  const imagen = id && (await ImagenCms.findOne({ _id: id, bibliotecaId: req.biblioteca._id }).select("datos"));
  if (!imagen) return res.status(404).json({ error: "Imagen no encontrada." });
  res.set("Content-Type", "image/webp");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(imagen.datos);
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

// Reglas de la categoría del socio logueado (ver circulacion/categorias.js).
// null si el socio se borró después de iniciar sesión: la cookie sigue
// siendo válida, pero ya no debería poder pedir nada.
async function politicaDelSocio(req) {
  const socio = await Socio.findOne({ _id: req.usuario.id, bibliotecaId: req.biblioteca._id, eliminadoEn: null });
  return socio ? politicaDeSocio(socio, req.biblioteca) : null;
}

const SOCIO_INACTIVO = "Tu cuenta de socio ya no está activa. Consultá en la biblioteca.";

function mensajeMaximoAlcanzado(politica) {
  const n = politica.maxPrestamos;
  const categoria = politica.categoria ? ` para la categoría ${politica.categoria.nombre}` : "";
  return `Ya tenés ${n} ${n === 1 ? "préstamo o pedido" : "préstamos o pedidos"} en curso, el máximo${categoria}. Devolvé uno para poder pedir otro.`;
}

// Lo que el socio necesita saber antes de pedir: cuántos días le dura un
// préstamo, cuántas veces puede renovar, la multa y cuántos puede tener a
// la vez (y cuántos tiene ahora). Nada de esto es configurable desde acá.
router.get("/mis-reglas", async (req, res) => {
  const politica = await politicaDelSocio(req);
  if (!politica) return res.status(403).json({ error: SOCIO_INACTIVO });
  res.json({
    ...politica,
    enCurso: await contarPrestamosEnCurso(req.biblioteca._id, req.usuario.id),
  });
});

router.get("/mis-prestamos", async (req, res) => {
  const politica = (await politicaDelSocio(req)) || resolverPolitica(req.biblioteca);
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
      multa: calcularMulta(p, politica),
    }))
  );
});

// Cada pedido con el título del material (y su ficha), para que el socio
// vea qué pidió y en qué quedó sin tener que adivinarlo por un id.
router.get("/mis-solicitudes", async (req, res) => {
  const solicitudes = await Solicitud.find({
    bibliotecaId: req.biblioteca._id,
    socioId: req.usuario.id,
  }).sort({ fechaSolicitud: -1 });
  const prestamos = await Prestamo.find({ _id: { $in: solicitudes.map((s) => s.prestamoId).filter(Boolean) } }).select(
    "itemTipo itemId"
  );
  const prestamoPorId = new Map(prestamos.map((p) => [String(p._id), p]));
  const materialDe = (s) => (s.tipo === "prestamo" ? s : prestamoPorId.get(String(s.prestamoId)) || {});
  const titulos = await titulosDe(solicitudes.map((s) => materialDe(s)));
  res.json(
    solicitudes.map((s) => {
      const { itemTipo, itemId } = materialDe(s);
      return { ...s.toObject(), material: itemId ? { itemTipo, id: String(itemId), ...titulos.get(String(itemId)) } : null };
    })
  );
});

router.post("/solicitudes", idempotente, async (req, res) => {
  const { tipo, itemTipo, itemId, prestamoId } = req.body || {};
  let itemReservado = null;
  if (tipo !== "prestamo" && tipo !== "renovacion") {
    return res.status(400).json({ error: "tipo debe ser 'prestamo' o 'renovacion'." });
  }
  const politica = await politicaDelSocio(req);
  if (!politica) return res.status(403).json({ error: SOCIO_INACTIVO });

  if (tipo === "prestamo") {
    if (!itemTipo || !itemId) return res.status(400).json({ error: "Faltan itemTipo/itemId." });
    if (!esIdValido(itemId)) return res.status(400).json({ error: "itemId inválido." });
    const Modelo = MODELOS_POR_TIPO[itemTipo];
    if (!Modelo) return res.status(400).json({ error: "itemTipo inválido." });
    const item = await Modelo.findOne({ _id: itemId, bibliotecaId: req.biblioteca._id, eliminadoEn: null });
    if (!item) return res.status(404).json({ error: "Ítem no encontrado." });
    if (superaMaxPrestamos(politica, await contarPrestamosEnCurso(req.biblioteca._id, req.usuario.id))) {
      return res.status(409).json({ error: mensajeMaximoAlcanzado(politica) });
    }
  } else {
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
    if (!puedeRenovar(prestamo, politica)) {
      return res.status(409).json({ error: "Este préstamo ya alcanzó el máximo de renovaciones." });
    }
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
    // Dos pedidos iguales al mismo tiempo (doble toque): el índice único de
    // Solicitud deja pasar solo el primero.
    if (err.code === 11000) {
      return res.status(409).json({ error: "Ya tenés una solicitud pendiente igual a esta." });
    }
    // Acá ya se validó todo lo que un socio puede escribir mal (tipo,
    // itemTipo/itemId, prestamoId) — si igual falla, es un error interno,
    // no algo que el socio pueda corregir. No hace falta mostrarle el
    // mensaje crudo de Mongoose, en inglés técnico (ver GOB-5 en
    // AUDITORIA.md) — se loguea server-side para que el staff/dev lo vea.
    console.error("Error al crear una solicitud de OPAC:", err);
    return res.status(400).json({ error: "No se pudo registrar el pedido. Probá de nuevo en un momento." });
  }
  // Segundo chequeo del máximo, ya con el pedido creado — mismo criterio
  // que crearPrestamo en circulacion.js: si dos pedidos del mismo socio
  // pasaron juntos el chequeo de arriba, se deshace solo el último.
  if (tipo === "prestamo" && politica.maxPrestamos != null) {
    const enCurso = await contarPrestamosEnCurso(req.biblioteca._id, req.usuario.id, { hastaId: solicitud._id });
    if (enCurso > politica.maxPrestamos) {
      await Solicitud.deleteOne({ _id: solicitud._id });
      await Ejemplar.findByIdAndUpdate(itemReservado._id, { estado: "disponible" });
      return res.status(409).json({ error: mensajeMaximoAlcanzado(politica) });
    }
  }
  res.status(201).json(solicitud);
});

export default router;
