import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import FichaSocio from "./FichaSocio.jsx";
import { AuthProvider } from "../../AuthContext.jsx";
import api from "../../api.js";

vi.mock("../../api.js", () => ({
  default: {
    yo: vi.fn(),
    obtenerSocio: vi.fn(),
    listarPrestamos: vi.fn(),
    listarSolicitudes: vi.fn(),
    prestarPorCodigo: vi.fn(),
    procesarDevolucion: vi.fn(),
    renovarPrestamo: vi.fn(),
    aprobarSolicitud: vi.fn(),
    rechazarSolicitud: vi.fn(),
    cancelarSolicitud: vi.fn(),
    verDatosContactoSocio: vi.fn(),
    crearCredencialesSocio: vi.fn(),
    eliminarSocio: vi.fn(),
  },
}));

const SOCIA = {
  _id: "s1",
  numeroSocio: "2318",
  apellido: "Quiroga",
  nombre: "Lucía",
  categoria: "ALUMNO",
  categoriaInfo: { nombre: "Alumno" },
  curso: "3° B",
  biblioteca: { nombre: "Biblioteca Escolar" },
  reglas: { diasPrestamo: 7, maxRenovaciones: 1, maxPrestamos: 2, enCurso: 2 },
  tieneLoginOpac: true,
};

const PRESTAMOS = [
  {
    _id: "p1",
    itemTipo: "Libro",
    itemId: "l1",
    item: { titulo: "Ficciones" },
    ejemplar: { codigoBarras: "BPSJ-1", signatura: "863 BOR" },
    fechaEntrega: "2026-10-01T12:00:00Z",
    fechaVencimiento: "2026-10-08T12:00:00Z",
    vencido: true,
    diasAtraso: 3,
    renovacionesRestantes: 1,
    multa: 0,
  },
  {
    _id: "p2",
    itemTipo: "Libro",
    itemId: "l2",
    item: { titulo: "Rayuela" },
    ejemplar: { codigoBarras: "BPSJ-2" },
    fechaEntrega: "2026-10-20T12:00:00Z",
    fechaVencimiento: "2026-10-27T12:00:00Z",
    vencido: false,
    renovacionesRestantes: 0,
    multa: 0,
  },
];

function renderFicha(sesion = { rol: "superbibliotecario", bibliotecaId: "b1" }) {
  api.yo.mockResolvedValue(sesion);
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/socios/s1"]}>
        <Routes>
          <Route path="/socios/:id" element={<FichaSocio />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.obtenerSocio.mockResolvedValue(SOCIA);
  api.listarPrestamos.mockResolvedValue(PRESTAMOS);
  api.listarSolicitudes.mockResolvedValue([]);
});

describe("FichaSocio", () => {
  it("muestra los datos, el aviso de vencidos y los préstamos en curso", async () => {
    renderFicha();

    expect(await screen.findByRole("heading", { level: 1, name: /Quiroga, Lucía/ })).toBeInTheDocument();
    expect(api.listarPrestamos).toHaveBeenCalledWith({ estado: "activo", socioId: "s1" });
    expect(screen.getByText("Tiene 1 préstamo vencido.")).toBeInTheDocument();
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByRole("link", { name: "Ficciones" })).toHaveAttribute("href", "/catalogo/Libro/l1");
    expect(within(tabla).getByText("Vencido hace 3 días")).toBeInTheDocument();
    // Sin renovaciones restantes no se puede tildar para renovar.
    expect(screen.getByRole("checkbox", { name: "Renovar Rayuela" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Imprimir credencial/ })).toHaveAttribute("href", "/socios/s1/credencial");
  });

  it("renueva y devuelve lo tildado, y avisa si lo devuelto tenía reserva", async () => {
    api.renovarPrestamo.mockResolvedValue({ fechaVencimiento: "2026-11-01T12:00:00Z" });
    api.procesarDevolucion.mockResolvedValue({
      reservaSiguiente: { socio: { apellido: "Herrera", nombre: "Martín", numeroSocio: "D-20" } },
    });
    const user = userEvent.setup();
    renderFicha();
    await screen.findByRole("table");

    await user.click(screen.getByRole("checkbox", { name: "Renovar Ficciones" }));
    await user.click(screen.getByRole("checkbox", { name: "Devolver Rayuela" }));
    await user.click(screen.getByRole("button", { name: "Renovar o devolver lo seleccionado" }));

    expect(api.renovarPrestamo).toHaveBeenCalledWith("p1");
    expect(api.procesarDevolucion).toHaveBeenCalledWith("p2");
    expect(await screen.findByText(/Devuelto «Rayuela»/)).toBeInTheDocument();
    expect(screen.getByText(/No lo pongas en el estante: «Rayuela» quedó apartado para Herrera, Martín/)).toBeInTheDocument();
  });

  it("presta por código de barras desde la ficha", async () => {
    api.prestarPorCodigo.mockResolvedValue({ fechaVencimiento: "2026-11-01T12:00:00Z" });
    const user = userEvent.setup();
    renderFicha();

    await user.type(await screen.findByLabelText("Código de barras del ejemplar"), "BPSJ-7");
    await user.click(screen.getByRole("button", { name: "Prestar" }));

    expect(api.prestarPorCodigo).toHaveBeenCalledWith("s1", "BPSJ-7");
    expect(await screen.findByText(/Prestado BPSJ-7/)).toBeInTheDocument();
  });

  it("con la cuenta vencida no deja prestar", async () => {
    api.obtenerSocio.mockResolvedValue({ ...SOCIA, vigenteHasta: "2020-12-31" });
    renderFicha();

    expect(await screen.findByText(/La cuenta venció el 31\/12\/2020/)).toBeInTheDocument();
    expect(screen.getByLabelText("Código de barras del ejemplar")).toBeDisabled();
  });

  it("un bibliotecario solo con permiso de devoluciones no ve la caja de prestar ni la columna Renovar", async () => {
    renderFicha({ rol: "bibliotecario", bibliotecaId: "b1", permisos: { devoluciones: true } });
    await screen.findByRole("table");

    expect(screen.queryByLabelText("Código de barras del ejemplar")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /^Renovar/ })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Devolver Ficciones" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Editar/ })).not.toBeInTheDocument();
  });
});
