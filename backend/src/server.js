import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { conectarDB } from "./db.js";
import { logRequests } from "./middleware/logging.js";
import { manejarErrores, rutaApiInexistente } from "./middleware/errores.js";
import authRoutes from "./routes/auth.js";
import bibliotecasRoutes from "./routes/bibliotecas.js";
import supervisoresRoutes from "./routes/supervisores.js";
import solicitudesSupervisionRoutes from "./routes/solicitudesSupervision.js";
import superbibliotecariosRoutes from "./routes/superbibliotecarios.js";
import bibliotecariosRoutes from "./routes/bibliotecarios.js";
import usuariosRoutes from "./routes/usuarios.js";
import librosRoutes from "./routes/libros.js";
import autoresRoutes from "./routes/autores.js";
import materiasRoutes from "./routes/materias.js";
import seriadasRoutes from "./routes/seriadas.js";
import recursosElectronicosRoutes from "./routes/recursosElectronicos.js";
import materialSonoroRoutes from "./routes/materialSonoro.js";
import materialAudiovisualRoutes from "./routes/materialAudiovisual.js";
import materialCartograficoRoutes from "./routes/materialCartografico.js";
import materialGraficoRoutes from "./routes/materialGrafico.js";
import materialDidacticoRoutes from "./routes/materialDidactico.js";
import archivosRoutes from "./routes/archivos.js";
import objetosRoutes from "./routes/objetos.js";
import sociosRoutes from "./routes/socios.js";
import exportRoutes from "./routes/export.js";
import opacRoutes from "./routes/opac.js";
import circulacionRoutes from "./routes/circulacion.js";
import portadasRoutes from "./routes/portadas.js";
import contenidoRoutes from "./routes/contenido.js";
import { rutasSeo } from "./seo/rutas.js";
import { ipDelVisitante } from "./middleware/proxy.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// distDir: el build del frontend (los tests lo cambian para simular un
// servicio que es solo la API).
export function crearApp({ distDir = path.join(__dirname, "..", "..", "frontend", "dist") } = {}) {
  const app = express();
  // Render pone la app detrás de un proxy — sin esto, cualquier lógica que
  // dependa de la IP real del cliente (ej. rate-limiting por IP) vería
  // siempre la IP del proxy, no la del usuario.
  app.set("trust proxy", 1);
  // Y detrás de Vercel, el IP del visitante que informa Vercel (ver
  // middleware/proxy.js).
  app.use(ipDelVisitante);
  // img-src vuelve al default de Helmet ('self' + data:): antes permitía
  // cualquier https: porque el OPAC mostraba directo la URL de portada que
  // pegaba el staff (ver ARQ-7/CYBER-3 en AUDITORIA.md). Ahora el servidor
  // descarga y procesa esas imágenes (ver portadas/) y las sirve él mismo:
  // el navegador de un alumno nunca le pide nada a un sitio de terceros.
  app.use(helmet());
  // CORS solo para un frontend en otro origen que le pegue directo a esta
  // API (VITE_API_URL + FRONTEND_URL). Con Vercel reenviando /api (el
  // despliegue de DEPLOY.md) no hace falta: para el navegador es el mismo
  // origen, y así la cookie de sesión no es "de terceros" (Safari y iPhone
  // las bloquean). `credentials: true` porque la sesión viaja en cookie.
  if (process.env.FRONTEND_URL) {
    const origenPermitido = process.env.FRONTEND_URL;
    app.use(
      cors({
        origin: (origin, callback) => callback(null, !origin || origin === origenPermitido),
        credentials: true,
      })
    );
  }
  // Límite explícito en vez de heredar el default de body-parser (100kb)
  // sin documentar por qué alcanza (ver CYBER-6 en AUDITORIA.md) — 2mb
  // cubre con margen la carga masiva de CSV (`POST /libros/importar-csv`,
  // el body más grande de esta API) para varios miles de filas de texto.
  app.use(express.json({ limit: "2mb" }));
  // Express 5 deja req.body en undefined cuando la petición no trae JSON;
  // Express 4 lo dejaba en {}. Las rutas se escribieron contra lo segundo
  // (por ejemplo, `const { x } = req.body`), así que se conserva.
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });
  app.use(cookieParser());
  app.use(logRequests());

  // Sin autenticación a propósito: lo consultan balanceadores/monitoreo
  // (Render, uptime checks) que no tienen ni deberían tener credenciales.
  // viaProxy/ipSegun sirven para comprobar el despliegue con Vercel: de qué
  // cabecera salió el IP del visitante (nunca el IP en sí).
  app.get("/api/health", (req, res) => {
    const dbConectada = mongoose.connection.readyState === 1;
    res.set("Cache-Control", "no-store");
    res.status(dbConectada ? 200 : 503).json({
      ok: dbConectada,
      db: mongoose.connection.readyState,
      viaProxy: req.viaProxy,
      ipSegun: req.ipSegun,
    });
  });

  // Versionado de API (ver ARQ-5 en la auditoría): /api/v1/... es la base
  // que usa el frontend de acá en adelante. /api/... sin versión se deja
  // montado como alias — mismo router, misma lógica — para no romper nada
  // que ya lo esté llamando (la suite de integración lo sigue usando tal
  // cual, a propósito, como prueba viva de que el alias no rompió nada).
  const rutasApi = [
    ["/auth", authRoutes],
    ["/bibliotecas", bibliotecasRoutes],
    ["/supervisores", supervisoresRoutes],
    ["/solicitudes-supervision", solicitudesSupervisionRoutes],
    ["/superbibliotecarios", superbibliotecariosRoutes],
    ["/bibliotecarios", bibliotecariosRoutes],
    ["/usuarios", usuariosRoutes],
    ["/libros", librosRoutes],
    ["/autores", autoresRoutes],
    ["/materias", materiasRoutes],
    ["/seriadas", seriadasRoutes],
    ["/recursosElectronicos", recursosElectronicosRoutes],
    ["/materialSonoro", materialSonoroRoutes],
    ["/materialAudiovisual", materialAudiovisualRoutes],
    ["/materialCartografico", materialCartograficoRoutes],
    ["/materialGrafico", materialGraficoRoutes],
    ["/materialDidactico", materialDidacticoRoutes],
    ["/archivos", archivosRoutes],
    ["/objetos", objetosRoutes],
    ["/socios", sociosRoutes],
    ["/export", exportRoutes],
    ["/opac/:codigo", opacRoutes],
    ["/circulacion", circulacionRoutes],
    ["/portadas", portadasRoutes],
    ["/contenido", contenidoRoutes],
  ];
  // La API no es una página: que ningún buscador la muestre como resultado
  // (sí la puede pedir, para ver el catálogo como lo ve una persona).
  // Y ninguna respuesta queda guardada en un caché compartido (la CDN de
  // Vercel) salvo las que lo dicen (catálogo público, portadas): el resto
  // puede tener datos de una sesión.
  app.use("/api", (req, res, next) => {
    res.set("X-Robots-Tag", "noindex");
    res.set("Cache-Control", "private, no-cache");
    next();
  });
  for (const [ruta, router] of rutasApi) {
    app.use(`/api${ruta}`, router);
    app.use(`/api/v1${ruta}`, router);
  }
  app.use("/api", rutaApiInexistente);

  // Con un solo servicio, Express sirve también el build de React. Con el
  // frontend en Vercel, este servicio es solo la API (no hay build).
  // Antes que los archivos: robots.txt y sitemaps dinámicos, y las páginas
  // públicas del OPAC con su <head> ya escrito (ver seo/rutas.js).
  app.use(rutasSeo({ distDir }));
  app.use(express.static(distDir, { index: false }));
  // El resto (panel, ingreso del staff) es la app sin indexar. Sin build, a
  // quien entre directo a la dirección de Render se lo manda al sitio.
  const hayBuild = fs.existsSync(path.join(distDir, "index.html"));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    if (!hayBuild && process.env.SITIO_URL) {
      return res.redirect(302, process.env.SITIO_URL.replace(/\/+$/, "") + req.originalUrl);
    }
    res.set("X-Robots-Tag", "noindex");
    res.sendFile(path.join(distDir, "index.html"));
  });

  // Último: recibe los errores de cualquier ruta, también los de las async
  // (Express 5 los reenvía solo), y responde un JSON controlado.
  app.use(manejarErrores);

  return app;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("Falta MONGODB_URI en el entorno.");
    process.exit(1);
  }
  await conectarDB(process.env.MONGODB_URI);
  const app = crearApp();
  const puerto = process.env.PORT || 3000;
  app.listen(puerto, () => {
    console.log(`sibpsanjuan escuchando en :${puerto}`);
  });
}

// pathToFileURL y no `file://${...}`: en Windows argv[1] trae barras
// invertidas y letra de unidad, y la comparación literal nunca coincidía
// (`npm start` terminaba sin levantar el servidor y sin decir nada).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
