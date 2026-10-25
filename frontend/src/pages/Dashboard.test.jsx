import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard.jsx";
import { AuthProvider } from "../AuthContext.jsx";
import api from "../api.js";

vi.mock("../api.js", () => ({
  default: { yo: vi.fn(), listarLibros: vi.fn(), listarSocios: vi.fn() },
}));

function renderPanel(sesion) {
  api.yo.mockResolvedValue(sesion);
  render(
    <AuthProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </AuthProvider>
  );
}

async function tarjetas() {
  await screen.findByText(/libros cargados/);
  return screen.getAllByRole("link").map((a) => a.querySelector("strong").textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listarLibros.mockResolvedValue([{}, {}]);
  api.listarSocios.mockResolvedValue([{}]);
});

describe("Dashboard", () => {
  it("una cuenta solo de mostrador ve lo que usa: notificaciones, prestar, devolver, socios y catálogo", async () => {
    renderPanel({ rol: "bibliotecario", bibliotecaId: "b1", permisos: { prestamos: true, devoluciones: true } });
    expect(await tarjetas()).toEqual(["Notificaciones", "Prestar", "Devolver", "Socios", "Catálogo"]);
  });

  it("la jefa de biblioteca ve todos los módulos y Bibliotecarios", async () => {
    renderPanel({ rol: "superbibliotecario", bibliotecaId: "b1" });
    expect(await tarjetas()).toEqual(["Notificaciones", "Prestar", "Devolver", "Socios", "Catálogo", "Catalogar", "Exportar", "Bibliotecarios"]);
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
