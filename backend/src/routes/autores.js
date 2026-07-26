import { Router } from "express";
import Autor from "../models/Autor.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";

// CRUD del catálogo de autoridades de autor (ver BIBL-1 en AUDITORIA.md).
// No usa ninguna de las dos fábricas compartidas (rutasCatalogo.js /
// rutasCatalogoSinCirculacion.js): esas asumen un campo "titulo" para
// ordenar/buscar, que acá no existe — la forma de este bucket es distinta
// (formaAutorizada + variantes), no un tipo de material catalogable más.
const router = Router();
router.use(requiereLogin, requiereBiblioteca);

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function limpiarVariantes(variantes) {
  return (Array.isArray(variantes) ? variantes : []).map((v) => String(v).trim()).filter(Boolean);
}

router.get("/", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null };
  const q = (req.query.q || "").trim();
  if (q) {
    const rx = new RegExp(escaparRegex(q), "i");
    filtro.$or = [{ formaAutorizada: rx }, { variantes: rx }];
  }
  const pagina = Number(req.query.pagina);
  const porPagina = Number(req.query.porPagina);

  if (pagina > 0 && porPagina > 0) {
    const total = await Autor.countDocuments(filtro);
    const autores = await Autor.find(filtro)
      .sort({ formaAutorizada: 1 })
      .skip((pagina - 1) * porPagina)
      .limit(porPagina);
    res.set("X-Total-Count", String(total));
    return res.json(autores);
  }

  const autores = await Autor.find(filtro).sort({ formaAutorizada: 1 });
  res.json(autores);
});

router.post("/", requierePermiso("catalogar"), async (req, res) => {
  const { formaAutorizada, variantes } = req.body || {};
  if (!formaAutorizada || !String(formaAutorizada).trim()) {
    return res.status(400).json({ error: "La forma autorizada es obligatoria." });
  }
  try {
    const autor = await Autor.create({
      bibliotecaId: req.usuario.bibliotecaId,
      formaAutorizada: String(formaAutorizada).trim(),
      variantes: limpiarVariantes(variantes),
    });
    res.status(201).json(autor);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe un autor con la forma autorizada '${formaAutorizada}'.` });
    }
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const { formaAutorizada, variantes } = req.body || {};
  const datos = {};
  if (formaAutorizada !== undefined) datos.formaAutorizada = String(formaAutorizada).trim();
  if (variantes !== undefined) datos.variantes = limpiarVariantes(variantes);
  try {
    const autor = await Autor.findOneAndUpdate(
      { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
      datos,
      { new: true, runValidators: true }
    );
    if (!autor) {
      return res.status(404).json({ error: "No encontrado." });
    }
    res.json(autor);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe un autor con la forma autorizada '${formaAutorizada}'.` });
    }
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const autor = await Autor.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!autor) {
    return res.status(404).json({ error: "No encontrado." });
  }
  autor.eliminadoEn = new Date();
  autor.eliminadoPor = req.usuario.id;
  await autor.save();
  res.json({ ok: true });
});

export default router;
