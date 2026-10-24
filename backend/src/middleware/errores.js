import { ErrorHttp } from "../utils/consulta.js";

// Rutas /api que no existen: JSON en vez de la página de error HTML de Express.
export function rutaApiInexistente(req, res) {
  res.status(404).json({ error: "Ruta no encontrada." });
}

// Manejador global, montado al final de la app. Con Express 5, cualquier
// error de una ruta async (promesa rechazada) llega acá en vez de quedar sin
// manejar y terminar el proceso. Al cliente nunca le llegan stack traces ni
// mensajes internos; al log, solo metadata de la request, sin body ni
// cookies (mismo criterio que middleware/logging.js).
export function manejarErrores(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ErrorHttp) {
    return res.status(err.estado).json({ error: err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "El cuerpo de la petición es demasiado grande." });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: "Algún dato de la petición tiene un formato inválido." });
  }

  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      nivel: "error",
      metodo: req.method,
      ruta: req.originalUrl.split("?")[0],
      error: err.name || "Error",
      mensaje: err.message,
    })
  );
  res.status(500).json({ error: "Ocurrió un error interno. Probá de nuevo en unos minutos." });
}
