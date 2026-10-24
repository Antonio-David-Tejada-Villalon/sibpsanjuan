import { test } from "node:test";
import assert from "node:assert/strict";
import { enmascarar, socioParaPanel } from "../src/utils/datosSocio.js";

test("enmascarar: deja ver solo lo justo para reconocer el dato", () => {
  assert.equal(enmascarar("dni", "30.111.222"), "•••222");
  assert.equal(enmascarar("telefono", "264 400-1234"), "•••234");
  assert.equal(enmascarar("email", "mjperez@example.com"), "m•••@example.com");
  assert.equal(enmascarar("emailTutor", "sin-arroba"), "•••");
  assert.equal(enmascarar("direccion", "San Martín 123"), "•••");
  assert.equal(enmascarar("fechaNacimiento", "2012-05-01"), "•••");
});

test("enmascarar: un dato vacío sigue vacío (no cargado ≠ oculto)", () => {
  assert.equal(enmascarar("dni", ""), "");
  assert.equal(enmascarar("dni", undefined), "");
  assert.equal(enmascarar("telefono", null), "");
});

test("socioParaPanel: sin hash, con tieneLoginOpac y el contacto enmascarado", () => {
  const socio = { numeroSocio: "1", apellido: "Pérez", dni: "30111222", passwordHash: "x", localidad: "Rivadavia" };
  const resultado = socioParaPanel(socio);
  assert.equal("passwordHash" in resultado, false);
  assert.equal(resultado.tieneLoginOpac, true);
  assert.equal(resultado.dni, "•••222");
  assert.equal(resultado.localidad, "Rivadavia", "localidad no es dato de contacto");
});
