import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pager from "./Pager.jsx";

describe("Pager", () => {
  it("no renderiza nada si el total entra en una sola página", () => {
    const { container } = render(
      <Pager pagina={1} porPagina={50} total={10} onCambiar={() => {}} etiqueta="libros" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra la página actual y el total, y deshabilita 'Anterior' en la primera página", () => {
    render(<Pager pagina={1} porPagina={2} total={5} onCambiar={() => {}} etiqueta="libros" />);
    expect(screen.getByText(/página 1 de 3/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeEnabled();
  });

  it("deshabilita 'Siguiente' en la última página", () => {
    render(<Pager pagina={3} porPagina={2} total={5} onCambiar={() => {}} etiqueta="libros" />);
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeDisabled();
  });

  it("llama a onCambiar con la página siguiente al hacer click", async () => {
    const onCambiar = vi.fn();
    const user = userEvent.setup();
    render(<Pager pagina={2} porPagina={2} total={5} onCambiar={onCambiar} etiqueta="libros" />);
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(onCambiar).toHaveBeenCalledWith(3);
  });
});
