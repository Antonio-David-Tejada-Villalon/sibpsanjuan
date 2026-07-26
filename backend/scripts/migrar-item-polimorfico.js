#!/usr/bin/env node
// Migra los documentos existentes de Ejemplar/Prestamo/Solicitud del viejo
// campo fijo "libroId" al nuevo par polimórfico "itemTipo"/"itemId" (ver el
// comentario en models/Ejemplar.js). No borra "libroId" — eso queda para un
// script de limpieza aparte, una vez pasado un período de confianza.
//
// Seguro de correr con el código VIEJO todavía desplegado y sirviendo
// tráfico: Mongo no tiene esquema fijo, así que los campos nuevos que este
// script agrega no le importan al código que todavía solo lee/escribe
// "libroId". Es además idempotente: cada corrida excluye los documentos que
// ya tienen itemId, así que repetirla (por una corrida interrumpida a la
// mitad, por ejemplo) no hace daño.
//
// Uso:
//   MONGODB_URI=... node scripts/migrar-item-polimorfico.js
//   MONGODB_URI=... node scripts/migrar-item-polimorfico.js --verificar   (no escribe, solo cuenta pendientes)

import dotenv from "dotenv";
import mongoose from "mongoose";
import { conectarDB, desconectarDB } from "../src/db.js";
import Ejemplar from "../src/models/Ejemplar.js";
import Prestamo from "../src/models/Prestamo.js";
import Solicitud from "../src/models/Solicitud.js";

dotenv.config();

const soloVerificar = process.argv.includes("--verificar");

// Documentos creados antes de esta migración tienen "libroId" (String u
// ObjectId ya guardado) y todavía no tienen "itemId". El pipeline de
// agregación permite copiar el valor de un campo a otro en el mismo
// updateMany — requiere Mongo >= 4.2 (Atlas free tier lo soporta).
//
// Usa Modelo.collection (el driver nativo) en vez del Model de Mongoose a
// propósito: con `mongoose.set("strictQuery", true)` (ver src/db.js),
// Mongoose descarta en silencio cualquier condición del filtro sobre un
// campo que ya no está en el schema — y "libroId" es exactamente eso, ya
// que se quitó del schema al generalizar a itemTipo/itemId. Filtrar con el
// Model dejaría el filtro reducido a solo `{itemId:{$exists:false}}`, que
// también matchea documentos que nunca debieron tener itemId (ej. una
// Solicitud de renovación) y los contaminaría con un itemTipo inventado.
// El driver nativo no aplica ese casteo — ve el filtro tal cual se escribe.
//
// Exportada (no solo de uso interno) para que el test de integración pueda
// ejercitar la misma lógica contra el mongod en memoria compartido, sin que
// este script abra una segunda conexión (ver backend/test/integracion.test.js).
export async function migrarColeccion(Modelo, nombre) {
  const coleccion = Modelo.collection;
  const filtro = { libroId: { $exists: true }, itemId: { $exists: false } };
  const pendientes = await coleccion.countDocuments(filtro);
  console.log(`${nombre}: ${pendientes} documento(s) pendiente(s) de migrar.`);

  if (soloVerificar || pendientes === 0) {
    return { nombre, pendientesAntes: pendientes, migrados: 0 };
  }

  const resultado = await coleccion.updateMany(filtro, [
    { $set: { itemTipo: "Libro", itemId: "$libroId" } },
  ]);
  const migrados = resultado.modifiedCount ?? 0;
  console.log(`${nombre}: ${migrados} documento(s) migrado(s) a itemTipo/itemId.`);

  const restantes = await coleccion.countDocuments(filtro);
  if (restantes > 0) {
    throw new Error(
      `${nombre}: quedaron ${restantes} documento(s) sin migrar después de la corrida — revisar antes de continuar.`
    );
  }
  return { nombre, pendientesAntes: pendientes, migrados };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("Falta MONGODB_URI en el entorno.");
    process.exit(1);
  }

  await conectarDB(process.env.MONGODB_URI);
  console.log(soloVerificar ? "Modo verificación (no escribe nada).\n" : "Migrando...\n");

  const resultados = [];
  resultados.push(await migrarColeccion(Ejemplar, "Ejemplar"));
  resultados.push(await migrarColeccion(Prestamo, "Prestamo"));
  // Solicitud: solo las de tipo "prestamo" tienen libroId — las de
  // "renovacion" nunca lo tuvieron, y el filtro ya las excluye solas
  // (libroId: {$exists:true} no matchea documentos que nunca tuvieron ese
  // campo).
  resultados.push(await migrarColeccion(Solicitud, "Solicitud"));

  console.log("\nResumen:");
  for (const r of resultados) {
    console.log(`  ${r.nombre}: ${r.pendientesAntes} pendientes antes, ${r.migrados} migrados.`);
  }

  await desconectarDB();
}

// Igual que server.js: solo corre main() si se invoca directo (node
// scripts/migrar-item-polimorfico.js), no cuando otro módulo (el test de
// integración) importa migrarColeccion().
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
