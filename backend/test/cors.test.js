// Prueba aislada (app propia, no la compartida de integracion.test.js) porque
// necesita levantar crearApp() con FRONTEND_URL ya seteado en el entorno —
// ver server.js: el middleware de CORS se decide una sola vez, al armar la
// app. Cubre el split "Vercel + Render" (ver DEPLOY.md).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { conectarDB, desconectarDB } from "../src/db.js";
import { crearApp } from "../src/server.js";

process.env.JWT_SECRET = "clave-de-test";
process.env.COOKIE_SECURE = "0";

let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await conectarDB(mongod.getUri());
});

after(async () => {
  await desconectarDB();
  await mongod.stop();
});

test("sin FRONTEND_URL: sin CORS (comportamiento same-origin de siempre)", async (t) => {
  delete process.env.FRONTEND_URL;
  const app = crearApp();
  const server = app.listen(0);
  const puerto = server.address().port;
  t.after(() => server.close());

  const res = await fetch(`http://127.0.0.1:${puerto}/api/health`, {
    headers: { Origin: "https://miapp.vercel.app" },
  });
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("con FRONTEND_URL: CORS con credenciales solo para ese origen", async (t) => {
  process.env.FRONTEND_URL = "https://miapp.vercel.app";
  const app = crearApp();
  const server = app.listen(0);
  const puerto = server.address().port;
  t.after(() => {
    server.close();
    delete process.env.FRONTEND_URL;
  });

  const resPermitido = await fetch(`http://127.0.0.1:${puerto}/api/health`, {
    headers: { Origin: "https://miapp.vercel.app" },
  });
  assert.equal(resPermitido.headers.get("access-control-allow-origin"), "https://miapp.vercel.app");
  assert.equal(resPermitido.headers.get("access-control-allow-credentials"), "true");

  const resOtroOrigen = await fetch(`http://127.0.0.1:${puerto}/api/health`, {
    headers: { Origin: "https://otro-sitio.com" },
  });
  assert.equal(resOtroOrigen.headers.get("access-control-allow-origin"), null);
});

test("con FRONTEND_URL: portadas y logos se pueden mostrar desde el frontend (CORP cross-origin)", async (t) => {
  const { default: Biblioteca } = await import("../src/models/Biblioteca.js");
  const { default: ImagenCms } = await import("../src/models/ImagenCms.js");
  const biblioteca = await Biblioteca.create({ nombre: "Escolar", codigo: "corp" });
  const imagen = await ImagenCms.create({
    bibliotecaId: biblioteca._id,
    datos: Buffer.from("RIFF"),
    ancho: 1,
    alto: 1,
    bytes: 4,
    subidaPor: biblioteca._id,
  });
  const ruta = `/api/v1/opac/corp/imagenes/${imagen._id}.webp`;

  delete process.env.FRONTEND_URL;
  let server = crearApp().listen(0);
  let res = await fetch(`http://127.0.0.1:${server.address().port}${ruta}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
  server.close();

  process.env.FRONTEND_URL = "https://miapp.vercel.app";
  server = crearApp().listen(0);
  t.after(() => {
    server.close();
    delete process.env.FRONTEND_URL;
  });
  res = await fetch(`http://127.0.0.1:${server.address().port}${ruta}`);
  assert.equal(res.headers.get("cross-origin-resource-policy"), "cross-origin");
  // El resto de la API sigue igual.
  res = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
});

test("con SameSite=None, salir borra la cookie con los mismos atributos (si no, el navegador la ignora)", async (t) => {
  process.env.COOKIE_SAMESITE = "none";
  process.env.COOKIE_SECURE = "1";
  const server = crearApp().listen(0);
  t.after(() => {
    server.close();
    delete process.env.COOKIE_SAMESITE;
    process.env.COOKIE_SECURE = "0";
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const ruta of ["/api/v1/auth/logout", "/api/v1/opac/corp/logout"]) {
    const res = await fetch(base + ruta, { method: "POST" });
    const cookie = res.headers.get("set-cookie") || "";
    assert.match(cookie, /Expires=Thu, 01 Jan 1970/, ruta);
    assert.match(cookie, /SameSite=None/, ruta);
    assert.match(cookie, /Secure/, ruta);
    assert.match(cookie, /HttpOnly/, ruta);
  }
});
