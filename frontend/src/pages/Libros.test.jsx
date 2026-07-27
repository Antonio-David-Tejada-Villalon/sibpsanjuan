import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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

// El listado y la búsqueda de libros ya cargados viven en
// BuscarCatalogo.jsx (ver BuscarCatalogo.test.jsx) — este archivo se movió
// junto con esa pantalla. Acá solo queda el editor MARC (alta/edición) y su
// precarga vía navegación (state:{ editar }), que reemplazó al viejo botón
// "Editar" de la tabla que este archivo tenía antes.
function renderLibros({ state } = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/libros", state }]}>
      <Libros />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  api.listarLibrosPaginado.mockResolvedValue({ items: [LIBRO], total: 1 });
});

describe("Libros", () => {
  it("crea un libro nuevo", async () => {
    api.crearLibro.mockResolvedValue({ ...LIBRO, _id: "2", titulo: "Rayuela" });
    const user = userEvent.setup();
    renderLibros();

    await user.type(screen.getByLabelText(/^título propiamente dicho/i), "Rayuela");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    expect(api.crearLibro).toHaveBeenCalledWith(expect.objectContaining({ titulo: "Rayuela" }));
    expect(api.actualizarLibro).not.toHaveBeenCalled();
  });

  it("precarga el formulario al navegar con state:{ editar } (desde Buscar en el catálogo) y guarda con actualizarLibro", async () => {
    api.actualizarLibro.mockResolvedValue({ ...LIBRO, titulo: "Ficciones (editado)" });
    const user = userEvent.setup();
    renderLibros({ state: { editar: LIBRO } });

    const tituloInput = await screen.findByLabelText(/^título propiamente dicho/i);
    expect(tituloInput).toHaveValue("Ficciones");
    expect(screen.getByRole("heading", { name: /editar libro/i })).toBeInTheDocument();

    await user.clear(tituloInput);
    await user.type(tituloInput, "Ficciones (editado)");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(api.actualizarLibro).toHaveBeenCalledWith("1", expect.objectContaining({ titulo: "Ficciones (editado)" }));
    expect(api.crearLibro).not.toHaveBeenCalled();
  });

  it("avisa antes de salir si hay cambios sin guardar, y deja de avisar tras guardar (ver UX-4)", async () => {
    api.crearLibro.mockResolvedValue({ ...LIBRO, _id: "2", titulo: "Rayuela" });
    const user = userEvent.setup();
    renderLibros();

    function disparaBeforeUnload() {
      const evento = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(evento);
      return evento;
    }

    expect(disparaBeforeUnload().defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText(/^título propiamente dicho/i), "Rayuela");
    expect(disparaBeforeUnload().defaultPrevented).toBe(true);

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() => expect(screen.getByLabelText(/^título propiamente dicho/i)).toHaveValue(""));
    expect(disparaBeforeUnload().defaultPrevented).toBe(false);
  });

  it("cancelar la edición precargada por navegación vuelve el formulario a 'Nuevo libro' vacío", async () => {
    const user = userEvent.setup();
    renderLibros({ state: { editar: LIBRO } });

    expect(await screen.findByRole("heading", { name: /editar libro/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(screen.getByRole("heading", { name: /nuevo libro/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^título propiamente dicho/i)).toHaveValue("");
  });
});
