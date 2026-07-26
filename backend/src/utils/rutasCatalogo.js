import { Router } from "express";
import Ejemplar from "../models/Ejemplar.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "./objectId.js";
import { crearEjemplaresPara, adjuntarEjemplaresPara } from "./ejemplares.js";

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Fábrica de rutas CRUD para un tipo de material circulante (con
// ejemplares) — routes/libros.js y routes/seriadas.js siguen este mismo
// esqueleto letra por letra (paginación opt-in, búsqueda regex-escapada,
// rollback manual sin transacciones, candado de borrado por ejemplares
// prestados). Se centraliza acá para los buckets que se suman después, en
// vez de repetirlo una vez por cada uno; libros.js/seriadas.js quedan tal
// cual están (ya probados) en vez de reescribirlos sobre esta fábrica.
export function crearRutasCatalogo({ Modelo, itemTipo, camposBusqueda }) {
  const router = Router();
  router.use(requiereLogin, requiereBiblioteca);

  const crearEjemplares = crearEjemplaresPara(itemTipo);
  const adjuntarEjemplares = adjuntarEjemplaresPara(itemTipo);

  router.get("/", async (req, res) => {
    const filtro = { bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null };
    const q = (req.query.q || "").trim();
    if (q) {
      const rx = new RegExp(escaparRegex(q), "i");
      filtro.$or = camposBusqueda.map((campo) => ({ [campo]: rx }));
    }
    const pagina = Number(req.query.pagina);
    const porPagina = Number(req.query.porPagina);

    // Paginado opt-in (ver ARQ-3): sin pagina/porPagina, se devuelve la
    // lista completa como siempre, para no romper consumidores que esperan
    // un array (ej. el selector de ítem en Préstamos).
    if (pagina > 0 && porPagina > 0) {
      const total = await Modelo.countDocuments(filtro);
      const items = await Modelo.find(filtro)
        .sort({ titulo: 1 })
        .skip((pagina - 1) * porPagina)
        .limit(porPagina);
      res.set("X-Total-Count", String(total));
      return res.json(await adjuntarEjemplares(items));
    }

    const items = await Modelo.find(filtro).sort({ titulo: 1 });
    res.json(await adjuntarEjemplares(items));
  });

  router.post("/", requierePermiso("catalogar"), async (req, res) => {
    const { ejemplares, ...resto } = req.body;
    const datos = { ...resto, bibliotecaId: req.usuario.bibliotecaId };
    delete datos._id;
    let item;
    try {
      item = await Modelo.create(datos);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    try {
      const creados = await crearEjemplares(req.usuario.bibliotecaId, item._id, ejemplares);
      res.status(201).json({ ...item.toObject(), ejemplares: creados });
    } catch (err) {
      // Sin transacciones (no hay replica set en este setup): si fallan los
      // ejemplares (ej. código de barras duplicado), deshacemos el registro
      // a mano para no dejarlo huérfano sin ejemplares.
      await Modelo.deleteOne({ _id: item._id });
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/:id/ejemplares", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
    const item = await Modelo.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
    if (!item) {
      return res.status(404).json({ error: "No encontrado." });
    }
    try {
      const creados = await crearEjemplares(req.usuario.bibliotecaId, item._id, req.body.ejemplares);
      res.status(201).json(creados);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
    const datos = { ...req.body };
    delete datos._id;
    delete datos.bibliotecaId;
    delete datos.ejemplares;
    try {
      const item = await Modelo.findOneAndUpdate(
        { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
        datos,
        { new: true, runValidators: true }
      );
      if (!item) {
        return res.status(404).json({ error: "No encontrado." });
      }
      res.json(item);
    } catch (err) {
      // Sin este try/catch, un error de validación acá (ver ARQ-12 en
      // AUDITORIA.md) quedaba como una promesa rechazada sin capturar —
      // Node termina el proceso ante eso por default desde la v15.
      res.status(400).json({ error: err.message });
    }
  });

  router.delete("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
    const item = await Modelo.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
    if (!item) {
      return res.status(404).json({ error: "No encontrado." });
    }
    const prestado = await Ejemplar.exists({ itemTipo, itemId: item._id, estado: "prestado" });
    if (prestado) {
      return res.status(409).json({ error: "No se puede eliminar: tiene ejemplares prestados." });
    }
    // Borrado lógico del registro bibliográfico (ver GOB-2); los ejemplares
    // físicos sí se borran de verdad, igual que en libros.js/seriadas.js.
    await Ejemplar.deleteMany({ itemTipo, itemId: item._id });
    item.eliminadoEn = new Date();
    item.eliminadoPor = req.usuario.id;
    await item.save();
    res.json({ ok: true });
  });

  return router;
}
