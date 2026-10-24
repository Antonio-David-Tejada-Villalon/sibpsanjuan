import net from "node:net";
import { timingSafeEqual } from "node:crypto";

// Con el frontend en Vercel, cada pedido a la API llega reenviado por
// Vercel (ver frontend/vercel.json): para Express, el IP es siempre el de
// Vercel, y el límite de intentos de ingreso sería uno solo para todo el
// colegio. Vercel agrega a esos pedidos una cabecera con un secreto
// compartido (PROXY_SECRETO, el mismo valor en Render y en Vercel); solo si
// coincide se usa el IP del visitante que informa Vercel. Sin el secreto,
// esas cabeceras las puede inventar cualquiera que le pegue directo a Render.

export const CABECERA_PROXY = "x-sibp-proxy";

// Vercel reemplaza estas cabeceras con el IP real (no deja pasar las que
// manda el navegador); Render y su CDN agregan los suyos a la derecha de
// x-forwarded-for, así que ahí el visitante es el primero.
const FUENTES_IP = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"];

function mismoSecreto(esperado, recibido) {
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function ipDelVisitante(req, res, next) {
  const secreto = process.env.PROXY_SECRETO;
  const recibido = req.get(CABECERA_PROXY);
  delete req.headers[CABECERA_PROXY]; // que no llegue a ningún log
  req.viaProxy = false;
  req.ipSegun = "conexion";
  if (secreto && recibido && mismoSecreto(secreto, recibido)) {
    req.viaProxy = true;
    for (const cabecera of FUENTES_IP) {
      const ip = req.get(cabecera)?.split(",")[0].trim();
      if (ip && net.isIP(ip)) {
        // Reemplaza el getter de Express para todo lo que use req.ip
        // (límites de intentos, de descargas de portadas).
        Object.defineProperty(req, "ip", { value: ip, configurable: true });
        req.ipSegun = cabecera;
        break;
      }
    }
  }
  next();
}
