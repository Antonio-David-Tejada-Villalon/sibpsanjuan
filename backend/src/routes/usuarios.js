import { Router } from "express";
import bcrypt from "bcryptjs";
import Usuario from "../models/Usuario.js";
import { requiereLogin } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";
import { puedeGestionar } from "../utils/jerarquia.js";

// Único punto de borrado (y de reseteo de contraseña) para cualquier cuenta
// de staff (supervisor, superbibliotecario o bibliotecario), protegido por
// puedeGestionar() — en vez de repetir el mismo chequeo de rango+alcance en
// supervisores.js, superbibliotecarios.js y bibliotecarios.js por separado.
const router = Router();

router.use(requiereLogin);

router.delete("/:id", requiereIdValido(), async (req, res) => {
  const objetivo = await Usuario.findById(req.params.id);
  if (!objetivo) {
    return res.status(404).json({ error: "No encontrado." });
  }
  if (!puedeGestionar(req.usuario, objetivo)) {
    return res.status(403).json({ error: "No tenés permiso para eliminar esta cuenta." });
  }
  await Usuario.deleteOne({ _id: objetivo._id });
  res.json({ ok: true });
});

// Fija una contraseña nueva para una cuenta que quien la pide puede
// gestionar (ver puedeGestionar) — a diferencia de PUT /auth/password (self
// service, pide la actual), esto no necesita la contraseña vieja: es el
// "reseteo" de quien administra la cuenta, para el caso de que se haya
// olvidado la suya. Mismo patrón que POST /socios/:id/credenciales, pero
// para cuentas de staff en vez de socios.
router.put("/:id/password", requiereIdValido(), async (req, res) => {
  const { passwordNueva } = req.body || {};
  if (typeof passwordNueva !== "string" || passwordNueva.length < 8) {
    return res.status(400).json({ error: "La contraseña nueva tiene que tener al menos 8 caracteres." });
  }
  const objetivo = await Usuario.findById(req.params.id);
  if (!objetivo) {
    return res.status(404).json({ error: "No encontrado." });
  }
  if (!puedeGestionar(req.usuario, objetivo)) {
    return res.status(403).json({ error: "No tenés permiso para cambiar la contraseña de esta cuenta." });
  }
  objetivo.passwordHash = await bcrypt.hash(passwordNueva, 10);
  await objetivo.save();
  res.json({ ok: true });
});

export default router;
