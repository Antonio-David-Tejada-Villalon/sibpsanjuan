// Color de acento de la institución (CMS del OPAC): a partir de un solo
// color se derivan los tokens que usa el sistema de diseño, cuidando el
// contraste. Misma fórmula WCAG que backend/src/contenido/formato.js.

function canales(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function aHex(rgb) {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

function luminancia(hex) {
  const [r, g, b] = canales(hex).map((c) => c / 255);
  const lineal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

export function contraste(a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

// Sobre el acento va siempre texto #1F2937 (nunca blanco); para publicar
// el backend exige 4.5:1.
export const TEXTO_SOBRE_ACENTO = "#1f2937";
export const CONTRASTE_MINIMO = 4.5;

export function contrasteDelAcento(hex) {
  return contraste(hex, TEXTO_SOBRE_ACENTO);
}

export function esColorValido(hex) {
  return typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex);
}

function mezclar(hex, con, proporcion) {
  const a = canales(hex);
  const b = canales(con);
  return aHex(a.map((c, i) => c + (b[i] - c) * proporcion));
}

// Oscurece (o aclara) el color de a poco hasta que se lea como texto sobre
// todos los fondos indicados.
function hastaContrastar(hex, hacia, fondos) {
  for (let p = 0; p <= 1; p += 0.05) {
    const candidato = mezclar(hex, hacia, p);
    if (fondos.every((f) => contraste(candidato, f) >= CONTRASTE_MINIMO)) return candidato;
  }
  return hacia;
}

// Fondos de los tokens del tema claro (papel, superficie) y oscuro (fondo,
// superficie, superficie elevada) — ver sistema-diseno/tokens.json.
const FONDOS_CLAROS = ["#faf8f5", "#ffffff", "#f3f0eb"];
const FONDOS_OSCUROS = ["#14161a", "#1e2126", "#262a31"];

export function tokensDeMarca(acento) {
  const hex = acento.toLowerCase();
  const [r, g, b] = canales(hex);
  return {
    marca: hex,
    marcaHover: mezclar(hex, "#000000", 0.12),
    marcaPresionado: mezclar(hex, "#000000", 0.22),
    marcaTenue: `rgba(${r}, ${g}, ${b}, 0.14)`,
    textoClaro: hastaContrastar(hex, "#000000", FONDOS_CLAROS),
    textoOscuro: hastaContrastar(hex, "#ffffff", FONDOS_OSCUROS),
  };
}

// Hoja de estilo que pisa los tokens de marca dentro de .marca-institucion,
// en claro y oscuro (mismos selectores que sistema-diseno/tokens.css). Los
// alias --brand* y --foco se repiten a propósito: en estilos.css están
// definidos en :root como var(--marca...), y un alias se resuelve donde se
// declara — sin redefinirlos acá seguirían con el naranja del sistema.
// Solo se arma con colores ya validados (#rrggbb), nunca con texto libre.
export function cssDeMarca(acento) {
  if (!esColorValido(acento)) return "";
  const t = tokensDeMarca(acento);
  const comunes = `--marca: ${t.marca}; --marca-hover: ${t.marcaHover}; --marca-presionado: ${t.marcaPresionado}; --brand: ${t.marca}; --brand-tenue: ${t.marcaTenue};`;
  const texto = (color) => `--marca-texto: ${color}; --brand-texto: ${color}; --foco: ${color};`;
  return [
    `.marca-institucion { ${comunes} ${texto(t.textoClaro)} }`,
    `:root[data-theme="dark"] .marca-institucion { ${texto(t.textoOscuro)} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .marca-institucion { ${texto(t.textoOscuro)} } }`,
  ].join("\n");
}
