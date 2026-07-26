#!/usr/bin/env node
// Renombra las cuentas Usuario con el viejo rol "biblioteca" a
// "superbibliotecario" — es literalmente lo que ya son (acceso completo
// dentro de su única biblioteca), el nuevo nombre solo refleja que ahora
// pueden además crear cuentas "bibliotecario" propias. Mismo bibliotecaId,
// ningún dato se pierde ni se toca.
//
// Igual que migrar-item-polimorfico.js: usa Usuario.collection (driver
// nativo) para no depender de que el schema de Mongoose todavía acepte
// "biblioteca" como valor válido del enum — updateMany por el driver nativo
// no aplica validación de documento. Idempotente (una segunda corrida no
// encuentra nada que migrar) y seguro de correr con el código viejo todavía
// desplegado (Mongo es schemaless; el código viejo solo lee/escribe
// "biblioteca", nunca "superbibliotecario", así que no se cruzan).
//
// Uso:
//   MONGODB_URI=... node scripts/migrar-roles-jerarquia.js
//   MONGODB_URI=... node scripts/migrar-roles-jerarquia.js --verificar   (no escribe, solo cuenta pendientes)

import dotenv from "dotenv";
import mongoose from "mongoose";
import { conectarDB, desconectarDB } from "../src/db.js";
import Usuario from "../src/models/Usuario.js";

dotenv.config();

const soloVerificar = process.argv.includes("--verificar");

export async function migrarRolesJerarquia(Modelo) {
  const coleccion = Modelo.collection;
  const filtro = { rol: "biblioteca" };
  const pendientes = await coleccion.countDocuments(filtro);
  console.log(`Usuario: ${pendientes} cuenta(s) 'biblioteca' pendiente(s) de renombrar a 'superbibliotecario'.`);

  if (soloVerificar || pendientes === 0) {
    return { pendientesAntes: pendientes, migrados: 0 };
  }

  const resultado = await coleccion.updateMany(filtro, { $set: { rol: "superbibliotecario" } });
  const migrados = resultado.modifiedCount ?? 0;
  console.log(`Usuario: ${migrados} cuenta(s) migrada(s) a 'superbibliotecario'.`);

  const restantes = await coleccion.countDocuments(filtro);
  if (restantes > 0) {
    throw new Error(`Usuario: quedaron ${restantes} cuenta(s) sin migrar — revisar antes de continuar.`);
  }
  return { pendientesAntes: pendientes, migrados };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("Falta MONGODB_URI en el entorno.");
    process.exit(1);
  }

  await conectarDB(process.env.MONGODB_URI);
  console.log(soloVerificar ? "Modo verificación (no escribe nada).\n" : "Migrando...\n");

  const resultado = await migrarRolesJerarquia(Usuario);
  console.log(`\nResumen: ${resultado.pendientesAntes} pendientes antes, ${resultado.migrados} migrados.`);

  await desconectarDB();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (err) => {
    console.error(err);
    try {
      await mongoose.disconnect();
    } catch {
      // ya desconectado o nunca conectado — no hay nada más que limpiar.
    }
    process.exit(1);
  });
}
