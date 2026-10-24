import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizar, slugDe, TIPOS } from "../src/opac/catalogo.js";
import { listaDeConsulta, enteroDeConsulta } from "../src/utils/consulta.js";

test("normalizar: minúsculas y sin tildes, para buscar como escribe la gente", () => {
  assert.equal(normalizar("Martín FIERRO — Ñandú"), "martin fierro — nandu");
  assert.equal(normalizar(undefined), "");
});

test("slugDe: dirección legible y estable a partir del título", () => {
  assert.equal(slugDe("¿Cómo pido un libro? (2.ª edición)"), "como-pido-un-libro-2-edicion");
  assert.equal(slugDe("!!!"), "material");
});

test("TIPOS: los 10 tipos de material tienen segmento único y lista blanca de campos", () => {
  const segmentos = Object.values(TIPOS).map((t) => t.segmento);
  assert.equal(Object.keys(TIPOS).length, 10);
  assert.equal(new Set(segmentos).size, 10);
  for (const tipo of Object.values(TIPOS)) assert.equal(typeof tipo.detalle({}), "object");
});

test("listaDeConsulta y enteroDeConsulta: aceptan lo esperable y cortan lo demás", () => {
  assert.deepEqual(listaDeConsulta(undefined, "x"), []);
  assert.deepEqual(listaDeConsulta(" Borges, J. L. ", "x"), ["Borges, J. L."]);
  assert.deepEqual(listaDeConsulta(["a", " ", "b"], "x"), ["a", "b"]);
  assert.throws(() => listaDeConsulta({ $ne: "x" }, "x"), /formato válido/);
  assert.throws(() => listaDeConsulta(Array(21).fill("a"), "x"), /formato válido/);
  assert.equal(enteroDeConsulta("3", { minimo: 1, maximo: 10, defecto: 1 }), 3);
  assert.equal(enteroDeConsulta("abc", { minimo: 1, maximo: 10, defecto: 1 }), 1);
  assert.equal(enteroDeConsulta("500", { minimo: 1, maximo: 10, defecto: 1 }), 10);
  assert.equal(enteroDeConsulta(["2"], { minimo: 1, maximo: 10, defecto: 1 }), 1);
});
