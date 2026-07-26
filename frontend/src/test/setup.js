import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom no implementa matchMedia — lo usa ThemeToggle.jsx (tema claro/
// oscuro) para saber la preferencia del sistema. Sin este polyfill,
// cualquier pantalla con el header de Layout.jsx/OpacLayout.jsx (que
// siempre incluye ThemeToggle) rompe en los tests.
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
