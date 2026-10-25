import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import CodigoBarras from "../../CodigoBarras.jsx";

// Etiquetas para el lomo (signatura en renglones, como se pega en el libro)
// con el código de barras del ejemplar debajo. Se muestran solo al
// imprimir, directo en <body>: así la hoja no arrastra el alto del resto
// de la pantalla (que se oculta, ver .hoja-etiquetas en estilos.css).
// ejemplares = null: no hay nada para imprimir.
export default function EtiquetasLomo({ ejemplares, alTerminar }) {
  useEffect(() => {
    if (!ejemplares?.length) return undefined;
    const despues = () => alTerminar();
    window.addEventListener("afterprint", despues);
    // Un instante para que las etiquetas estén en la página antes de imprimir.
    const espera = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(espera);
      window.removeEventListener("afterprint", despues);
    };
  }, [ejemplares, alTerminar]);

  if (!ejemplares?.length) return null;
  return createPortal(
    <div className="solo-imprimir hoja-etiquetas" aria-hidden="true">
      {ejemplares.map((e) => (
        <div key={e._id} className="etiqueta-lomo">
          <div className="etiqueta-lomo__signatura">
            {(e.signatura || "S/S").split(/\s+/).map((parte, i) => (
              <span key={i}>{parte}</span>
            ))}
          </div>
          <CodigoBarras valor={e.codigoBarras} alto={22} modulo={0.9} />
          <small>{e.codigoBarras}</small>
        </div>
      ))}
    </div>,
    document.body
  );
}
