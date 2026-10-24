import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContenidoOpac, { slugDe } from "./ContenidoOpac.jsx";
import api from "../api.js";

vi.mock("../api.js", () => ({
  default: {
    obtenerBorradorContenido: vi.fn(),
    listarVersionesContenido: vi.fn(),
    guardarBorradorContenido: vi.fn(),
    publicarContenido: vi.fn(),
    descartarBorradorContenido: vi.fn(),
    restaurarVersionContenido: vi.fn(),
    subirImagenContenido: vi.fn(),
  },
}));

function estado({ puedePublicar = true, borrador = { version: 2, actualizadoEn: "2026-10-24T12:00:00Z" }, falta = [] } = {}) {
  return {
    codigo: "escolar",
    borrador,
    publicada: { version: 1, publicadoEn: "2026-10-20T12:00:00Z" },
    puedePublicar,
    faltaParaPublicar: falta,
    datos: {
      identidad: { nombre: "Colegio San Juan", nombreLegal: "", colorAcento: "#ff8300", logos: { cuadrado: null, horizontal: null, oscuro: null } },
      contacto: { email: "", telefono: "", direccion: "", horario: "", web: "" },
      avisos: [],
      paginas: [],
    },
  };
}

describe("ContenidoOpac (CMS del panel)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listarVersionesContenido.mockResolvedValue([
      { _id: "v1", version: 1, estado: "publicada", publicadoEn: "2026-10-20T12:00:00Z", publicadoPor: "bpcms" },
    ]);
  });

  it("guarda el borrador con los cambios y avisa si hay cambios sin guardar", async () => {
    api.obtenerBorradorContenido.mockResolvedValue(estado());
    api.guardarBorradorContenido.mockImplementation(async (datos) => ({ ...estado(), datos }));
    const user = userEvent.setup();
    render(<ContenidoOpac />);
    const nombre = await screen.findByLabelText("Nombre de la institución *");
    await user.clear(nombre);
    await user.type(nombre, "Colegio Nuevo");
    expect(screen.getByText("Hay cambios sin guardar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(api.guardarBorradorContenido.mock.calls[0][0].identidad.nombre).toBe("Colegio Nuevo");
    expect(await screen.findByText("Borrador guardado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();
  });

  it("muestra el contraste del color elegido y si alcanza para publicar", async () => {
    api.obtenerBorradorContenido.mockResolvedValue(estado());
    const user = userEvent.setup();
    render(<ContenidoOpac />);
    const codigo = await screen.findByLabelText("Código del color");
    expect(screen.getByText(/se lee bien/)).toBeInTheDocument();
    await user.clear(codigo);
    await user.type(codigo, "#1d4ed8");
    expect(screen.getByText(/hace falta al menos 4.5:1 para publicar/)).toBeInTheDocument();
  });

  it("la dirección de una página nueva sigue al título", async () => {
    api.obtenerBorradorContenido.mockResolvedValue(estado());
    const user = userEvent.setup();
    render(<ContenidoOpac />);
    await user.click(await screen.findByRole("button", { name: "Agregar página" }));
    await user.type(screen.getByLabelText("Título *"), "Reglamento de Préstamos");
    expect(screen.getByLabelText("Dirección *")).toHaveValue("reglamento-de-prestamos");
    expect(slugDe("  ¿Cómo pido un libro?  ")).toBe("como-pido-un-libro");
  });

  it("un bibliotecario edita el borrador pero no ve publicar ni restaurar", async () => {
    api.obtenerBorradorContenido.mockResolvedValue(estado({ puedePublicar: false }));
    render(<ContenidoOpac />);
    await screen.findByLabelText("Nombre de la institución *");
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Restaurar como borrador/ })).not.toBeInTheDocument();
    expect(screen.getByText("Lo publica un admin, supervisor o superbibliotecario.")).toBeInTheDocument();
  });

  it("muestra la lista de errores de validación que devuelve el servidor", async () => {
    api.obtenerBorradorContenido.mockResolvedValue(estado());
    api.guardarBorradorContenido.mockRejectedValue(
      Object.assign(new Error("Aviso 1 — título: es obligatorio."), {
        status: 400,
        datos: { errores: ["Aviso 1 — título: es obligatorio.", "Sitio web: tiene que empezar con https:// (o http://)."] },
      })
    );
    const user = userEvent.setup();
    render(<ContenidoOpac />);
    // Una URL válida para el navegador (type="url") pero no para el servidor.
    await user.type(await screen.findByLabelText("Sitio web de la institución"), "ftp://colegio.edu.ar");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Hay que corregir");
    expect(alerta).toHaveTextContent("Sitio web: tiene que empezar con https://");
  });
});
