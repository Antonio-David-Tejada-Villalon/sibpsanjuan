// Fuentes automáticas de portadas, en el orden que pide el proyecto:
// Open Library y después Google Books (Amazon quedó descartado). Las dos se
// consultan por ISBN y solo cuando el staff lo pide o al cargar un libro,
// nunca recorriendo el catálogo en masa.

// Open Library: "intended for displaying covers", no para descargas
// masivas, y limita a 100 pedidos cada 5 minutos por IP las búsquedas por
// ISBN (https://openlibrary.org/dev/docs/api/covers). Este límite propio,
// por proceso, queda por debajo. default=false: sin portada responde 404
// en vez de una imagen en blanco.
export function urlOpenLibrary(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`;
}

const VENTANA_OPEN_LIBRARY_MS = 5 * 60 * 1000;
const MAXIMO_OPEN_LIBRARY = 90;
let pedidosOpenLibrary = [];

export function hayCupoOpenLibrary(ahora = Date.now()) {
  pedidosOpenLibrary = pedidosOpenLibrary.filter((t) => ahora - t < VENTANA_OPEN_LIBRARY_MS);
  if (pedidosOpenLibrary.length >= MAXIMO_OPEN_LIBRARY) return false;
  pedidosOpenLibrary.push(ahora);
  return true;
}

// Google Books: la API sin clave comparte una cuota anónima que se agota
// seguido; en producción conviene GOOGLE_BOOKS_API_KEY. Devuelve la URL de
// la miniatura o null si el libro no está o no tiene imagen.
export async function buscarGoogleBooks(isbn, { fetchImpl = fetch } = {}) {
  const parametros = new URLSearchParams({ q: `isbn:${isbn}`, fields: "items(volumeInfo/imageLinks)", maxResults: "1" });
  if (process.env.GOOGLE_BOOKS_API_KEY) parametros.set("key", process.env.GOOGLE_BOOKS_API_KEY);
  const res = await fetchImpl(`https://www.googleapis.com/books/v1/volumes?${parametros}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const datos = await res.json();
  const enlaces = datos?.items?.[0]?.volumeInfo?.imageLinks;
  const url = enlaces?.thumbnail || enlaces?.smallThumbnail;
  return url ? url.replace(/^http:/, "https:") : null;
}

// Los Términos de las APIs de Google (§5e) no permiten guardar copias
// permanentes del contenido ni conservarlas más de lo que permite la
// cabecera de caché. Devuelve hasta cuándo se puede guardar la imagen, o
// null si la respuesta no permite guardarla (y entonces no se usa).
export function vencimientoSegunCache(cacheControl, expires, ahora = Date.now()) {
  const cc = String(cacheControl || "").toLowerCase();
  if (/(^|,)\s*(no-store|no-cache|private)\b/.test(cc)) return null;
  const maxAge = cc.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/);
  if (maxAge) {
    const segundos = Number(maxAge[1]);
    return segundos > 0 ? new Date(ahora + segundos * 1000) : null;
  }
  const fecha = expires ? Date.parse(expires) : NaN;
  return Number.isFinite(fecha) && fecha > ahora ? new Date(fecha) : null;
}
