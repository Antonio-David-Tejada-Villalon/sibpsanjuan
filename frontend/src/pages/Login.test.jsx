import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login.jsx";
import { AuthProvider } from "../AuthContext.jsx";
import api from "../api.js";

vi.mock("../api.js", () => ({
  default: {
    yo: vi.fn(),
    login: vi.fn(),
  },
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simula "sin sesión todavía" para el chequeo inicial que hace AuthProvider.
    api.yo.mockRejectedValue(new Error("401"));
  });

  it("muestra un error si las credenciales son incorrectas", async () => {
    api.login.mockRejectedValue(new Error("Usuario o contraseña incorrectos."));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/usuario/i), "admin");
    await user.type(screen.getByLabelText(/contraseña/i), "mala");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos.");
  });

  it("deshabilita el botón y muestra 'Entrando…' mientras la petición está en curso", async () => {
    let resolverLogin;
    api.login.mockReturnValue(
      new Promise((resolve) => {
        resolverLogin = resolve;
      })
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/usuario/i), "admin");
    await user.type(screen.getByLabelText(/contraseña/i), "dev12345");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    const boton = await screen.findByRole("button", { name: /entrando/i });
    expect(boton).toBeDisabled();

    resolverLogin({ usuario: "admin", rol: "admin" });
  });

  it("no deja el formulario roto si el login resulta exitoso", async () => {
    api.login.mockResolvedValue({ usuario: "admin", rol: "admin" });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/usuario/i), "admin");
    await user.type(screen.getByLabelText(/contraseña/i), "dev12345");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(api.login).toHaveBeenCalledWith("admin", "dev12345");
  });
});
