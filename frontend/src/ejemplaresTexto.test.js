import { describe, it, expect } from "vitest";
import { aEjemplares } from "./ejemplaresTexto.js";

describe("aEjemplares", () => {
  it("una línea por ejemplar, coma separa código de barras de signatura", () => {
    const resultado = aEjemplares("BPSJ-000001, 863 BOR\nBPSJ-000002, 863 BOR");
    expect(resultado).toEqual([
      { codigoBarras: "BPSJ-000001", signatura: "863 BOR" },
      { codigoBarras: "BPSJ-000002", signatura: "863 BOR" },
    ]);
  });

  it("una línea sin coma queda con signatura undefined", () => {
    const resultado = aEjemplares("BPSJ-000001");
    expect(resultado).toEqual([{ codigoBarras: "BPSJ-000001", signatura: undefined }]);
  });

  it("ignora líneas vacías y espacios de más", () => {
    const resultado = aEjemplares("\n  BPSJ-000001, 863 BOR  \n\n   \n");
    expect(resultado).toEqual([{ codigoBarras: "BPSJ-000001", signatura: "863 BOR" }]);
  });

  it("texto vacío da un arreglo vacío", () => {
    expect(aEjemplares("")).toEqual([]);
  });

  it("texto con solo espacios/saltos de línea da un arreglo vacío", () => {
    expect(aEjemplares("   \n\n  \n")).toEqual([]);
  });
});
