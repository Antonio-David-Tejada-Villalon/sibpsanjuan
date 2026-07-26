import { Router } from "express";
import Libro from "../models/Libro.js";
import Seriada from "../models/Seriada.js";
import RecursoElectronico from "../models/RecursoElectronico.js";
import MaterialSonoro from "../models/MaterialSonoro.js";
import MaterialAudiovisual from "../models/MaterialAudiovisual.js";
import MaterialCartografico from "../models/MaterialCartografico.js";
import MaterialGrafico from "../models/MaterialGrafico.js";
import MaterialDidactico from "../models/MaterialDidactico.js";
import Socio from "../models/Socio.js";
import Ejemplar from "../models/Ejemplar.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import {
  librosAMarcXml,
  seriadasAMarcXml,
  recursosElectronicosAMarcXml,
  materialSonoroAMarcXml,
  materialAudiovisualAMarcXml,
  materialCartograficoAMarcXml,
  materialGraficoAMarcXml,
  materialDidacticoAMarcXml,
} from "../marc/marcxml.js";
import { sociosACsv } from "../export/patronesCsv.js";

const router = Router();

// Cada endpoint de este archivo es una exportación de datos — se gatea
// todo el router con el permiso "exportar" de una sola vez, en vez de
// repetirlo en cada ruta (a diferencia de libros.js/socios.js, acá no hay
// ninguna ruta de lectura que deba quedar afuera del permiso: hasta el GET
// es la acción sensible en sí misma).
router.use(requiereLogin, requiereBiblioteca, requierePermiso("exportar"));

// El nombre de usuario se usa tal cual en la cabecera Content-Disposition.
// Sin este filtro, un usuario con comillas o saltos de línea en su nombre
// podría inyectar contenido en la cabecera de descarga.
function nombreDeArchivoSeguro(texto) {
  return String(texto).replace(/[^a-zA-Z0-9._-]/g, "_");
}

router.get("/marcxml", async (req, res) => {
  const libros = await Libro.find({ bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (libros.length === 0) {
    return res.status(404).json({ error: "No hay libros cargados todavía." });
  }
  // Los ejemplares viven en su propia colección (ver models/Ejemplar.js) —
  // se arma acá el mismo shape ".ejemplares" que espera marcxml.js, sin
  // cambiarle la firma.
  const ejemplares = await Ejemplar.find({ bibliotecaId: req.usuario.bibliotecaId, itemTipo: "Libro" });
  const porLibro = new Map();
  for (const e of ejemplares) {
    const key = String(e.itemId);
    if (!porLibro.has(key)) porLibro.set(key, []);
    porLibro.get(key).push({ codigoBarras: e.codigoBarras, signatura: e.signatura });
  }
  const librosConEjemplares = libros.map((l) => ({
    ...l.toObject(),
    ejemplares: porLibro.get(String(l._id)) || [],
  }));
  const xml = librosAMarcXml(librosConEjemplares);
  res.set("Content-Type", "application/marcxml+xml; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="libros-${nombreDeArchivoSeguro(req.usuario.usuario)}.xml"`);
  res.send(xml);
});

router.get("/marcxml/seriadas", async (req, res) => {
  const seriadas = await Seriada.find({ bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (seriadas.length === 0) {
    return res.status(404).json({ error: "No hay publicaciones seriadas cargadas todavía." });
  }
  const ejemplares = await Ejemplar.find({ bibliotecaId: req.usuario.bibliotecaId, itemTipo: "Seriada" });
  const porSeriada = new Map();
  for (const e of ejemplares) {
    const key = String(e.itemId);
    if (!porSeriada.has(key)) porSeriada.set(key, []);
    porSeriada.get(key).push({ codigoBarras: e.codigoBarras, signatura: e.signatura });
  }
  const seriadasConEjemplares = seriadas.map((s) => ({
    ...s.toObject(),
    ejemplares: porSeriada.get(String(s._id)) || [],
  }));
  const xml = seriadasAMarcXml(seriadasConEjemplares);
  res.set("Content-Type", "application/marcxml+xml; charset=utf-8");
  res.set(
    "Content-Disposition",
    `attachment; filename="seriadas-${nombreDeArchivoSeguro(req.usuario.usuario)}.xml"`
  );
  res.send(xml);
});

router.get("/marcxml/recursosElectronicos", async (req, res) => {
  const recursos = await RecursoElectronico.find({ bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (recursos.length === 0) {
    return res.status(404).json({ error: "No hay recursos electrónicos cargados todavía." });
  }
  // Sin Ejemplar que unir acá — este bucket nunca tiene copias físicas.
  const xml = recursosElectronicosAMarcXml(recursos.map((r) => r.toObject()));
  res.set("Content-Type", "application/marcxml+xml; charset=utf-8");
  res.set(
    "Content-Disposition",
    `attachment; filename="recursos-electronicos-${nombreDeArchivoSeguro(req.usuario.usuario)}.xml"`
  );
  res.send(xml);
});

// Espejo genérico de los tres endpoints de arriba (/marcxml,
// .../seriadas, .../recursosElectronicos), para los cinco buckets que
// también circulan (tienen ejemplares) — se centraliza acá en vez de
// repetir el mismo fetch+join+reshape cinco veces más. Los tres
// endpoints existentes quedan tal cual, sin tocarlos.
function rutaExportMarcxmlCirculante({ Modelo, itemTipo, construirXml, nombreArchivo, mensajeVacio }) {
  return async (req, res) => {
    const items = await Modelo.find({ bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
    if (items.length === 0) {
      return res.status(404).json({ error: mensajeVacio });
    }
    const ejemplares = await Ejemplar.find({ bibliotecaId: req.usuario.bibliotecaId, itemTipo });
    const porItem = new Map();
    for (const e of ejemplares) {
      const key = String(e.itemId);
      if (!porItem.has(key)) porItem.set(key, []);
      porItem.get(key).push({ codigoBarras: e.codigoBarras, signatura: e.signatura });
    }
    const itemsConEjemplares = items.map((it) => ({
      ...it.toObject(),
      ejemplares: porItem.get(String(it._id)) || [],
    }));
    const xml = construirXml(itemsConEjemplares);
    res.set("Content-Type", "application/marcxml+xml; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${nombreArchivo}-${nombreDeArchivoSeguro(req.usuario.usuario)}.xml"`);
    res.send(xml);
  };
}

router.get(
  "/marcxml/materialSonoro",
  rutaExportMarcxmlCirculante({
    Modelo: MaterialSonoro,
    itemTipo: "MaterialSonoro",
    construirXml: materialSonoroAMarcXml,
    nombreArchivo: "material-sonoro",
    mensajeVacio: "No hay material sonoro cargado todavía.",
  })
);

router.get(
  "/marcxml/materialAudiovisual",
  rutaExportMarcxmlCirculante({
    Modelo: MaterialAudiovisual,
    itemTipo: "MaterialAudiovisual",
    construirXml: materialAudiovisualAMarcXml,
    nombreArchivo: "material-audiovisual",
    mensajeVacio: "No hay material audiovisual cargado todavía.",
  })
);

router.get(
  "/marcxml/materialCartografico",
  rutaExportMarcxmlCirculante({
    Modelo: MaterialCartografico,
    itemTipo: "MaterialCartografico",
    construirXml: materialCartograficoAMarcXml,
    nombreArchivo: "material-cartografico",
    mensajeVacio: "No hay material cartográfico cargado todavía.",
  })
);

router.get(
  "/marcxml/materialGrafico",
  rutaExportMarcxmlCirculante({
    Modelo: MaterialGrafico,
    itemTipo: "MaterialGrafico",
    construirXml: materialGraficoAMarcXml,
    nombreArchivo: "material-grafico",
    mensajeVacio: "No hay material gráfico cargado todavía.",
  })
);

router.get(
  "/marcxml/materialDidactico",
  rutaExportMarcxmlCirculante({
    Modelo: MaterialDidactico,
    itemTipo: "MaterialDidactico",
    construirXml: materialDidacticoAMarcXml,
    nombreArchivo: "material-didactico",
    mensajeVacio: "No hay material didáctico cargado todavía.",
  })
);

router.get("/socios.csv", async (req, res) => {
  const socios = await Socio.find({ bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (socios.length === 0) {
    return res.status(404).json({ error: "No hay socios cargados todavía." });
  }
  const csv = sociosACsv(socios);
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="socios-${nombreDeArchivoSeguro(req.usuario.usuario)}.csv"`);
  res.send(csv);
});

export default router;
