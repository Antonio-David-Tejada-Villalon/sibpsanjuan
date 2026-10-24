import crypto from "node:crypto";
import Portada from "../models/Portada.js";
import Libro from "../models/Libro.js";
import { descargarImagen } from "./descargar.js";
import { procesarPortada } from "./procesar.js";
import { urlOpenLibrary, hayCupoOpenLibrary, buscarGoogleBooks, vencimientoSegunCache } from "./fuentes.js";

// Lo que toca la red, agrupado para que los tests lo reemplacen (vía
// app.locals.portadas) sin que nada de eso sea alcanzable desde un pedido.
export const DEPENDENCIAS = { descargar: descargarImagen, urlOpenLibrary, buscarGoogleBooks, hayCupoOpenLibrary };

// Una portada está vigente si no vence (Open Library, URL del staff) o si
// todavía no venció (Google Books).
export function filtroVigente(ahora = new Date()) {
  return { $or: [{ expiraEn: null }, { expiraEn: { $gt: ahora } }] };
}

export function normalizarIsbn(isbn) {
  const limpio = String(isbn || "").replace(/[\s-]/g, "").toUpperCase();
  return /^(\d{9}[\dX]|\d{13})$/.test(limpio) ? limpio : "";
}

async function guardar({ item, itemTipo, fuente, origen, imagen, expiraEn = null, usuarioId = null }) {
  const procesada = await procesarPortada(imagen);
  const version = crypto.createHash("sha256").update(procesada.grande).digest("hex").slice(0, 12);
  return Portada.findOneAndUpdate(
    { itemId: item._id },
    {
      $set: {
        bibliotecaId: item.bibliotecaId,
        itemTipo,
        fuente,
        origen,
        ...procesada,
        version,
        expiraEn,
        actualizadaPor: usuarioId,
        actualizada: new Date(),
      },
    },
    { upsert: true, new: true, projection: { grande: 0, miniatura: 0 } }
  );
}

// Orden automático por ISBN: Open Library y, si no tiene, Google Books. Un
// fallo de una fuente (no está, imagen rota, sin cupo) pasa a la siguiente;
// si ninguna sirve devuelve null y queda la tapa tipográfica del OPAC (o la
// URL que cargue el staff, que es la última opción).
export async function buscarPortadaAutomatica(item, itemTipo, { deps = DEPENDENCIAS, usuarioId = null } = {}) {
  const isbn = normalizarIsbn(item.isbn);
  if (!isbn) return null;

  if (deps.hayCupoOpenLibrary()) {
    try {
      const origen = deps.urlOpenLibrary(isbn);
      const { buffer } = await deps.descargar(origen);
      return await guardar({ item, itemTipo, fuente: "openlibrary", origen, imagen: buffer, usuarioId });
    } catch (err) {
      if (err.estado !== 404) console.warn(`Portada de Open Library para ${isbn}: ${err.message}`);
    }
  }

  try {
    const origen = await deps.buscarGoogleBooks(isbn);
    if (origen) {
      const { buffer, cacheControl, expires } = await deps.descargar(origen);
      const expiraEn = vencimientoSegunCache(cacheControl, expires);
      // Sin permiso de caché en la respuesta, guardarla violaría los
      // términos de Google: se descarta.
      if (expiraEn) return await guardar({ item, itemTipo, fuente: "googlebooks", origen, imagen: buffer, expiraEn, usuarioId });
    }
  } catch (err) {
    console.warn(`Portada de Google Books para ${isbn}: ${err.message}`);
  }
  return null;
}

// Última opción: una imagen desde una URL que pegó el staff. Los errores
// (ErrorDescarga, ErrorImagen) traen un mensaje para mostrar tal cual.
export async function portadaDesdeUrl(item, itemTipo, url, { deps = DEPENDENCIAS, usuarioId = null } = {}) {
  const { buffer } = await deps.descargar(url);
  return guardar({ item, itemTipo, fuente: "url", origen: url, imagen: buffer, usuarioId });
}

// Búsqueda en segundo plano al cargar o editar un libro con ISBN, para que
// tenga portada "por defecto" sin que nadie apriete nada. Una cola en
// memoria, de a un libro cada 3,5 s (≈85 cada 5 minutos, debajo del límite
// de Open Library), con tope de tamaño: una carga masiva por CSV no la
// desborda. Si el proceso se reinicia, lo pendiente se pierde; para eso
// está scripts/migrar-portadas.js.
const cola = [];
const MAX_COLA = 500;
const PAUSA_MS = 3500;
let trabajando = false;

export function encolarBusquedaAutomatica(libro) {
  if (process.env.PORTADAS_AUTOMATICAS === "0" || !normalizarIsbn(libro.isbn)) return false;
  if (cola.length >= MAX_COLA || cola.some((id) => String(id) === String(libro._id))) return false;
  cola.push(libro._id);
  if (!trabajando) procesarCola();
  return true;
}

async function procesarCola() {
  trabajando = true;
  while (cola.length) {
    const id = cola.shift();
    try {
      const libro = await Libro.findOne({ _id: id, eliminadoEn: null });
      if (libro && !(await Portada.exists({ itemId: id }))) await buscarPortadaAutomatica(libro, "Libro");
    } catch (err) {
      console.error("Búsqueda automática de portada:", err.message);
    }
    await new Promise((r) => setTimeout(r, PAUSA_MS).unref());
  }
  trabajando = false;
}
