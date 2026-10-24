import React, { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { instalar, usePwa } from "./pwa.js";

const CLAVE = "instalarDescartado";
const UN_MES = 30 * 24 * 60 * 60 * 1000;

function descartadoHace() {
  try {
    return Date.now() - Number(localStorage.getItem(CLAVE) || 0);
  } catch {
    return Infinity;
  }
}

// Aviso propio para instalar el catálogo como app: en Chrome, Edge y
// Android, con el pedido del navegador; en iPhone y iPad (Safari no lo
// ofrece), con los pasos a mano. "Ahora no" lo esconde por un mes.
export default function InstalarApp() {
  const { instalable } = usePwa();
  const [oculto, setOculto] = useState(() => descartadoHace() < UN_MES);
  const [verPasos, setVerPasos] = useState(false);

  if (!instalable || oculto) return null;

  function descartar() {
    try {
      localStorage.setItem(CLAVE, String(Date.now()));
    } catch {
      // Sin almacenamiento se esconde solo por esta visita.
    }
    setOculto(true);
  }

  return (
    <aside className="instalar-app" aria-labelledby="instalar-app-titulo">
      <div className="instalar-app__texto">
        <h2 id="instalar-app-titulo">Tené el catálogo a mano</h2>
        <p>Instalalo en tu celular o computadora: abre como una app y muestra lo último que viste aunque no haya conexión.</p>
        {instalable === "ios" && verPasos && (
          <ol className="instalar-app__pasos">
            <li>
              Tocá <Share size={16} strokeWidth={1.5} aria-label="Compartir" /> <strong>Compartir</strong> (en Safari, abajo o arriba).
            </li>
            <li>
              Elegí <SquarePlus size={16} strokeWidth={1.5} aria-hidden="true" /> <strong>Agregar a inicio</strong>.
            </li>
          </ol>
        )}
      </div>
      <div className="instalar-app__acciones">
        {instalable === "prompt" && (
          <button type="button" onClick={instalar}>
            <Download size={16} strokeWidth={1.5} aria-hidden="true" /> Instalar
          </button>
        )}
        {instalable === "ios" && !verPasos && (
          <button type="button" onClick={() => setVerPasos(true)}>
            Cómo instalarlo
          </button>
        )}
        <button type="button" className="secundario" onClick={descartar}>
          <X size={16} strokeWidth={1.5} aria-hidden="true" /> Ahora no
        </button>
      </div>
    </aside>
  );
}
