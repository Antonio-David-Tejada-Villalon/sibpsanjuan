import { Router } from "express";
import SolicitudSupervision from "../models/SolicitudSupervision.js";
import Usuario from "../models/Usuario.js";
import Biblioteca from "../models/Biblioteca.js";
import { requiereLogin, requiereAdmin, requiereSupervisor } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";

// Autoservicio con aprobación: un supervisor elige qué biblioteca quiere
// supervisar (de las que todavía no tiene, ver GET /bibliotecas/
// disponibles-para-supervisar) y la pide acá — el admin es quien de verdad
// otorga el alcance (POST /:id/aprobar), nunca el supervisor solo.
const router = Router();

router.use(requiereLogin);

router.post("/", requiereSupervisor, async (req, res) => {
  const { bibliotecaId } = req.body || {};
  if (!bibliotecaId) {
    return res.status(400).json({ error: "bibliotecaId es obligatorio." });
  }
  const biblioteca = await Biblioteca.findById(bibliotecaId).catch(() => null);
  if (!biblioteca) {
    return res.status(404).json({ error: "Biblioteca no encontrada." });
  }
  if ((req.usuario.bibliotecasSupervisadas || []).map(String).includes(String(bibliotecaId))) {
    return res.status(409).json({ error: "Ya supervisás esta biblioteca." });
  }
  const yaPendiente = await SolicitudSupervision.findOne({
    supervisorId: req.usuario.id,
    bibliotecaId,
    estado: "pendiente",
  });
  if (yaPendiente) {
    return res.status(409).json({ error: "Ya tenés una solicitud pendiente para esta biblioteca." });
  }
  const solicitud = await SolicitudSupervision.create({ supervisorId: req.usuario.id, bibliotecaId });
  res.status(201).json(solicitud);
});

// El supervisor ve el estado de sus propias solicitudes — para no volver a
// pedir lo mismo y para saber si ya se la aprobaron/rechazaron.
router.get("/mias", requiereSupervisor, async (req, res) => {
  const solicitudes = await SolicitudSupervision.find({ supervisorId: req.usuario.id })
    .sort({ creado: -1 })
    .populate("bibliotecaId", "nombre codigo");
  res.json(solicitudes);
});

// El admin ve todas (opcionalmente filtradas por estado) para resolverlas.
router.get("/", requiereAdmin, async (req, res) => {
  const filtro = {};
  if (req.query.estado) filtro.estado = req.query.estado;
  const solicitudes = await SolicitudSupervision.find(filtro)
    .sort({ creado: -1 })
    .populate("supervisorId", "usuario")
    .populate("bibliotecaId", "nombre codigo");
  res.json(solicitudes);
});

router.post("/:id/aprobar", requiereAdmin, requiereIdValido(), async (req, res) => {
  const solicitud = await SolicitudSupervision.findById(req.params.id);
  if (!solicitud || solicitud.estado !== "pendiente") {
    return res.status(404).json({ error: "Solicitud no encontrada o ya resuelta." });
  }
  await Usuario.findByIdAndUpdate(solicitud.supervisorId, {
    $addToSet: { bibliotecasSupervisadas: solicitud.bibliotecaId },
  });
  solicitud.estado = "aprobada";
  solicitud.resueltoPor = req.usuario.id;
  solicitud.resueltoEn = new Date();
  await solicitud.save();
  res.json(solicitud);
});

router.post("/:id/rechazar", requiereAdmin, requiereIdValido(), async (req, res) => {
  const solicitud = await SolicitudSupervision.findById(req.params.id);
  if (!solicitud || solicitud.estado !== "pendiente") {
    return res.status(404).json({ error: "Solicitud no encontrada o ya resuelta." });
  }
  solicitud.estado = "rechazada";
  solicitud.resueltoPor = req.usuario.id;
  solicitud.resueltoEn = new Date();
  await solicitud.save();
  res.json(solicitud);
});

export default router;
