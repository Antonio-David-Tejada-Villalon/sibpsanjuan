import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

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

afterEach(() => {
  cleanup();
});
