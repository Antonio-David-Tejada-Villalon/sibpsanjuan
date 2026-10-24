// El service worker (sw.js) ejecutado en un entorno falso: un CacheStorage
// en memoria y una red que se puede cortar. Controla qué se guarda en el
// dispositivo (y sobre todo qué NO) y qué se responde sin conexión.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { URL as URLDeNode, fileURLToPath } from "node:url";

const ORIGEN = "https://biblioteca.example";
const fuente = readFileSync(fileURLToPath(new URLDeNode("./sw.js", import.meta.url)), "utf8")
  .replace('const VERSION = "__VERSION__";', 'const VERSION = "v2";')
  .replace("const PRECARGA = __PRECARGA__;", 'const PRECARGA = ["/index.html", "/logo-64.png", "/assets/index-abc.js"];');

const clave = (r) => (typeof r === "string" ? new URL(r, ORIGEN).href : r.url);

class CacheFalso {
  constructor(red) {
    this.mapa = new Map();
    this.red = red;
  }
  async match(r) {
    return this.mapa.get(clave(r))?.clone();
  }
  async put(r, respuesta) {
    this.mapa.set(clave(r), respuesta.clone());
  }
  async keys() {
    return [...this.mapa.keys()].map((u) => new Request(u));
  }
  async delete(r) {
    return this.mapa.delete(clave(r));
  }
  async addAll(urls) {
    for (const u of urls) this.mapa.set(clave(u), await this.red(new Request(clave(u))));
  }
}

class CachesFalsos {
  constructor(red) {
    this.cajas = new Map();
    this.red = red;
  }
  async open(nombre) {
    if (!this.cajas.has(nombre)) this.cajas.set(nombre, new CacheFalso(this.red));
    return this.cajas.get(nombre);
  }
  async keys() {
    return [...this.cajas.keys()];
  }
  async delete(nombre) {
    return this.cajas.delete(nombre);
  }
  async match(r, opciones = {}) {
    const cajas = opciones.cacheName ? [this.cajas.get(opciones.cacheName)] : [...this.cajas.values()];
    for (const caja of cajas) {
      const encontrada = await caja?.match(r);
      if (encontrada) return encontrada;
    }
    return undefined;
  }
  guardadas() {
    return [...this.cajas.values()].flatMap((c) => [...c.mapa.keys()]).map((u) => u.replace(ORIGEN, ""));
  }
}

let sinConexion;
let oyentes;
let caches;
let entorno;

const red = vi.fn(async (pedido) => {
  if (sinConexion) throw new TypeError("Failed to fetch");
  const url = new URL(pedido.url);
  return new Response(JSON.stringify({ desde: "red", ruta: url.pathname + url.search }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function cargar() {
  oyentes = {};
  caches = new CachesFalsos(red);
  entorno = {
    location: { origin: ORIGEN },
    addEventListener: (tipo, fn) => (oyentes[tipo] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}) },
  };
  vm.runInNewContext(fuente, { self: entorno, caches, fetch: red, Response, Headers, Request, URL, JSON, Date, Math, Promise, console });
}

// Un pedido como los del navegador. Devuelve la respuesta del service
// worker, o null si lo dejó pasar directo a la red (sin tocar ningún caché).
async function pedir(ruta, { modo = "cors", metodo = "GET" } = {}) {
  const request = new Request(ruta.startsWith("http") ? ruta : ORIGEN + ruta, { method: metodo });
  Object.defineProperty(request, "mode", { value: modo });
  let respuesta = null;
  oyentes.fetch({ request, respondWith: (p) => (respuesta = p) });
  return respuesta ? await respuesta : null;
}

async function evento(tipo, datos) {
  let espera;
  oyentes[tipo]({ data: datos, waitUntil: (p) => (espera = p) });
  await espera;
}

describe("service worker", () => {
  beforeEach(() => {
    sinConexion = false;
    red.mockClear();
    cargar();
  });

  it("al instalarse precarga la app, y al activarse borra las versiones viejas", async () => {
    await caches.open("sibp-app-v1");
    await evento("install");
    expect(caches.guardadas()).toEqual(["/index.html", "/logo-64.png", "/assets/index-abc.js"]);
    expect(entorno.skipWaiting).not.toHaveBeenCalled(); // espera a "Actualizar"
    await evento("activate");
    expect(await caches.keys()).toEqual(["sibp-app-v2"]);
    await evento("message", { tipo: "activar" });
    expect(entorno.skipWaiting).toHaveBeenCalled();
  });

  it("sin conexión, cualquier página abre la app precargada, con sus archivos (el logo incluido)", async () => {
    await evento("install");
    sinConexion = true;
    const respuesta = await pedir("/opac/escolar/libro/martin-fierro-1", { modo: "navigate" });
    expect(await respuesta.text()).toContain('"/index.html"');
    for (const archivo of ["/logo-64.png", "/assets/index-abc.js"]) {
      expect((await pedir(archivo, { modo: "no-cors" })).status, archivo).toBe(200);
    }
  });

  it("datos públicos: de la red si hay; sin conexión, lo guardado con la fecha real en que se guardó", async () => {
    const antes = Date.now();
    const enLinea = await pedir("/api/v1/opac/escolar/contenido");
    expect((await enLinea.json()).desde).toBe("red");
    expect(enLinea.headers.get("x-sibp-desde-cache")).toBeNull();

    sinConexion = true;
    const guardada = await pedir("/api/v1/opac/escolar/contenido");
    expect(guardada.status).toBe(200);
    const fecha = Date.parse(guardada.headers.get("x-sibp-desde-cache"));
    expect(fecha).toBeGreaterThanOrEqual(antes);
    expect(fecha).toBeLessThanOrEqual(Date.now());

    const nunca = await pedir("/api/v1/opac/escolar/items/Libro/aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(nunca.status).toBe(503);
    expect((await nunca.json()).error).toMatch(/Sin conexión/);
  });

  it("nunca guarda sesiones, datos de socios, préstamos, pedidos ni nada del panel", async () => {
    const privadas = [
      "/api/v1/opac/escolar/yo",
      "/api/v1/opac/escolar/mis-prestamos",
      "/api/v1/opac/escolar/mis-solicitudes",
      "/api/v1/opac/escolar/mis-reglas",
      "/api/v1/auth/yo",
      "/api/v1/socios?bibliotecaId=1",
      "/api/v1/circulacion/prestamos",
      "/api/v1/contenido/vista-previa",
      "/api/v1/export/socios.csv",
    ];
    for (const ruta of privadas) expect(await pedir(ruta), ruta).toBeNull();
    expect(await pedir("/api/v1/opac/escolar/login", { metodo: "POST" })).toBeNull();
    expect(await pedir("/api/v1/opac/escolar/solicitudes", { metodo: "POST" })).toBeNull();
    expect(caches.guardadas()).toEqual([]);
  });

  it("del catálogo no guarda lo que revela qué buscó alguien", async () => {
    for (const consulta of ["q=borges", "autor=Borges%2C+Jorge+Luis", "materia=Cuentos", "q=x&tipo=Libro"]) {
      expect(await pedir(`/api/v1/opac/escolar/buscar?${consulta}`), consulta).toBeNull();
    }
    await pedir("/api/v1/opac/escolar/buscar");
    await pedir("/api/v1/opac/escolar/buscar?tipo=Libro&pagina=2");
    expect(caches.guardadas()).toEqual(["/api/v1/opac/escolar/buscar", "/api/v1/opac/escolar/buscar?tipo=Libro&pagina=2"]);
  });

  it("portadas y archivos: primero lo guardado; las portadas, como mucho 300", async () => {
    const ruta = (i) => `/api/v1/opac/escolar/portadas/${String(i).padStart(24, "0")}/miniatura.webp`;
    await pedir(ruta(1));
    await pedir(ruta(1));
    expect(red).toHaveBeenCalledTimes(1);
    for (let i = 2; i <= 301; i++) await pedir(ruta(i));
    await new Promise((r) => setTimeout(r, 0));
    const portadas = caches.guardadas().filter((u) => u.includes("/portadas/"));
    expect(portadas).toHaveLength(300);
    expect(portadas).not.toContain(ruta(1));

    sinConexion = true;
    expect((await pedir(ruta(301))).status).toBe(200);
  });

  it("otros sitios no pasan por el service worker", async () => {
    expect(await pedir("https://covers.openlibrary.org/b/isbn/1.jpg")).toBeNull();
  });

  it("al cerrar sesión se borra el catálogo guardado (lo que se miró)", async () => {
    await pedir("/api/v1/opac/escolar/items/Libro/aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(caches.guardadas()).toHaveLength(1);
    await evento("message", { tipo: "limpiar" });
    expect(caches.guardadas()).toEqual([]);
  });
});
