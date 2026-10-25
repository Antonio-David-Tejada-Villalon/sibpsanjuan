import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Devolver from "./Devolver.jsx";
import api from "../../api.js";

vi.mock("../../api.js", () => ({
  default: { devolverPorCodigo: vi.fn() },
}));

const DEVOLUCION = {
  _id: "p1",
  codigoBarras: "BPSJ-000001",
  item: { titulo: "Ficciones" },
  socioId: "s1",
  socio: { apellido: "Quiroga", nombre: "Lucía" },
  fechaVencimiento: "2026-10-20T12:00:00Z",
  fechaDevolucion: "2026-10-23T12:00:00Z",
};

function renderDevolver() {
  return render(
    <MemoryRouter>
      <Devolver />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Devolver", () => {
  it("devuelve por código de barras y lista lo devuelto con el atraso", async () => {
    api.devolverPorCodigo.mockResolvedValue(DEVOLUCION);
    const user = userEvent.setup();
    renderDevolver();

    // Como un lector de códigos: escribe y manda Enter.
    await user.type(screen.getByLabelText("Código de barras del ejemplar"), "BPSJ-000001{Enter}");

    expect(api.devolverPorCodigo).toHaveBeenCalledWith("BPSJ-000001");
    expect(await screen.findByRole("link", { name: "Quiroga, Lucía" })).toHaveAttribute("href", "/socios/s1");
    expect(screen.getByText("3 días")).toBeInTheDocument();
    expect(screen.getByLabelText("Código de barras del ejemplar")).toHaveValue("");
    expect(screen.queryByText(/No lo pongas en el estante/)).not.toBeInTheDocument();
  });

  it("si alguien lo había reservado, avisa que no va al estante y para quién quedó", async () => {
    api.devolverPorCodigo.mockResolvedValue({
      ...DEVOLUCION,
      reservaSiguiente: { socio: { _id: "s2", apellido: "Herrera", nombre: "Martín", numeroSocio: "D-20" } },
    });
    const user = userEvent.setup();
    renderDevolver();

    await user.type(screen.getByLabelText("Código de barras del ejemplar"), "BPSJ-000001{Enter}");

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("No lo pongas en el estante. «Ficciones» tiene una reserva: quedó apartado para Herrera, Martín (n.º D-20)");
  });

  it("muestra el error del servidor (código que no existe o no estaba prestado)", async () => {
    api.devolverPorCodigo.mockRejectedValue(new Error("Ese ejemplar no está prestado."));
    const user = userEvent.setup();
    renderDevolver();

    await user.type(screen.getByLabelText("Código de barras del ejemplar"), "XX-1{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Ese ejemplar no está prestado.");
  });
});
