import { test } from "node:test";
import assert from "node:assert/strict";
import { contraste, contrasteDelAcento, enlacesInvalidos } from "../src/contenido/formato.js";
import { validarContenido, contenidoInicial } from "../src/contenido/validar.js";
import { hoyEnSanJuan, avisoVigente } from "../src/contenido/publico.js";

const base = () => contenidoInicial({ nombre: "Colegio de prueba" });

test("contraste: fórmula WCAG y el acento contra el texto oscuro de los botones", () => {
  assert.equal(contraste("#ffffff", "#000000").toFixed(1), "21.0");
  assert.ok(contrasteDelAcento("#ff8300") >= 4.5, "el naranja del sistema pasa");
  assert.ok(contrasteDelAcento("#1d4ed8") < 4.5, "un azul oscuro no deja leer el texto oscuro encima");
});

test("enlacesInvalidos: solo http, https y mailto", () => {
  assert.deepEqual(enlacesInvalidos("[sitio](https://colegio.edu.ar) y [correo](mailto:a@b.com)"), []);
  assert.deepEqual(enlacesInvalidos("[clic](javascript:alert(1)) [x](data:text/html,hola)"), ["javascript:alert(1", "data:text/html,hola"]);
});

test("validarContenido: el contenido inicial ya se puede publicar", () => {
  const { errores } = validarContenido(base(), { modo: "publicar" });
  assert.deepEqual(errores, []);
});

test("validarContenido: un borrador puede estar incompleto, para publicar no", () => {
  const datos = { ...base(), identidad: { ...base().identidad, nombre: "", colorAcento: "#1D4ED8" } };
  const borrador = validarContenido(datos);
  assert.deepEqual(borrador.errores, []);
  assert.equal(borrador.datos.identidad.colorAcento, "#1d4ed8", "se normaliza en minúsculas");
  const publicar = validarContenido(datos, { modo: "publicar" }).errores.join(" ");
  assert.match(publicar, /Nombre de la institución: es obligatorio/);
  assert.match(publicar, /contraste de \d\.\d\d:1/);
});

test("validarContenido: enlaces, correo, web, fechas, direcciones de página y páginas legales", () => {
  const { errores } = validarContenido(
    {
      ...base(),
      contacto: { email: "no-es-correo", web: "ftp://colegio.edu.ar" },
      avisos: [{ titulo: "Feria", texto: "[ver](javascript:alert(1))", desde: "2026-11-10", hasta: "2026-11-01" }],
      paginas: [
        { titulo: "Reglamento", slug: "Reglamento de Préstamos", cuerpo: "texto" },
        { titulo: "Otra", slug: "otra", cuerpo: "x" },
        { titulo: "Repetida", slug: "otra", cuerpo: "x", legal: { responsable: "", version: "", vigenteDesde: "" } },
      ],
    },
    { modo: "publicar" }
  );
  const todo = errores.join("\n");
  assert.match(todo, /Correo de contacto: no parece un correo válido/);
  assert.match(todo, /Sitio web: tiene que empezar con https/);
  assert.match(todo, /Aviso 1 — texto: el enlace "javascript:alert\(1" no es válido/);
  assert.match(todo, /Aviso 1: la fecha "hasta" es anterior/);
  assert.match(todo, /Página 1 — dirección: solo minúsculas/);
  assert.match(todo, /Página 3 — dirección: "otra" ya la usa otra página/);
  assert.match(todo, /Página 3 — responsable: es obligatorio/);
  assert.match(todo, /Página 3 — vigente desde: es obligatoria/);
});

test("validarContenido: límites de cantidad y tipos", () => {
  const muchos = Array.from({ length: 11 }, (_, i) => ({ titulo: `A${i}`, texto: "" }));
  const { errores, datos } = validarContenido({ ...base(), avisos: muchos, identidad: { nombre: 42 } });
  assert.match(errores.join(" "), /Avisos: como máximo 10/);
  assert.match(errores.join(" "), /Nombre de la institución: tiene que ser texto/);
  assert.equal(datos.avisos.length, 10);
});

test("hoyEnSanJuan y avisoVigente: el día cuenta en el huso de San Juan, no en UTC", () => {
  assert.equal(hoyEnSanJuan(new Date("2026-10-25T02:30:00Z")), "2026-10-24");
  assert.equal(avisoVigente({ desde: "2026-10-01", hasta: "2026-10-24" }, "2026-10-24"), true);
  assert.equal(avisoVigente({ desde: "2026-10-25", hasta: null }, "2026-10-24"), false);
  assert.equal(avisoVigente({ desde: null, hasta: "2026-10-23" }, "2026-10-24"), false);
  assert.equal(avisoVigente({ desde: null, hasta: null }, "2026-10-24"), true);
});
