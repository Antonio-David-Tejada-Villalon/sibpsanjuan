import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import CatalogoPublico from "./CatalogoPublico.jsx";
import { SocioAuthProvider } from "../../SocioAuthContext.jsx";
import api from "../../api.js";

// El catálogo ya no filtra en el navegador: le pide al servidor una página
// de resultados con los parámetros de la URL (ver backend/src/opac/
// catalogo.js). Estos tests controlan que la URL, la llamada y lo que se ve
// coincidan.
vi.mock("../../api.js", () => ({
  urlPortada: (codigo, id, version) => (version ? `/portadas/${id}.webp?v=${version}` : null),
  default: {
    opacBuscar: vi.fn(),
    opacYo: vi.fn(),
  },
}));

const FICCIONES = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  itemTipo: "Libro",
  etiquetaTipo: "Libros",
  segmento: "libro",
  slug: "ficciones",
  titulo: "Ficciones",
  subtitulo: "",
  autores: ["Borges, Jorge Luis"],
  extra: "Borges, Jorge Luis",
  anio: "1944",
  urlAcceso: "",
  soloLectura: false,
  circula: true,
  disponibles: 1,
  total: 1,
  portada: null,
};

function respuesta({ resultados = [FICCIONES], total = resultados.length, pagina = 1, totalPaginas = 1 } = {}) {
  return {
    total,
    pagina,
    porPagina: 24,
    totalPaginas,
    resultados,
    facetas: {
      tipos: [
        { valor: "Libro", etiqueta: "Libros", cantidad: 3 },
        { valor: "Seriada", etiqueta: "Publicaciones seriadas", cantidad: 1 },
        { valor: "Objeto", etiqueta: "Objetos", cantidad: 0 },
      ],
      autores: [{ valor: "Borges, Jorge Luis", cantidad: 2 }],
      materias: [{ valor: "Cuentos", cantidad: 2 }],
    },
  };
}

function UbicacionActual() {
  const location = useLocation();
  return <output data-testid="ubicacion">{location.pathname + location.search}</output>;
}

function renderCatalogo(entrada = "/opac/escolar") {
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route
          path="/opac/:codigo"
          element={
            <SocioAuthProvider>
              <CatalogoPublico />
              <UbicacionActual />
            </SocioAuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

const ultimaConsulta = () => api.opacBuscar.mock.calls.at(-1)[1];

describe("CatalogoPublico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.opacYo.mockRejectedValue(new Error("401"));
    api.opacBuscar.mockResolvedValue(respuesta());
  });

  it("pide la búsqueda al servidor con los parámetros de la URL y muestra total y tarjetas con enlace a la ficha", async () => {
    renderCatalogo("/opac/escolar?q=borges&tipo=Libro&orden=titulo");
    expect(await screen.findByRole("link", { name: "Ficciones" })).toHaveAttribute(
      "href",
      "/opac/escolar/libro/ficciones-aaaaaaaaaaaaaaaaaaaaaaaa"
    );
    expect(api.opacBuscar).toHaveBeenCalledWith("escolar", "q=borges&tipo=Libro&orden=titulo");
    expect(screen.getByText("1 resultado para «borges»")).toBeInTheDocument();
    expect(screen.getByLabelText(/Buscar por título/)).toHaveValue("borges");
    expect(screen.getByLabelText("Ordenar por")).toHaveValue("titulo");
    expect(screen.getByText("1 ejemplar disponible")).toBeInTheDocument();
  });

  it("buscar actualiza la URL (sin la página) y vuelve a pedir", async () => {
    const user = userEvent.setup();
    renderCatalogo("/opac/escolar?pagina=3");
    await screen.findByRole("link", { name: "Ficciones" });
    await user.type(screen.getByLabelText(/Buscar por título/), "aleph");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/opac/escolar?q=aleph");
    expect(ultimaConsulta()).toBe("q=aleph");
  });

  it("las facetas suman y quitan filtros, con chips para sacarlos y 'Limpiar filtros'", async () => {
    const user = userEvent.setup();
    renderCatalogo();
    await screen.findByRole("link", { name: "Ficciones" });
    expect(screen.queryByLabelText(/Objetos/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Borges, Jorge Luis (2)" }));
    expect(ultimaConsulta()).toBe("autor=Borges%2C+Jorge+Luis");
    await user.click(screen.getByLabelText("Publicaciones seriadas (1)"));
    expect(ultimaConsulta()).toBe("autor=Borges%2C+Jorge+Luis&tipo=Seriada");

    await user.click(screen.getByRole("button", { name: /Autor: Borges, Jorge Luis/ }));
    expect(ultimaConsulta()).toBe("tipo=Seriada");
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(ultimaConsulta()).toBe("");
  });

  it("paginación numerada con enlaces que conservan la búsqueda", async () => {
    api.opacBuscar.mockResolvedValue(respuesta({ total: 120, pagina: 2, totalPaginas: 5 }));
    renderCatalogo("/opac/escolar?q=libro&pagina=2");
    const paginas = await screen.findByRole("navigation", { name: "Páginas de resultados" });
    expect(within(paginas).getByText("2")).toHaveAttribute("aria-current", "page");
    expect(within(paginas).getByRole("link", { name: "Página 5" })).toHaveAttribute("href", "/opac/escolar?q=libro&pagina=5");
    expect(within(paginas).getByRole("link", { name: "Página 1" })).toHaveAttribute("href", "/opac/escolar?q=libro");
    expect(within(paginas).getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/opac/escolar?q=libro&pagina=3");
  });

  it("sin resultados lo explica, y si falla deja reintentar", async () => {
    api.opacBuscar.mockRejectedValueOnce(new Error("Error 503"));
    const user = userEvent.setup();
    renderCatalogo("/opac/escolar?q=zzz");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo buscar: Error 503");
    api.opacBuscar.mockResolvedValue(respuesta({ resultados: [] }));
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No encontramos nada para «zzz».")).toBeInTheDocument();
  });
});
