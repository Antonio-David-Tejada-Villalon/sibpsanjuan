// Detrás de Vercel (ver middleware/proxy.js y DEPLOY.md): el IP del
// visitante solo se toma de las cabeceras de Vercel si llega el secreto
// compartido, y el límite de ingreso cuenta por visitante, no por Vercel.
// App propia por test: el límite de intentos guarda su cuenta en memoria.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { conectarDB, desconectarDB } from "../src/db.js";
import { crearApp } from "../src/server.js";
import Usuario from "../src/models/Usuario.js";

process.env.JWT_SECRET = "clave-de-test";
process.env.COOKIE_SECURE = "0";

let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await conectarDB(mongod.getUri());
  await Usuario.create({ usuario: "jefa", passwordHash: await bcrypt.hash("clave-correcta", 4), rol: "admin", bibliotecaId: null });
});

after(async () => {
  await desconectarDB();
  await mongod.stop();
});

function levantar(t, entorno = {}) {
  const antes = {};
  for (const [k, v] of Object.entries(entorno)) {
    antes[k] = process.env[k];
    process.env[k] = v;
  }
  const server = crearApp().listen(0);
  t.after(() => {
    server.close();
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  return `http://127.0.0.1:${server.address().port}`;
}

const SECRETO = "s3creto-compartido-con-vercel";

test("sin el secreto, las cabeceras de IP no se creen (cualquiera las puede inventar)", async (t) => {
  const base = levantar(t, { PROXY_SECRETO: SECRETO });
  for (const cabeceras of [{}, { "x-sibp-proxy": "otro", "x-vercel-forwarded-for": "203.0.113.9" }]) {
    const salud = await (await fetch(`${base}/api/health`, { headers: cabeceras })).json();
    assert.equal(salud.viaProxy, false);
    assert.equal(salud.ipSegun, "conexion");
  }
});

test("con el secreto, el IP del visitante sale de las cabeceras de Vercel", async (t) => {
  const base = levantar(t, { PROXY_SECRETO: SECRETO });
  let salud = await (
    await fetch(`${base}/api/health`, { headers: { "x-sibp-proxy": SECRETO, "x-vercel-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.1" } })
  ).json();
  assert.deepEqual([salud.viaProxy, salud.ipSegun], [true, "x-vercel-forwarded-for"]);
  salud = await (await fetch(`${base}/api/health`, { headers: { "x-sibp-proxy": SECRETO, "x-real-ip": "198.51.100.1" } })).json();
  assert.equal(salud.ipSegun, "x-real-ip");
  // Un valor que no es un IP no se usa.
  salud = await (await fetch(`${base}/api/health`, { headers: { "x-sibp-proxy": SECRETO, "x-real-ip": "<script>" } })).json();
  assert.equal(salud.ipSegun, "conexion");
});

async function ingresar(base, password, cabeceras = {}) {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabeceras },
    body: JSON.stringify({ usuario: "jefa", password }),
  });
  return res.status;
}

test("el límite de ingreso es por visitante detrás de Vercel, y solo cuentan los intentos fallidos", async (t) => {
  const base = levantar(t, { PROXY_SECRETO: SECRETO, LOGIN_RATE_LIMIT: "3" });
  const desde = (ip) => ({ "x-sibp-proxy": SECRETO, "x-vercel-forwarded-for": ip });

  // Ingresos correctos no gastan intentos.
  for (let i = 0; i < 5; i++) assert.equal(await ingresar(base, "clave-correcta", desde("203.0.113.1")), 200);

  // Tres errores desde un visitante lo bloquean a él...
  for (let i = 0; i < 3; i++) assert.equal(await ingresar(base, "mal", desde("203.0.113.1")), 401);
  assert.equal(await ingresar(base, "mal", desde("203.0.113.1")), 429);
  // ...pero no a otro que entra por el mismo Vercel.
  assert.equal(await ingresar(base, "clave-correcta", desde("203.0.113.2")), 200);

  // Sin el secreto, inventar otro IP no da intentos nuevos.
  for (let i = 0; i < 3; i++) await ingresar(base, "mal", { "x-vercel-forwarded-for": `198.51.100.${i}` });
  assert.equal(await ingresar(base, "mal", { "x-vercel-forwarded-for": "198.51.100.99" }), 429);
});

test("la API no se guarda en cachés compartidos salvo lo que es público", async (t) => {
  const base = levantar(t);
  const res = await fetch(`${base}/api/v1/auth/yo`);
  assert.equal(res.headers.get("cache-control"), "private, no-cache");
});

test("Render como solo API (sin build): quien entra directo va al sitio; los bots que reenvía Vercel reciben los metadatos", async (t) => {
  const antes = { SITIO_URL: process.env.SITIO_URL, PROXY_SECRETO: process.env.PROXY_SECRETO };
  process.env.SITIO_URL = "https://biblioteca.example";
  process.env.PROXY_SECRETO = SECRETO;
  const server = crearApp({ distDir: "/no/existe" }).listen(0);
  t.after(() => {
    server.close();
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const ruta of ["/libros", "/opac/escolar?q=x"]) {
    const res = await fetch(base + ruta, { redirect: "manual" });
    assert.equal(res.status, 302, ruta);
    assert.equal(res.headers.get("location"), `https://biblioteca.example${ruta}`);
  }
  const res = await fetch(`${base}/opac/noexiste`, { redirect: "manual", headers: { "x-sibp-proxy": SECRETO } });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /<meta name="robots" content="noindex,nofollow" \/>/);
  // La API y robots.txt siguen respondiendo acá.
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap: https:\/\/biblioteca\.example\/sitemap\.xml/);
});
