import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import sharp from "sharp";
import { descargarImagen, esDireccionPublica } from "../src/portadas/descargar.js";
import { procesarPortada } from "../src/portadas/procesar.js";
import { vencimientoSegunCache } from "../src/portadas/fuentes.js";

// Servidor local que hace de "sitio externo". Como 127.0.0.1 está bloqueado
// (bien), los tests le dan al descargador un nombre falso que resuelve ahí
// y lo permiten explícitamente; todo lo demás sigue con las reglas reales.
let servidor;
let puerto;
let jpeg;

before(async () => {
  jpeg = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#1f2937" } })
    .withMetadata({ exif: { IFD0: { Copyright: "dato privado de la cámara" } } })
    .jpeg()
    .toBuffer();
  servidor = http.createServer((req, res) => {
    if (req.url === "/tapa.jpg") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      return res.end(jpeg);
    }
    if (req.url === "/redirige") {
      res.writeHead(302, { Location: "/tapa.jpg" });
      return res.end();
    }
    if (req.url === "/a-metadatos") {
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    if (req.url === "/bucle") {
      res.writeHead(302, { Location: "/bucle" });
      return res.end();
    }
    if (req.url === "/enorme") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      return res.end(Buffer.alloc(6 * 1024 * 1024));
    }
    if (req.url === "/lenta") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      return res.write(jpeg.subarray(0, 10)); // nunca termina
    }
    if (req.url === "/pagina") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<h1>hola</h1>");
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  puerto = String(servidor.address().port);
});

after(() => {
  servidor.closeAllConnections();
  servidor.close();
});

const PRUEBA = () => ({
  resolver: async (host) =>
    host === "portadas.prueba"
      ? [{ address: "127.0.0.1", family: 4 }]
      : host === "interno.prueba"
        ? [{ address: "10.0.0.5", family: 4 }]
        : [{ address: "93.184.215.14", family: 4 }],
  permitirDireccion: (ip) => ip === "127.0.0.1" || esDireccionPublica(ip),
  puertosPermitidos: ["80", "443", puerto],
});
const url = (ruta) => `http://portadas.prueba:${puerto}${ruta}`;

test("esDireccionPublica: bloquea privadas, loopback, link-local, metadatos y mapeadas", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
    assert.equal(esDireccionPublica(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "207.241.224.2", "2001:4860:4860::8888"]) {
    assert.equal(esDireccionPublica(ip), true, ip);
  }
  assert.equal(esDireccionPublica("no-es-ip"), false);
});

test("descargarImagen: rechaza direcciones peligrosas antes de conectar", async () => {
  const casos = [
    ["http://127.0.0.1/tapa.jpg", "DESTINO_BLOQUEADO"],
    ["http://169.254.169.254/latest/meta-data/", "DESTINO_BLOQUEADO"],
    ["http://[::1]/tapa.jpg", "DESTINO_BLOQUEADO"],
    ["ftp://ejemplo.org/tapa.jpg", "PROTOCOLO"],
    ["file:///etc/passwd", "PROTOCOLO"],
    ["http://usuario:clave@ejemplo.org/tapa.jpg", "CREDENCIALES"],
    ["http://ejemplo.org:8080/tapa.jpg", "PUERTO"],
    ["no es una url", "URL_INVALIDA"],
  ];
  for (const [direccion, codigo] of casos) {
    await assert.rejects(descargarImagen(direccion), (err) => err.codigo === codigo, direccion);
  }
});

test("descargarImagen: un nombre que resuelve a una IP interna se bloquea al conectar", async () => {
  await assert.rejects(
    descargarImagen(`http://interno.prueba:${puerto}/tapa.jpg`, PRUEBA()),
    (err) => err.codigo === "DESTINO_BLOQUEADO"
  );
});

test("descargarImagen: descarga, sigue redirecciones y revalida cada salto", async () => {
  const directa = await descargarImagen(url("/tapa.jpg"), PRUEBA());
  assert.equal(directa.tipo, "image/jpeg");
  assert.equal(directa.buffer.length, jpeg.length);
  const redirigida = await descargarImagen(url("/redirige"), PRUEBA());
  assert.equal(redirigida.buffer.length, jpeg.length);
  assert.match(redirigida.urlFinal, /\/tapa\.jpg$/);
  await assert.rejects(descargarImagen(url("/a-metadatos"), PRUEBA()), (err) => err.codigo === "DESTINO_BLOQUEADO");
  await assert.rejects(descargarImagen(url("/bucle"), PRUEBA()), (err) => err.codigo === "REDIRECCIONES");
});

test("descargarImagen: límites de tamaño, tiempo, tipo y estado", async () => {
  await assert.rejects(descargarImagen(url("/enorme"), PRUEBA()), (err) => err.codigo === "TAMANO");
  await assert.rejects(descargarImagen(url("/lenta"), { ...PRUEBA(), timeoutMs: 300 }), (err) => err.codigo === "TIEMPO");
  await assert.rejects(descargarImagen(url("/pagina"), PRUEBA()), (err) => err.codigo === "NO_ES_IMAGEN");
  await assert.rejects(descargarImagen(url("/no-existe"), PRUEBA()), (err) => err.codigo === "ESTADO" && err.estado === 404);
});

test("procesarPortada: WebP de 360 y 120 px, sin EXIF", async () => {
  const p = await procesarPortada(jpeg);
  assert.equal(p.ancho, 360);
  assert.equal(p.alto, 540);
  const metaGrande = await sharp(p.grande).metadata();
  assert.equal(metaGrande.format, "webp");
  assert.equal(metaGrande.exif, undefined, "el EXIF no pasa a la portada");
  assert.equal((await sharp(p.miniatura).metadata()).width, 120);
});

test("procesarPortada: rechaza SVG, imágenes diminutas y archivos que no son imagen", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><script>alert(1)</script></svg>');
  await assert.rejects(procesarPortada(svg), /formato/);
  const diminuta = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
  await assert.rejects(procesarPortada(diminuta), /demasiado chica/);
  await assert.rejects(procesarPortada(Buffer.from("esto no es una imagen")), /no es una imagen válida/);
});

test("vencimientoSegunCache: solo permite guardar lo que la cabecera de caché permite", () => {
  const ahora = Date.parse("2026-10-24T12:00:00Z");
  assert.equal(vencimientoSegunCache("public, max-age=3600", "", ahora).toISOString(), "2026-10-24T13:00:00.000Z");
  assert.equal(vencimientoSegunCache("", "Sat, 24 Oct 2026 15:00:00 GMT", ahora).toISOString(), "2026-10-24T15:00:00.000Z");
  assert.equal(vencimientoSegunCache("no-store", "", ahora), null);
  assert.equal(vencimientoSegunCache("private, max-age=600", "", ahora), null);
  assert.equal(vencimientoSegunCache("max-age=0", "", ahora), null);
  assert.equal(vencimientoSegunCache("", "", ahora), null, "sin cabecera no se guarda");
});
