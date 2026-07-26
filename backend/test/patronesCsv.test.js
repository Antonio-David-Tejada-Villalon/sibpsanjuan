import { test } from "node:test";
import assert from "node:assert/strict";
import { sociosACsv } from "../src/export/patronesCsv.js";

test("genera encabezado con las columnas del importador de socios de Koha", () => {
  const csv = sociosACsv([
    { numeroSocio: "0001", apellido: "Pérez", nombre: "Ana", categoria: "ADULTO" },
  ]);
  const [encabezado] = csv.trim().split("\n");
  assert.equal(
    encabezado,
    "cardnumber,surname,firstname,address,city,phone,email,dateofbirth,branchcode,categorycode,borrowernotes"
  );
});

test("mapea numeroSocio/apellido/nombre a cardnumber/surname/firstname", () => {
  const csv = sociosACsv([
    { numeroSocio: "0007", apellido: "Gómez", nombre: "Ñico", categoria: "INFANTIL" },
  ]);
  const filas = csv.trim().split("\n");
  assert.equal(filas.length, 2);
  assert.match(filas[1], /^0007,Gómez,Ñico,/);
});

test("mete el DNI en borrowernotes con una etiqueta clara (no hay columna DNI en Koha)", () => {
  const csv = sociosACsv([
    { numeroSocio: "0001", apellido: "Pérez", nombre: "Ana", dni: "30111222", categoria: "ADULTO" },
  ]);
  assert.match(csv, /DNI: 30111222/);
});

test("branchcode siempre va vacío (lo define la instancia Koha de destino, no esta herramienta)", () => {
  const csv = sociosACsv([{ numeroSocio: "0001", apellido: "Pérez", nombre: "Ana" }]);
  const filas = csv.trim().split("\n")[1].split(",");
  const idx = csv.split("\n")[0].split(",").indexOf("branchcode");
  assert.equal(filas[idx], "");
});

test("escapa correctamente campos con comas (ej. direcciones)", () => {
  const csv = sociosACsv([
    {
      numeroSocio: "0001",
      apellido: "Pérez",
      nombre: "Ana",
      direccion: "San Martín 123, Piso 2, Depto B",
    },
  ]);
  const filas = csv.trim().split("\n");
  assert.equal(filas.length, 2);
  assert.match(filas[1], /"San Martín 123, Piso 2, Depto B"/);
});

test("varios socios generan una fila cada uno, en el mismo orden de columnas", () => {
  const csv = sociosACsv([
    { numeroSocio: "0001", apellido: "A", nombre: "Uno" },
    { numeroSocio: "0002", apellido: "B", nombre: "Dos" },
    { numeroSocio: "0003", apellido: "C", nombre: "Tres" },
  ]);
  const filas = csv.trim().split("\n");
  assert.equal(filas.length, 4); // encabezado + 3
});

test("lista vacía produce solo el encabezado, sin romper", () => {
  const csv = sociosACsv([]);
  const filas = csv.trim().split("\n");
  assert.equal(filas.length, 1);
});
