import { Router } from "express";
import Materia from "../models/Materia.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";

// CRUD del catálogo de autoridades de materia (ver BIBL-3 en AUDITORIA.md),
// mismo esqueleto letra por letra que routes/autores.js (BIBL-1). No usa
// ninguna de las dos fábricas compartidas — esas asumen un campo "titulo"
// para ordenar/buscar, que acá no existe.
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
    const total = await Materia.countDocuments(filtro);
    const materias = await Materia.find(filtro)
      .sort({ formaAutorizada: 1 })
      .skip((pagina - 1) * porPagina)
      .limit(porPagina);
    res.set("X-Total-Count", String(total));
    return res.json(materias);
  }

  const materias = await Materia.find(filtro).sort({ formaAutorizada: 1 });
  res.json(materias);
});

router.post("/", requierePermiso("catalogar"), async (req, res) => {
  const { formaAutorizada, variantes } = req.body || {};
  if (!formaAutorizada || !String(formaAutorizada).trim()) {
    return res.status(400).json({ error: "La forma autorizada es obligatoria." });
  }
  try {
    const materia = await Materia.create({
      bibliotecaId: req.usuario.bibliotecaId,
      formaAutorizada: String(formaAutorizada).trim(),
      variantes: limpiarVariantes(variantes),
    });
    res.status(201).json(materia);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe una materia con la forma autorizada '${formaAutorizada}'.` });
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
    const materia = await Materia.findOneAndUpdate(
      { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
      datos,
      { new: true, runValidators: true }
    );
    if (!materia) {
      return res.status(404).json({ error: "No encontrado." });
    }
    res.json(materia);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe una materia con la forma autorizada '${formaAutorizada}'.` });
    }
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const materia = await Materia.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!materia) {
    return res.status(404).json({ error: "No encontrado." });
  }
  materia.eliminadoEn = new Date();
  materia.eliminadoPor = req.usuario.id;
  await materia.save();
  res.json({ ok: true });
});

export default router;
