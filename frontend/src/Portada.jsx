import React, { useState } from "react";

// Tres estilos de tapa, todos con tokens del sistema de diseño (así siguen
// al tema claro/oscuro). Se elige uno por título, siempre el mismo para el
// mismo libro, para que una grilla sin portadas no sea una pared igual.
const VARIANTES = ["tinta", "papel", "marca"];

function varianteDe(texto = "") {
  let hash = 0;
  for (const caracter of texto) hash = (hash * 31 + caracter.codePointAt(0)) >>> 0;
  return VARIANTES[hash % VARIANTES.length];
}

// Tapa generada con título y autoría para lo que no tiene portada: nunca un
// recuadro gris con "sin imagen". Decorativa (oculta para lectores de
// pantalla) donde el título ya está escrito al lado, como en las tarjetas.
export function TapaTipografica({ titulo, autor, decorativa = true }) {
  const accesible = decorativa
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": `Sin portada: tapa con el título ${titulo}` };
  return (
    <div className={`tapa-tipografica tapa-tipografica--${varianteDe(titulo)}`} {...accesible}>
      <span className="tapa-tipografica__titulo">{titulo}</span>
      {autor && <span className="tapa-tipografica__autor">{autor}</span>}
    </div>
  );
}

// Portada procesada por el servidor (WebP propio, nunca una URL de
// terceros) o la tapa tipográfica si no hay o si no carga. Ancho y alto
// explícitos en proporción 2:3 para que el diseño no salte al cargar.
export default function Portada({ src, titulo, autor, tamano = "miniatura", decorativa = true }) {
  const [srcFallido, setSrcFallido] = useState(null);
  if (!src || srcFallido === src) {
    return <TapaTipografica titulo={titulo} autor={autor} decorativa={decorativa} />;
  }
  const [ancho, alto] = tamano === "grande" ? [360, 540] : [120, 180];
  return (
    <img
      className="portada"
      src={src}
      width={ancho}
      height={alto}
      alt={decorativa ? "" : `Portada de ${titulo}`}
      loading="lazy"
      decoding="async"
      onError={() => setSrcFallido(src)}
    />
  );
}
