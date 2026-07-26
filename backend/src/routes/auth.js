import { Router } from "express";
import bcrypt from "bcryptjs";
import Usuario from "../models/Usuario.js";
import { firmarToken, setCookieSesion, limpiarCookieSesion, requiereLogin } from "../middleware/auth.js";
import { crearLimitadorLogin } from "../middleware/rateLimit.js";

const router = Router();

router.post("/login", crearLimitadorLogin(), async (req, res) => {
  const { usuario, password } = req.body || {};
  if (typeof usuario !== "string" || typeof password !== "string" || !usuario || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios." });
  }
  const cuenta = await Usuario.findOne({ usuario });
  if (!cuenta || !(await bcrypt.compare(password, cuenta.passwordHash))) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }
  const token = firmarToken(cuenta);
  setCookieSesion(res, token);
  res.json({
    usuario: cuenta.usuario,
    rol: cuenta.rol,
    bibliotecaId: cuenta.bibliotecaId,
    bibliotecasSupervisadas: cuenta.bibliotecasSupervisadas,
    puedeCrearBibliotecas: cuenta.puedeCrearBibliotecas,
    permisos: cuenta.permisos,
  });
});

router.post("/logout", (req, res) => {
  limpiarCookieSesion(res);
  res.json({ ok: true });
});

router.get("/yo", requiereLogin, (req, res) => {
  res.json(req.usuario);
});

// Cambiar la propia contraseña, con sesión ya iniciada — antes no existía
// ninguna forma de rotarla sin recrear la cuenta entera (ver CYBER-4 en
// AUDITORIA.md). No hay "olvidé mi contraseña" acá: eso requeriría enviar
// un correo, y este proyecto no tiene ningún servicio de mail configurado
// todavía — queda fuera de este cambio a propósito.
router.put("/password", requiereLogin, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body || {};
  if (typeof passwordActual !== "string" || typeof passwordNueva !== "string") {
    return res.status(400).json({ error: "Faltan la contraseña actual y la nueva." });
  }
  if (passwordNueva.length < 8) {
    return res.status(400).json({ error: "La contraseña nueva tiene que tener al menos 8 caracteres." });
  }
  const cuenta = await Usuario.findById(req.usuario.id);
  if (!cuenta || !(await bcrypt.compare(passwordActual, cuenta.passwordHash))) {
    return res.status(401).json({ error: "La contraseña actual no es correcta." });
  }
  cuenta.passwordHash = await bcrypt.hash(passwordNueva, 10);
  await cuenta.save();
  res.json({ ok: true });
});

export default router;
