import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import FormularioSocio from "./FormularioSocio.jsx";
import { AuthProvider } from "../../AuthContext.jsx";
import api from "../../api.js";

vi.mock("../../api.js", () => ({
  default: {
    yo: vi.fn(),
    obtenerSocio: vi.fn(),
    listarCategorias: vi.fn(),
    verDatosContactoSocio: vi.fn(),
    actualizarSocio: vi.fn(),
    crearSocio: vi.fn(),
  },
}));

const CATEGORIAS = [
  { _id: "c1", codigo: "ALUMNO", nombre: "Alumno", datosMinimos: true },
  { _id: "c2", codigo: "DOCENTE", nombre: "Docente", datosMinimos: false },
];

const DOCENTE = {
  _id: "s1",
  numeroSocio: "D-20",
  apellido: "Herrera",
  nombre: "Martín",
  categoria: "DOCENTE",
  dni: "•••222",
  telefono: "•••234",
  email: "m•••@colegio.edu.ar",
  localidad: "Rivadavia",
  tieneLoginOpac: false,
};

function Ficha() {
  const location = useLocation();
  return (
    <p>
      FICHA {location.pathname} {location.state?.aviso}
    </p>
  );
}

function renderFormulario(sesion, ruta = "/socios/nuevo") {
  api.yo.mockResolvedValue(sesion);
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/socios/nuevo" element={<FormularioSocio />} />
          <Route path="/socios/:id/editar" element={<FormularioSocio />} />
          <Route path="/socios/:id" element={<Ficha />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("FormularioSocio: alta y edición, solos en su pantalla", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listarCategorias.mockResolvedValue(CATEGORIAS);
    api.obtenerSocio.mockResolvedValue(DOCENTE);
  });

  it("para Alumno pide legajo y curso, sin DNI, domicilio ni teléfono", async () => {
    const user = userEvent.setup();
    renderFormulario({ rol: "superbibliotecario", bibliotecaId: "b1" });
    // Las categorías llegan después de la sesión (dependen de su biblioteca).
    await screen.findByRole("option", { name: "Alumno" });
    await user.selectOptions(screen.getByLabelText("Categoría *"), "ALUMNO");

    expect(screen.getByLabelText("Legajo *")).toBeInTheDocument();
    expect(screen.getByLabelText("Curso y división")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo del tutor o tutora")).toBeInTheDocument();
    expect(screen.queryByLabelText("DNI")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Teléfono")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dirección")).not.toBeInTheDocument();
  });

  it("al guardar un socio nuevo va a su ficha con el aviso", async () => {
    api.crearSocio.mockResolvedValue({ _id: "s9" });
    const user = userEvent.setup();
    renderFormulario({ rol: "superbibliotecario", bibliotecaId: "b1" });
    await screen.findByRole("option", { name: "Alumno" });

    await user.selectOptions(screen.getByLabelText("Categoría *"), "ALUMNO");
    await user.type(screen.getByLabelText("Legajo *"), "2401");
    await user.type(screen.getByLabelText("Apellido *"), "Quiroga");
    await user.type(screen.getByLabelText("Nombre *"), "Lucía");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // Datos mínimos: lo que no se pide tampoco se manda.
    expect(api.crearSocio).toHaveBeenCalledWith(expect.not.objectContaining({ dni: expect.anything() }));
    expect(api.crearSocio).toHaveBeenCalledWith(expect.objectContaining({ numeroSocio: "2401", categoria: "ALUMNO" }));
    expect(await screen.findByText("FICHA /socios/s9 Socio dado de alta.")).toBeInTheDocument();
  });

  it("al editar, el contacto se ve oculto y de solo lectura hasta pedir verlo completo", async () => {
    api.verDatosContactoSocio.mockResolvedValue({
      dni: "30111222",
      telefono: "264 400 1234",
      email: "mherrera@colegio.edu.ar",
      direccion: "",
      emailTutor: "",
      fechaNacimiento: "",
    });
    const user = userEvent.setup();
    renderFormulario({ rol: "superbibliotecario", bibliotecaId: "b1" }, "/socios/s1/editar");

    const dni = await screen.findByLabelText("DNI");
    expect(dni).toHaveValue("•••222");
    expect(dni).toHaveAttribute("readonly");

    await user.click(screen.getByRole("button", { name: "Ver datos completos" }));
    expect(api.verDatosContactoSocio).toHaveBeenCalledWith("s1");
    expect(await screen.findByDisplayValue("30111222")).not.toHaveAttribute("readonly");
    expect(screen.getByText(/Quedó registrado que viste los datos completos/)).toBeInTheDocument();
  });

  it("un bibliotecario sin el permiso no tiene el botón para verlos", async () => {
    renderFormulario({ rol: "bibliotecario", bibliotecaId: "b1", permisos: { socios: true } }, "/socios/s1/editar");
    await screen.findByLabelText("DNI");
    expect(screen.queryByRole("button", { name: "Ver datos completos" })).not.toBeInTheDocument();
    expect(screen.getByText(/hace falta el permiso/)).toBeInTheDocument();
  });
});
