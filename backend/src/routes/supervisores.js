import { Router } from "express";
import bcrypt from "bcryptjs";
import Usuario from "../models/Usuario.js";
import { requiereLogin, requiereAdmin } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";

// CRUD de cuentas "supervisor" — solo el admin global las crea/edita
// (es quien les otorga bibliotecasSupervisadas y puedeCrearBibliotecas).
const router = Router();

router.use(requiereLogin, requiereAdmin);

router.get("/", async (req, res) => {
  const supervisores = await Usuario.find({ rol: "supervisor" }).select("-passwordHash");
  res.json(supervisores);
});

router.post("/", async (req, res) => {
  const { usuario, password, bibliotecasSupervisadas, puedeCrearBibliotecas } = req.body || {};
  if (!usuario || !password || password.length < 8) {
    return res.status(400).json({ error: "usuario y password (mínimo 8 caracteres) son obligatorios." });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const nuevo = await Usuario.create({
      usuario,
      passwordHash,
      rol: "supervisor",
      bibliotecasSupervisadas: Array.isArray(bibliotecasSupervisadas) ? bibliotecasSupervisadas : [],
      puedeCrearBibliotecas: !!puedeCrearBibliotecas,
    });
    res.status(201).json({
      id: nuevo._id,
      usuario: nuevo.usuario,
      bibliotecasSupervisadas: nuevo.bibliotecasSupervisadas,
      puedeCrearBibliotecas: nuevo.puedeCrearBibliotecas,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe un usuario '${usuario}'.` });
    }
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", requiereIdValido(), async (req, res) => {
  const { bibliotecasSupervisadas, puedeCrearBibliotecas } = req.body || {};
  const datos = {};
  if (Array.isArray(bibliotecasSupervisadas)) datos.bibliotecasSupervisadas = bibliotecasSupervisadas;
  if (typeof puedeCrearBibliotecas === "boolean") datos.puedeCrearBibliotecas = puedeCrearBibliotecas;
  try {
    const supervisor = await Usuario.findOneAndUpdate({ _id: req.params.id, rol: "supervisor" }, datos, {
      new: true,
      runValidators: true,
    }).select("-passwordHash");
    if (!supervisor) {
      return res.status(404).json({ error: "No encontrado." });
    }
    res.json(supervisor);
  } catch (err) {
    // Ver ARQ-12 en AUDITORIA.md — sin este try/catch, un error de
    // validación quedaba como promesa rechazada sin capturar.
    res.status(400).json({ error: err.message });
  }
});

export default router;
