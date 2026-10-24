#!/usr/bin/env node
// Pasa las portadas ya cargadas al esquema nuevo (ver models/Portada.js):
// antes el OPAC mostraba directo la URL externa de "portadaUrl"; ahora solo
// muestra portadas descargadas y procesadas por el servidor, así que sin
// esta migración esos ítems quedarían con la tapa tipográfica.
//
// - Por defecto: cada ítem (de los 10 tipos) con portadaUrl y sin portada
//   procesada se descarga por la misma vía segura que usa el panel.
// - --buscar-isbn: además, a cada libro con ISBN y sin portada se la busca
//   en Open Library y Google Books, de a uno cada 3,5 s para respetar el
//   límite de Open Library (100 pedidos cada 5 minutos). No es un rastreo
//   del catálogo de Open Library: un pedido por libro propio.
// - --verificar: solo cuenta lo pendiente, sin descargar nada.
//
// Idempotente: lo que ya tiene portada se saltea.
//
// Uso:
//   MONGODB_URI=... node scripts/migrar-portadas.js [--buscar-isbn] [--verificar]

import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { conectarDB, desconectarDB } from "../src/db.js";
import Portada from "../src/models/Portada.js";
import RecursoElectronico from "../src/models/RecursoElectronico.js";
import Archivo from "../src/models/Archivo.js";
import Objeto from "../src/models/Objeto.js";
import { MODELOS_POR_TIPO } from "../src/circulacion/tiposCirculantes.js";
import { buscarPortadaAutomatica, portadaDesdeUrl, normalizarIsbn, DEPENDENCIAS } from "../src/portadas/servicio.js";

dotenv.config();

const MODELOS = { ...MODELOS_POR_TIPO, RecursoElectronico, Archivo, Objeto };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export async function migrarPortadas({ buscarIsbn = false, soloVerificar = false, deps = DEPENDENCIAS, pausaMs = 1000 } = {}) {
  const resumen = { desdeUrl: 0, porIsbn: 0, fallidas: [], pendientes: 0 };
  const conPortada = new Set((await Portada.find().select("itemId")).map((p) => String(p.itemId)));

  for (const [itemTipo, Modelo] of Object.entries(MODELOS)) {
    const items = await Modelo.find({ eliminadoEn: null, portadaUrl: { $nin: [null, ""] } });
    for (const item of items.filter((i) => !conPortada.has(String(i._id)))) {
      resumen.pendientes++;
      if (soloVerificar) continue;
      try {
        await portadaDesdeUrl(item, itemTipo, item.portadaUrl, { deps });
        conPortada.add(String(item._id));
        resumen.desdeUrl++;
      } catch (err) {
        resumen.fallidas.push({ itemTipo, id: String(item._id), motivo: err.message });
      }
      await pausa(pausaMs);
    }
  }

  if (buscarIsbn) {
    const libros = await MODELOS.Libro.find({ eliminadoEn: null, isbn: { $nin: [null, ""] } });
    for (const libro of libros.filter((l) => !conPortada.has(String(l._id)) && normalizarIsbn(l.isbn))) {
      resumen.pendientes++;
      if (soloVerificar) continue;
      if (await buscarPortadaAutomatica(libro, "Libro", { deps })) resumen.porIsbn++;
      await pausa(Math.max(pausaMs, 3500));
    }
  }
  return resumen;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("Falta MONGODB_URI en el entorno.");
    process.exit(1);
  }
  const soloVerificar = process.argv.includes("--verificar");
  const buscarIsbn = process.argv.includes("--buscar-isbn");
  await conectarDB(process.env.MONGODB_URI);
  console.log(soloVerificar ? "Modo verificación (no descarga nada).\n" : "Migrando portadas...\n");
  const r = await migrarPortadas({ buscarIsbn, soloVerificar });
  for (const f of r.fallidas) console.log(`No se pudo: ${f.itemTipo} ${f.id} — ${f.motivo}`);
  console.log(
    `\nResumen: ${r.pendientes} pendientes, ${r.desdeUrl} desde su URL, ${r.porIsbn} encontradas por ISBN, ${r.fallidas.length} fallidas.`
  );
  await desconectarDB();
}

// pathToFileURL: en Windows la comparación con `file://${argv[1]}` nunca daba true.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (err) => {
    console.error(err);
    try {
      await mongoose.disconnect();
    } catch {
      // ya desconectado o nunca conectado.
    }
    process.exit(1);
  });
}
