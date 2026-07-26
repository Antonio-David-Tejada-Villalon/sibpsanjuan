import { test } from "node:test";
import assert from "node:assert/strict";
import { esIsbnValido, esIssnValido } from "../src/utils/validacionChecksums.js";

test("esIsbnValido: vacío es válido (campo opcional)", () => {
  assert.equal(esIsbnValido(""), true);
  assert.equal(esIsbnValido(undefined), true);
  assert.equal(esIsbnValido(null), true);
});

test("esIsbnValido: ISBN-10 real, con y sin guiones", () => {
  assert.equal(esIsbnValido("0-306-40615-2"), true);
  assert.equal(esIsbnValido("0306406152"), true);
});

test("esIsbnValido: ISBN-10 con dígito de control 'X'", () => {
  // 155404295X es un ISBN-10 real y válido (dígito de control X = 10).
  assert.equal(esIsbnValido("155404295X"), true);
  assert.equal(esIsbnValido("155404295x"), true);
});

test("esIsbnValido: ISBN-13 real, con y sin guiones", () => {
  assert.equal(esIsbnValido("978-0-306-40615-7"), true);
  assert.equal(esIsbnValido("9780306406157"), true);
});

test("esIsbnValido: rechaza dígito verificador incorrecto (ISBN-10 e ISBN-13)", () => {
  assert.equal(esIsbnValido("0-306-40615-3"), false);
  assert.equal(esIsbnValido("978-0-306-40615-8"), false);
});

test("esIsbnValido: rechaza longitudes que no son 10 ni 13, y texto sin sentido", () => {
  assert.equal(esIsbnValido("12345"), false);
  assert.equal(esIsbnValido("no es un isbn"), false);
});

test("esIssnValido: vacío es válido (campo opcional)", () => {
  assert.equal(esIssnValido(""), true);
  assert.equal(esIssnValido(undefined), true);
});

test("esIssnValido: ISSN real, con y sin guión", () => {
  assert.equal(esIssnValido("0378-5955"), true);
  assert.equal(esIssnValido("03785955"), true);
  assert.equal(esIssnValido("0025-5629"), true);
});

test("esIssnValido: rechaza dígito verificador incorrecto", () => {
  assert.equal(esIssnValido("1234-5678"), false);
  assert.equal(esIssnValido("1111-2222"), false);
});

test("esIssnValido: rechaza longitud distinta de 8 y texto sin sentido", () => {
  assert.equal(esIssnValido("123-456"), false);
  assert.equal(esIssnValido("no es un issn"), false);
});
