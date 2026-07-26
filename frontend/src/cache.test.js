import { describe, it, expect, vi, afterEach } from "vitest";
import { cacheGet, cacheSet, cacheInvalidate } from "./cache.js";

// Claves únicas por test a propósito: el store de cache.js es un módulo
// compartido (sin reset entre tests), así que reusar una clave entre tests
// haría que uno interfiera con el resultado del otro.
describe("cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve undefined si la clave nunca se guardó", () => {
    expect(cacheGet("/nunca-guardada")).toBeUndefined();
  });

  it("devuelve el valor guardado mientras no venció el TTL", () => {
    cacheSet("/libros-a", ["a", "b"]);
    expect(cacheGet("/libros-a")).toEqual(["a", "b"]);
  });

  it("vence después de 15 segundos", () => {
    vi.useFakeTimers();
    cacheSet("/libros-b", ["a"]);
    vi.advanceTimersByTime(15_001);
    expect(cacheGet("/libros-b")).toBeUndefined();
  });

  it("cacheInvalidate borra solo las claves que empiezan con el prefijo dado", () => {
    cacheSet("/libros-c", ["a"]);
    cacheSet("/libros-c?pagina=2", ["b"]);
    cacheSet("/socios-c", ["c"]);
    cacheInvalidate("/libros-c");
    expect(cacheGet("/libros-c")).toBeUndefined();
    expect(cacheGet("/libros-c?pagina=2")).toBeUndefined();
    expect(cacheGet("/socios-c")).toEqual(["c"]);
  });
});
