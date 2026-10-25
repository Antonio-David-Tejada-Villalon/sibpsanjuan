import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import FichaMaterialPanel from "./FichaMaterialPanel.jsx";
import { AuthProvider } from "../../AuthContext.jsx";
import api from "../../api.js";

vi.mock("../../api.js", () => ({
  default: {
    yo: vi.fn(),
    obtenerMaterial: vi.fn(),
    listarEjemplares: vi.fn(),
    obtenerMarc: vi.fn(),
    listarPrestamos: vi.fn(),
    listarSolicitudes: vi.fn(),
    crearEjemplares: vi.fn(),
    actualizarEjemplar: vi.fn(),
    eliminarEjemplar: vi.fn(),
    crearReserva: vi.fn(),
    obtenerSocio: vi.fn(),
    listarSociosPaginado: vi.fn(),
    aprobarSolicitud: vi.fn(),
    cancelarSolicitud: vi.fn(),
  },
  urlPortada: vi.fn(() => "/portada.webp"),
}));

const MATERIAL = {
  itemTipo: "Libro",
  etiquetaTipo: "Libro",
  circula: true,
  reservasAbiertas: 0,
  biblioteca: { codigo: "escolar", nombre: "Biblioteca Escolar" },
  item: {
    _id: "l1",
    titulo: "Ficciones",
    subtitulo: "Cuentos",
    autores: ["Borges, Jorge Luis"],
    editorial: "Emecé",
    anio: "1944",
    materias: ["Literatura argentina"],
    creado: "2026-10-01T12:00:00Z",
  },
};

const PRESTADO = {
  _id: "e1",
  codigoBarras: "BPSJ-000001",
  signatura: "863 BOR",
  numeroCopia: "1",
  ubicacion: "Literatura, estante 3",
  estadoVisible: "prestado",
  prestamo: { socio: { apellido: "Herrera", nombre: "Martín" }, fechaVencimiento: "2026-10-30T12:00:00Z" },
};

const SOCIA = {
  _id: "s1",
  numeroSocio: "2318",
  apellido: "Quiroga",
  nombre: "Lucía",
  reglas: { maxPrestamos: 2, enCurso: 0 },
};

function renderFicha(ruta = "/catalogo/Libro/l1", sesion = { rol: "superbibliotecario", bibliotecaId: "b1" }) {
  api.yo.mockResolvedValue(sesion);
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/catalogo/:itemTipo/:id" element={<FichaMaterialPanel />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  api.obtenerMaterial.mockResolvedValue(MATERIAL);
  api.listarEjemplares.mockResolvedValue([PRESTADO]);
  api.listarSolicitudes.mockResolvedValue([]);
  api.obtenerSocio.mockResolvedValue(SOCIA);
});

describe("FichaMaterialPanel", () => {
  it("la vista Normal muestra los datos y las existencias con su estado, como en Koha", async () => {
    renderFicha();

    expect(await screen.findByRole("heading", { level: 1, name: /Ficciones/ })).toBeInTheDocument();
    const vistas = screen.getByRole("navigation", { name: "Vistas del material" });
    expect(within(vistas).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Normal",
      "MARC",
      "ISBD",
      "Ítems (1)",
      "Reservas",
      "Historial de préstamos",
    ]);
    const existencias = screen.getByRole("table");
    expect(within(existencias).getByText("Prestado")).toBeInTheDocument();
    expect(within(existencias).getByText(/A Herrera, Martín, vence el/)).toBeInTheDocument();
    expect(within(existencias).getByText("Literatura, estante 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Editar registro/ })).toHaveAttribute("href", "/catalogar/libro/l1");
  });

  it("la vista MARC muestra cada campo con indicadores y subcampos con nombre", async () => {
    api.obtenerMarc.mockResolvedValue({
      campos: [
        { tag: "001", nombre: "Número de control", valor: "l1" },
        {
          tag: "245",
          ind1: "1",
          ind2: "0",
          nombre: "Mención de título",
          subcampos: [
            { codigo: "a", nombre: "Título", valor: "Ficciones :" },
            { codigo: "b", nombre: "Resto del título", valor: "Cuentos" },
          ],
        },
      ],
    });
    renderFicha("/catalogo/Libro/l1?vista=marc");

    expect(await screen.findByRole("heading", { name: "Registro MARC" })).toBeInTheDocument();
    expect(api.obtenerMarc).toHaveBeenCalledWith("Libro", "l1");
    expect(screen.getByText("245")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Resto del título")).toBeInTheDocument();
    expect(screen.getByText("Cuentos")).toBeInTheDocument();
  });

  it("Archivos y objetos no tienen vista MARC", async () => {
    api.obtenerMaterial.mockResolvedValue({ ...MATERIAL, itemTipo: "Objeto", etiquetaTipo: "Objeto", circula: false });
    renderFicha("/catalogo/Objeto/l1");

    const vistas = await screen.findByRole("navigation", { name: "Vistas del material" });
    expect(within(vistas).queryByRole("button", { name: "MARC" })).not.toBeInTheDocument();
    expect(within(vistas).queryByRole("button", { name: /Ítems/ })).not.toBeInTheDocument();
  });

  it("en Ítems agrega varias copias iguales de una vez (952)", async () => {
    api.crearEjemplares.mockResolvedValue([
      { codigoBarras: "BPSJ-000002" },
      { codigoBarras: "BPSJ-000003" },
      { codigoBarras: "BPSJ-000004" },
    ]);
    const user = userEvent.setup();
    renderFicha("/catalogo/Libro/l1?vista=items");

    const codigo = await screen.findByLabelText(/Código de barras/);
    // La signatura se sugiere de los ejemplares que ya tiene.
    expect(screen.getByLabelText(/Signatura topográfica/)).toHaveValue("863 BOR");
    await user.type(codigo, "BPSJ-000002");
    const copias = screen.getByLabelText("Copias iguales");
    await user.clear(copias);
    await user.type(copias, "3");
    await user.click(screen.getByRole("button", { name: "Agregar ejemplar" }));

    expect(api.crearEjemplares).toHaveBeenCalledWith(
      expect.objectContaining({ itemTipo: "Libro", itemId: "l1", codigoBarras: "BPSJ-000002", signatura: "863 BOR", cantidad: 3 })
    );
    expect(await screen.findByText("Se agregaron 3 ejemplares (BPSJ-000002 a BPSJ-000004).")).toBeInTheDocument();
    expect(api.listarEjemplares).toHaveBeenCalledTimes(2);
  });

  it("en Reservas, con todo prestado, la reserva del socio queda en espera", async () => {
    api.crearReserva.mockResolvedValue({ estado: "en_espera" });
    const user = userEvent.setup();
    // Llega desde la ficha del socio («Buscar para reservar»), ya elegido.
    renderFicha("/catalogo/Libro/l1?vista=reservas&socio=s1");

    expect(await screen.findByText(/No hay ejemplares libres ahora: la reserva queda en espera/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reservar (en espera)" }));

    expect(api.crearReserva).toHaveBeenCalledWith({ socioId: "s1", itemTipo: "Libro", itemId: "l1", ejemplarId: undefined });
    expect(await screen.findByText(/Reserva en espera para Quiroga, Lucía/)).toBeInTheDocument();
  });

  it("no deja reservar lo que el servidor rechazaría: ya lo tiene prestado o ya lo reservó", async () => {
    api.listarEjemplares.mockResolvedValue([{ ...PRESTADO, prestamo: { ...PRESTADO.prestamo, socio: { ...SOCIA } } }]);
    const { unmount } = renderFicha("/catalogo/Libro/l1?vista=reservas&socio=s1");

    expect(await screen.findByText("Ya tiene prestado un ejemplar de este material.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reservar (en espera)" })).toBeDisabled();
    unmount();

    api.listarEjemplares.mockResolvedValue([PRESTADO]);
    api.listarSolicitudes.mockResolvedValue([{ _id: "r1", tipo: "prestamo", estado: "en_espera", socioId: "s1", socio: SOCIA, fechaSolicitud: "2026-10-20T12:00:00Z" }]);
    renderFicha("/catalogo/Libro/l1?vista=reservas&socio=s1");

    expect(await screen.findByText("Ya tiene un pedido o una reserva de este material.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reservar (en espera)" })).toBeDisabled();
  });
});
