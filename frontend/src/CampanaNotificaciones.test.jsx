import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CampanaNotificaciones, { avisarCambioDeNotificaciones } from "./CampanaNotificaciones.jsx";

const NOTIFICACIONES = {
  noLeidas: 2,
  notificaciones: [
    { clave: "pedido:1", tipo: "pedido", titulo: "Quiroga, Lucía pidió «Ficciones»", detalle: "Para retirar en el mostrador", enlace: "/socios/s1", leida: false },
    { clave: "vencido:2", tipo: "vencido", titulo: "«Rayuela» está vencido", enlace: "/socios/s2", leida: false },
    { clave: "aviso:3", tipo: "sistema", titulo: "Un aviso ya leído", leida: true },
  ],
};

function renderCampana(cargar, marcarVistas = vi.fn().mockResolvedValue({})) {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route
          path="*"
          element={<CampanaNotificaciones cargar={cargar} marcarVistas={marcarVistas} rutaDe={(n) => n.enlace || "/notificaciones"} rutaTodas="/notificaciones" />}
        />
      </Routes>
    </MemoryRouter>
  );
  return { marcarVistas };
}

describe("CampanaNotificaciones", () => {
  it("muestra cuántas hay sin leer y, al abrir una, la marca como vista", async () => {
    const cargar = vi.fn().mockResolvedValue(NOTIFICACIONES);
    const { marcarVistas } = renderCampana(cargar);
    const user = userEvent.setup();

    const boton = await screen.findByRole("button", { name: "Notificaciones: 2 sin leer" });
    await user.click(boton);
    expect(screen.getByText("Para retirar en el mostrador")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /pidió «Ficciones»/ }));

    expect(marcarVistas).toHaveBeenCalledWith(["pedido:1"]);
    expect(screen.getByRole("button", { name: "Notificaciones: 1 sin leer" })).toBeInTheDocument();
  });

  it("«Marcar todo como leído» manda solo las que no estaban leídas", async () => {
    const cargar = vi.fn().mockResolvedValue(NOTIFICACIONES);
    const { marcarVistas } = renderCampana(cargar);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Notificaciones: 2 sin leer" }));
    await user.click(screen.getByRole("button", { name: "Marcar todo como leído" }));

    expect(marcarVistas).toHaveBeenCalledWith(["pedido:1", "vencido:2"]);
    expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
  });

  it("se vuelve a pedir cuando otra pantalla avisa que algo cambió", async () => {
    const cargar = vi.fn().mockResolvedValue({ noLeidas: 0, notificaciones: [] });
    renderCampana(cargar);
    await screen.findByRole("button", { name: "Notificaciones" });
    expect(cargar).toHaveBeenCalledTimes(1);

    cargar.mockResolvedValue(NOTIFICACIONES);
    await act(async () => avisarCambioDeNotificaciones());

    expect(await screen.findByRole("button", { name: "Notificaciones: 2 sin leer" })).toBeInTheDocument();
  });
});
