// Validación de dígito verificador para ISBN (10 y 13) e ISSN (ver BIBL-4 en
// AUDITORIA.md) — funciones puras, sin acceso a la base, para poder
// testearlas igual que circulacion/reglas.js. Solo validan el checksum
// matemático de la norma; no consultan ningún registro externo (ISBNdb,
// WorldCat, etc.) ni verifican que el libro "exista" realmente.

function soloAlfanumerico(valor) {
  return String(valor || "").replace(/[^0-9Xx]/g, "");
}

// ISBN-10: 10 posiciones, la última puede ser "X" (=10). Suma ponderada
// 10,9,8...1 tiene que ser múltiplo de 11.
function esIsbn10Valido(codigo) {
  if (!/^\d{9}[\dXx]$/.test(codigo)) return false;
  let suma = 0;
  for (let i = 0; i < 9; i++) suma += Number(codigo[i]) * (10 - i);
  const ultimo = codigo[9].toUpperCase();
  suma += (ultimo === "X" ? 10 : Number(ultimo)) * 1;
  return suma % 11 === 0;
}

// ISBN-13: 13 dígitos, checksum EAN-13 (pesos alternados 1 y 3).
function esIsbn13Valido(codigo) {
  if (!/^\d{13}$/.test(codigo)) return false;
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(codigo[i]) * (i % 2 === 0 ? 1 : 3);
  const digitoControl = (10 - (suma % 10)) % 10;
  return digitoControl === Number(codigo[12]);
}

// Vacío es válido (campo opcional) — solo se rechaza un valor presente que
// no cumple el checksum. Tolera guiones/espacios como separadores, que es
// como la mayoría de los libros lo traen impreso.
export function esIsbnValido(valor) {
  const texto = String(valor || "").trim();
  if (!texto) return true;
  const codigo = soloAlfanumerico(texto);
  if (codigo.length === 10) return esIsbn10Valido(codigo);
  if (codigo.length === 13) return esIsbn13Valido(codigo);
  return false;
}

// ISSN: 8 posiciones (7 dígitos + 1 dígito de control, que puede ser "X").
// Suma ponderada 8,7,6...2 más el dígito de control tiene que ser múltiplo
// de 11.
export function esIssnValido(valor) {
  const texto = String(valor || "").trim();
  if (!texto) return true;
  const codigo = soloAlfanumerico(texto);
  if (!/^\d{7}[\dXx]$/.test(codigo)) return false;
  let suma = 0;
  for (let i = 0; i < 7; i++) suma += Number(codigo[i]) * (8 - i);
  const ultimo = codigo[7].toUpperCase();
  suma += ultimo === "X" ? 10 : Number(ultimo);
  return suma % 11 === 0;
}
