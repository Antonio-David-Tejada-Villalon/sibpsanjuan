#!/usr/bin/env node
// Levanta un Mongo descartable en memoria + el backend, con un admin de
// desarrollo ya creado. Pensado solo para mirar/probar la app en el
// navegador — los datos se pierden al cortar el proceso (Ctrl+C).
//
// Uso:
//   npm run dev:local
//
// Después, en otra terminal: cd ../frontend && npm run dev
// y abrís http://localhost:5173 — usuario "admin", contraseña "dev12345".

import { MongoMemoryServer } from "mongodb-memory-server";
import bcrypt from "bcryptjs";
import { conectarDB } from "../src/db.js";
import { crearApp } from "../src/server.js";
import Usuario from "../src/models/Usuario.js";

process.env.JWT_SECRET ||= "clave-de-desarrollo-no-usar-en-produccion";
process.env.COOKIE_SECURE ||= "0";

const mongod = await MongoMemoryServer.create();
await conectarDB(mongod.getUri());

const usuario = "admin";
const password = "dev12345";
if (!(await Usuario.findOne({ usuario }))) {
  const passwordHash = await bcrypt.hash(password, 10);
  await Usuario.create({ usuario, passwordHash, rol: "admin", bibliotecaId: null });
}

const app = crearApp();
const puerto = process.env.PORT || 3000;
app.listen(puerto, () => {
  console.log(`
Backend de desarrollo en http://localhost:${puerto}
Mongo en memoria (los datos se pierden al cortar con Ctrl+C)

Admin de prueba -> usuario: ${usuario}  contraseña: ${password}

Ahora, en otra terminal:
  cd ../frontend && npm run dev
y abrí http://localhost:5173
`);
});

process.on("SIGINT", async () => {
  await mongod.stop();
  process.exit(0);
});
