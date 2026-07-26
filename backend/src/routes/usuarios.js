import { Router } from "express";
import Usuario from "../models/Usuario.js";
import { requiereLogin } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";
import { puedeGestionar } from "../utils/jerarquia.js";

// Único punto de borrado para cualquier cuenta de staff (supervisor,
// superbibliotecario o bibliotecario), protegido por puedeGestionar() — en
// vez de repetir el mismo chequeo de rango+alcance en supervisores.js,
// superbibliotecarios.js y bibliotecarios.js por separado.
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

export default router;
