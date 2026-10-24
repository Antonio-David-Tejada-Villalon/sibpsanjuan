import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorHttp, textoDeConsulta, opcionDeConsulta } from "../src/utils/consulta.js";

test("textoDeConsulta: sin valor devuelve texto vacío y recorta el texto", () => {
  assert.equal(textoDeConsulta(undefined), "");
  assert.equal(textoDeConsulta("  Borges "), "Borges");
  assert.equal(textoDeConsulta(""), "");
});

test("textoDeConsulta: una lista o un objeto cortan con un 400, no con un error interno", () => {
  for (const valor of [["a", "b"], { a: "1" }, { $ne: null }]) {
    assert.throws(
      () => textoDeConsulta(valor),
      (err) => err instanceof ErrorHttp && err.estado === 400
    );
  }
});

test("opcionDeConsulta: acepta solo los valores permitidos", () => {
  const permitidos = ["pendiente", "aprobada", "rechazada"];
  assert.equal(opcionDeConsulta(undefined, permitidos, "estado"), undefined);
  assert.equal(opcionDeConsulta("", permitidos, "estado"), undefined);
  assert.equal(opcionDeConsulta("aprobada", permitidos, "estado"), "aprobada");
  for (const valor of ["otra", ["pendiente"], { $ne: "x" }]) {
    assert.throws(
      () => opcionDeConsulta(valor, permitidos, "estado"),
      (err) => err instanceof ErrorHttp && err.estado === 400
    );
  }
});
