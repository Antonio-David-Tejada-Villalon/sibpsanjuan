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

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function crearApp() {
  const app = express();
  // Render pone la app detrás de un proxy — sin esto, cualquier lógica que
  // dependa de la IP real del cliente (ej. rate-limiting por IP) vería
  // siempre la IP del proxy, no la del usuario.
  app.set("trust proxy", 1);
  // img-src vuelve al default de Helmet ('self' + data:): antes permitía
  // cualquier https: porque el OPAC mostraba directo la URL de portada que
  // pegaba el staff (ver ARQ-7/CYBER-3 en AUDITORIA.md). Ahora el servidor
  // descarga y procesa esas imágenes (ver portadas/) y las sirve él mismo:
  // el navegador de un alumno nunca le pide nada a un sitio de terceros.
  app.use(helmet());
  // Sin FRONTEND_URL (el despliegue de hoy: un solo servicio Express
  // sirviendo API + build), no se monta ningún middleware de CORS — mismo
  // comportamiento same-origin de siempre. Se activa solo si el frontend se
  // despliega aparte (ej. Vercel) apuntando acá vía VITE_API_URL — ver
  // "Vercel + Render" en DEPLOY.md. `credentials: true` es necesario porque
  // la sesión viaja en cookie httpOnly, no en un header Authorization.
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
  app.get("/api/health", (req, res) => {
    const dbConectada = mongoose.connection.readyState === 1;
    res.status(dbConectada ? 200 : 503).json({ ok: dbConectada, db: mongoose.connection.readyState });
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
  ];
  for (const [ruta, router] of rutasApi) {
    app.use(`/api${ruta}`, router);
    app.use(`/api/v1${ruta}`, router);
  }
  app.use("/api", rutaApiInexistente);

  // En producción, Express sirve el build de React ya compilado — un solo
  // servicio, una sola URL, sin CORS entre front y back.
  const distDir = path.join(__dirname, "..", "..", "frontend", "dist");
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (req, res) => {
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
