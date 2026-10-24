import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import api from "./api.js";
import { estadoDelPrestamo } from "./pages/opac/MisPrestamos.jsx";

function respuesta(status, cuerpo) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(cuerpo) };
}

describe("apiFetch: operaciones idempotentes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("si se corta la red, reintenta con la MISMA Idempotency-Key", async () => {
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(respuesta(201, { _id: "p1" }));
    const promesa = api.crearPrestamoDirecto({ socioId: "s1", itemTipo: "Libro", itemId: "l1" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await promesa).toEqual({ _id: "p1" });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [primera, segunda] = fetch.mock.calls.map(([, opciones]) => opciones.headers["Idempotency-Key"]);
    expect(primera).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(segunda).toBe(primera);
  });

  it("cada operación nueva lleva su propia clave", async () => {
    fetch.mockResolvedValue(respuesta(200, {}));
    await api.renovarPrestamo("p1");
    await api.renovarPrestamo("p1");
    const [a, b] = fetch.mock.calls.map(([, opciones]) => opciones.headers["Idempotency-Key"]);
    expect(a).not.toBe(b);
  });

  it("después de agotar los reintentos avisa que no hay conexión", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const promesa = api.procesarDevolucion("p1");
    const verificacion = expect(promesa).rejects.toThrow("No hay conexión con el servidor");
    await vi.advanceTimersByTimeAsync(3000);
    await verificacion;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("una consulta común no se reintenta ni lleva clave", async () => {
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.listarPrestamos()).rejects.toThrow("No hay conexión con el servidor");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBeUndefined();
  });
});

describe("estadoDelPrestamo (OPAC)", () => {
  const ahora = new Date(2026, 9, 24, 10, 0);

  it("cuenta días de calendario hasta el vencimiento", () => {
    expect(estadoDelPrestamo({ fechaVencimiento: new Date(2026, 9, 24, 18, 0) }, ahora).texto).toBe("Vence hoy");
    expect(estadoDelPrestamo({ fechaVencimiento: new Date(2026, 9, 25, 23, 0) }, ahora).texto).toBe("Vence mañana");
    expect(estadoDelPrestamo({ fechaVencimiento: new Date(2026, 9, 31, 9, 0) }, ahora).texto).toBe("Vence en 7 días");
  });

  it("vencido: dice hace cuánto y la multa si la hay", () => {
    const estado = estadoDelPrestamo({ fechaVencimiento: new Date(2026, 9, 21, 9, 0), vencido: true, multa: 150 }, ahora);
    expect(estado).toEqual({ tipo: "vencido", texto: "Venció hace 3 días · multa $150" });
    expect(estadoDelPrestamo({ fechaVencimiento: new Date(2026, 9, 23), vencido: true, multa: 0 }, ahora).texto).toBe(
      "Venció hace 1 día"
    );
  });

  it("devuelto", () => {
    const estado = estadoDelPrestamo({ fechaVencimiento: new Date(2026, 9, 21), fechaDevolucion: new Date(2026, 9, 20) }, ahora);
    expect(estado.tipo).toBe("devuelto");
    expect(estado.texto).toMatch(/^Devuelto el /);
  });
});
