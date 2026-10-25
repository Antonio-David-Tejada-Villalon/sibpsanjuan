import { Router } from "express";
import { requiereLogin, requiereBiblioteca } from "../middleware/auth.js";
import { notificacionesDelStaff, conLeidas, marcarVistas } from "../notificaciones/armar.js";

// La campana del panel: pedidos y reservas por resolver, préstamos vencidos
// y avisos del sistema de la biblioteca activa, según los permisos de cada
// uno (un bibliotecario sin "prestamos" no ve los pedidos).
const router = Router();
router.use(requiereLogin, requiereBiblioteca);

function puede(req, permiso) {
  return ["admin", "supervisor", "superbibliotecario"].includes(req.usuario.rol) || Boolean(req.usuario.permisos?.[permiso]);
}

router.get("/", async (req, res) => {
  const lista = await notificacionesDelStaff(req.usuario.bibliotecaId, {
    circulacion: puede(req, "prestamos") || puede(req, "devoluciones"),
    socios: puede(req, "socios"),
  });
  res.set("Cache-Control", "no-store");
  res.json(await conLeidas(`usuario:${req.usuario.id}`, lista));
});

// { claves: [...] }: las que ya vio (al abrirlas o con "Marcar todo como leído").
router.post("/vistas", async (req, res) => {
  const claves = Array.isArray(req.body?.claves) ? req.body.claves : [];
  await marcarVistas(`usuario:${req.usuario.id}`, claves);
  res.json({ ok: true });
});

export default router;
