import crypto from "node:crypto";
import ClaveIdempotencia from "../models/ClaveIdempotencia.js";

const FORMATO = /^[A-Za-z0-9_-]{8,100}$/;

// Para las operaciones de circulación que no se pueden repetir sin daño
// (prestar, devolver, renovar, aprobar/rechazar, pedir desde el OPAC). Con
// conexiones inestables, el cliente puede no ver la respuesta y reintentar:
// si manda la misma cabecera Idempotency-Key, el reintento recibe la
// respuesta original en vez de ejecutar la operación otra vez.
//
// - Sin cabecera: la ruta funciona como siempre (clientes viejos, tests).
// - Solo se guardan respuestas 2xx: un 4xx/5xx no cambió nada, así que el
//   reintento vuelve a ejecutarse (puede que ahora sí haya un ejemplar).
// - Mientras la primera ejecución sigue en curso, un reintento recibe 409.
//
// Va después del middleware de login: necesita req.usuario.
export async function idempotente(req, res, next) {
  const clave = req.get("Idempotency-Key");
  if (clave === undefined) return next();
  if (!FORMATO.test(clave)) {
    return res.status(400).json({ error: "La cabecera Idempotency-Key no tiene un formato válido." });
  }
  const actor = `${req.usuario.rol}:${req.usuario.id}`;
  // Sin /api ni /api/v1 (son alias) y sin la query (?bibliotecaId=...).
  const ruta = `${req.method} ${req.baseUrl.replace(/^\/api(\/v1)?/, "")}${req.path}`;
  const huella = crypto.createHash("sha256").update(JSON.stringify(req.body ?? {})).digest("hex");

  try {
    await ClaveIdempotencia.create({ clave, actor, ruta, huella });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const previa = await ClaveIdempotencia.findOne({ actor, clave });
    if (previa && (previa.ruta !== ruta || previa.huella !== huella)) {
      return res.status(422).json({ error: "Esa clave de idempotencia ya se usó para otra operación." });
    }
    if (!previa || previa.estado === "en_curso") {
      return res.status(409).json({ error: "Esta misma operación todavía se está procesando. Esperá un momento y actualizá." });
    }
    res.set("Idempotent-Replayed", "true");
    return res.status(previa.status).json(previa.cuerpo);
  }

  // La respuesta sale recién cuando quedó guardada: si saliera antes, un
  // reintento muy rápido todavía la vería "en curso".
  const enviar = res.json.bind(res);
  res.json = (cuerpo) => {
    const status = res.statusCode;
    const guardar =
      status >= 200 && status < 300
        ? ClaveIdempotencia.updateOne(
            { actor, clave },
            { estado: "completa", status, cuerpo: JSON.parse(JSON.stringify(cuerpo ?? null)) }
          )
        : ClaveIdempotencia.deleteOne({ actor, clave });
    guardar
      .catch((e) => console.error("No se pudo guardar la clave de idempotencia:", e.message))
      .finally(() => enviar(cuerpo));
    return res;
  };
  next();
}
