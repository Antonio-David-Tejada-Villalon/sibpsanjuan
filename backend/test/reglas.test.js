import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularVencimiento,
  estaVencido,
  diasDeAtraso,
  calcularMulta,
  puedeRenovar,
  resolverPolitica,
  superaMaxPrestamos,
} from "../src/circulacion/reglas.js";

test("calcularVencimiento suma los días de préstamo a la fecha de entrega", () => {
  const entrega = new Date("2026-01-01T00:00:00Z");
  const vencimiento = calcularVencimiento(entrega, 14);
  assert.equal(vencimiento.toISOString(), "2026-01-15T00:00:00.000Z");
});

test("estaVencido: false si todavía no llegó la fecha de vencimiento", () => {
  const prestamo = { fechaVencimiento: new Date("2026-06-01"), fechaDevolucion: null };
  assert.equal(estaVencido(prestamo, new Date("2026-05-30")), false);
});

test("estaVencido: true si ya pasó la fecha de vencimiento y no se devolvió", () => {
  const prestamo = { fechaVencimiento: new Date("2026-06-01"), fechaDevolucion: null };
  assert.equal(estaVencido(prestamo, new Date("2026-06-05")), true);
});

test("estaVencido: false si ya se devolvió, aunque la fecha de vencimiento haya pasado", () => {
  const prestamo = { fechaVencimiento: new Date("2026-06-01"), fechaDevolucion: new Date("2026-06-02") };
  assert.equal(estaVencido(prestamo, new Date("2026-06-10")), false);
});

test("diasDeAtraso: 0 si no está vencido", () => {
  const prestamo = { fechaVencimiento: new Date("2026-06-01"), fechaDevolucion: null };
  assert.equal(diasDeAtraso(prestamo, new Date("2026-05-30")), 0);
});

test("diasDeAtraso: cuenta días completos de atraso", () => {
  const prestamo = { fechaVencimiento: new Date("2026-06-01T00:00:00Z"), fechaDevolucion: null };
  assert.equal(diasDeAtraso(prestamo, new Date("2026-06-04T00:00:00Z")), 3);
});

test("calcularMulta: 0 si la biblioteca no cobra multa (multaPorDiaVencido = 0)", () => {
  const prestamo = { fechaVencimiento: new Date("2026-06-01"), fechaDevolucion: null };
  const biblioteca = { multaPorDiaVencido: 0 };
  assert.equal(calcularMulta(prestamo, biblioteca, new Date("2026-06-10")), 0);
});

test("calcularMulta: días de atraso * monto por día, si la biblioteca cobra", () => {
  const prestamo = { fechaVencimiento: new Date("2026-06-01T00:00:00Z"), fechaDevolucion: null };
  const biblioteca = { multaPorDiaVencido: 50 };
  assert.equal(calcularMulta(prestamo, biblioteca, new Date("2026-06-06T00:00:00Z")), 250);
});

test("puedeRenovar: true si todavía no llegó al tope de renovaciones", () => {
  const prestamo = { renovaciones: 1 };
  const biblioteca = { maxRenovaciones: 2 };
  assert.equal(puedeRenovar(prestamo, biblioteca), true);
});

test("puedeRenovar: false si ya llegó al tope", () => {
  const prestamo = { renovaciones: 2 };
  const biblioteca = { maxRenovaciones: 2 };
  assert.equal(puedeRenovar(prestamo, biblioteca), false);
});

test("puedeRenovar: false si la biblioteca no permite renovaciones (maxRenovaciones = 0)", () => {
  const prestamo = { renovaciones: 0 };
  const biblioteca = { maxRenovaciones: 0 };
  assert.equal(puedeRenovar(prestamo, biblioteca), false);
});

test("calcularVencimiento: sin biblioteca, o con contarSabados/contarDomingos en true, cuenta calendario puro (comportamiento de siempre)", () => {
  const entrega = new Date("2026-01-01T00:00:00Z"); // jueves
  assert.equal(
    calcularVencimiento(entrega, 3, { contarSabados: true, contarDomingos: true }).toISOString(),
    "2026-01-04T00:00:00.000Z"
  );
});

test("calcularVencimiento: saltea sábados y domingos si la biblioteca no los cuenta", () => {
  // Viernes 2026-01-02 + 1 día hábil (sin contar fin de semana) => lunes 2026-01-05
  const entrega = new Date("2026-01-02T00:00:00Z");
  const biblioteca = { contarSabados: false, contarDomingos: false };
  assert.equal(calcularVencimiento(entrega, 1, biblioteca).toISOString(), "2026-01-05T00:00:00.000Z");
});

test("calcularVencimiento: solo saltea domingo si contarSabados sigue en true", () => {
  // Viernes 2026-01-02 + 2 días hábiles: sábado sí cuenta (día 1), domingo
  // no cuenta, lunes cuenta como el segundo día => vence el lunes 2026-01-05.
  const entrega = new Date("2026-01-02T00:00:00Z");
  const biblioteca = { contarSabados: true, contarDomingos: false };
  assert.equal(calcularVencimiento(entrega, 2, biblioteca).toISOString(), "2026-01-05T00:00:00.000Z");
});

test("diasDeAtraso: sin biblioteca sigue contando calendario puro", () => {
  const prestamo = { fechaVencimiento: new Date("2026-01-02T00:00:00Z"), fechaDevolucion: null }; // viernes
  assert.equal(diasDeAtraso(prestamo, new Date("2026-01-05T00:00:00Z")), 3); // sáb+dom+lun
});

test("diasDeAtraso: no cuenta sábado ni domingo como atraso si la biblioteca no los cuenta", () => {
  const prestamo = { fechaVencimiento: new Date("2026-01-02T00:00:00Z"), fechaDevolucion: null }; // viernes
  const biblioteca = { contarSabados: false, contarDomingos: false };
  // Entre el vencimiento (viernes) y el lunes solo el lunes es día hábil.
  assert.equal(diasDeAtraso(prestamo, new Date("2026-01-05T00:00:00Z"), biblioteca), 1);
});

test("calcularMulta: usa el mismo criterio de días hábiles que diasDeAtraso", () => {
  const prestamo = { fechaVencimiento: new Date("2026-01-02T00:00:00Z"), fechaDevolucion: null };
  const biblioteca = { multaPorDiaVencido: 100, contarSabados: false, contarDomingos: false };
  assert.equal(calcularMulta(prestamo, biblioteca, new Date("2026-01-05T00:00:00Z")), 100); // 1 día hábil * 100
});

const BIBLIOTECA = {
  diasPrestamo: 14,
  maxRenovaciones: 2,
  multaPorDiaVencido: 10,
  contarSabados: true,
  contarDomingos: false,
};

test("resolverPolitica: sin categoría quedan las reglas de la biblioteca, sin tope de préstamos", () => {
  assert.deepEqual(resolverPolitica(BIBLIOTECA), {
    diasPrestamo: 14,
    maxRenovaciones: 2,
    multaPorDiaVencido: 10,
    maxPrestamos: null,
    contarSabados: true,
    contarDomingos: false,
    categoria: null,
  });
});

test("resolverPolitica: la categoría pisa solo lo que define; null hereda de la biblioteca", () => {
  const alumno = {
    codigo: "ALUMNO",
    nombre: "Alumno",
    diasPrestamo: 7,
    maxRenovaciones: null,
    multaPorDiaVencido: 0,
    maxPrestamos: 2,
  };
  const politica = resolverPolitica(BIBLIOTECA, alumno);
  assert.equal(politica.diasPrestamo, 7);
  assert.equal(politica.maxRenovaciones, 2, "null hereda");
  assert.equal(politica.multaPorDiaVencido, 0, "0 es un valor propio (no cobra), no un hueco");
  assert.equal(politica.maxPrestamos, 2);
  assert.equal(politica.contarDomingos, false, "los días que cuentan son siempre de la biblioteca");
  assert.deepEqual(politica.categoria, { codigo: "ALUMNO", nombre: "Alumno" });
});

test("resolverPolitica: el resultado se usa en lugar de la biblioteca en las demás reglas", () => {
  const politica = resolverPolitica(BIBLIOTECA, { codigo: "DOCENTE", nombre: "Docente", maxRenovaciones: 0 });
  assert.equal(puedeRenovar({ renovaciones: 0 }, politica), false);
  const prestamo = { fechaVencimiento: new Date("2026-01-05T00:00:00Z"), fechaDevolucion: null };
  assert.equal(calcularMulta(prestamo, politica, new Date("2026-01-08T00:00:00Z")), 30);
});

test("superaMaxPrestamos: sin tope nunca; con tope, desde que llega al máximo", () => {
  assert.equal(superaMaxPrestamos({ maxPrestamos: null }, 50), false);
  assert.equal(superaMaxPrestamos({ maxPrestamos: 2 }, 1), false);
  assert.equal(superaMaxPrestamos({ maxPrestamos: 2 }, 2), true);
});
