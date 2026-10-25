import { test } from "node:test";
import assert from "node:assert/strict";
import { esPrestable, estadoVisible, siguienteCodigo } from "../src/circulacion/ejemplares.js";
import { camposDeMarcXml, registroMarc } from "../src/marc/vista.js";
import { subcampos952 } from "../src/marc/marcxml.js";

test("varias copias: el código sigue la numeración y conserva los ceros", () => {
  assert.equal(siguienteCodigo("BPSJ-000009", 1), "BPSJ-000010");
  assert.equal(siguienteCodigo("735", 2), "737");
  assert.equal(siguienteCodigo("99", 1), "100");
  assert.equal(siguienteCodigo("SIN-NUMERO", 1), "SIN-NUMERO-2");
});

test("qué copia circula y qué estado se muestra: primero lo físico, después el uso", () => {
  assert.equal(esPrestable({ estado: "disponible" }), true, "un ejemplar viejo sin uso ni condición circula");
  assert.equal(esPrestable({ uso: "sala" }), false);
  assert.equal(esPrestable({ uso: "prestamo", condicion: "danado" }), false);
  assert.equal(estadoVisible({ estado: "prestado", condicion: "extraviado" }), "extraviado");
  assert.equal(estadoVisible({ estado: "disponible", uso: "no_prestable" }), "no_prestable");
  assert.equal(estadoVisible({ estado: "prestado", uso: "sala" }), "prestado");
  assert.equal(estadoVisible({ estado: "reservado" }), "reservado");
});

test("952 para Koha: solo las marcas que corresponden", () => {
  const sub = Object.fromEntries(
    subcampos952({ codigoBarras: "1", uso: "sala", condicion: "reparacion", notaInterna: "Lomo", numeroCopia: "2" }).filter(([, v]) => v)
  );
  assert.deepEqual(sub, { p: "1", t: "2", 5: "1", 7: "1", x: "Lomo. En reparación" });
});

test("vista MARC: lee el XML propio y pone nombre a campos y subcampos", () => {
  const campos = camposDeMarcXml(
    '<record><leader>00000nam a2200000 a 4500</leader><controlfield tag="001">abc</controlfield>' +
      '<datafield tag="245" ind1="1" ind2="0">\n  <subfield code="a">Tom &amp; Jerry &lt;b&gt;</subfield>\n</datafield></record>'
  );
  assert.deepEqual(campos, [
    { tag: "000", valor: "00000nam a2200000 a 4500" },
    { tag: "001", valor: "abc" },
    { tag: "245", ind1: "1", ind2: "0", subcampos: [{ codigo: "a", valor: "Tom & Jerry <b>" }] },
  ]);
  const registro = registroMarc("Libro", { _id: "x", titulo: "Rayuela", isbn: "123", ejemplares: [] });
  assert.equal(registro.find((c) => c.tag === "020").nombre, "NÚMERO INTERNACIONAL NORMALIZADO PARA LIBROS (ISBN)");
  assert.equal(registroMarc("Objeto", { titulo: "x" }), null, "Objetos y Archivos no tienen MARC");
});
