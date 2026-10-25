import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CodigoBarras, { modulosCode39 } from "./CodigoBarras.jsx";

describe("CodigoBarras (Code 39)", () => {
  it("cada carácter ocupa 15 módulos más 1 de separación, entre asteriscos", () => {
    // *2318* = 6 caracteres: 6 × 15 + 5 separaciones.
    const modulos = modulosCode39("2318");
    expect(modulos).toHaveLength(6 * 15 + 5);
    expect(modulos.startsWith("1")).toBe(true);
    expect(modulos.endsWith("1")).toBe(true);
    // El asterisco de inicio: barra, espacio ancho, barra, barra ancha…
    expect(modulos.slice(0, 15)).toBe("100010111011101");
  });

  it("pasa a mayúsculas y rechaza lo que Code 39 no codifica", () => {
    expect(modulosCode39("bpsj-1")).toBe(modulosCode39("BPSJ-1"));
    expect(modulosCode39("Ñandú")).toBeNull();
    expect(modulosCode39("A*B")).toBeNull();
    expect(modulosCode39("")).toBeNull();
  });

  it("dibuja un SVG con nombre accesible, o el texto si no se puede codificar", () => {
    const { rerender } = render(<CodigoBarras valor="2318" />);
    expect(screen.getByRole("img", { name: "Código de barras 2318" })).toBeInTheDocument();

    rerender(<CodigoBarras valor="Ñ-1" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Ñ-1")).toBeInTheDocument();
  });
});
