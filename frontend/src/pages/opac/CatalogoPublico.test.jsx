import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CatalogoPublico from "./CatalogoPublico.jsx";
import { SocioAuthProvider } from "../../SocioAuthContext.jsx";
import api from "../../api.js";

// CatalogoPublico.jsx es la pantalla más compleja del OPAC (filtros
// multi-select de tipo/materia/autor, paginación propia, y dos fetches en
// cascada — el catálogo combinado de 10 buckets + el catálogo de
// autoridades de autor de BIBL-1) y no tenía ningún test (ver FE-7 en
// AUDITORIA.md).
vi.mock("../../api.js", () => ({
  default: {
    opacCatalogo: vi.fn(),
    opacCatalogoSeriadas: vi.fn(),
    opacCatalogoRecursos: vi.fn(),
    opacCatalogoMaterialSonoro: vi.fn(),
    opacCatalogoMaterialAudiovisual: vi.fn(),
    opacCatalogoMaterialCartografico: vi.fn(),
    opacCatalogoMaterialGrafico: vi.fn(),
    opacCatalogoMaterialDidactico: vi.fn(),
    opacCatalogoArchivos: vi.fn(),
    opacCatalogoObjetos: vi.fn(),
    opacAutores: vi.fn(),
    opacMaterias: vi.fn(),
    opacYo: vi.fn(),
    opacLoginSocio: vi.fn(),
    opacLogoutSocio: vi.fn(),
    opacSolicitarPrestamo: vi.fn(),
  },
}));

const FICCIONES = {
  _id: "libro1",
  titulo: "Ficciones",
  autores: ["Borges, Jorge Luis"],
  editorial: "Sudamericana",
  anio: "1944",
  isbn: "111",
  materias: ["Cuentos"],
  ejemplaresDisponibles: 1,
};

const ALEPH = {
  _id: "libro2",
  titulo: "El Aleph",
  autores: ["Borges, J.L."],
  editorial: "Losada",
  anio: "1949",
  isbn: "222",
  materias: ["Cuentos"],
  ejemplaresDisponibles: 0,
};

const REVISTA = {
  _id: "seriada1",
  titulo: "Revista de Pruebas",
  autores: [],
  editorial: "Editorial X",
  periodicidad: "mensual",
  issn: "1234-5678",
  materias: ["Historia"],
  ejemplaresDisponibles: 2,
};

function mockCatalogoVacioSalvo(overrides) {
  api.opacCatalogo.mockResolvedValue(overrides.libros || []);
  api.opacCatalogoSeriadas.mockResolvedValue(overrides.seriadas || []);
  api.opacCatalogoRecursos.mockResolvedValue([]);
  api.opacCatalogoMaterialSonoro.mockResolvedValue([]);
  api.opacCatalogoMaterialAudiovisual.mockResolvedValue([]);
  api.opacCatalogoMaterialCartografico.mockResolvedValue([]);
  api.opacCatalogoMaterialGrafico.mockResolvedValue([]);
  api.opacCatalogoMaterialDidactico.mockResolvedValue([]);
  api.opacCatalogoArchivos.mockResolvedValue([]);
  api.opacCatalogoObjetos.mockResolvedValue([]);
  api.opacAutores.mockResolvedValue(overrides.autores || []);
  api.opacMaterias.mockResolvedValue(overrides.materias || []);
}

function renderCatalogo() {
  return render(
    <MemoryRouter initialEntries={["/opac/bpsanjuan"]}>
      <Routes>
        <Route
          path="/opac/:codigo"
          element={
            <SocioAuthProvider>
              <CatalogoPublico />
            </SocioAuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  api.opacYo.mockResolvedValue(null);
});

describe("CatalogoPublico", () => {
  it("combina los resultados de los dos fetches en cascada (catálogo + autoridades de autor) y muestra el total", async () => {
    mockCatalogoVacioSalvo({ libros: [FICCIONES], seriadas: [REVISTA] });
    renderCatalogo();

    expect(await screen.findByText("Ficciones")).toBeInTheDocument();
    expect(screen.getByText("Revista de Pruebas")).toBeInTheDocument();
    expect(screen.getByText("2 resultado(s)")).toBeInTheDocument();
    expect(api.opacAutores).toHaveBeenCalledWith("bpsanjuan");
  });

  it("el filtro de tipo de ítem (multi-select) excluye los resultados de ese tipo", async () => {
    mockCatalogoVacioSalvo({ libros: [FICCIONES], seriadas: [REVISTA] });
    const user = userEvent.setup();
    renderCatalogo();
    await screen.findByText("Ficciones");

    await user.click(screen.getByLabelText(/^Libros \(1\)/));

    expect(screen.queryByText("Ficciones")).not.toBeInTheDocument();
    expect(screen.getByText("Revista de Pruebas")).toBeInTheDocument();
    expect(screen.getByText("1 resultado(s)")).toBeInTheDocument();
  });

  it("la paginación (24 por página) avanza a la página siguiente al hacer clic en Siguiente", async () => {
    const muchosLibros = Array.from({ length: 25 }, (_, i) => ({
      ...FICCIONES,
      _id: `libro-${i}`,
      titulo: `Libro ${String(i).padStart(2, "0")}`,
    }));
    mockCatalogoVacioSalvo({ libros: muchosLibros });
    const user = userEvent.setup();
    renderCatalogo();

    await screen.findByText("25 resultado(s)");
    expect(screen.getByText("Libro 00")).toBeInTheDocument();
    expect(screen.queryByText("Libro 24")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(screen.getByText("Libro 24")).toBeInTheDocument();
    expect(screen.queryByText("Libro 00")).not.toBeInTheDocument();
  });

  it("agrupa variantes de autor bajo la forma autorizada del catálogo de autoridades (ver BIBL-1)", async () => {
    mockCatalogoVacioSalvo({
      libros: [FICCIONES, ALEPH],
      autores: [{ formaAutorizada: "Borges, Jorge Luis", variantes: ["Borges, J.L."] }],
    });
    const user = userEvent.setup();
    renderCatalogo();
    await screen.findByText("Ficciones");

    const facetaAutor = screen.getByRole("button", { name: "Borges, Jorge Luis (2)" });
    expect(facetaAutor).toBeInTheDocument();

    await user.click(facetaAutor);

    expect(screen.getByText("Ficciones")).toBeInTheDocument();
    expect(screen.getByText("El Aleph")).toBeInTheDocument();
    expect(screen.getByText("2 resultado(s)")).toBeInTheDocument();
  });

  it("agrupa variantes de materia bajo la forma autorizada del catálogo de autoridades (ver BIBL-3)", async () => {
    const libroA = { ...FICCIONES, materias: ["Historia argentina"] };
    const libroB = { ...ALEPH, materias: ["Historia de la Argentina"] };
    mockCatalogoVacioSalvo({
      libros: [libroA, libroB],
      materias: [{ formaAutorizada: "Historia argentina", variantes: ["Historia de la Argentina"] }],
    });
    const user = userEvent.setup();
    renderCatalogo();
    await screen.findByText("Ficciones");

    const facetaMateria = screen.getByRole("button", { name: "Historia argentina (2)" });
    expect(facetaMateria).toBeInTheDocument();

    await user.click(facetaMateria);

    expect(screen.getByText("Ficciones")).toBeInTheDocument();
    expect(screen.getByText("El Aleph")).toBeInTheDocument();
    expect(screen.getByText("2 resultado(s)")).toBeInTheDocument();
  });

  it("abrir una tarjeta muestra el modal de detalle, y Escape lo cierra", async () => {
    mockCatalogoVacioSalvo({ libros: [FICCIONES] });
    const user = userEvent.setup();
    renderCatalogo();
    await screen.findByText("Ficciones");

    await user.click(screen.getByText("Ficciones"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sudamericana")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
