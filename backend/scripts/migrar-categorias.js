#!/usr/bin/env node
// Prepara las bibliotecas que ya existían antes de las categorías de socio
// (ver models/Categoria.js): a cada una le agrega Alumno y Docente, y da de
// alta como categoría cada código que sus socios ya tienen cargado (ej.
// "ADULTO"), sin reglas propias — así ningún socio queda con una categoría
// "fantasma" y todos siguen con la regla general de la biblioteca, igual
// que hasta ahora. No toca ningún socio ni ningún préstamo.
//
// Un código que no entra en el formato de Categoria (más de 10 caracteres,
// espacios, acentos) no se puede dar de alta solo: se lista al final para
// que el staff les asigne a mano una categoría a esos socios. Mientras
// tanto siguen con la regla general.
//
// Idempotente (una segunda corrida no crea nada).
//
// Uso:
//   MONGODB_URI=... node scripts/migrar-categorias.js
//   MONGODB_URI=... node scripts/migrar-categorias.js --verificar   (no escribe, solo cuenta pendientes)

import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { conectarDB, desconectarDB } from "../src/db.js";
import Biblioteca from "../src/models/Biblioteca.js";
import Categoria from "../src/models/Categoria.js";
import Socio from "../src/models/Socio.js";
import { CATEGORIAS_BASE, asegurarCategorias, normalizarCodigoCategoria } from "../src/circulacion/categorias.js";

dotenv.config();

const FORMATO_CODIGO = /^[A-Z0-9_-]{1,10}$/;

function nombreDesdeCodigo(codigo) {
  return codigo.charAt(0) + codigo.slice(1).toLowerCase();
}

export async function migrarCategorias({ soloVerificar = false } = {}) {
  const bibliotecas = await Biblioteca.find().select("_id codigo");
  let creadas = 0;
  const sinMigrar = [];
  for (const biblioteca of bibliotecas) {
    const existentes = new Set(
      await Categoria.find({ bibliotecaId: biblioteca._id, eliminadoEn: null }).distinct("codigo")
    );
    const enUso = (await Socio.find({ bibliotecaId: biblioteca._id, eliminadoEn: null }).distinct("categoria"))
      .map(normalizarCodigoCategoria)
      .filter(Boolean);
    const faltantes = new Map(CATEGORIAS_BASE.map((c) => [c.codigo, c]));
    for (const codigo of new Set(enUso)) {
      if (!FORMATO_CODIGO.test(codigo)) {
        sinMigrar.push({ biblioteca: biblioteca.codigo, codigo });
      } else if (!faltantes.has(codigo)) {
        faltantes.set(codigo, { codigo, nombre: nombreDesdeCodigo(codigo) });
      }
    }
    const aCrear = [...faltantes.values()].filter((c) => !existentes.has(c.codigo));
    if (aCrear.length) {
      console.log(`${biblioteca.codigo}: ${aCrear.map((c) => c.codigo).join(", ")}`);
    }
    if (!soloVerificar && aCrear.length) await asegurarCategorias(biblioteca._id, aCrear);
    creadas += aCrear.length;
  }
  for (const { biblioteca, codigo } of sinMigrar) {
    console.log(`${biblioteca}: '${codigo}' no tiene formato de código — asignales otra categoría a mano a esos socios.`);
  }
  return { bibliotecas: bibliotecas.length, creadas: soloVerificar ? 0 : creadas, pendientes: creadas, sinMigrar };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("Falta MONGODB_URI en el entorno.");
    process.exit(1);
  }
  const soloVerificar = process.argv.includes("--verificar");
  await conectarDB(process.env.MONGODB_URI);
  console.log(soloVerificar ? "Modo verificación (no escribe nada).\n" : "Migrando...\n");

  const r = await migrarCategorias({ soloVerificar });
  console.log(`\nResumen: ${r.bibliotecas} bibliotecas, ${r.pendientes} categorías pendientes, ${r.creadas} creadas.`);

  await desconectarDB();
}

// pathToFileURL y no `file://${process.argv[1]}`: en Windows la ruta trae
// barras invertidas y letra de unidad, y la comparación nunca daba true.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
