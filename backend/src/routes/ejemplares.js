import { Router } from "express";
import Ejemplar from "../models/Ejemplar.js";
import Prestamo from "../models/Prestamo.js";
import Solicitud from "../models/Solicitud.js";
import Socio from "../models/Socio.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { esIdValido, requiereIdValido } from "../utils/objectId.js";
import { ErrorHttp } from "../utils/consulta.js";
import { MODELOS_POR_TIPO } from "../circulacion/tiposCirculantes.js";
import { CAMPOS_SOCIO_EN_CIRCULACION } from "../utils/datosSocio.js";
import { ETIQUETAS_ESTADO, estadoVisible, siguienteCodigo } from "../circulacion/ejemplares.js";
import { asignarAReservaEnEspera } from "../circulacion/reservas.js";

// Ejemplares de cualquier material que circula (la pestaña "Ítems" de un
// material, como en Koha): listarlos con su situación, agregar una o varias
// copias, editarlas y borrarlas. Ver models/Ejemplar.js.
const router = Router();
router.use(requiereLogin, requiereBiblioteca);

// Lo que el staff puede escribir; estado y ultimaVezVisto los maneja el
// sistema al prestar, devolver y reservar.
const CAMPOS = [
  "codigoBarras",
  "signatura",
  "numeroCopia",
  "ubicacion",
  "uso",
  "condicion",
  "fechaAdquisicion",
  "fuenteAdquisicion",
  "precio",
  "numeroInventario",
  "notaPublica",
  "notaInterna",
];

function datosDe(cuerpo) {
  const datos = {};
  for (const campo of CAMPOS) {
    if (cuerpo[campo] === undefined) continue;
    if (campo === "precio") {
      datos.precio = cuerpo.precio === "" || cuerpo.precio === null ? undefined : Number(cuerpo.precio);
      if (datos.precio !== undefined && !(datos.precio >= 0)) throw new ErrorHttp(400, "El precio tiene que ser un número.");
    } else if (typeof cuerpo[campo] === "string") {
      datos[campo] = cuerpo[campo].trim();
    } else {
      throw new ErrorHttp(400, `"${campo}" tiene que ser texto.`);
    }
  }
  return datos;
}

function respuestaDeError(res, err) {
  if (err.code === 11000) return res.status(409).json({ error: "Ya hay un ejemplar con ese código de barras en esta biblioteca." });
  if (err.name === "ValidationError") return res.status(400).json({ error: Object.values(err.errors)[0].message });
  throw err;
}

async function materialDe(req, itemTipo, itemId) {
  const Modelo = MODELOS_POR_TIPO[itemTipo];
  if (!Modelo || !esIdValido(itemId)) throw new ErrorHttp(400, "itemTipo o itemId inválido (solo los materiales que circulan tienen ejemplares).");
  const item = await Modelo.exists({ _id: itemId, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!item) throw new ErrorHttp(404, "Material no encontrado.");
}

// ?itemTipo=&itemId= — cada ejemplar con su estado en palabras y, si está
// prestado o apartado, para quién y hasta cuándo.
router.get("/", async (req, res) => {
  await materialDe(req, req.query.itemTipo, req.query.itemId);
  const ejemplares = await Ejemplar.find({
    bibliotecaId: req.usuario.bibliotecaId,
    itemTipo: req.query.itemTipo,
    itemId: req.query.itemId,
  }).sort({ numeroCopia: 1, codigoBarras: 1 });
  const ids = ejemplares.map((e) => e._id);
  const [prestamos, reservas] = await Promise.all([
    Prestamo.find({ ejemplarId: { $in: ids }, fechaDevolucion: null }).select("ejemplarId socioId fechaVencimiento"),
    Solicitud.find({ ejemplarId: { $in: ids }, estado: "pendiente" }).select("ejemplarId socioId fechaDisponible"),
  ]);
  const socios = await Socio.find({ _id: { $in: [...prestamos, ...reservas].map((x) => x.socioId) } }).select(CAMPOS_SOCIO_EN_CIRCULACION);
  const socioPorId = new Map(socios.map((s) => [String(s._id), s]));
  const prestamoPor = new Map(prestamos.map((p) => [String(p.ejemplarId), p]));
  const reservaPor = new Map(reservas.map((r) => [String(r.ejemplarId), r]));
  res.json(
    ejemplares.map((e) => {
      const visible = estadoVisible(e);
      const prestamo = prestamoPor.get(String(e._id));
      const reserva = reservaPor.get(String(e._id));
      return {
        ...e.toObject(),
        estadoVisible: visible,
        estadoTexto: ETIQUETAS_ESTADO[visible],
        prestamo: prestamo ? { _id: prestamo._id, fechaVencimiento: prestamo.fechaVencimiento, socio: socioPorId.get(String(prestamo.socioId)) || null } : null,
        reserva: reserva ? { _id: reserva._id, fechaDisponible: reserva.fechaDisponible, socio: socioPorId.get(String(reserva.socioId)) || null } : null,
      };
    })
  );
});

// Busca un ejemplar por su código de barras (el lector del mostrador).
router.get("/codigo/:codigo", async (req, res) => {
  const ejemplar = await Ejemplar.findOne({ bibliotecaId: req.usuario.bibliotecaId, codigoBarras: req.params.codigo.trim() });
  if (!ejemplar) return res.status(404).json({ error: `No hay ningún ejemplar con el código ${req.params.codigo}.` });
  const item = await MODELOS_POR_TIPO[ejemplar.itemTipo].findById(ejemplar.itemId).select("titulo autores");
  const visible = estadoVisible(ejemplar);
  res.json({ ...ejemplar.toObject(), estadoVisible: visible, estadoTexto: ETIQUETAS_ESTADO[visible], item });
});

// Una copia, o varias iguales con "cantidad" (hasta 50): el código de barras
// y el número de copia siguen la numeración (BPSJ-000009, BPSJ-000010…),
// como "Agregar múltiples copias" de Koha.
router.post("/", requierePermiso("catalogar"), async (req, res) => {
  const { itemTipo, itemId } = req.body || {};
  await materialDe(req, itemTipo, itemId);
  const datos = datosDe(req.body || {});
  if (!datos.codigoBarras) throw new ErrorHttp(400, "El código de barras es obligatorio.");
  const cantidad = req.body.cantidad === undefined ? 1 : Number(req.body.cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) throw new ErrorHttp(400, "La cantidad de copias va de 1 a 50.");
  const copiaInicial = Number.parseInt(datos.numeroCopia, 10);
  const nuevos = Array.from({ length: cantidad }, (_, i) => ({
    ...datos,
    bibliotecaId: req.usuario.bibliotecaId,
    itemTipo,
    itemId,
    codigoBarras: i === 0 ? datos.codigoBarras : siguienteCodigo(datos.codigoBarras, i),
    numeroCopia: Number.isInteger(copiaInicial) ? String(copiaInicial + i) : datos.numeroCopia,
  }));
  const codigos = nuevos.map((n) => n.codigoBarras);
  const repetidos = await Ejemplar.find({ bibliotecaId: req.usuario.bibliotecaId, codigoBarras: { $in: codigos } }).distinct("codigoBarras");
  if (repetidos.length) {
    return res.status(409).json({ error: `Ya existe${repetidos.length > 1 ? "n" : ""} el código ${repetidos.join(", ")}: no se cargó ninguna copia.` });
  }
  const desde = new Date();
  try {
    const creados = await Ejemplar.insertMany(nuevos, { ordered: true });
    res.status(201).json(creados);
  } catch (err) {
    // Alguien cargó el mismo código justo ahora: no queda la mitad cargada.
    if (err.code === 11000) {
      await Ejemplar.deleteMany({ bibliotecaId: req.usuario.bibliotecaId, itemId, codigoBarras: { $in: codigos }, creado: { $gte: desde } });
    }
    return respuestaDeError(res, err);
  }
});

router.put("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const datos = datosDe(req.body || {});
  if (datos.codigoBarras === "") throw new ErrorHttp(400, "El código de barras es obligatorio.");
  const antes = await Ejemplar.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId });
  if (!antes) return res.status(404).json({ error: "Ejemplar no encontrado." });
  try {
    const ejemplar = await Ejemplar.findOneAndUpdate({ _id: antes._id }, datos, { new: true, runValidators: true });
    // Volvió a estar en condiciones (ej. salió de reparación): si alguien
    // lo estaba esperando, se le aparta.
    if (ejemplar.estado === "disponible") await asignarAReservaEnEspera(ejemplar._id);
    res.json(await Ejemplar.findById(ejemplar._id));
  } catch (err) {
    return respuestaDeError(res, err);
  }
});

// Solo un ejemplar que no está prestado ni apartado, y que nunca se prestó:
// el historial de préstamos lo necesita. Uno con historial se marca
// "Retirado" (condición) en vez de borrarse.
router.delete("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const ejemplar = await Ejemplar.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId });
  if (!ejemplar) return res.status(404).json({ error: "Ejemplar no encontrado." });
  if (ejemplar.estado !== "disponible") {
    return res.status(409).json({ error: "Está prestado o apartado para una reserva: primero hay que resolver eso." });
  }
  if (await Prestamo.exists({ ejemplarId: ejemplar._id })) {
    return res.status(409).json({ error: "Este ejemplar tiene préstamos en su historial: en vez de borrarlo, marcalo como Retirado." });
  }
  const borrado = await Ejemplar.findOneAndDelete({ _id: ejemplar._id, estado: "disponible" });
  if (!borrado) return res.status(409).json({ error: "El ejemplar cambió mientras se borraba. Actualizá y probá de nuevo." });
  res.json({ ok: true });
});

export default router;
