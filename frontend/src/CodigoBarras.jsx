import React from "react";

// Código de barras Code 39 en SVG, sin dependencias: lo leen todos los
// lectores de mostrador. Cada carácter son 9 elementos (barra, espacio,
// barra…), 3 de ellos anchos; se encierra entre asteriscos.
const ANCHOS = {
  0: "nnnwwnwnn", 1: "wnnwnnnnw", 2: "nnwwnnnnw", 3: "wnwwnnnnn", 4: "nnnwwnnnw", 5: "wnnwwnnnn", 6: "nnwwwnnnn",
  7: "nnnwnnwnw", 8: "wnnwnnwnn", 9: "nnwwnnwnn", A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw",
  E: "wnnnwwnnn", F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww",
  L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
  Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn", $: "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn",
};

// Módulos (1 = barra, 0 = espacio) de un texto, o null si tiene algo que
// Code 39 no puede codificar.
export function modulosCode39(texto) {
  const valor = String(texto).toUpperCase();
  if (!valor || [...valor].some((c) => c === "*" || !ANCHOS[c])) return null;
  return [...`*${valor}*`]
    .map((c) => [...ANCHOS[c]].map((ancho, i) => (i % 2 === 0 ? "1" : "0").repeat(ancho === "w" ? 3 : 1)).join(""))
    .join("0");
}

export default function CodigoBarras({ valor, alto = 48, modulo = 2 }) {
  const modulos = modulosCode39(valor);
  if (!modulos) return <p className="codigo-barras-texto">{valor}</p>;
  // Barras seguidas como un solo rectángulo.
  const barras = [];
  for (let i = 0; i < modulos.length; ) {
    if (modulos[i] === "0") {
      i++;
      continue;
    }
    let fin = i;
    while (modulos[fin] === "1") fin++;
    barras.push([i, fin - i]);
    i = fin;
  }
  const margen = 10 * modulo;
  const ancho = modulos.length * modulo + 2 * margen;
  return (
    <svg className="codigo-barras" viewBox={`0 0 ${ancho} ${alto}`} width={ancho} height={alto} role="img" aria-label={`Código de barras ${valor}`}>
      <rect width={ancho} height={alto} fill="#ffffff" />
      {barras.map(([inicio, largo]) => (
        <rect key={inicio} x={margen + inicio * modulo} y={0} width={largo * modulo} height={alto} fill="#000000" />
      ))}
    </svg>
  );
}
