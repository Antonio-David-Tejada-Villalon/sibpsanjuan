// Utilidades del CMS del OPAC compartidas por la validación y las rutas.

// Formato básico seguro de los textos (avisos, páginas): párrafos separados
// por una línea en blanco, **negrita**, *cursiva*, listas ("- " o "1. ") y
// enlaces [texto](url). Nunca HTML: el frontend arma elementos de React
// (ver TextoSeguro.jsx), así que una etiqueta escrita a mano se ve como
// texto. Acá solo se controla que los enlaces no lleven a javascript: u
// otros esquemas.
const ENLACE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function esUrlPermitida(url, protocolos = ["http:", "https:", "mailto:"]) {
  try {
    return protocolos.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function enlacesInvalidos(texto) {
  const malos = [];
  for (const [, , url] of String(texto || "").matchAll(ENLACE)) {
    if (!esUrlPermitida(url)) malos.push(url);
  }
  return malos;
}

// Contraste WCAG 2.x entre dos colores #rrggbb.
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lineal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

export function contraste(hexA, hexB) {
  const [claro, oscuro] = [luminancia(hexA), luminancia(hexB)].sort((a, b) => b - a);
  return (claro + 0.05) / (oscuro + 0.05);
}

// El acento se usa de fondo de botones y chips con texto #1F2937 encima
// (nunca blanco: ver el sistema de diseño). Por eso se exige 4.5:1 contra
// ese texto, el mínimo de WCAG AA para texto normal.
export const TEXTO_SOBRE_ACENTO = "#1f2937";
export const CONTRASTE_MINIMO = 4.5;

export function contrasteDelAcento(hex) {
  return contraste(hex, TEXTO_SOBRE_ACENTO);
}
