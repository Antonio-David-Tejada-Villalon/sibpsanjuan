import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// jsdom no implementa matchMedia. Ninguna pantalla lo necesita hoy (el
// selector de tema delega el modo Automático en el CSS), pero se mantiene
// para componentes que consulten preferencias del sistema.
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

// Las búsquedas por texto ignoran lo oculto para lectores de pantalla
// (aria-hidden): por ejemplo, la tapa tipográfica de Portada.jsx repite el
// título que ya está escrito al lado, y un test que busca ese título tiene
// que encontrar el que se lee, no la decoración.
configure({ defaultIgnore: "script, style, [aria-hidden='true'], [aria-hidden='true'] *" });

afterEach(() => {
  cleanup();
});
