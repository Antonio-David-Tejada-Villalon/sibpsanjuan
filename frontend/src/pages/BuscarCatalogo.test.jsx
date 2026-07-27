import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import BuscarCatalogo from "./BuscarCatalogo.jsx";
import api from "../api.js";

vi.mock("../api.js", () => ({
  default: {
    listarLibros: vi.fn(),
    listarSeriadas: vi.fn(),
    listarRecursosElectronicos: vi.fn(),
    listarMaterialSonoro: vi.fn(),
    listarMaterialAudiovisual: vi.fn(),
    listarMaterialCartografico: vi.fn(),
    listarMaterialGrafico: vi.fn(),
    listarMaterialDidactico: vi.fn(),
    listarArchivo: vi.fn(),
    listarObjeto: vi.fn(),
    eliminarLibro: vi.fn(),
    eliminarSeriada: vi.fn(),
    eliminarRecursoElectronico: vi.fn(),
    eliminarMaterialSonoro: vi.fn(),
    eliminarMaterialAudiovisual: vi.fn(),
    eliminarMaterialCartografico: vi.fn(),
    eliminarMaterialGrafico: vi.fn(),
    eliminarMaterialDidactico: vi.fn(),
    eliminarArchivo: vi.fn(),
    eliminarObjeto: vi.fn(),
  },
}));

const FICCIONES = {
  _id: "libro1",
  itemTipo: "Libro",
  titulo: "Ficciones",
  subtitulo: "Cuentos",
  autores: ["Borges, Jorge Luis"],
  editorial: "Emecé",
  lugarPublicacion: "Buenos Aires",
  anio: "1944",
  isbn: "9789500000000",
  materias: ["Literatura argentina"],
  ejemplares: [{ codigoBarras: "BPSJ-1", estado: "disponible" }],
};

const REVISTA = {
  _id: "seriada1",
  itemTipo: "Seriada",
  titulo: "Revista de Pruebas",
  autores: ["Instituto de Pruebas"],
  editorial: "Editorial X",
  periodicidad: "mensual",
  issn: "1234-5678",
  materias: ["Historia"],
  ejemplares: [],
};

function mockCatalogoVacioSalvo(overrides = {}) {
  api.listarLibros.mockResolvedValue(overrides.libros || []);
  api.listarSeriadas.mockResolvedValue(overrides.seriadas || []);
  api.listarRecursosElectronicos.mockResolvedValue([]);
  api.listarMaterialSonoro.mockResolvedValue([]);
  api.listarMaterialAudiovisual.mockResolvedValue([]);
  api.listarMaterialCartografico.mockResolvedValue([]);
  api.listarMaterialGrafico.mockResolvedValue([]);
  api.listarMaterialDidactico.mockResolvedValue([]);
  api.listarArchivo.mockResolvedValue([]);
  api.listarObjeto.mockResolvedValue([]);
}

function renderBuscador() {
  return render(
    <MemoryRouter initialEntries={["/catalogo"]}>
      <Routes>
        <Route path="/catalogo" element={<BuscarCatalogo />} />
        <Route path="/libros" element={<p>PANTALLA DE LIBROS</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BuscarCatalogo", () => {
  it("combina los resultados de todos los tipos y muestra el total", async () => {
    mockCatalogoVacioSalvo({ libros: [FICCIONES], seriadas: [REVISTA] });
    renderBuscador();

    expect(await screen.findByText("Ficciones")).toBeInTheDocument();
    expect(screen.getByText("Revista de Pruebas")).toBeInTheDocument();
    expect(screen.getByText("2 resultado(s)")).toBeInTheDocument();
  });

  it("la búsqueda simple filtra por texto libre en cualquier tipo", async () => {
    mockCatalogoVacioSalvo({ libros: [FICCIONES], seriadas: [REVISTA] });
    const user = userEvent.setup();
    renderBuscador();
    await screen.findByText("Ficciones");

    await user.type(screen.getByLabelText(/buscar por título/i), "Revista");

    expect(screen.queryByText("Ficciones")).not.toBeInTheDocument();
    expect(screen.getByText("Revista de Pruebas")).toBeInTheDocument();
    expect(screen.getByText("1 resultado(s)")).toBeInTheDocument();
  });

  it("el filtro de tipo de ítem excluye los resultados de ese tipo", async () => {
    mockCatalogoVacioSalvo({ libros: [FICCIONES], seriadas: [REVISTA] });
    const user = userEvent.setup();
    renderBuscador();
    await screen.findByText("Ficciones");

    await user.click(screen.getByLabelText(/^Libro \(1\)/));

    expect(screen.queryByText("Ficciones")).not.toBeInTheDocument();
    expect(screen.getByText("Revista de Pruebas")).toBeInTheDocument();
  });

  it("Ficha ISBD abre un modal con el párrafo formateado según la puntuación ISBD", async () => {
    mockCatalogoVacioSalvo({ libros: [FICCIONES] });
    const user = userEvent.setup();
    renderBuscador();
    await screen.findByText("Ficciones");

    await user.click(screen.getByRole("button", { name: /ficha isbd/i }));

    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toBeInTheDocument();
    expect(dialogo).toHaveTextContent("Ficciones : Cuentos / Borges, Jorge Luis");
    expect(dialogo).toHaveTextContent("Buenos Aires : Emecé, 1944");
    expect(dialogo).toHaveTextContent("ISBN 9789500000000");
  });

  it("Editar navega a la pantalla de edición del tipo correspondiente", async () => {
    mockCatalogoVacioSalvo({ libros: [FICCIONES] });
    const user = userEvent.setup();
    renderBuscador();
    await screen.findByText("Ficciones");

    await user.click(screen.getByRole("button", { name: /^editar$/i }));

    expect(await screen.findByText("PANTALLA DE LIBROS")).toBeInTheDocument();
  });

  it("selección múltiple + Eliminar seleccionados llama al eliminar del tipo de cada ítem", async () => {
    mockCatalogoVacioSalvo({ libros: [FICCIONES], seriadas: [REVISTA] });
    api.eliminarLibro.mockResolvedValue({ ok: true });
    api.eliminarSeriada.mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderBuscador();
    await screen.findByText("Ficciones");

    await user.click(screen.getByLabelText(/seleccionar todos/i));
    expect(screen.getByText("2 seleccionado(s)")).toBeInTheDocument();

    mockCatalogoVacioSalvo({});
    await user.click(screen.getByRole("button", { name: /eliminar seleccionados/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.eliminarLibro).toHaveBeenCalledWith("libro1");
    expect(api.eliminarSeriada).toHaveBeenCalledWith("seriada1");
    expect(await screen.findByText("0 resultado(s)")).toBeInTheDocument();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
