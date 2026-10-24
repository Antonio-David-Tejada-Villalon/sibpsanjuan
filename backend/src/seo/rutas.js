import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import Biblioteca from "../models/Biblioteca.js";
import { contenidoPublico } from "../contenido/publico.js";
import { datosPublicados } from "../contenido/publicado.js";
import { TIPOS, fichaDeMaterial, slugDe } from "../opac/catalogo.js";
import { enteroDeConsulta } from "../utils/consulta.js";
import {
  escaparHtml,
  headDeMetadatos,
  metadatosDeFicha,
  metadatosDeInicio,
  metadatosDePagina,
  metadatosPrivados,
  origenDeLaApi,
  origenPublico,
  rutaDeFicha,
} from "./metadatos.js";

// Lo que ve un buscador (o la vista previa de WhatsApp, que no ejecuta
// JavaScript) al entrar directo a una página pública del OPAC: el mismo
// index.html de la app, con el <head> de esa página ya escrito. Más
// robots.txt y los sitemaps.
//
// Con el frontend en Vercel, Vercel sirve el HTML y reenvía acá solo los
// sitemaps y los bots de vista previa (ver frontend/vercel.json). Ese
// despliegue no tiene el build del frontend: a los bots se les responde un
// documento mínimo con los mismos metadatos.

const POR_SITEMAP = 45_000; // el límite del protocolo es 50.000 direcciones
const SEGMENTOS = Object.fromEntries(Object.entries(TIPOS).map(([itemTipo, t]) => [t.segmento, itemTipo]));
const PRIVADAS = { login: "Ingresar", cuenta: "Mi cuenta", "mis-prestamos": "Mis préstamos" };
const MARCA = /<!-- metadatos -->[\s\S]*?<!-- \/metadatos -->/;

export function rutasSeo({ distDir }) {
  const router = Router();
  let plantilla = null;

  async function leerPlantilla() {
    if (plantilla) return plantilla;
    try {
      plantilla = await fs.readFile(path.join(distDir, "index.html"), "utf8");
    } catch {
      return null; // sin build (despliegue solo API): documento mínimo
    }
    return plantilla;
  }

  async function responder(res, meta, status = 200) {
    const head = headDeMetadatos(meta);
    const base = await leerPlantilla();
    res.status(status);
    res.set("Cache-Control", "no-cache");
    if (meta.robots?.startsWith("noindex")) res.set("X-Robots-Tag", meta.robots.replace(",", ", "));
    if (base && MARCA.test(base)) {
      return res.type("html").send(base.replace(MARCA, () => `<!-- metadatos -->\n    ${head}\n    <!-- /metadatos -->`));
    }
    // Un build anterior a las marcas: por lo menos el título y lo nuevo.
    if (base) return res.type("html").send(base.replace(/<title>[^<]*<\/title>/, () => head));
    const enlace = meta.canonical ? `<p><a href="${escaparHtml(meta.canonical)}">Ver en el catálogo</a></p>` : "";
    return res.type("html").send(
      `<!doctype html>\n<html lang="es">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    ${head}\n  </head>\n  <body>\n    <main>\n      <h1>${escaparHtml(meta.titulo)}</h1>\n      <p>${escaparHtml(meta.descripcion)}</p>\n      ${enlace}\n    </main>\n  </body>\n</html>\n`
    );
  }

  const noEncontrado = (res) => responder(res, metadatosPrivados("No encontrado"), 404);

  async function cargarBiblioteca(req, res) {
    const biblioteca = await Biblioteca.findOne({ codigo: String(req.params.codigo).toLowerCase() });
    if (!biblioteca) {
      await noEncontrado(res);
      return null;
    }
    const { datos } = await datosPublicados(biblioteca);
    const contenido = contenidoPublico(datos, biblioteca.codigo);
    const opciones = { codigo: biblioteca.codigo, origen: origenPublico(req), origenApi: origenDeLaApi(req) };
    return { biblioteca, datos, contenido, opciones };
  }

  // Un error de la base no puede dejar a la gente sin la app: se manda el
  // HTML de siempre con 503 (para un buscador: "volvé más tarde").
  const conRespaldo = (manejador) => async (req, res, next) => {
    try {
      await manejador(req, res, next);
    } catch (err) {
      console.error("seo:", err.message);
      if (res.headersSent) return;
      res.set("Retry-After", "120");
      await responder(res, metadatosPrivados("Catálogo"), 503);
    }
  };

  // robots.txt no saca páginas del índice (solo evita que se rastreen): lo
  // privado responde "X-Robots-Tag: noindex" y para eso tiene que poder
  // rastrearse. Tampoco se bloquea /api/: Google lo necesita para ver el
  // catálogo como lo ve una persona.
  router.get("/robots.txt", (req, res) => {
    res.type("text/plain").set("Cache-Control", "public, max-age=3600");
    res.send(
      [
        "# Se indexa solo el catálogo público (/opac/...). El panel, el ingreso",
        '# y las cuentas de socios responden "X-Robots-Tag: noindex".',
        "User-agent: *",
        "Allow: /",
        "",
        `Sitemap: ${origenPublico(req)}/sitemap.xml`,
        "",
      ].join("\n")
    );
  });

  router.get(
    "/sitemap.xml",
    conRespaldo(async (req, res) => {
      const origen = origenPublico(req);
      const bibliotecas = await Biblioteca.find().sort({ codigo: 1 });
      const entradas = [];
      for (const b of bibliotecas) {
        const { datos } = await datosPublicados(b);
        const total = 1 + datos.paginas.filter((p) => p.slug).length + (await contarMateriales(b._id));
        const paginas = Math.ceil(total / POR_SITEMAP);
        for (let n = 1; n <= paginas; n++) {
          entradas.push(`${origen}/opac/${b.codigo}/sitemap.xml${n > 1 ? `?pagina=${n}` : ""}`);
        }
      }
      enviarXml(
        res,
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entradas
          .map((loc) => `  <sitemap><loc>${escaparHtml(loc)}</loc></sitemap>`)
          .join("\n")}\n</sitemapindex>`
      );
    })
  );

  router.get(
    "/opac/:codigo/sitemap.xml",
    conRespaldo(async (req, res) => {
      const datos = await cargarBiblioteca(req, res);
      if (!datos) return;
      const { biblioteca, datos: publicados, opciones } = datos;
      const pagina = enteroDeConsulta(req.query.pagina, { minimo: 1, maximo: 1000, defecto: 1 });
      const urls = [
        { loc: `${opciones.origen}/opac/${biblioteca.codigo}` },
        ...publicados.paginas.filter((p) => p.slug).map((p) => ({ loc: `${opciones.origen}/opac/${biblioteca.codigo}/pagina/${p.slug}` })),
        ...(await materialesDe(biblioteca._id)).map((m) => ({
          loc: `${opciones.origen}${rutaDeFicha(biblioteca.codigo, m)}`,
          lastmod: m.actualizado,
        })),
      ].slice((pagina - 1) * POR_SITEMAP, pagina * POR_SITEMAP);
      if (!urls.length) return noEncontrado(res);
      enviarXml(
        res,
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
          .map(
            ({ loc, lastmod }) =>
              `  <url><loc>${escaparHtml(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ""}</url>`
          )
          .join("\n")}\n</urlset>`
      );
    })
  );

  // Inicio y búsqueda. Con parámetros es una página de resultados: no se
  // indexa (sería una copia por cada búsqueda posible), pero sus enlaces sí
  // se siguen.
  router.get(
    "/opac/:codigo",
    conRespaldo(async (req, res) => {
      const datos = await cargarBiblioteca(req, res);
      if (!datos) return;
      const meta = metadatosDeInicio(datos.contenido, datos.opciones);
      if (Object.keys(req.query).length) meta.robots = "noindex,follow";
      await responder(res, meta);
    })
  );

  router.get(
    "/opac/:codigo/pagina/:slug",
    conRespaldo(async (req, res) => {
      const datos = await cargarBiblioteca(req, res);
      if (!datos) return;
      const pagina = datos.datos.paginas.find((p) => p.slug && p.slug === req.params.slug);
      if (!pagina) return noEncontrado(res);
      await responder(res, metadatosDePagina(pagina, datos.contenido, datos.opciones));
    })
  );

  router.get(
    "/opac/:codigo/:segmento/:slugId",
    conRespaldo(async (req, res, next) => {
      const itemTipo = SEGMENTOS[req.params.segmento];
      if (!itemTipo) return next();
      const datos = await cargarBiblioteca(req, res);
      if (!datos) return;
      const [, id] = /([0-9a-f]{24})$/.exec(req.params.slugId) || [];
      const ficha = id && (await fichaDeMaterial(datos.biblioteca, itemTipo, id));
      if (!ficha) return noEncontrado(res);
      // Título cambiado (o enlace viejo): a la dirección actual, de forma
      // permanente, para que el buscador reemplace la vieja.
      const canonica = rutaDeFicha(datos.biblioteca.codigo, ficha);
      if (req.path !== canonica) return res.redirect(301, canonica);
      await responder(res, metadatosDeFicha(ficha, datos.contenido, datos.opciones));
    })
  );

  // Cualquier otra página del OPAC (ingreso, cuenta, préstamos, aviso de
  // privacidad, direcciones inexistentes): la app la resuelve; no se indexa.
  router.get(
    "/opac/:codigo/*resto",
    conRespaldo(async (req, res) => {
      const datos = await cargarBiblioteca(req, res);
      if (!datos) return;
      const [primero] = req.params.resto;
      await responder(res, metadatosPrivados(PRIVADAS[primero] || "Catálogo", datos.contenido));
    })
  );

  return router;
}

function enviarXml(res, cuerpo) {
  res.type("application/xml").set("Cache-Control", "public, max-age=3600");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n${cuerpo}\n`);
}

async function contarMateriales(bibliotecaId) {
  const cuentas = await Promise.all(Object.values(TIPOS).map((t) => t.Modelo.countDocuments({ bibliotecaId, eliminadoEn: null })));
  return cuentas.reduce((a, b) => a + b, 0);
}

async function materialesDe(bibliotecaId) {
  const porTipo = await Promise.all(
    Object.values(TIPOS).map(async (t) => {
      const docs = await t.Modelo.find({ bibliotecaId, eliminadoEn: null }).select("titulo actualizado").sort({ _id: 1 }).lean();
      return docs.map((d) => ({ id: String(d._id), segmento: t.segmento, slug: slugDe(d.titulo), actualizado: d.actualizado }));
    })
  );
  return porTipo.flat();
}
