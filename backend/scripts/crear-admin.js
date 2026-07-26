#!/usr/bin/env node
// Da de alta (o resetea la contraseña de) el usuario admin. Se corre una
// sola vez para arrancar, y de nuevo si hace falta recuperar el acceso.
//
// Uso:
//   MONGODB_URI=... node scripts/crear-admin.js <usuario> <password>

import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { conectarDB, desconectarDB } from "../src/db.js";
import Usuario from "../src/models/Usuario.js";

dotenv.config();

async function main() {
  const [usuario, password] = process.argv.slice(2);
  if (!usuario || !password) {
    console.error("Uso: node scripts/crear-admin.js <usuario> <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("La contraseña tiene que tener al menos 8 caracteres.");
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error("Falta MONGODB_URI en el entorno.");
    process.exit(1);
  }

  await conectarDB(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash(password, 10);

  const existente = await Usuario.findOne({ usuario });
  if (existente) {
    existente.passwordHash = passwordHash;
    existente.rol = "admin";
    existente.bibliotecaId = null;
    await existente.save();
    console.log(`Contraseña actualizada para el admin '${usuario}'.`);
  } else {
    await Usuario.create({ usuario, passwordHash, rol: "admin", bibliotecaId: null });
    console.log(`Admin '${usuario}' creado.`);
  }

  await desconectarDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
