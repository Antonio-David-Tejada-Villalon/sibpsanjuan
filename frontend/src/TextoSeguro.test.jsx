import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TextoSeguro from "./TextoSeguro.jsx";
import { contraste, contrasteDelAcento, cssDeMarca, tokensDeMarca } from "./marca.js";

describe("TextoSeguro", () => {
  it("arma párrafos, negrita, cursiva, listas y enlaces", () => {
    const { container } = render(
      <TextoSeguro
        texto={"La biblioteca cierra por **inventario** el *lunes*.\n\n- Devolvé tus libros\n- Pedí renovación\n\n1. Uno\n2. Dos\n\nMás en [el sitio](https://colegio.edu.ar) o [escribinos](mailto:biblio@colegio.edu.ar)."}
      />
    );
    expect(container.querySelector("strong")).toHaveTextContent("inventario");
    expect(container.querySelector("em")).toHaveTextContent("lunes");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    const sitio = screen.getByRole("link", { name: "el sitio" });
    expect(sitio).toHaveAttribute("href", "https://colegio.edu.ar");
    expect(sitio).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "escribinos" })).not.toHaveAttribute("target");
  });

  it("nunca interpreta HTML ni enlaces javascript:", () => {
    const { container } = render(
      <TextoSeguro texto={'<script>alert(1)</script> <img src=x onerror=alert(1)> [clic](javascript:alert(1))'} />
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent("<script>alert(1)</script>");
  });
});

describe("marca", () => {
  it("deriva un color de texto legible en claro y en oscuro a partir del acento", () => {
    for (const acento of ["#ff8300", "#ffb703", "#3ec1d3", "#8ac926"]) {
      const t = tokensDeMarca(acento);
      for (const fondo of ["#faf8f5", "#ffffff", "#f3f0eb"]) expect(contraste(t.textoClaro, fondo)).toBeGreaterThanOrEqual(4.5);
      for (const fondo of ["#14161a", "#1e2126", "#262a31"]) expect(contraste(t.textoOscuro, fondo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("el acento del sistema pasa el control de contraste y un azul oscuro no", () => {
    expect(contrasteDelAcento("#ff8300")).toBeGreaterThanOrEqual(4.5);
    expect(contrasteDelAcento("#1d4ed8")).toBeLessThan(4.5);
  });

  it("la hoja de estilo solo se arma con un color válido y redefine los alias", () => {
    expect(cssDeMarca("red; } body { display: none")).toBe("");
    const css = cssDeMarca("#ffb703");
    expect(css).toContain(".marca-institucion { --marca: #ffb703;");
    expect(css).toContain("--brand: #ffb703;");
    expect(css).toContain(':root[data-theme="dark"] .marca-institucion');
  });
});
