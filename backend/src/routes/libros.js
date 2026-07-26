import { Router } from "express";
import Libro from "../models/Libro.js";
import Ejemplar from "../models/Ejemplar.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";
import { crearEjemplaresPara, adjuntarEjemplaresPara } from "../utils/ejemplares.js";
import { plantillaLibrosCsv, parseLibrosCsv } from "../utils/importarLibrosCsv.js";

const router = Router();

router.use(requiereLogin, requiereBiblioteca);

const crearEjemplares = crearEjemplaresPara("Libro");
const adjuntarEjemplares = adjuntarEjemplaresPara("Libro");

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null };
  const q = (req.query.q || "").trim();
  if (q) {
    const rx = new RegExp(escaparRegex(q), "i");
    filtro.$or = [{ titulo: rx }, { autores: rx }, { isbn: rx }];
  }
  const pagina = Number(req.query.pagina);
  const porPagina = Number(req.query.porPagina);

  // Paginado es opt-in: sin pagina/porPagina en la query, se devuelve la
  // lista completa como siempre (así no se rompe a quien ya consume este
  // endpoint esperando un array — el dashboard, el selector de Préstamos).
  // Con esos params, se agrega X-Total-Count para que la pantalla de
  // Libros pueda armar un paginador (ver ARQ-3 en la auditoría).
  if (pagina > 0 && porPagina > 0) {
    const total = await Libro.countDocuments(filtro);
    const libros = await Libro.find(filtro)
      .sort({ titulo: 1 })
      .skip((pagina - 1) * porPagina)
      .limit(porPagina);
    res.set("X-Total-Count", String(total));
    return res.json(await adjuntarEjemplares(libros));
  }

  const libros = await Libro.find(filtro).sort({ titulo: 1 });
  res.json(await adjuntarEjemplares(libros));
});

router.post("/", requierePermiso("catalogar"), async (req, res) => {
  const { ejemplares, ...resto } = req.body;
  const datos = { ...resto, bibliotecaId: req.usuario.bibliotecaId };
  delete datos._id;
  let libro;
  try {
    libro = await Libro.create(datos);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const creados = await crearEjemplares(req.usuario.bibliotecaId, libro._id, ejemplares);
    res.status(201).json({ ...libro.toObject(), ejemplares: creados });
  } catch (err) {
    // Sin transacciones (no hay replica set en este setup): si fallan los
    // ejemplares (ej. código de barras duplicado), deshacemos el libro a
    // mano para no dejar un registro bibliográfico huérfano sin ejemplares.
    await Libro.deleteOne({ _id: libro._id });
    res.status(400).json({ error: err.message });
  }
});

router.get("/plantilla-csv", (req, res) => {
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="plantilla-libros.csv"');
  res.send(plantillaLibrosCsv());
});

// Carga masiva: cada fila se crea como un registro bibliográfico con sus
// ejemplares (ver columna "ejemplares" en importarLibrosCsv.js). No aborta
// todo el archivo por una fila inválida: cada una se intenta por separado y
// se acumulan los errores para devolverlos juntos al final.
router.post("/importar-csv", requierePermiso("catalogar"), async (req, res) => {
  const { csv } = req.body || {};
  if (typeof csv !== "string" || !csv.trim()) {
    return res.status(400).json({ error: "Falta el contenido del CSV." });
  }
  let libros, erroresDeParseo, avisos;
  try {
    ({ libros, errores: erroresDeParseo, avisos } = parseLibrosCsv(csv));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const errores = [...erroresDeParseo];
  let creados = 0;
  for (const { _fila, ejemplares, ...datos } of libros) {
    let libro;
    try {
      libro = await Libro.create({ ...datos, bibliotecaId: req.usuario.bibliotecaId });
    } catch (err) {
      errores.push({ fila: _fila, mensaje: err.message });
      continue;
    }
    try {
      await crearEjemplares(req.usuario.bibliotecaId, libro._id, ejemplares);
      creados += 1;
    } catch (err) {
      // Mismo criterio que el alta individual (POST "/" más abajo): si
      // fallan los ejemplares (ej. código de barras ya usado en esta
      // biblioteca), se deshace el libro para no dejar un registro
      // bibliográfico huérfano sin ninguno de sus ejemplares.
      await Libro.deleteOne({ _id: libro._id });
      errores.push({ fila: _fila, mensaje: err.message });
    }
  }

  // Siempre 200/201, incluso si todas las filas fallaron: la importación en
  // sí se procesó sin problemas, el resultado (éxitos y errores por fila)
  // va en el cuerpo. Devolver 400 acá hacía que el frontend descartara este
  // cuerpo (sin campo "error", cae al mensaje genérico "Error 400") y el
  // usuario se quedaba sin ver por qué falló cada fila.
  res.status(creados > 0 ? 201 : 200).json({ creados, errores, avisos });
});

router.post("/:id/ejemplares", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const libro = await Libro.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!libro) {
    return res.status(404).json({ error: "No encontrado." });
  }
  try {
    const creados = await crearEjemplares(req.usuario.bibliotecaId, libro._id, req.body.ejemplares);
    res.status(201).json(creados);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put(
  "/:id/ejemplares/:ejemplarId",
  requierePermiso("catalogar"),
  requiereIdValido(),
  requiereIdValido("ejemplarId"),
  async (req, res) => {
    const libro = await Libro.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
    if (!libro) {
      return res.status(404).json({ error: "No encontrado." });
    }
    const { codigoBarras, signatura } = req.body || {};
    const datos = {};
    if (codigoBarras !== undefined) datos.codigoBarras = codigoBarras;
    if (signatura !== undefined) datos.signatura = signatura;
    try {
      const ejemplar = await Ejemplar.findOneAndUpdate(
        { _id: req.params.ejemplarId, bibliotecaId: req.usuario.bibliotecaId, itemTipo: "Libro", itemId: libro._id },
        datos,
        { new: true, runValidators: true }
      );
      if (!ejemplar) {
        return res.status(404).json({ error: "Ejemplar no encontrado." });
      }
      res.json(ejemplar);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: "Ya existe un ejemplar con ese código de barras en esta biblioteca." });
      }
      res.status(400).json({ error: err.message });
    }
  }
);

router.delete(
  "/:id/ejemplares/:ejemplarId",
  requierePermiso("catalogar"),
  requiereIdValido(),
  requiereIdValido("ejemplarId"),
  async (req, res) => {
    const libro = await Libro.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
    if (!libro) {
      return res.status(404).json({ error: "No encontrado." });
    }
    const ejemplar = await Ejemplar.findOne({
      _id: req.params.ejemplarId,
      bibliotecaId: req.usuario.bibliotecaId,
      itemTipo: "Libro",
      itemId: libro._id,
    });
    if (!ejemplar) {
      return res.status(404).json({ error: "Ejemplar no encontrado." });
    }
    // Solo "disponible": borrar uno "prestado" dejaría un Prestamo apuntando
    // a un ejemplar que ya no existe, y uno "reservado" haría lo mismo con
    // la Solicitud pendiente que lo reservó (ver POST /opac/:codigo/solicitudes).
    if (ejemplar.estado !== "disponible") {
      return res.status(409).json({ error: "Solo se puede eliminar un ejemplar disponible (no prestado ni reservado)." });
    }
    await Ejemplar.deleteOne({ _id: ejemplar._id });
    res.json({ ok: true });
  }
);

router.put("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const datos = { ...req.body };
  delete datos._id;
  delete datos.bibliotecaId;
  delete datos.ejemplares;
  try {
    const libro = await Libro.findOneAndUpdate(
      { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
      datos,
      { new: true, runValidators: true }
    );
    if (!libro) {
      return res.status(404).json({ error: "No encontrado." });
    }
    res.json(libro);
  } catch (err) {
    // Ver ARQ-12 en AUDITORIA.md — sin este try/catch, un error de
    // validación (ej. el ISBN nuevo de BIBL-4) quedaba como promesa
    // rechazada sin capturar.
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requierePermiso("catalogar"), requiereIdValido(), async (req, res) => {
  const libro = await Libro.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!libro) {
    return res.status(404).json({ error: "No encontrado." });
  }
  const prestado = await Ejemplar.exists({ itemTipo: "Libro", itemId: libro._id, estado: "prestado" });
  if (prestado) {
    return res.status(409).json({ error: "No se puede eliminar: tiene ejemplares prestados." });
  }
  // Borrado lógico del registro bibliográfico (ver GOB-2) — los ejemplares
  // físicos sí se borran de verdad: a esta altura ya se confirmó que
  // ninguno está prestado, así que lo único que se pierde son los códigos
  // de barras/signaturas, recargables a mano si hiciera falta.
  await Ejemplar.deleteMany({ itemTipo: "Libro", itemId: libro._id });
  libro.eliminadoEn = new Date();
  libro.eliminadoPor = req.usuario.id;
  await libro.save();
  res.json({ ok: true });
});

export default router;
