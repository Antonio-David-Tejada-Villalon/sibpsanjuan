import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoriasSocios from "./CategoriasSocios.jsx";
import { ReglasDelSocio } from "./pages/opac/MisPrestamos.jsx";
import api from "./api.js";

vi.mock("./api.js", () => ({
  default: {
    listarCategorias: vi.fn(),
    obtenerBiblioteca: vi.fn(),
    crearCategoria: vi.fn(),
    actualizarCategoria: vi.fn(),
    eliminarCategoria: vi.fn(),
  },
}));

const BIBLIOTECA = { _id: "b1", diasPrestamo: 14, maxRenovaciones: 2, multaPorDiaVencido: 0 };

const ALUMNO = {
  _id: "c1",
  codigo: "ALUMNO",
  nombre: "Alumno",
  diasPrestamo: 7,
  maxRenovaciones: null,
  maxPrestamos: 1,
  multaPorDiaVencido: null,
  socios: 3,
  reglas: { diasPrestamo: 7, maxRenovaciones: 2, maxPrestamos: 1, multaPorDiaVencido: 0 },
};

describe("CategoriasSocios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listarCategorias.mockResolvedValue([ALUMNO]);
    api.obtenerBiblioteca.mockResolvedValue(BIBLIOTECA);
  });

  it("muestra las reglas que se aplican y marca las que vienen de la configuración general", async () => {
    render(<CategoriasSocios bibliotecaId="b1" />);
    const item = (await screen.findByText("3 socios")).closest("li");
    expect(within(item).getByText("ALUMNO")).toBeInTheDocument();
    expect(within(item).getByText("7 días")).toBeInTheDocument();
    // maxRenovaciones es null en la categoría: hereda 2 de la biblioteca.
    const renovaciones = within(item).getByText("Renovaciones máximas").nextSibling;
    expect(renovaciones).toHaveTextContent("2 · general");
    expect(within(item).getByText("No cobra")).toBeInTheDocument();
  });

  it("crea una categoría mandando null en lo que se deja vacío", async () => {
    api.crearCategoria.mockResolvedValue({});
    const user = userEvent.setup();
    render(<CategoriasSocios bibliotecaId="b1" />);
    await screen.findByText("3 socios");

    await user.type(screen.getByLabelText(/código/i), "preceptor");
    await user.type(screen.getByLabelText("Nombre *"), "Preceptor");
    await user.type(screen.getByLabelText("Préstamos a la vez"), "4");
    await user.click(screen.getByRole("button", { name: "Crear categoría" }));

    expect(api.crearCategoria).toHaveBeenCalledWith("b1", {
      codigo: "PRECEPTOR",
      nombre: "Preceptor",
      datosMinimos: false,
      diasPrestamo: null,
      maxRenovaciones: null,
      maxPrestamos: 4,
      multaPorDiaVencido: null,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Se creó la categoría Preceptor.");
  });

  it("no intenta borrar una categoría que tiene socios: explica qué hacer", async () => {
    const user = userEvent.setup();
    render(<CategoriasSocios bibliotecaId="b1" />);
    await screen.findByText("3 socios");
    await user.click(screen.getByRole("button", { name: "Eliminar Alumno" }));

    expect(api.eliminarCategoria).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("3 socios tienen la categoría Alumno");
  });
});

describe("ReglasDelSocio (OPAC)", () => {
  it("dice en frases cortas las reglas de la categoría del socio", () => {
    render(
      <ReglasDelSocio
        reglas={{
          categoria: { codigo: "ALUMNO", nombre: "Alumno" },
          diasPrestamo: 7,
          maxRenovaciones: 1,
          maxPrestamos: 2,
          multaPorDiaVencido: 50,
          enCurso: 1,
        }}
      />
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Tus reglas de préstamo · Alumno");
    expect(screen.getByText("Cada préstamo dura 7 días.")).toBeInTheDocument();
    expect(screen.getByText("Podés renovarlo hasta 1 vez.")).toBeInTheDocument();
    expect(screen.getByText(/hasta 2 a la vez.*Ahora tenés 1/)).toBeInTheDocument();
    expect(screen.getByText("Si te atrasás, la multa es de $50 por día.")).toBeInTheDocument();
  });

  it("sin tope ni multa, no los menciona", () => {
    render(
      <ReglasDelSocio
        reglas={{ categoria: null, diasPrestamo: 14, maxRenovaciones: 0, maxPrestamos: null, multaPorDiaVencido: 0, enCurso: 0 }}
      />
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Los préstamos no se pueden renovar.")).toBeInTheDocument();
  });
});
