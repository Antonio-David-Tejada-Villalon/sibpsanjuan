import React, { useEffect, useId, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { dispositivoPideAhorro, fijarAhorroDeDatos, fijarReducirMovimiento, usePreferencias } from "./preferencias.js";

// Botón con las preferencias de este dispositivo: "Ahorro de datos" y
// "Reducir movimiento" (ver preferencias.js). Va junto al selector de tema.
export default function Preferencias({ sobreTinta = false }) {
  const { ahorro, ahorroElegido, reducirMovimiento } = usePreferencias();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef(null);
  const boton = useRef(null);
  const idPanel = useId();

  useEffect(() => {
    if (!abierto) return undefined;
    function afuera(evento) {
      if (!contenedor.current?.contains(evento.target)) setAbierto(false);
    }
    function tecla(evento) {
      if (evento.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const automatico = ahorroElegido === null && dispositivoPideAhorro();

  return (
    <div className="preferencias" ref={contenedor}>
      <button
        ref={boton}
        type="button"
        className={sobreTinta ? "preferencias__boton preferencias__boton--sobre-tinta" : "preferencias__boton"}
        aria-expanded={abierto}
        aria-controls={idPanel}
        title="Preferencias"
        onClick={() => setAbierto((a) => !a)}
      >
        <Settings size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="sr-only">Preferencias</span>
      </button>
      {abierto && (
        <div className="preferencias__panel" id={idPanel} role="group" aria-label="Preferencias de este dispositivo">
          <label className="preferencias__opcion">
            <input type="checkbox" role="switch" checked={ahorro} onChange={(e) => fijarAhorroDeDatos(e.target.checked)} />
            <span>
              <strong>Ahorro de datos</strong>
              <small>Fuentes del sistema, portadas chicas, menos resultados por página y sin animaciones.</small>
              {automatico && <small>Activado porque tu dispositivo lo pide.</small>}
            </span>
          </label>
          {ahorroElegido !== null && (
            <button type="button" className="enlace-boton preferencias__automatico" onClick={() => fijarAhorroDeDatos(null)}>
              Que lo decida el dispositivo
            </button>
          )}
          <label className="preferencias__opcion">
            <input type="checkbox" role="switch" checked={reducirMovimiento} onChange={(e) => fijarReducirMovimiento(e.target.checked)} />
            <span>
              <strong>Reducir movimiento</strong>
              <small>Sin transiciones ni animaciones.</small>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
