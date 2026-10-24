import { Router } from "express";
import mongoose from "mongoose";
import Biblioteca from "../models/Biblioteca.js";
import Categoria from "../models/Categoria.js";
import Socio from "../models/Socio.js";
import { puedeConfigurarCirculacion } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";
import { resolverPolitica } from "../circulacion/reglas.js";

// Montado en /bibliotecas/:id/categorias (ver routes/bibliotecas.js), con
// :id ya validado — mismo esquema que PUT /bibliotecas/:id/circulacion, así
// admin/supervisor eligen la biblioteca por URL igual que allá.
const router = Router({ mergeParams: true });

const REGLAS = ["diasPrestamo", "maxRenovaciones", "multaPorDiaVencido", "maxPrestamos"];

const NO_ES_NUMERO = {
  diasPrestamo: "Los días de préstamo tienen que ser un número.",
  maxRenovaciones: "Las renovaciones máximas tienen que ser un número.",
  multaPorDiaVencido: "La multa por día tiene que ser un número.",
  maxPrestamos: "El máximo de préstamos tiene que ser un número.",
};

// Leer: quien puede configurarla, y también sus bibliotecarios — necesitan
// la lista para elegir la categoría al cargar un socio.
router.use((req, res, next) => {
  const esSuBibliotecario =
    req.usuario.rol === "bibliotecario" && String(req.usuario.bibliotecaId) === String(req.params.id);
  if (!esSuBibliotecario && !puedeConfigurarCirculacion(req, req.params.id)) {
    return res.status(403).json({ error: "No tenés permiso para ver las categorías de esta biblioteca." });
  }
  next();
});

function soloQuienConfigura(req, res, next) {
  if (!puedeConfigurarCirculacion(req, req.params.id)) {
    return res.status(403).json({ error: "Las categorías solo las cambia un admin, supervisor o superbibliotecario." });
  }
  next();
}

// Un campo vacío del formulario ("") significa "usar la regla de la
// biblioteca", igual que null.
function reglasDelCuerpo(cuerpo) {
  const reglas = {};
  for (const campo of REGLAS) {
    if (cuerpo[campo] !== undefined) reglas[campo] = cuerpo[campo] === "" ? null : cuerpo[campo];
  }
  return reglas;
}

function mensajeDeValidacion(err) {
  if (err.name !== "ValidationError") return err.message;
  return Object.values(err.errors)
    .map((e) => (e.name === "CastError" ? NO_ES_NUMERO[e.path] || `"${e.path}" tiene un valor inválido.` : e.message))
    .join(" ");
}

router.get("/", async (req, res) => {
  const biblioteca = await Biblioteca.findById(req.params.id);
  if (!biblioteca) return res.status(404).json({ error: "Biblioteca no encontrada." });
  const categorias = await Categoria.find({ bibliotecaId: biblioteca._id, eliminadoEn: null }).sort({ nombre: 1 });
  const conteo = await Socio.aggregate([
    { $match: { bibliotecaId: new mongoose.Types.ObjectId(req.params.id), eliminadoEn: null } },
    { $group: { _id: { $toUpper: "$categoria" }, socios: { $sum: 1 } } },
  ]);
  const sociosPorCodigo = new Map(conteo.map((c) => [c._id, c.socios]));
  // reglas: lo que de verdad se le aplica a un socio de esa categoría (lo
  // propio + lo heredado de la biblioteca), para mostrarlo sin hacer la
  // cuenta en el frontend.
  res.json(
    categorias.map((c) => ({
      ...c.toObject(),
      socios: sociosPorCodigo.get(c.codigo) || 0,
      reglas: resolverPolitica(biblioteca, c),
    }))
  );
});

router.post("/", soloQuienConfigura, async (req, res) => {
  const biblioteca = await Biblioteca.findById(req.params.id);
  if (!biblioteca) return res.status(404).json({ error: "Biblioteca no encontrada." });
  const { codigo, nombre } = req.body || {};
  try {
    const categoria = await Categoria.create({
      bibliotecaId: biblioteca._id,
      codigo,
      nombre,
      ...reglasDelCuerpo(req.body || {}),
    });
    res.status(201).json(categoria);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe una categoría con código '${String(codigo).trim().toUpperCase()}'.` });
    }
    res.status(400).json({ error: mensajeDeValidacion(err) });
  }
});

// El código no se edita: es lo que tienen guardado sus socios (ver
// models/Categoria.js). Para "renombrarla" se cambia el nombre visible.
router.put("/:categoriaId", soloQuienConfigura, requiereIdValido("categoriaId"), async (req, res) => {
  const categoria = await Categoria.findOne({ _id: req.params.categoriaId, bibliotecaId: req.params.id, eliminadoEn: null });
  if (!categoria) return res.status(404).json({ error: "Categoría no encontrada." });
  const cuerpo = req.body || {};
  if (cuerpo.codigo !== undefined && String(cuerpo.codigo).trim().toUpperCase() !== categoria.codigo) {
    return res.status(400).json({ error: "El código de una categoría no se puede cambiar; cambiá el nombre." });
  }
  if (cuerpo.nombre !== undefined) categoria.nombre = cuerpo.nombre;
  categoria.set(reglasDelCuerpo(cuerpo));
  try {
    await categoria.save();
    res.json(categoria);
  } catch (err) {
    res.status(400).json({ error: mensajeDeValidacion(err) });
  }
});

// Borrado lógico, y solo si ningún socio activo la tiene: si no, esos
// socios quedarían apuntando a una categoría que ya no existe.
router.delete("/:categoriaId", soloQuienConfigura, requiereIdValido("categoriaId"), async (req, res) => {
  const categoria = await Categoria.findOne({ _id: req.params.categoriaId, bibliotecaId: req.params.id, eliminadoEn: null });
  if (!categoria) return res.status(404).json({ error: "Categoría no encontrada." });
  const socios = await Socio.countDocuments({
    bibliotecaId: req.params.id,
    eliminadoEn: null,
    categoria: { $regex: `^${categoria.codigo}$`, $options: "i" },
  });
  if (socios > 0) {
    return res.status(409).json({
      error: `${socios} ${socios === 1 ? "socio tiene" : "socios tienen"} esta categoría. Pasalos a otra antes de borrarla.`,
    });
  }
  categoria.eliminadoEn = new Date();
  categoria.eliminadoPor = req.usuario.id;
  await categoria.save();
  res.json({ ok: true });
});

export default router;
