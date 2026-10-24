import { Router } from "express";
import rateLimit from "express-rate-limit";
import Biblioteca from "../models/Biblioteca.js";
import Portada from "../models/Portada.js";
import RecursoElectronico from "../models/RecursoElectronico.js";
import Archivo from "../models/Archivo.js";
import Objeto from "../models/Objeto.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";
import { MODELOS_POR_TIPO } from "../circulacion/tiposCirculantes.js";
import { ErrorDescarga } from "../portadas/descargar.js";
import { ErrorImagen } from "../portadas/procesar.js";
import { DEPENDENCIAS, buscarPortadaAutomatica, portadaDesdeUrl, normalizarIsbn } from "../portadas/servicio.js";

// Gestión de portadas desde el panel: ver la actual, buscarla por ISBN
// (Open Library → Google Books), cargarla desde una URL (última opción) o
// quitarla. Las imágenes en sí se sirven públicamente desde el OPAC.
const router = Router();

router.use(requiereLogin, requiereBiblioteca, requierePermiso("catalogar"));

// Los 10 tipos de material del catálogo pueden tener portada; buscarla por
// ISBN solo aplica a Libro (el único con ISBN).
const MODELOS_CON_PORTADA = { ...MODELOS_POR_TIPO, RecursoElectronico, Archivo, Objeto };

// Cada pedido descarga y procesa una imagen: un límite por persona evita
// que el servidor se use para pedir imágenes en masa.
const limitarDescargas = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  keyGenerator: (req) => `usuario:${req.usuario.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas búsquedas de portadas seguidas. Probá de nuevo en unos minutos." },
});

function dependencias(req) {
  return { ...DEPENDENCIAS, ...req.app.locals.portadas };
}

async function buscarItem(req, res) {
  const Modelo = MODELOS_CON_PORTADA[req.params.itemTipo];
  if (!Modelo) {
    res.status(400).json({ error: "Tipo de material inválido." });
    return null;
  }
  const item = await Modelo.findOne({ _id: req.params.itemId, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!item) res.status(404).json({ error: "No encontrado." });
  return item;
}

// Lo que necesita el panel para mostrarla: de dónde salió y su URL pública.
async function respuesta(req, portada) {
  const biblioteca = await Biblioteca.findById(req.usuario.bibliotecaId).select("codigo");
  const base = `/api/v1/opac/${biblioteca.codigo}/portadas/${portada.itemId}`;
  return {
    fuente: portada.fuente,
    origen: portada.origen,
    version: portada.version,
    ancho: portada.ancho,
    alto: portada.alto,
    expiraEn: portada.expiraEn,
    actualizada: portada.actualizada,
    url: `${base}/grande.webp?v=${portada.version}`,
    urlMiniatura: `${base}/miniatura.webp?v=${portada.version}`,
  };
}

const conIds = [requiereIdValido("itemId")];

router.get("/:itemTipo/:itemId", ...conIds, async (req, res) => {
  const item = await buscarItem(req, res);
  if (!item) return;
  const portada = await Portada.findOne({ itemId: item._id }).select("-grande -miniatura");
  if (!portada) return res.status(404).json({ error: "Este material todavía no tiene portada." });
  res.json(await respuesta(req, portada));
});

router.post("/:itemTipo/:itemId/buscar", ...conIds, limitarDescargas, async (req, res) => {
  const item = await buscarItem(req, res);
  if (!item) return;
  const isbn = normalizarIsbn(item.isbn);
  if (!isbn) {
    return res.status(400).json({ error: "La búsqueda automática necesita un ISBN válido. Podés cargar la portada desde una URL." });
  }
  const portada = await buscarPortadaAutomatica(item, req.params.itemTipo, { deps: dependencias(req), usuarioId: req.usuario.id });
  if (!portada) {
    return res.status(404).json({
      error: `No se encontró portada para el ISBN ${isbn} en Open Library ni en Google Books. Podés cargarla desde una URL.`,
    });
  }
  res.json(await respuesta(req, portada));
});

router.post("/:itemTipo/:itemId/desde-url", ...conIds, limitarDescargas, async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) return res.status(400).json({ error: "Falta la URL de la imagen." });
  const item = await buscarItem(req, res);
  if (!item) return;
  try {
    const portada = await portadaDesdeUrl(item, req.params.itemTipo, url, { deps: dependencias(req), usuarioId: req.usuario.id });
    res.json(await respuesta(req, portada));
  } catch (err) {
    if (err instanceof ErrorDescarga || err instanceof ErrorImagen) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

router.delete("/:itemTipo/:itemId", ...conIds, async (req, res) => {
  const item = await buscarItem(req, res);
  if (!item) return;
  await Portada.deleteOne({ itemId: item._id });
  res.json({ ok: true });
});

export default router;
