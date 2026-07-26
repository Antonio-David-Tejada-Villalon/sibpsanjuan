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
