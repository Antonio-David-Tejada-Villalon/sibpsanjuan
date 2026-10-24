import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SelectorTema from "./SelectorTema.jsx";

describe("SelectorTema", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("ofrece Claro, Oscuro y Automático, con Automático elegido por defecto", () => {
    render(<SelectorTema />);
    const opciones = screen.getAllByRole("radio");
    expect(opciones.map((o) => o.textContent)).toEqual(["Claro", "Oscuro", "Automático"]);
    expect(screen.getByRole("radio", { name: "Automático" })).toHaveAttribute("aria-checked", "true");
  });

  it("aplica y guarda el tema elegido, y Automático vuelve a seguir al sistema", async () => {
    const usuario = userEvent.setup();
    render(<SelectorTema />);

    await usuario.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("tema")).toBe("dark");
    expect(screen.getByRole("status")).toHaveTextContent("Tema oscuro activado");

    await usuario.click(screen.getByRole("radio", { name: "Automático" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem("tema")).toBeNull();
  });

  it("respeta una elección guardada y se recorre con las flechas", async () => {
    localStorage.setItem("tema", "light");
    const usuario = userEvent.setup();
    render(<SelectorTema compacto />);

    const claro = screen.getByRole("radio", { name: "Claro" });
    expect(claro).toHaveAttribute("aria-checked", "true");
    claro.focus();
    await usuario.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Oscuro" })).toHaveFocus();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("ignora un valor guardado desconocido", () => {
    localStorage.setItem("tema", "violeta");
    render(<SelectorTema />);
    expect(screen.getByRole("radio", { name: "Automático" })).toHaveAttribute("aria-checked", "true");
  });
});
