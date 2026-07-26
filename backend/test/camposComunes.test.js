import { test } from "node:test";
import assert from "node:assert/strict";
import { camposComunes, aplicarTimestampActualizado } from "../src/models/camposComunes.js";

test("camposComunes: incluye bibliotecaId requerido con ref a Biblioteca", () => {
  const campos = camposComunes();
  assert.equal(campos.bibliotecaId.required, true);
  assert.equal(campos.bibliotecaId.ref, "Biblioteca");
});

test("camposComunes: titulo es requerido, subtitulo y notas no", () => {
  const campos = camposComunes();
  assert.equal(campos.titulo.required, true);
  assert.equal(campos.subtitulo.required, undefined);
  assert.equal(campos.notas.required, undefined);
});

test("camposComunes: materias por defecto es un arreglo vacío", () => {
  const campos = camposComunes();
  assert.deepEqual(campos.materias.default, []);
});

test("camposComunes: eliminadoEn por defecto es null (soft-delete, activo)", () => {
  const campos = camposComunes();
  assert.equal(campos.eliminadoEn.default, null);
});

test("camposComunes: cada llamada devuelve un objeto nuevo (no comparte el arreglo default entre modelos)", () => {
  const a = camposComunes();
  const b = camposComunes();
  assert.notEqual(a.materias.default, b.materias.default);
});

test("aplicarTimestampActualizado: registra un hook pre('save') sobre el schema recibido", () => {
  let registrado = null;
  const schemaFalso = { pre: (evento, fn) => { registrado = { evento, fn }; } };
  aplicarTimestampActualizado(schemaFalso);
  assert.equal(registrado.evento, "save");
  assert.equal(typeof registrado.fn, "function");
});

test("aplicarTimestampActualizado: el hook actualiza 'actualizado' y llama a next()", () => {
  let registrado = null;
  const schemaFalso = { pre: (evento, fn) => { registrado = { evento, fn }; } };
  aplicarTimestampActualizado(schemaFalso);

  const documento = { actualizado: null };
  let siguienteLlamado = false;
  registrado.fn.call(documento, () => { siguienteLlamado = true; });

  assert.ok(documento.actualizado instanceof Date);
  assert.equal(siguienteLlamado, true);
});
