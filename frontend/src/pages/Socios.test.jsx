import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Socios from "./Socios.jsx";
import { AuthProvider } from "../AuthContext.jsx";
import api from "../api.js";

vi.mock("../api.js", () => ({
  default: {
    yo: vi.fn(),
    listarSociosPaginado: vi.fn(),
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

function renderSocios(sesion) {
  api.yo.mockResolvedValue(sesion);
  return render(
    <AuthProvider>
      <Socios />
    </AuthProvider>
  );
}

describe("Socios: datos mínimos y contacto enmascarado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listarSociosPaginado.mockResolvedValue({ items: [DOCENTE], total: 1 });
    api.listarCategorias.mockResolvedValue(CATEGORIAS);
  });

  it("para Alumno pide legajo y curso, sin DNI, domicilio ni teléfono", async () => {
    const user = userEvent.setup();
    renderSocios({ rol: "superbibliotecario", bibliotecaId: "b1" });
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
    renderSocios({ rol: "superbibliotecario", bibliotecaId: "b1" });
    await user.click(await screen.findByRole("button", { name: "Editar" }));

    const dni = screen.getByLabelText("DNI");
    expect(dni).toHaveValue("•••222");
    expect(dni).toHaveAttribute("readonly");

    await user.click(screen.getByRole("button", { name: "Ver datos completos" }));
    expect(api.verDatosContactoSocio).toHaveBeenCalledWith("s1");
    expect(await screen.findByDisplayValue("30111222")).not.toHaveAttribute("readonly");
    expect(screen.getByText(/Quedó registrado que viste los datos completos/)).toBeInTheDocument();
  });

  it("un bibliotecario sin el permiso no tiene el botón para verlos", async () => {
    const user = userEvent.setup();
    renderSocios({ rol: "bibliotecario", bibliotecaId: "b1", permisos: { socios: true } });
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.queryByRole("button", { name: "Ver datos completos" })).not.toBeInTheDocument();
    expect(screen.getByText(/hace falta el permiso/)).toBeInTheDocument();
  });
});
