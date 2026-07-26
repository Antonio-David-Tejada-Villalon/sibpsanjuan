import { test } from "node:test";
import assert from "node:assert/strict";
import { puedeGestionar } from "../src/utils/jerarquia.js";

const ADMIN = { rol: "admin" };
const SUPERVISOR = { rol: "supervisor", bibliotecasSupervisadas: ["bib1", "bib2"] };
const OTRO_SUPERVISOR = { rol: "supervisor", bibliotecasSupervisadas: ["bib9"] };
const SUPER_BIB1 = { rol: "superbibliotecario", bibliotecaId: "bib1" };
const SUPER_BIB9 = { rol: "superbibliotecario", bibliotecaId: "bib9" };
const BIBLIOTECARIO_BIB1 = { rol: "bibliotecario", bibliotecaId: "bib1" };
const BIBLIOTECARIO_BIB2 = { rol: "bibliotecario", bibliotecaId: "bib2" };

test("admin puede gestionar supervisor, superbibliotecario y bibliotecario", () => {
  assert.equal(puedeGestionar(ADMIN, SUPERVISOR), true);
  assert.equal(puedeGestionar(ADMIN, SUPER_BIB1), true);
  assert.equal(puedeGestionar(ADMIN, BIBLIOTECARIO_BIB1), true);
});

test("nadie puede gestionar al admin, ni siquiera otro admin", () => {
  assert.equal(puedeGestionar(SUPERVISOR, ADMIN), false);
  assert.equal(puedeGestionar(SUPER_BIB1, ADMIN), false);
  assert.equal(puedeGestionar(ADMIN, ADMIN), false);
});

test("supervisor puede gestionar un superbibliotecario de una biblioteca en su alcance", () => {
  assert.equal(puedeGestionar(SUPERVISOR, SUPER_BIB1), true);
});

test("supervisor NO puede gestionar un superbibliotecario fuera de su alcance", () => {
  assert.equal(puedeGestionar(SUPERVISOR, SUPER_BIB9), false);
});

test("supervisor no puede gestionar a otro supervisor (mismo rango)", () => {
  assert.equal(puedeGestionar(SUPERVISOR, OTRO_SUPERVISOR), false);
});

test("supervisor puede gestionar un bibliotecario de una biblioteca en su alcance", () => {
  assert.equal(puedeGestionar(SUPERVISOR, BIBLIOTECARIO_BIB1), true);
});

test("superbibliotecario puede gestionar un bibliotecario de su misma biblioteca", () => {
  assert.equal(puedeGestionar(SUPER_BIB1, BIBLIOTECARIO_BIB1), true);
});

test("superbibliotecario NO puede gestionar un bibliotecario de otra biblioteca", () => {
  assert.equal(puedeGestionar(SUPER_BIB1, BIBLIOTECARIO_BIB2), false);
});

test("superbibliotecario no puede gestionar a otro superbibliotecario ni a un supervisor", () => {
  assert.equal(puedeGestionar(SUPER_BIB1, SUPER_BIB9), false);
  assert.equal(puedeGestionar(SUPER_BIB1, SUPERVISOR), false);
});

test("bibliotecario no puede gestionar a nadie (rango más bajo)", () => {
  assert.equal(puedeGestionar(BIBLIOTECARIO_BIB1, BIBLIOTECARIO_BIB2), false);
  assert.equal(puedeGestionar(BIBLIOTECARIO_BIB1, SUPER_BIB1), false);
});

test("un rol desconocido o ausente nunca puede gestionar ni ser gestionado", () => {
  assert.equal(puedeGestionar({ rol: "socio" }, BIBLIOTECARIO_BIB1), false);
  assert.equal(puedeGestionar(ADMIN, { rol: "socio" }), false);
  assert.equal(puedeGestionar({}, BIBLIOTECARIO_BIB1), false);
});
