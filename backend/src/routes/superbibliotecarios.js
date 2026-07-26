import { Router } from "express";
import bcrypt from "bcryptjs";
import Usuario from "../models/Usuario.js";
import Biblioteca from "../models/Biblioteca.js";
import { requiereLogin, requiereAdminOSupervisor } from "../middleware/auth.js";
import { esIdValido, requiereIdValido } from "../utils/objectId.js";

// Cuentas "superbibliotecario" — el admin puede crear una para cualquier
// biblioteca; un supervisor, solo para una biblioteca dentro de su propio
// alcance (bibliotecasSupervisadas). Esto reemplaza al viejo
// POST /api/bibliotecas/:id/usuarios (que hardcodeaba rol:"biblioteca").
const router = Router();

router.use(requiereLogin, requiereAdminOSupervisor);

function enAlcance(req, bibliotecaId) {
  if (req.usuario.rol === "admin") return true;
  return (req.usuario.bibliotecasSupervisadas || []).map(String).includes(String(bibliotecaId));
}

router.get("/", async (req, res) => {
  const filtro = { rol: "superbibliotecario" };
  if (req.usuario.rol === "supervisor") {
    filtro.bibliotecaId = { $in: req.usuario.bibliotecasSupervisadas || [] };
  }
  const cuentas = await Usuario.find(filtro).select("-passwordHash");
  res.json(cuentas);
});

router.post("/", async (req, res) => {
  const { usuario, password, bibliotecaId } = req.body || {};
  if (!usuario || !password || password.length < 8 || !bibliotecaId) {
    return res.status(400).json({ error: "usuario, password (mínimo 8 caracteres) y bibliotecaId son obligatorios." });
  }
  if (!esIdValido(bibliotecaId)) {
    return res.status(400).json({ error: "bibliotecaId inválido." });
  }
  if (!enAlcance(req, bibliotecaId)) {
    return res.status(403).json({ error: "Esa biblioteca no está en tu alcance." });
  }
  const biblioteca = await Biblioteca.findById(bibliotecaId);
  if (!biblioteca) {
    return res.status(404).json({ error: "Biblioteca no encontrada." });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const nuevo = await Usuario.create({
      usuario,
      passwordHash,
      rol: "superbibliotecario",
      bibliotecaId: biblioteca._id,
    });
    res.status(201).json({ id: nuevo._id, usuario: nuevo.usuario, bibliotecaId: nuevo.bibliotecaId });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe un usuario '${usuario}'.` });
    }
    res.status(400).json({ error: err.message });
  }
});

// Borrar una cuenta de superbibliotecario se hace desde el endpoint
// consolidado DELETE /api/usuarios/:id (ver routes/usuarios.js), que usa
// puedeGestionar() para el mismo chequeo de rango+alcance en un solo lugar
// en vez de repetirlo acá también.

export default router;
