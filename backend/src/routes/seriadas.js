import { Router } from "express";
import Seriada from "../models/Seriada.js";
import Ejemplar from "../models/Ejemplar.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";
import { crearEjemplaresPara, adjuntarEjemplaresPara } from "../utils/ejemplares.js";

// Espejo casi literal de routes/libros.js — misma paginación opt-in, misma
// búsqueda regex-escapada, mismo rollback manual sin transacciones, mismo
// candado de borrado por ejemplares prestados. La única diferencia real es
// el tipo (Seriada en vez de Libro) y los campos propios del bucket.
const router = Router();

router.use(requiereLogin, requiereBiblioteca);

const crearEjemplares = crearEjemplaresPara("Seriada");
const adjuntarEjemplares = adjuntarEjemplaresPara("Seriada");

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null };
  const q = (req.query.q || "").trim();
  if (q) {
    const rx = new RegExp(escaparRegex(q), "i");
    filtro.$or = [{ titulo: rx }, { autores: rx }, { issn: rx }];
  }
  const pagina = Number(req.query.pagina);
  const porPagina = Number(req.query.porPagina);

  if (pagina > 0 && porPagina > 0) {
    const total = await Seriada.countDocuments(filtro);
    const seriadas = await Seriada.find(filtro)
      .sort({ titulo: 1 })
      .skip((pagina - 1) * porPagina)
      .limit(porPagina);
    res.set("X-Total-Count", String(total));
    return res.json(await adjuntarEjemplares(seriadas));
  }

  const seriadas = await Seriada.find(filtro).sort({ titulo: 1 });
  res.json(await adjuntarEjemplares(seriadas));
});

router.post("/", requierePermiso("catalogar"), async (req, res) => {
  const { ejemplares, ...resto } = req.body;
  const datos = { ...resto, bibliotecaId: req.usuario.bibliotecaId };
  delete datos._id;
  let seriada;
  try {
    seriada = await Seriada.create(datos);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const creados = await crearEjemplares(req.usuario.bibliotecaId, seriada._id, ejemplares);
    res.status(201).json({ ...seriada.toObject(), ejemplares: creados });
  } catch (err) {
    // Sin transacciones (no hay replica set en este setup): si fallan los
    // ejemplares (ej. código de barras duplicado), deshacemos la seriada a
    // mano para no dejar un registro bibliográfico huérfano sin ejemplares.
    await Seriada.deleteOne({ _id: seriada._id });
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/ejemplares", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const seriada = await Seriada.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!seriada) {
    return res.status(404).json({ error: "No encontrado." });
  }
  try {
    const creados = await crearEjemplares(req.usuario.bibliotecaId, seriada._id, req.body.ejemplares);
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
    const seriada = await Seriada.findOneAndUpdate(
      { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
      datos,
      { new: true, runValidators: true }
    );
    if (!seriada) {
      return res.status(404).json({ error: "No encontrado." });
    }
    res.json(seriada);
  } catch (err) {
    // Ver ARQ-12 en AUDITORIA.md — sin este try/catch, un error de
    // validación (ej. el ISSN nuevo de BIBL-4) quedaba como promesa
    // rechazada sin capturar.
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const seriada = await Seriada.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!seriada) {
    return res.status(404).json({ error: "No encontrado." });
  }
  const prestado = await Ejemplar.exists({ itemTipo: "Seriada", itemId: seriada._id, estado: "prestado" });
  if (prestado) {
    return res.status(409).json({ error: "No se puede eliminar: tiene ejemplares prestados." });
  }
  await Ejemplar.deleteMany({ itemTipo: "Seriada", itemId: seriada._id });
  seriada.eliminadoEn = new Date();
  seriada.eliminadoPor = req.usuario.id;
  await seriada.save();
  res.json({ ok: true });
});

export default router;
