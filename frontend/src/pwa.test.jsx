import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router-dom";

// pwa.js y preferencias.js guardan estado de módulo: cada test los carga de
// nuevo para empezar limpio.
async function cargar() {
  vi.resetModules();
  const pwa = await import("./pwa.js");
  const { default: EstadoConexion } = await import("./EstadoConexion.jsx");
  const { default: InstalarApp } = await import("./InstalarApp.jsx");
  return { pwa, EstadoConexion, InstalarApp };
}

function respuesta(cabeceras = {}, ok = true) {
  return { ok, headers: new Headers(cabeceras) };
}

function enRouter(elemento) {
  return render(
    <MemoryRouter>
      {elemento}
      <Link to="/otra">Otra pantalla</Link>
    </MemoryRouter>
  );
}

describe("aviso de conexión", () => {
  it("sin conexión lo dice, y con Reintentar recarga", async () => {
    const { EstadoConexion } = await cargar();
    enRouter(<EstadoConexion />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status")).toHaveTextContent("Sin conexión. Pedir, renovar o guardar cambios necesita internet.");
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("si lo que se ve vino de lo guardado, dice de cuándo es (la fecha que puso el service worker)", async () => {
    const { pwa, EstadoConexion } = await cargar();
    enRouter(<EstadoConexion />);
    await act(async () => pwa.registrarOrigenDeRespuesta(respuesta({ "x-sibp-desde-cache": "2026-10-24T22:30:00.000Z" })));
    const { cuandoSeGuardo } = await import("./EstadoConexion.jsx");
    const fecha = cuandoSeGuardo(new Date("2026-10-24T22:30:00.000Z")).replace(/\s+/g, " ");
    expect(fecha).toMatch(/^24 de octubre a las \d{2}:30$/);
    expect(screen.getByRole("status")).toHaveTextContent(`Estás viendo lo guardado en este dispositivo el ${fecha}.`);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    // Otra respuesta "nueva" (puede venir del caché HTTP) no lo apaga...
    await act(async () => pwa.registrarOrigenDeRespuesta(respuesta()));
    expect(screen.getByRole("status")).toHaveTextContent("Estás viendo lo guardado");
    // ...una pantalla nueva sí: arranca limpia.
    await userEvent.setup().click(screen.getByRole("link", { name: "Otra pantalla" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("sin cabecera no inventa ninguna fecha", async () => {
    const { pwa, EstadoConexion } = await cargar();
    enRouter(<EstadoConexion />);
    await act(async () => pwa.registrarOrigenDeRespuesta(respuesta({ "x-sibp-desde-cache": "" })));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("versión nueva", () => {
  let original;
  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  });
  afterEach(() => {
    if (original) Object.defineProperty(navigator, "serviceWorker", original);
    else delete navigator.serviceWorker;
  });

  it("con un service worker nuevo esperando, ofrece Actualizar y le pide que tome el control", async () => {
    const esperando = { postMessage: vi.fn() };
    const registro = { waiting: esperando, addEventListener: vi.fn(), update: vi.fn(() => Promise.resolve()) };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { controller: {}, register: vi.fn(() => Promise.resolve(registro)), addEventListener: vi.fn() },
    });
    const { pwa, EstadoConexion } = await cargar();
    enRouter(<EstadoConexion />);
    await act(async () => pwa.registrarServiceWorker());
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/sw.js");
    expect(screen.getByRole("status")).toHaveTextContent("Hay una versión nueva.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Actualizar" }));
    expect(esperando.postMessage).toHaveBeenCalledWith({ tipo: "activar" });
  });

  it("la primera instalación (sin uno anterior) no es una versión nueva", async () => {
    const registro = { waiting: { postMessage: vi.fn() }, addEventListener: vi.fn(), update: vi.fn() };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { controller: null, register: vi.fn(() => Promise.resolve(registro)), addEventListener: vi.fn() },
    });
    const { pwa, EstadoConexion } = await cargar();
    enRouter(<EstadoConexion />);
    await act(async () => pwa.registrarServiceWorker());
    expect(screen.queryByText("Hay una versión nueva.")).not.toBeInTheDocument();
  });
});

describe("instalar la app", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("donde el navegador lo ofrece, Instalar abre su pedido", async () => {
    const { pwa, InstalarApp } = await cargar();
    pwa.escucharInstalacion();
    render(<InstalarApp />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    const pedido = new Event("beforeinstallprompt");
    pedido.prompt = vi.fn();
    pedido.userChoice = Promise.resolve({ outcome: "accepted" });
    await act(async () => window.dispatchEvent(pedido));
    await userEvent.setup().click(screen.getByRole("button", { name: "Instalar" }));
    expect(pedido.prompt).toHaveBeenCalled();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("en iPhone explica los pasos (Compartir → Agregar a inicio)", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1");
    const { pwa, InstalarApp } = await cargar();
    pwa.escucharInstalacion();
    render(<InstalarApp />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Cómo instalarlo" }));
    expect(screen.getByRole("list")).toHaveTextContent("Compartir");
    expect(screen.getByRole("list")).toHaveTextContent("Agregar a inicio");
  });

  it("'Ahora no' lo esconde y no vuelve a aparecer por un mes", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)");
    const { pwa, InstalarApp } = await cargar();
    pwa.escucharInstalacion();
    const { unmount } = render(<InstalarApp />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Ahora no" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    unmount();
    render(<InstalarApp />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});

describe("preferencias", () => {
  afterEach(() => {
    localStorage.clear();
    delete navigator.connection;
    document.documentElement.removeAttribute("data-ahorro");
    document.documentElement.removeAttribute("data-movimiento");
  });

  async function cargarPreferencias() {
    vi.resetModules();
    const modulo = await import("./preferencias.js");
    const { default: Preferencias } = await import("./Preferencias.jsx");
    return { ...modulo, Preferencias };
  }

  it("sin elección propia sigue al dispositivo (Save-Data)", async () => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true, addEventListener: vi.fn() } });
    const { ahorroDeDatosActivo, Preferencias } = await cargarPreferencias();
    expect(ahorroDeDatosActivo()).toBe(true);
    expect(document.documentElement).toHaveAttribute("data-ahorro", "1");
    render(<Preferencias />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Preferencias" }));
    expect(screen.getByRole("switch", { name: /Ahorro de datos/ })).toBeChecked();
    expect(screen.getByText("Activado porque tu dispositivo lo pide.")).toBeInTheDocument();
  });

  it("la elección propia gana, se guarda y se puede volver a automático", async () => {
    const { Preferencias } = await cargarPreferencias();
    const user = userEvent.setup();
    render(<Preferencias />);
    await user.click(screen.getByRole("button", { name: "Preferencias" }));
    await user.click(screen.getByRole("switch", { name: /Ahorro de datos/ }));
    expect(document.documentElement).toHaveAttribute("data-ahorro", "1");
    expect(localStorage.getItem("ahorroDatos")).toBe("1");
    await user.click(screen.getByRole("switch", { name: /Reducir movimiento/ }));
    expect(document.documentElement).toHaveAttribute("data-movimiento", "reducido");
    await user.click(screen.getByRole("button", { name: "Que lo decida el dispositivo" }));
    expect(document.documentElement).not.toHaveAttribute("data-ahorro");
    expect(localStorage.getItem("ahorroDatos")).toBeNull();
  });

  it("Escape cierra el panel y devuelve el foco al botón", async () => {
    const { Preferencias } = await cargarPreferencias();
    const user = userEvent.setup();
    render(<Preferencias />);
    const boton = screen.getByRole("button", { name: "Preferencias" });
    await user.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });
});
