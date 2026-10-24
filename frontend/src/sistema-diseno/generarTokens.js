// Convierte tokens.json (el mismo archivo del sistema de diseño publicado)
// en las custom properties de tokens.css. tokens.json es la única fuente de
// verdad: tokens.css se regenera con `npm run tokens` y una prueba avisa si
// quedó desactualizado.

const ENCABEZADO = "/* SIBPSANJUAN — generado desde tokens.json con `npm run tokens`. No editar a mano. */";

function valorCss(valor) {
  const alias = /^\{(.+)\}$/.exec(valor);
  return alias ? `var(--${alias[1]})` : valor;
}

function porTema(token, temas) {
  if (typeof token.value === "string") return { [temas[0]]: token.value };
  return token.value;
}

export function generarCss(tokens) {
  const temas = tokens.color.themes.map((t) => t.id);
  const [claro, oscuro] = temas;
  const lineasClaras = [];
  const lineasOscuras = [];

  for (const familia of ["color", "shadow"]) {
    for (const token of tokens[familia]?.tokens || []) {
      const valores = porTema(token, temas);
      lineasClaras.push(`  --${token.name}: ${valorCss(valores[claro])};`);
      if (valores[oscuro] !== undefined && valores[oscuro] !== valores[claro]) {
        lineasOscuras.push(`  --${token.name}: ${valorCss(valores[oscuro])};`);
      }
    }
  }

  const generales = [];
  for (const familia of ["spacing", "radius", "duration", "easing", "size", "breakpoint"]) {
    for (const token of tokens[familia]?.tokens || []) generales.push(`  --${token.name}: ${token.value};`);
  }
  for (const [clave, pila] of Object.entries(tokens.type.families)) generales.push(`  --font-${clave}: ${pila};`);

  const fuentes = tokens.type.fonts.map((f) =>
    [
      "@font-face {",
      `  font-family: "${f.family}";`,
      `  src: url("./${f.file}") format("woff2");`,
      `  font-weight: ${f.weight};`,
      `  font-style: ${f.style || "normal"};`,
      "  font-display: swap;",
      "}",
    ].join("\n")
  );

  const sinMovimiento = (tokens.duration?.tokens || []).map((t) => `  --${t.name}: 0ms;`).join("\n");
  const oscuras = lineasOscuras.join("\n");

  return (
    [
      ENCABEZADO,
      ...fuentes,
      `:root {\n${lineasClaras.join("\n")}\n${generales.join("\n")}\n  color-scheme: light;\n}`,
      `:root[data-theme="${oscuro}"] {\n${oscuras}\n  color-scheme: dark;\n}`,
      `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="${claro}"]) {\n${oscuras.replace(/^/gm, "  ")}\n    color-scheme: dark;\n  }\n}`,
      `@media (prefers-reduced-motion: reduce) {\n  :root {\n${sinMovimiento.replace(/^/gm, "  ")}\n  }\n}`,
      `:root[data-movimiento="reducido"] {\n${sinMovimiento}\n}`,
    ].join("\n\n") + "\n"
  );
}
