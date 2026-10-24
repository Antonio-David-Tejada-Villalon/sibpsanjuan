/* Service worker de SIBPSANJUAN. Lo arma el build (ver vite.config.js):
   reemplaza __VERSION__ y __PRECARGA__ y lo publica como /sw.js.

   Qué se guarda en este dispositivo, y nada más:
   - La app (HTML, JS y CSS del catálogo público): precargada al instalar.
   - Archivos con hash (/assets/): la primera vez que se usan.
   - Portadas y logos: la primera vez que se ven, hasta 300.
   - Del catálogo público: la identidad de la biblioteca, sus páginas, las
     fichas que se miraron y la primera página del catálogo sin búsqueda.
     Cada respuesta guarda la fecha en que se guardó, para decir "es de tal
     día" sin inventarla.
   Nunca: sesiones, datos de socios, préstamos, pedidos, búsquedas con texto
   ni nada del panel. Esos pedidos ni pasan por acá: van directo a la red. */

const VERSION = "__VERSION__";
const PRECARGA = __PRECARGA__;

const CACHE_APP = `sibp-app-${VERSION}`;
const CACHE_ARCHIVOS = "sibp-archivos";
const CACHE_PORTADAS = "sibp-portadas";
const CACHE_CATALOGO = "sibp-catalogo";
const MAX_PORTADAS = 300;
const MAX_ARCHIVOS = 120;

// Respuestas públicas del catálogo que sirven sin conexión.
const PUBLICAS = /^\/api\/v1\/opac\/[a-z0-9]{1,20}\/(contenido|paginas\/[^/]+|items\/[A-Za-z]+\/[0-9a-f]{24}|buscar)$/;
const IMAGENES = /^\/api\/v1\/opac\/[a-z0-9]{1,20}\/(portadas\/[0-9a-f]{24}\/(grande|miniatura)\.webp|imagenes\/[0-9a-f]{24}\.webp)$/;
// Del catálogo solo se guarda lo que no revela qué buscó alguien: el
// listado sin texto ni filtros de autor o materia.
const PARAMETROS_PRIVADOS = ["q", "autor", "materia"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE_APP).then((cache) => cache.addAll(PRECARGA)));
  // No se activa solo: la página muestra "Hay una versión nueva" y espera
  // a que la persona elija actualizar (ver pwa.js).
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith("sibp-app-") && nombre !== CACHE_APP) await caches.delete(nombre);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "activar") self.skipWaiting();
  if (evento.data?.tipo === "limpiar") evento.waitUntil(caches.delete(CACHE_CATALOGO));
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (pedido.mode === "navigate") {
    evento.respondWith(navegar(pedido));
  } else if (PRECARGA.includes(url.pathname)) {
    evento.respondWith(caches.match(pedido, { cacheName: CACHE_APP }).then((guardada) => guardada || fetch(pedido)));
  } else if (url.pathname.startsWith("/assets/")) {
    evento.respondWith(primeroGuardado(pedido, CACHE_ARCHIVOS, MAX_ARCHIVOS));
  } else if (IMAGENES.test(url.pathname)) {
    evento.respondWith(primeroGuardado(pedido, CACHE_PORTADAS, MAX_PORTADAS));
  } else if (PUBLICAS.test(url.pathname) && esGuardable(url)) {
    evento.respondWith(primeroLaRed(pedido));
  }
  // Todo lo demás (el resto de la API, sesiones, panel) va a la red sin
  // pasar por acá ni guardarse.
});

function esGuardable(url) {
  if (!url.pathname.endsWith("/buscar")) return true;
  return !PARAMETROS_PRIVADOS.some((p) => url.searchParams.has(p));
}

// HTML: siempre el de la red (trae los metadatos de cada página); sin
// conexión, la app precargada, que resuelve la ruta en el navegador.
async function navegar(pedido) {
  try {
    return await fetch(pedido);
  } catch {
    const app = await caches.match("/index.html", { cacheName: CACHE_APP });
    return app || Response.error();
  }
}

async function primeroGuardado(pedido, nombre, maximo) {
  const guardada = await caches.match(pedido);
  if (guardada) return guardada;
  const respuesta = await fetch(pedido);
  if (respuesta.ok) {
    const cache = await caches.open(nombre);
    await cache.put(pedido, respuesta.clone());
    recortar(cache, maximo);
  }
  return respuesta;
}

// Datos públicos del catálogo: de la red si hay; si no, lo último guardado,
// avisando desde cuándo.
async function primeroLaRed(pedido) {
  const cache = await caches.open(CACHE_CATALOGO);
  try {
    const respuesta = await fetch(pedido);
    if (respuesta.ok) {
      const cuerpo = await respuesta.clone().arrayBuffer();
      const cabeceras = new Headers(respuesta.headers);
      cabeceras.set("x-sibp-guardado", new Date().toISOString());
      await cache.put(pedido, new Response(cuerpo, { status: 200, headers: cabeceras }));
    }
    return respuesta;
  } catch {
    const guardada = await cache.match(pedido);
    if (!guardada) {
      return new Response(JSON.stringify({ error: "Sin conexión, y esto todavía no estaba guardado en este dispositivo." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    const cabeceras = new Headers(guardada.headers);
    cabeceras.set("x-sibp-desde-cache", guardada.headers.get("x-sibp-guardado") || "");
    return new Response(await guardada.arrayBuffer(), { status: 200, headers: cabeceras });
  }
}

// Las más viejas primero (cache.keys() respeta el orden en que se guardaron).
async function recortar(cache, maximo) {
  const claves = await cache.keys();
  for (const clave of claves.slice(0, Math.max(0, claves.length - maximo))) await cache.delete(clave);
}
