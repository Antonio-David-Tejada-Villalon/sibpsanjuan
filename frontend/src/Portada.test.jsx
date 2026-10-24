import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Portada from "./Portada.jsx";
import GestorPortada from "./GestorPortada.jsx";
import api from "./api.js";

vi.mock("./api.js", () => ({
  default: {
    obtenerPortada: vi.fn(),
    buscarPortadaPorIsbn: vi.fn(),
    portadaDesdeUrl: vi.fn(),
    quitarPortada: vi.fn(),
  },
}));

describe("Portada", () => {
  it("sin portada dibuja una tapa con título y autor, nunca un recuadro gris", () => {
    const { container } = render(<Portada src={null} titulo="Ficciones" autor="Borges, Jorge Luis" />);
    const tapa = container.querySelector(".tapa-tipografica");
    expect(tapa).toHaveTextContent("Ficciones");
    expect(tapa).toHaveTextContent("Borges, Jorge Luis");
    expect(tapa).toHaveAttribute("aria-hidden", "true");
  });

  it("en la ficha la tapa se anuncia como imagen", () => {
    render(<Portada src={null} titulo="Ficciones" decorativa={false} />);
    expect(screen.getByRole("img", { name: "Sin portada: tapa con el título Ficciones" })).toBeInTheDocument();
  });

  it("con portada usa la imagen del propio servidor, con medidas 2:3 reservadas, y si falla vuelve a la tapa", () => {
    const { container } = render(<Portada src="/api/v1/opac/x/portadas/1/miniatura.webp?v=a" titulo="Ficciones" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("width", "120");
    expect(img).toHaveAttribute("height", "180");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".tapa-tipografica")).toHaveTextContent("Ficciones");
  });
});

describe("GestorPortada", () => {
  beforeEach(() => vi.clearAllMocks());

  it("antes de guardar el material explica que la portada viene después", () => {
    render(<GestorPortada itemTipo="Libro" itemId={null} titulo="Nuevo" isbn="" />);
    expect(screen.getByText(/Guardá el material y después/)).toBeInTheDocument();
    expect(api.obtenerPortada).not.toHaveBeenCalled();
  });

  it("busca por ISBN y muestra la fuente", async () => {
    api.obtenerPortada.mockRejectedValue(Object.assign(new Error("Sin portada"), { status: 404 }));
    api.buscarPortadaPorIsbn.mockResolvedValue({ fuente: "openlibrary", url: "/api/v1/opac/x/portadas/l1/grande.webp?v=abc" });
    const user = userEvent.setup();
    render(<GestorPortada itemTipo="Libro" itemId="l1" titulo="Ficciones" isbn="9789875666474" />);
    expect(await screen.findByText(/Sin portada: el catálogo muestra una tapa/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Buscar por ISBN/ }));
    expect(api.buscarPortadaPorIsbn).toHaveBeenCalledWith("Libro", "l1");
    expect(await screen.findByText("Fuente: Open Library.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Portada de Ficciones" })).toHaveAttribute(
      "src",
      "/api/v1/opac/x/portadas/l1/grande.webp?v=abc"
    );
  });

  it("Enter en la URL usa la imagen sin enviar el formulario de la página", async () => {
    api.obtenerPortada.mockRejectedValue(Object.assign(new Error("Sin portada"), { status: 404 }));
    api.portadaDesdeUrl.mockResolvedValue({ fuente: "url", url: "/api/v1/opac/x/portadas/o1/grande.webp?v=1" });
    const alEnviar = vi.fn((e) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={alEnviar}>
        <GestorPortada itemTipo="Objeto" itemId="o1" titulo="Brújula" />
      </form>
    );
    await screen.findByText(/Sin portada/);
    expect(screen.queryByRole("button", { name: /Buscar por ISBN/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Imagen desde una URL"), "https://museo.example/brujula.jpg{Enter}");
    expect(api.portadaDesdeUrl).toHaveBeenCalledWith("Objeto", "o1", "https://museo.example/brujula.jpg");
    expect(alEnviar).not.toHaveBeenCalled();
    expect(await screen.findByText(/Fuente: una URL cargada por el personal/)).toBeInTheDocument();
  });

  it("un error de la descarga se muestra tal cual", async () => {
    api.obtenerPortada.mockRejectedValue(Object.assign(new Error("Sin portada"), { status: 404 }));
    api.portadaDesdeUrl.mockRejectedValue(new Error("Esa dirección apunta a una red interna o reservada y no se puede usar."));
    const user = userEvent.setup();
    render(<GestorPortada itemTipo="Objeto" itemId="o1" titulo="Brújula" />);
    await screen.findByText(/Sin portada/);
    await user.type(screen.getByLabelText("Imagen desde una URL"), "http://169.254.169.254/");
    await user.click(screen.getByRole("button", { name: "Usar esta imagen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("red interna");
  });
});
