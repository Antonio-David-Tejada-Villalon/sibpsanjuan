import { Router } from "express";
import bcrypt from "bcryptjs";
import Usuario, { PERMISOS_BIBLIOTECARIO } from "../models/Usuario.js";
import { requiereLogin, requiereSuperbibliotecario } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";

// Cuentas "bibliotecario" — solo el superbibliotecario de una biblioteca
// puede crear/editar/eliminar las de su propia biblioteca. bibliotecaId se
// fuerza del lado servidor (nunca del body) — un bibliotecario siempre
// pertenece a la biblioteca de quien lo creó, nunca a otra.
const router = Router();

router.use(requiereLogin, requiereSuperbibliotecario);

function normalizarPermisos(permisos) {
  const normalizados = {};
  for (const clave of PERMISOS_BIBLIOTECARIO) {
    normalizados[clave] = !!permisos?.[clave];
  }
  return normalizados;
}

router.get("/", async (req, res) => {
  const cuentas = await Usuario.find({ rol: "bibliotecario", bibliotecaId: req.usuario.bibliotecaId }).select(
    "-passwordHash"
  );
  res.json(cuentas);
});

router.post("/", async (req, res) => {
  const { usuario, password, permisos } = req.body || {};
  if (!usuario || !password || password.length < 8) {
    return res.status(400).json({ error: "usuario y password (mínimo 8 caracteres) son obligatorios." });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const nuevo = await Usuario.create({
      usuario,
      passwordHash,
      rol: "bibliotecario",
      bibliotecaId: req.usuario.bibliotecaId,
      permisos: normalizarPermisos(permisos),
    });
    res.status(201).json({ id: nuevo._id, usuario: nuevo.usuario, permisos: nuevo.permisos });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe un usuario '${usuario}'.` });
    }
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", requiereIdValido(), async (req, res) => {
  const { permisos } = req.body || {};
  try {
    const cuenta = await Usuario.findOneAndUpdate(
      { _id: req.params.id, rol: "bibliotecario", bibliotecaId: req.usuario.bibliotecaId },
      { permisos: normalizarPermisos(permisos) },
      { new: true, runValidators: true }
    ).select("-passwordHash");
    if (!cuenta) {
      return res.status(404).json({ error: "No encontrado." });
    }
    res.json(cuenta);
  } catch (err) {
    // Ver ARQ-12 en AUDITORIA.md — sin este try/catch, un error de
    // validación quedaba como promesa rechazada sin capturar.
    res.status(400).json({ error: err.message });
  }
});

// Borrar una cuenta de bibliotecario se hace desde el endpoint consolidado
// DELETE /api/usuarios/:id (ver routes/usuarios.js) — mismo motivo que en
// superbibliotecarios.js: un solo lugar para el chequeo de puedeGestionar().

export default router;
