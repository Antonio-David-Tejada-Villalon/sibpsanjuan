// Logging estructurado (una línea JSON por request) en vez de texto libre —
// así se puede grepear/parsear en los logs de Render sin depender de un
// formato ad hoc. No se loguea body ni cookies: solo metadata de la request.
export function logRequests() {
  return (req, res, next) => {
    const inicio = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      const linea = {
        ts: new Date().toISOString(),
        metodo: req.method,
        ruta: req.originalUrl.split("?")[0],
        estado: res.statusCode,
        ms: Math.round(ms),
        bibliotecaId: req.usuario?.bibliotecaId || req.biblioteca?._id || undefined,
      };
      console.log(JSON.stringify(linea));
    });
    next();
  };
}
