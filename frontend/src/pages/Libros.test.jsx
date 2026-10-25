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
    obtenerPortada: vi.fn(() => Promise.reject(Object.assign(new Error("Sin portada"), { status: 404 }))),
  },
}));

const LIBRO = {
  _id: "1",
  titulo: "Ficciones",
  autores: ["Borges, Jorge Luis"],
  anio: "1944",
  ejemplares: [{ _id: "ej1", codigoBarras: "BPSJ-1", estado: "disponible" }],
};

// El listado vive en BuscarCatalogo.jsx y la ficha en
// pages/catalogo/FichaMaterialPanel.jsx: acá queda solo el formulario MARC.
// Para editar, pages/catalogo/FormularioMaterial.jsx trae el material y lo
// pasa en "entidad"; al guardar o cancelar, la que decide adónde ir es esa
// pantalla (alGuardar / alCancelar).
function renderLibros(props = {}) {
  return render(
    <MemoryRouter>
      <Libros {...props} />
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

  it("con un material en «entidad» precarga el formulario y guarda con actualizarLibro", async () => {
    const guardadoEditado = { ...LIBRO, titulo: "Ficciones (editado)" };
    api.actualizarLibro.mockResolvedValue(guardadoEditado);
    const alGuardar = vi.fn();
    const user = userEvent.setup();
    renderLibros({ entidad: LIBRO, alGuardar });

    const tituloInput = await screen.findByLabelText(/^título propiamente dicho/i);
    expect(tituloInput).toHaveValue("Ficciones");
    expect(screen.getByRole("heading", { name: /editar libro/i })).toBeInTheDocument();

    await user.clear(tituloInput);
    await user.type(tituloInput, "Ficciones (editado)");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(api.actualizarLibro).toHaveBeenCalledWith("1", expect.objectContaining({ titulo: "Ficciones (editado)" }));
    expect(api.crearLibro).not.toHaveBeenCalled();
    // false: no es nuevo (la pantalla que lo envuelve va a la ficha, no a Ítems).
    expect(alGuardar).toHaveBeenCalledWith(guardadoEditado, false);
  });

  it("al crear, avisa a alGuardar que es nuevo", async () => {
    const nuevo = { ...LIBRO, _id: "2", titulo: "Rayuela" };
    api.crearLibro.mockResolvedValue(nuevo);
    const alGuardar = vi.fn();
    const user = userEvent.setup();
    renderLibros({ alGuardar });

    await user.type(screen.getByLabelText(/^título propiamente dicho/i), "Rayuela");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    expect(alGuardar).toHaveBeenCalledWith(nuevo, true);
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

  it("Cancelar en la edición llama a alCancelar sin guardar ni avisar de cambios", async () => {
    const alCancelar = vi.fn();
    const user = userEvent.setup();
    renderLibros({ entidad: LIBRO, alCancelar });

    expect(await screen.findByRole("heading", { name: /editar libro/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^título propiamente dicho/i), " (borrador)");
    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(alCancelar).toHaveBeenCalledTimes(1);
    expect(api.actualizarLibro).not.toHaveBeenCalled();
    const evento = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
  });
});
