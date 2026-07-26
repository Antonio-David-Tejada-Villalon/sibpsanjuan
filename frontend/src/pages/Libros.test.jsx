import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Libros from "./Libros.jsx";
import api from "../api.js";

vi.mock("../api.js", () => ({
  default: {
    listarLibrosPaginado: vi.fn(),
    crearLibro: vi.fn(),
    actualizarLibro: vi.fn(),
    eliminarLibro: vi.fn(),
    urlPlantillaLibrosCsv: vi.fn(() => "/api/v1/libros/plantilla-csv"),
    importarLibrosCsv: vi.fn(),
    agregarEjemplaresLibro: vi.fn(),
    actualizarEjemplarLibro: vi.fn(),
    eliminarEjemplarLibro: vi.fn(),
  },
}));

const LIBRO = {
  _id: "1",
  titulo: "Ficciones",
  autores: ["Borges, Jorge Luis"],
  anio: "1944",
  ejemplares: [{ _id: "ej1", codigoBarras: "BPSJ-1", estado: "disponible" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  api.listarLibrosPaginado.mockResolvedValue({ items: [LIBRO], total: 1 });
});

describe("Libros", () => {
  it("lista los libros cargados", async () => {
    render(<Libros />);
    expect(await screen.findByText("Ficciones")).toBeInTheDocument();
  });

  it("crea un libro nuevo", async () => {
    api.crearLibro.mockResolvedValue({ ...LIBRO, _id: "2", titulo: "Rayuela" });
    const user = userEvent.setup();
    render(<Libros />);
    await screen.findByText("Ficciones");

    await user.type(screen.getByLabelText(/^título/i), "Rayuela");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    expect(api.crearLibro).toHaveBeenCalledWith(expect.objectContaining({ titulo: "Rayuela" }));
    expect(api.actualizarLibro).not.toHaveBeenCalled();
  });

  it("editar precarga el formulario y guarda con actualizarLibro, no con crearLibro", async () => {
    api.actualizarLibro.mockResolvedValue({ ...LIBRO, titulo: "Ficciones (editado)" });
    const user = userEvent.setup();
    render(<Libros />);
    await screen.findByText("Ficciones");

    await user.click(screen.getByRole("button", { name: /editar/i }));

    const tituloInput = screen.getByLabelText(/^título/i);
    expect(tituloInput).toHaveValue("Ficciones");
    expect(screen.getByRole("heading", { name: /editar libro/i })).toBeInTheDocument();

    await user.clear(tituloInput);
    await user.type(tituloInput, "Ficciones (editado)");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(api.actualizarLibro).toHaveBeenCalledWith("1", expect.objectContaining({ titulo: "Ficciones (editado)" }));
    expect(api.crearLibro).not.toHaveBeenCalled();
  });

  it("avisa antes de salir si hay cambios sin guardar, y deja de avisar tras guardar o cancelar (ver UX-4)", async () => {
    api.crearLibro.mockResolvedValue({ ...LIBRO, _id: "2", titulo: "Rayuela" });
    const user = userEvent.setup();
    render(<Libros />);
    await screen.findByText("Ficciones");

    function disparaBeforeUnload() {
      const evento = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(evento);
      return evento;
    }

    expect(disparaBeforeUnload().defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText(/^título/i), "Rayuela");
    expect(disparaBeforeUnload().defaultPrevented).toBe(true);

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() => expect(screen.getByLabelText(/^título/i)).toHaveValue(""));
    expect(disparaBeforeUnload().defaultPrevented).toBe(false);
  });

  it("cancelar la edición vuelve el formulario a 'Nuevo libro' vacío", async () => {
    const user = userEvent.setup();
    render(<Libros />);
    await screen.findByText("Ficciones");

    await user.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByRole("heading", { name: /editar libro/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(screen.getByRole("heading", { name: /nuevo libro/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^título/i)).toHaveValue("");
  });
});
