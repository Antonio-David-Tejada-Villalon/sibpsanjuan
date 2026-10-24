import React from "react";

// Muestra los textos del CMS (avisos, páginas) con el formato básico que
// permite: párrafos (línea en blanco), **negrita**, *cursiva*, listas con
// "- " o "1. " y enlaces [texto](url). Arma elementos de React — nunca
// HTML —, así que una etiqueta escrita a mano se ve como texto y no se
// ejecuta. Mismas reglas que backend/src/contenido/formato.js.

const EN_LINEA = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function esUrlPermitida(url) {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function enLinea(texto, clave) {
  const partes = [];
  let ultimo = 0;
  let n = 0;
  for (const m of texto.matchAll(EN_LINEA)) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const k = `${clave}-${n++}`;
    if (m[1] !== undefined) partes.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2] !== undefined) partes.push(<em key={k}>{m[2]}</em>);
    else if (esUrlPermitida(m[4])) {
      const externo = !m[4].startsWith("mailto:");
      partes.push(
        <a key={k} href={m[4]} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {m[3]}
        </a>
      );
    } else {
      // Un enlace con un esquema no permitido (javascript:, data:...) queda
      // como texto común, sin link.
      partes.push(m[3]);
    }
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

const VINETA = /^\s*[-*]\s+/;
const NUMERO = /^\s*\d+[.)]\s+/;

export default function TextoSeguro({ texto, className }) {
  const bloques = String(texto || "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").filter((l) => l.trim() !== ""))
    .filter((lineas) => lineas.length);

  return (
    <div className={className}>
      {bloques.map((lineas, i) => {
        if (lineas.every((l) => VINETA.test(l))) {
          return (
            <ul key={i}>
              {lineas.map((l, j) => (
                <li key={j}>{enLinea(l.replace(VINETA, ""), `${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (lineas.every((l) => NUMERO.test(l))) {
          return (
            <ol key={i}>
              {lineas.map((l, j) => (
                <li key={j}>{enLinea(l.replace(NUMERO, ""), `${i}-${j}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            {lineas.map((l, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {enLinea(l, `${i}-${j}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
