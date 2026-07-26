import { Router } from "express";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "./objectId.js";

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Fábrica de rutas CRUD para un tipo de material que NO circula (sin
// Ejemplar en absoluto) — routes/recursosElectronicos.js sigue este mismo
// esqueleto letra por letra. Se centraliza acá para Archivo/Objeto (que
// comparten el mismo criterio: piezas únicas que se consultan, no se
// prestan) en vez de repetirlo; recursosElectronicos.js queda tal cual
// está (ya probado) en vez de reescribirlo sobre esta fábrica.
export function crearRutasCatalogoSinCirculacion({ Modelo, camposBusqueda }) {
  const router = Router();
  router.use(requiereLogin, requiereBiblioteca);

  router.get("/", async (req, res) => {
    const filtro = { bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null };
    const q = (req.query.q || "").trim();
    if (q) {
      const rx = new RegExp(escaparRegex(q), "i");
      filtro.$or = camposBusqueda.map((campo) => ({ [campo]: rx }));
    }
    const pagina = Number(req.query.pagina);
    const porPagina = Number(req.query.porPagina);

    if (pagina > 0 && porPagina > 0) {
      const total = await Modelo.countDocuments(filtro);
      const items = await Modelo.find(filtro)
        .sort({ titulo: 1 })
        .skip((pagina - 1) * porPagina)
        .limit(porPagina);
      res.set("X-Total-Count", String(total));
      return res.json(items);
    }

    const items = await Modelo.find(filtro).sort({ titulo: 1 });
    res.json(items);
  });

  router.post("/", requierePermiso("catalogar"), async (req, res) => {
    const datos = { ...req.body, bibliotecaId: req.usuario.bibliotecaId };
    delete datos._id;
    try {
      const item = await Modelo.create(datos);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
    const datos = { ...req.body };
    delete datos._id;
    delete datos.bibliotecaId;
    try {
      const item = await Modelo.findOneAndUpdate(
        { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
        datos,
        { new: true, runValidators: true }
      );
      if (!item) {
        return res.status(404).json({ error: "No encontrado." });
      }
      res.json(item);
    } catch (err) {
      // Ver ARQ-12 en AUDITORIA.md — sin este try/catch, un error de
      // validación quedaba como promesa rechazada sin capturar.
      res.status(400).json({ error: err.message });
    }
  });

  router.delete("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
    const item = await Modelo.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
    if (!item) {
      return res.status(404).json({ error: "No encontrado." });
    }
    item.eliminadoEn = new Date();
    item.eliminadoPor = req.usuario.id;
    await item.save();
    res.json({ ok: true });
  });

  return router;
}
