import { Router } from "express";
import Biblioteca from "../models/Biblioteca.js";
import Usuario from "../models/Usuario.js";
import Libro from "../models/Libro.js";
import Socio from "../models/Socio.js";
import Seriada from "../models/Seriada.js";
import RecursoElectronico from "../models/RecursoElectronico.js";
import MaterialSonoro from "../models/MaterialSonoro.js";
import MaterialAudiovisual from "../models/MaterialAudiovisual.js";
import MaterialCartografico from "../models/MaterialCartografico.js";
import MaterialGrafico from "../models/MaterialGrafico.js";
import MaterialDidactico from "../models/MaterialDidactico.js";
import Archivo from "../models/Archivo.js";
import Objeto from "../models/Objeto.js";
import { requiereLogin, requiereAdmin, requiereAdminOSupervisor, requiereSupervisor } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";

const router = Router();

router.use(requiereLogin);

// --- Bibliotecas (tenants) ---

// Listar y crear: admin (ve/crea todo) o supervisor (ve solo las suyas;
// crea solo si el admin le otorgó puedeCrearBibliotecas). Borrar sigue
// siendo solo del admin — es destructivo y nadie pidió delegarlo.
router.get("/", requiereAdminOSupervisor, async (req, res) => {
  const filtro = req.usuario.rol === "supervisor" ? { _id: { $in: req.usuario.bibliotecasSupervisadas || [] } } : {};
  const bibliotecas = await Biblioteca.find(filtro).sort({ nombre: 1 });
  res.json(bibliotecas);
});

// Bibliotecas que el supervisor todavía NO tiene en su alcance — para armar
// el selector de "pedir supervisar esta biblioteca" en
// routes/solicitudesSupervision.js. Solo nombre/código: no hace falta el
// resto del documento para elegir de una lista.
router.get("/disponibles-para-supervisar", requiereSupervisor, async (req, res) => {
  const bibliotecas = await Biblioteca.find({ _id: { $nin: req.usuario.bibliotecasSupervisadas || [] } })
    .select("nombre codigo")
    .sort({ nombre: 1 });
  res.json(bibliotecas);
});

// Una sola biblioteca — admin, supervisor con esta en su alcance, o el
// superbibliotecario de esta biblioteca (mismo criterio que
// puedeConfigurarCirculacion más abajo, que necesita leer los valores
// actuales antes de poder editarlos). Va DESPUÉS de
// "/disponibles-para-supervisar" a propósito: si estuviera antes, Express
// probaría a matchear esa ruta literal contra "/:id" primero.
router.get("/:id", requiereIdValido(), async (req, res) => {
  if (!puedeConfigurarCirculacion(req, req.params.id)) {
    return res.status(403).json({ error: "No tenés permiso para ver esta biblioteca." });
  }
  const biblioteca = await Biblioteca.findById(req.params.id);
  if (!biblioteca) {
    return res.status(404).json({ error: "No encontrada." });
  }
  res.json(biblioteca);
});

router.post("/", requiereAdminOSupervisor, async (req, res) => {
  if (req.usuario.rol === "supervisor" && !req.usuario.puedeCrearBibliotecas) {
    return res.status(403).json({ error: "Este supervisor no tiene permiso para crear bibliotecas." });
  }
  const { nombre, codigo } = req.body || {};
  if (!nombre || !codigo) {
    return res.status(400).json({ error: "nombre y codigo son obligatorios." });
  }
  try {
    const biblioteca = await Biblioteca.create({ nombre, codigo });
    // Si la creó un supervisor, queda automáticamente en su alcance — si no,
    // tendría que pedirle al admin que se la asigne aparte para poder
    // gestionarla, lo cual no tiene sentido justo después de crearla.
    if (req.usuario.rol === "supervisor") {
      await Usuario.findByIdAndUpdate(req.usuario.id, { $addToSet: { bibliotecasSupervisadas: biblioteca._id } });
    }
    res.status(201).json(biblioteca);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe una biblioteca con código '${codigo}'.` });
    }
    res.status(400).json({ error: err.message });
  }
});

// Admin (siempre), supervisor (si esta biblioteca está en su alcance) o el
// superbibliotecario de esta biblioteca (nunca de otra) pueden ajustar sus
// reglas de circulación — un bibliotecario con permisos individuales, no:
// esto es política de toda la biblioteca, no un permiso otorgable ítem por
// ítem como catalogar/prestamos/etc.
function puedeConfigurarCirculacion(req, bibliotecaId) {
  if (req.usuario.rol === "admin") return true;
  if (req.usuario.rol === "supervisor") {
    return (req.usuario.bibliotecasSupervisadas || []).map(String).includes(String(bibliotecaId));
  }
  if (req.usuario.rol === "superbibliotecario") {
    return String(req.usuario.bibliotecaId) === String(bibliotecaId);
  }
  return false;
}

router.put("/:id/circulacion", requiereIdValido(), async (req, res) => {
  if (!puedeConfigurarCirculacion(req, req.params.id)) {
    return res.status(403).json({ error: "No tenés permiso para configurar esta biblioteca." });
  }
  const { diasPrestamo, maxRenovaciones, multaPorDiaVencido, contarSabados, contarDomingos } = req.body || {};
  const datos = {};
  if (diasPrestamo !== undefined) datos.diasPrestamo = diasPrestamo;
  if (maxRenovaciones !== undefined) datos.maxRenovaciones = maxRenovaciones;
  if (multaPorDiaVencido !== undefined) datos.multaPorDiaVencido = multaPorDiaVencido;
  if (typeof contarSabados === "boolean") datos.contarSabados = contarSabados;
  if (typeof contarDomingos === "boolean") datos.contarDomingos = contarDomingos;
  try {
    const biblioteca = await Biblioteca.findByIdAndUpdate(req.params.id, datos, { new: true, runValidators: true });
    if (!biblioteca) {
      return res.status(404).json({ error: "No encontrada." });
    }
    res.json(biblioteca);
  } catch (err) {
    // Ver ARQ-12 en AUDITORIA.md — sin este try/catch, un error de
    // validación quedaba como promesa rechazada sin capturar.
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requiereAdmin, requiereIdValido(), async (req, res) => {
  const biblioteca = await Biblioteca.findByIdAndDelete(req.params.id);
  if (!biblioteca) {
    return res.status(404).json({ error: "No encontrada." });
  }
  await Usuario.deleteMany({ bibliotecaId: biblioteca._id });
  // Un supervisor que la tuviera en su alcance no debería quedar con un id
  // colgado apuntando a una biblioteca que ya no existe.
  await Usuario.updateMany(
    { bibliotecasSupervisadas: biblioteca._id },
    { $pull: { bibliotecasSupervisadas: biblioteca._id } }
  );
  // Los logins de staff no tienen razón para sobrevivir a su biblioteca,
  // pero el catálogo y los socios sí son datos con valor propio — mismo
  // criterio que GOB-2: se marcan eliminados (recuperables) en vez de
  // perderse sin dejar rastro ni quedar huérfanos e invisibles en la base
  // (ver ARQ-6 en la auditoría). Se extiende a los 9 buckets sumados desde
  // entonces — antes solo cubría Libro/Socio.
  const eliminadoEn = new Date();
  const eliminadoPor = req.usuario.id;
  const modelosConSoftDelete = [
    Libro,
    Socio,
    Seriada,
    RecursoElectronico,
    MaterialSonoro,
    MaterialAudiovisual,
    MaterialCartografico,
    MaterialGrafico,
    MaterialDidactico,
    Archivo,
    Objeto,
  ];
  await Promise.all(
    modelosConSoftDelete.map((Modelo) =>
      Modelo.updateMany({ bibliotecaId: biblioteca._id, eliminadoEn: null }, { eliminadoEn, eliminadoPor })
    )
  );
  res.json({ ok: true });
});

// --- Usuarios de una biblioteca (todos los roles: superbibliotecario + bibliotecario) ---

router.get("/:id/usuarios", requiereAdminOSupervisor, requiereIdValido(), async (req, res) => {
  const usuarios = await Usuario.find({ bibliotecaId: req.params.id }).select("-passwordHash");
  res.json(usuarios);
});

export default router;
