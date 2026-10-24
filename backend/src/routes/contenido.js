import express, { Router } from "express";
import sharp from "sharp";
import Biblioteca from "../models/Biblioteca.js";
import ContenidoOpac from "../models/ContenidoOpac.js";
import ImagenCms from "../models/ImagenCms.js";
import Usuario from "../models/Usuario.js";
import Auditoria from "../models/Auditoria.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { idempotente } from "../middleware/idempotencia.js";
import { requiereIdValido } from "../utils/objectId.js";
import { contenidoInicial, validarContenido, imagenesUsadas } from "../contenido/validar.js";
import { contenidoPublico, urlImagenCms } from "../contenido/publico.js";

// CMS del OPAC desde el panel. Editar el borrador y subir logos: permiso
// "contenido" (admin, supervisor y superbibliotecario lo tienen siempre).
// Publicar, descartar el borrador y restaurar versiones: solo esos tres
// roles, nunca un bibliotecario — es lo que ve el público.
const router = Router();

router.use(requiereLogin, requiereBiblioteca, requierePermiso("contenido"));

const puedePublicar = (req) => req.usuario.rol !== "bibliotecario";

function soloQuienPublica(req, res, next) {
  if (!puedePublicar(req)) {
    return res.status(403).json({ error: "Publicar, descartar o restaurar lo hace un admin, supervisor o superbibliotecario." });
  }
  next();
}

const bibliotecaDe = (req) => Biblioteca.findById(req.usuario.bibliotecaId).select("nombre codigo");

function registrar(req, accion, contenido) {
  return Auditoria.create({
    bibliotecaId: req.usuario.bibliotecaId,
    actorId: req.usuario.id,
    actorRol: req.usuario.rol,
    accion,
    entidadTipo: "ContenidoOpac",
    entidadId: contenido._id,
    resultado: "ok",
  });
}

// Todas las imágenes que usa el contenido tienen que ser de esta biblioteca.
async function imagenesAjenas(req, datos) {
  const ids = imagenesUsadas(datos);
  if (!ids.length) return false;
  const propias = await ImagenCms.countDocuments({ _id: { $in: ids }, bibliotecaId: req.usuario.bibliotecaId });
  return propias !== new Set(ids).size;
}

function errorDeValidacion(res, errores) {
  return res.status(400).json({ error: errores[0], errores });
}

// Lo que necesita la pantalla del panel: el borrador (o, si no hay, la
// versión publicada / el contenido inicial como punto de partida, sin
// guardarlo todavía), qué le falta para poder publicarse y si quien mira
// puede publicar.
async function estadoDelBorrador(req) {
  const [biblioteca, borrador, publicada] = await Promise.all([
    bibliotecaDe(req),
    ContenidoOpac.findOne({ bibliotecaId: req.usuario.bibliotecaId, estado: "borrador" }),
    ContenidoOpac.findOne({ bibliotecaId: req.usuario.bibliotecaId, estado: "publicada" }).select("version publicadoEn datos"),
  ]);
  const datos = borrador?.datos ?? publicada?.datos ?? contenidoInicial(biblioteca);
  return {
    codigo: biblioteca.codigo,
    borrador: borrador ? { version: borrador.version, actualizadoEn: borrador.actualizadoEn, restauradaDe: borrador.restauradaDe } : null,
    publicada: publicada ? { version: publicada.version, publicadoEn: publicada.publicadoEn } : null,
    datos,
    faltaParaPublicar: validarContenido(datos, { modo: "publicar" }).errores,
    puedePublicar: puedePublicar(req),
  };
}

async function siguienteVersion(bibliotecaId) {
  const ultima = await ContenidoOpac.findOne({ bibliotecaId }).sort({ version: -1 }).select("version");
  return (ultima?.version || 0) + 1;
}

// Crea el borrador o reemplaza el que hay. Un choque con el índice único
// (dos personas creándolo a la vez) se resuelve actualizando el que ganó.
async function guardarBorrador(req, datos, extra = {}) {
  const bibliotecaId = req.usuario.bibliotecaId;
  const cambios = { datos, actualizadoPor: req.usuario.id, actualizadoEn: new Date(), ...extra };
  const existente = await ContenidoOpac.findOneAndUpdate({ bibliotecaId, estado: "borrador" }, cambios, { new: true });
  if (existente) return existente;
  try {
    return await ContenidoOpac.create({
      bibliotecaId,
      estado: "borrador",
      version: await siguienteVersion(bibliotecaId),
      creadoPor: req.usuario.id,
      restauradaDe: null,
      ...cambios,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return ContenidoOpac.findOneAndUpdate({ bibliotecaId, estado: "borrador" }, cambios, { new: true });
  }
}

router.get("/borrador", async (req, res) => {
  res.json(await estadoDelBorrador(req));
});

router.put("/borrador", async (req, res) => {
  const { datos, errores } = validarContenido(req.body?.datos);
  if (errores.length) return errorDeValidacion(res, errores);
  if (await imagenesAjenas(req, datos)) return errorDeValidacion(res, ["Una de las imágenes no es de esta biblioteca."]);
  await guardarBorrador(req, datos);
  res.json(await estadoDelBorrador(req));
});

router.delete("/borrador", soloQuienPublica, async (req, res) => {
  await ContenidoOpac.deleteOne({ bibliotecaId: req.usuario.bibliotecaId, estado: "borrador" });
  res.json(await estadoDelBorrador(req));
});

// Lo que verá el público con el borrador actual (para la vista previa).
router.get("/vista-previa", async (req, res) => {
  const estado = await estadoDelBorrador(req);
  res.json(contenidoPublico(estado.datos, estado.codigo));
});

router.post("/borrador/publicar", soloQuienPublica, idempotente, async (req, res) => {
  const bibliotecaId = req.usuario.bibliotecaId;
  const borrador = await ContenidoOpac.findOne({ bibliotecaId, estado: "borrador" });
  if (!borrador) return res.status(409).json({ error: "No hay cambios en borrador para publicar." });
  const { datos, errores } = validarContenido(borrador.datos, { modo: "publicar" });
  if (errores.length) return errorDeValidacion(res, errores);
  if (await imagenesAjenas(req, datos)) return errorDeValidacion(res, ["Una de las imágenes no es de esta biblioteca."]);

  // Sin transacciones: primero se archiva la publicada y después el
  // borrador pasa a publicada. Si eso último falla (otra persona publicó o
  // descartó a la vez), se deshace el archivado.
  const anterior = await ContenidoOpac.findOneAndUpdate({ bibliotecaId, estado: "publicada" }, { estado: "archivada" });
  const publicada = await ContenidoOpac.findOneAndUpdate(
    { _id: borrador._id, estado: "borrador" },
    { estado: "publicada", datos, publicadoPor: req.usuario.id, publicadoEn: new Date() },
    { new: true }
  );
  if (!publicada) {
    if (anterior) {
      await ContenidoOpac.updateOne({ _id: anterior._id, estado: "archivada" }, { estado: "publicada" }).catch(() => {});
    }
    return res.status(409).json({ error: "El borrador cambió mientras se publicaba. Actualizá y probá de nuevo." });
  }
  await registrar(req, "contenido.publicar", publicada);
  res.json({ version: publicada.version, publicadoEn: publicada.publicadoEn });
});

router.get("/versiones", async (req, res) => {
  const versiones = await ContenidoOpac.find({ bibliotecaId: req.usuario.bibliotecaId })
    .sort({ version: -1 })
    .select("-datos");
  const ids = versiones.flatMap((v) => [v.creadoPor, v.actualizadoPor, v.publicadoPor]).filter(Boolean);
  const usuarios = await Usuario.find({ _id: { $in: ids } }).select("usuario");
  const nombre = new Map(usuarios.map((u) => [String(u._id), u.usuario]));
  res.json(
    versiones.map((v) => ({
      _id: v._id,
      version: v.version,
      estado: v.estado,
      creadoEn: v.creadoEn,
      actualizadoEn: v.actualizadoEn,
      actualizadoPor: nombre.get(String(v.actualizadoPor)) || null,
      publicadoEn: v.publicadoEn,
      publicadoPor: v.publicadoPor ? nombre.get(String(v.publicadoPor)) || null : null,
      restauradaDe: v.restauradaDe,
    }))
  );
});

router.get("/versiones/:id", requiereIdValido(), async (req, res) => {
  const version = await ContenidoOpac.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId });
  if (!version) return res.status(404).json({ error: "Versión no encontrada." });
  res.json({ version: version.version, estado: version.estado, datos: version.datos });
});

// Volver a una versión anterior: pasa a ser el borrador (no se publica sola;
// se revisa y se publica como cualquier otro cambio).
router.post("/versiones/:id/restaurar", soloQuienPublica, requiereIdValido(), async (req, res) => {
  const origen = await ContenidoOpac.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId });
  if (!origen) return res.status(404).json({ error: "Versión no encontrada." });
  const borrador = await guardarBorrador(req, origen.datos, { restauradaDe: origen.version });
  await registrar(req, "contenido.restaurar", borrador);
  res.json(await estadoDelBorrador(req));
});

// Logos: la imagen llega como cuerpo binario (Content-Type de imagen), hasta
// 1 MB. Se decodifica y se guarda como WebP de hasta 512 px, sin metadatos.
// SVG no: puede llevar scripts o referencias externas.
const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp"];

router.post("/imagenes", express.raw({ type: TIPOS_IMAGEN, limit: "1mb" }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(415).json({ error: "Subí una imagen PNG, JPG o WebP (hasta 1 MB)." });
  }
  let procesada;
  try {
    const meta = await sharp(req.body, { limitInputPixels: 25_000_000, failOn: "error" }).metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format)) throw new Error("formato");
    if (meta.width < 16 || meta.height < 16) throw new Error("chica");
    procesada = await sharp(req.body, { limitInputPixels: 25_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return res.status(400).json({ error: "La imagen no se pudo leer. Probá con un PNG, JPG o WebP de al menos 16 px." });
  }
  const imagen = await ImagenCms.create({
    bibliotecaId: req.usuario.bibliotecaId,
    datos: procesada.data,
    ancho: procesada.info.width,
    alto: procesada.info.height,
    bytes: procesada.info.size,
    subidaPor: req.usuario.id,
  });
  const biblioteca = await bibliotecaDe(req);
  res.status(201).json({ id: String(imagen._id), url: urlImagenCms(biblioteca.codigo, imagen._id), ancho: imagen.ancho, alto: imagen.alto });
});

export default router;
