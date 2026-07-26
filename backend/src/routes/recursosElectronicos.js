import { Router } from "express";
import RecursoElectronico from "../models/RecursoElectronico.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";

// Más simple que libros.js/seriadas.js a propósito: no hay Ejemplar
// involucrado en absoluto — no existe una ruta ":id/ejemplares" acá, y esa
// ausencia es justamente lo que hace que este bucket nunca pueda circular
// (ver el comentario en models/RecursoElectronico.js).
const router = Router();

router.use(requiereLogin, requiereBiblioteca);

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null };
  const q = (req.query.q || "").trim();
  if (q) {
    const rx = new RegExp(escaparRegex(q), "i");
    filtro.$or = [{ titulo: rx }, { autores: rx }];
  }
  const pagina = Number(req.query.pagina);
  const porPagina = Number(req.query.porPagina);

  if (pagina > 0 && porPagina > 0) {
    const total = await RecursoElectronico.countDocuments(filtro);
    const recursos = await RecursoElectronico.find(filtro)
      .sort({ titulo: 1 })
      .skip((pagina - 1) * porPagina)
      .limit(porPagina);
    res.set("X-Total-Count", String(total));
    return res.json(recursos);
  }

  const recursos = await RecursoElectronico.find(filtro).sort({ titulo: 1 });
  res.json(recursos);
});

router.post("/", requierePermiso("catalogar"), async (req, res) => {
  const datos = { ...req.body, bibliotecaId: req.usuario.bibliotecaId };
  delete datos._id;
  try {
    const recurso = await RecursoElectronico.create(datos);
    res.status(201).json(recurso);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const datos = { ...req.body };
  delete datos._id;
  delete datos.bibliotecaId;
  try {
    const recurso = await RecursoElectronico.findOneAndUpdate(
      { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
      datos,
      { new: true, runValidators: true }
    );
    if (!recurso) {
      return res.status(404).json({ error: "No encontrado." });
    }
    res.json(recurso);
  } catch (err) {
    // Ver ARQ-12 en AUDITORIA.md — sin este try/catch, un error de
    // validación quedaba como promesa rechazada sin capturar.
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const recurso = await RecursoElectronico.findOne({
    _id: req.params.id,
    bibliotecaId: req.usuario.bibliotecaId,
    eliminadoEn: null,
  });
  if (!recurso) {
    return res.status(404).json({ error: "No encontrado." });
  }
  // Borrado lógico, mismo patrón que Libro/Seriada — no hay ejemplares que
  // limpiar acá, es un solo documento.
  recurso.eliminadoEn = new Date();
  recurso.eliminadoPor = req.usuario.id;
  await recurso.save();
  res.json({ ok: true });
});

export default router;
