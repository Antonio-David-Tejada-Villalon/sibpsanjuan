import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generarCss } from "./generarTokens.js";

const carpeta = path.dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(path.join(carpeta, "tokens.json"), "utf8"));
const css = readFileSync(path.join(carpeta, "tokens.css"), "utf8").replace(/\r\n/g, "\n");

describe("tokens del sistema de diseño", () => {
  it("tokens.css está al día con tokens.json (si falla, corré npm run tokens)", () => {
    expect(css).toBe(generarCss(tokens));
  });

  it("define los dos temas y nunca texto blanco sobre el naranja de marca", () => {
    expect(css).toContain('--marca: #ff8300;');
    expect(css).toContain('--sobre-marca: #1f2937;');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
  });

  it("anula las duraciones con reducir movimiento", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*--dur-rapida: 0ms/);
    expect(css).toMatch(/data-movimiento="reducido"[\s\S]*--dur-modal: 0ms/);
  });
});
