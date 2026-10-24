import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import FichaMaterial from "./FichaMaterial.jsx";
import CuentaSocio from "./CuentaSocio.jsx";
import { SocioAuthProvider } from "../../SocioAuthContext.jsx";
import api from "../../api.js";

vi.mock("../../api.js", () => ({
  urlPortada: (codigo, id, version) => (version ? `/portadas/${id}.webp?v=${version}` : null),
  default: {
    opacYo: vi.fn(),
    opacFicha: vi.fn(),
    opacMisReglas: vi.fn(),
    opacSolicitarPrestamo: vi.fn(),
    opacMisSolicitudes: vi.fn(),
    opacLogoutSocio: vi.fn(),
  },
}));

const ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const FICHA = {
  id: ID,
  itemTipo: "Libro",
  etiquetaTipo: "Libros",
  segmento: "libro",
  slug: "martin-fierro",
  titulo: "Martín Fierro",
  subtitulo: "",
  autores: ["Hernández, José"],
  materias: ["Poesía gauchesca"],
  detalle: [
    { etiqueta: "Año", valor: "1872" },
    { etiqueta: "Editorial", valor: "Colihue" },
  ],
  urlAcceso: "",
  urlInstruccion: "",
  soloLectura: false,
  circula: true,
  disponibles: 1,
  total: 2,
  ejemplares: [
    { signatura: "861 HER", estado: "disponible" },
    { signatura: "861 HER", estado: "prestado" },
  ],
  portada: null,
  portadaFuente: null,
  seo: {
    titulo: "Martín Fierro · José Hernández · Colegio",
    descripcion: "Martín Fierro de José Hernández (Colihue, 1872).",
    canonical: `https://catalogo.example/opac/escolar/libro/martin-fierro-${ID}`,
    robots: "index,follow",
    og: { tipo: "book", sitio: "Colegio", imagen: null },
    jsonLd: { "@context": "https://schema.org", "@graph": [{ "@type": "Book", name: "Martín Fierro" }] },
  },
};

const REGLAS = {
  categoria: { codigo: "ALUMNO", nombre: "Alumno" },
  diasPrestamo: 7,
  maxRenovaciones: 1,
  maxPrestamos: 2,
  multaPorDiaVencido: 0,
  enCurso: 1,
};

function UbicacionActual() {
  const location = useLocation();
  return <output data-testid="ubicacion">{location.pathname + location.search}</output>;
}

function renderFicha(entrada = `/opac/escolar/libro/martin-fierro-${ID}`) {
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route
          path="/opac/:codigo/libro/:slugId"
          element={
            <SocioAuthProvider>
              <FichaMaterial itemTipo="Libro" />
              <UbicacionActual />
            </SocioAuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("FichaMaterial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.opacFicha.mockResolvedValue(FICHA);
    api.opacMisReglas.mockResolvedValue(REGLAS);
  });

  it("muestra la ficha con migas de pan, autores, datos, materias y el estado de cada ejemplar", async () => {
    api.opacYo.mockRejectedValue(new Error("401"));
    renderFicha();
    expect(await screen.findByRole("heading", { level: 1, name: "Martín Fierro" })).toBeInTheDocument();
    expect(api.opacFicha).toHaveBeenCalledWith("escolar", "Libro", ID);
    const migas = screen.getByRole("navigation", { name: "Ubicación" });
    expect(within(migas).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Catálogo", "Libros", "Martín Fierro"]);
    expect(within(migas).getByText("Martín Fierro")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Hernández, José" })).toHaveAttribute("href", "/opac/escolar?autor=Hern%C3%A1ndez%2C%20Jos%C3%A9");
    expect(screen.getByText("1872")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Poesía gauchesca" })).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByText("Prestado")).toBeInTheDocument();
    expect(screen.getByText("1 ejemplar disponible")).toBeInTheDocument();
    // Título, canonical y datos estructurados de la API (los mismos que
    // escribe el servidor al entrar directo).
    expect(document.title).toBe("Martín Fierro · José Hernández · Colegio");
    expect(document.head.querySelector('link[rel="canonical"]').href).toBe(FICHA.seo.canonical);
    expect(document.head.querySelector('script[type="application/ld+json"]').textContent).toContain('"@type":"Book"');
  });

  it("el enlace para ingresar no se sigue (es una página privada)", async () => {
    api.opacYo.mockRejectedValue(new Error("401"));
    renderFicha();
    expect(await screen.findByRole("link", { name: "Ingresá para pedirlo" })).toHaveAttribute("rel", "nofollow");
  });

  it("si la dirección no es la canónica (título viejo), la reemplaza", async () => {
    api.opacYo.mockRejectedValue(new Error("401"));
    renderFicha(`/opac/escolar/libro/titulo-viejo-${ID}`);
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(screen.getByTestId("ubicacion")).toHaveTextContent(`/opac/escolar/libro/martin-fierro-${ID}`));
  });

  it("sin sesión ofrece ingresar y volver a esta ficha", async () => {
    api.opacYo.mockRejectedValue(new Error("401"));
    renderFicha();
    const ingresar = await screen.findByRole("link", { name: "Ingresá para pedirlo" });
    expect(ingresar).toHaveAttribute("href", `/opac/escolar/login?volver=${encodeURIComponent(`/opac/escolar/libro/martin-fierro-${ID}`)}`);
  });

  it("antes de pedir muestra las reglas de la categoría, y después confirma", async () => {
    api.opacYo.mockResolvedValue({ numeroSocio: "2318", nombre: "Valentina", apellido: "Gómez" });
    api.opacSolicitarPrestamo.mockResolvedValue({});
    const user = userEvent.setup();
    renderFicha();
    await user.click(await screen.findByRole("button", { name: "Pedir préstamo" }));
    expect(await screen.findByText("Dura 7 días (categoría Alumno).")).toBeInTheDocument();
    expect(screen.getByText("Podés renovarlo hasta 1 vez.")).toBeInTheDocument();
    expect(screen.getByText("Tenés 1 de 2 préstamos o pedidos en curso.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));
    expect(api.opacSolicitarPrestamo).toHaveBeenCalledWith("escolar", "Libro", ID);
    expect(await screen.findByText(/tu pedido quedó registrado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver mis pedidos" })).toHaveAttribute("href", "/opac/escolar/cuenta");
  });

  it("en el tope de la categoría no deja confirmar y explica por qué", async () => {
    api.opacYo.mockResolvedValue({ numeroSocio: "2318" });
    api.opacMisReglas.mockResolvedValue({ ...REGLAS, enCurso: 2 });
    const user = userEvent.setup();
    renderFicha();
    await user.click(await screen.findByRole("button", { name: "Pedir préstamo" }));
    expect(await screen.findByText(/Ya llegaste al máximo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar pedido" })).toBeDisabled();
  });

  it("sin conexión deshabilita el pedido y avisa", async () => {
    api.opacYo.mockResolvedValue({ numeroSocio: "2318" });
    renderFicha();
    const pedir = await screen.findByRole("button", { name: "Pedir préstamo" });
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(pedir).toBeDisabled();
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(pedir).toBeEnabled();
  });

  it("un material que no existe muestra un mensaje claro", async () => {
    api.opacYo.mockRejectedValue(new Error("401"));
    api.opacFicha.mockRejectedValue(Object.assign(new Error("Material no encontrado."), { status: 404 }));
    renderFicha();
    expect(await screen.findByRole("heading", { name: "Material no encontrado" })).toBeInTheDocument();
  });
});

describe("CuentaSocio", () => {
  it("lista los pedidos con su estado en palabras y enlace a la ficha", async () => {
    vi.clearAllMocks();
    api.opacYo.mockResolvedValue({ numeroSocio: "2318", nombre: "Valentina", apellido: "Gómez" });
    api.opacMisReglas.mockResolvedValue(REGLAS);
    api.opacMisSolicitudes.mockResolvedValue([
      {
        _id: "s1",
        tipo: "prestamo",
        estado: "pendiente",
        fechaSolicitud: "2026-10-24T12:00:00Z",
        material: { itemTipo: "Libro", id: ID, titulo: "Martín Fierro", segmento: "libro", slug: "martin-fierro" },
      },
      {
        _id: "s2",
        tipo: "prestamo",
        estado: "rechazada",
        fechaSolicitud: "2026-10-20T12:00:00Z",
        fechaResolucion: "2026-10-21T12:00:00Z",
        notaStaff: "No quedan ejemplares",
        material: null,
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/opac/escolar/cuenta"]}>
        <Routes>
          <Route
            path="/opac/:codigo/cuenta"
            element={
              <SocioAuthProvider>
                <CuentaSocio />
              </SocioAuthProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByRole("link", { name: "Martín Fierro" })).toHaveAttribute("href", `/opac/escolar/libro/martin-fierro-${ID}`);
    expect(screen.getByText("Pendiente: la biblioteca todavía no lo revisó")).toBeInTheDocument();
    expect(screen.getByText("Rechazado")).toBeInTheDocument();
    expect(screen.getByText("Nota de la biblioteca: No quedan ejemplares")).toBeInTheDocument();
    expect(await screen.findByText(/Valentina Gómez · Socio n.º 2318/)).toBeInTheDocument();
  });
});
