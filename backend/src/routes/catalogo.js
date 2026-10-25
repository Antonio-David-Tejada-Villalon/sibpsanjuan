import { Router } from "express";
import Ejemplar from "../models/Ejemplar.js";
import Portada from "../models/Portada.js";
import Solicitud from "../models/Solicitud.js";
import Biblioteca from "../models/Biblioteca.js";
import { requiereLogin, requiereBiblioteca } from "../middleware/auth.js";
import { esIdValido } from "../utils/objectId.js";
import { ErrorHttp } from "../utils/consulta.js";
import { TIPOS } from "../opac/catalogo.js";
import { filtroVigente } from "../portadas/servicio.js";
import { registroMarc } from "../marc/vista.js";
import { ETIQUETAS_ESTADO, estadoVisible } from "../circulacion/ejemplares.js";

// Un material visto desde el panel (la ficha con sus pestañas Normal, MARC,
// ISBD, Ítems y Reservas): el registro completo, a diferencia del OPAC, que
// solo muestra lo público (opac/catalogo.js).
const router = Router();
router.use(requiereLogin, requiereBiblioteca);

async function cargar(req) {
  const tipo = TIPOS[req.params.tipo];
  if (!tipo || !esIdValido(req.params.id)) throw new ErrorHttp(404, "Material no encontrado.");
  const item = await tipo.Modelo.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!item) throw new ErrorHttp(404, "Material no encontrado.");
  const ejemplares = tipo.circula
    ? await Ejemplar.find({ bibliotecaId: req.usuario.bibliotecaId, itemTipo: req.params.tipo, itemId: item._id }).sort({ numeroCopia: 1, codigoBarras: 1 })
    : [];
  return { tipo, item, ejemplares };
}

router.get("/:tipo/:id", async (req, res) => {
  const { tipo, item, ejemplares } = await cargar(req);
  const [biblioteca, portada, reservas] = await Promise.all([
    Biblioteca.findById(req.usuario.bibliotecaId).select("codigo nombre"),
    Portada.findOne({ itemId: item._id, ...filtroVigente() }).select("version fuente"),
    tipo.circula
      ? Solicitud.countDocuments({ bibliotecaId: req.usuario.bibliotecaId, tipo: "prestamo", itemId: item._id, estado: { $in: ["pendiente", "en_espera"] } })
      : 0,
  ]);
  res.json({
    itemTipo: req.params.tipo,
    etiquetaTipo: tipo.etiqueta,
    segmento: tipo.segmento,
    circula: Boolean(tipo.circula),
    soloLectura: Boolean(tipo.soloLectura),
    biblioteca: { codigo: biblioteca.codigo, nombre: biblioteca.nombre },
    item,
    ejemplares: ejemplares.map((e) => {
      const visible = estadoVisible(e);
      return { ...e.toObject(), estadoVisible: visible, estadoTexto: ETIQUETAS_ESTADO[visible] };
    }),
    reservasAbiertas: reservas,
    portada: portada?.version ?? null,
    portadaFuente: portada?.fuente ?? null,
  });
});

router.get("/:tipo/:id/marc", async (req, res) => {
  const { item, ejemplares } = await cargar(req);
  const campos = registroMarc(req.params.tipo, { ...item.toObject(), ejemplares });
  if (!campos) return res.status(404).json({ error: "Este tipo de material no tiene registro MARC: no se exporta a Koha." });
  res.json({ campos });
});

export default router;
