import React, { useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { obtenerTemaGuardado, fijarTema } from "./tema.js";

// Tres opciones, como pide el sistema de diseño: Claro, Oscuro y Automático,
// que sigue al sistema operativo y es la opción por defecto. tema.js guarda
// "light"/"dark" como siempre (las elecciones ya guardadas siguen valiendo);
// Automático borra la elección. Antes era un botón de dos estados con emojis
// que, una vez usado, no dejaba volver a seguir al sistema.
const OPCIONES = [
  { valor: "light", texto: "Claro", Icono: Sun, aviso: "Tema claro activado" },
  { valor: "dark", texto: "Oscuro", Icono: Moon, aviso: "Tema oscuro activado" },
  { valor: null, texto: "Automático", Icono: Monitor, aviso: "Tema automático: sigue al sistema" },
];

// sobreTinta: para la franja oscura del encabezado. compacto: solo íconos,
// con el nombre de cada opción para lectores de pantalla y como tooltip.
export default function SelectorTema({ sobreTinta = false, compacto = false }) {
  const [elegido, setElegido] = useState(() => obtenerTemaGuardado());
  const [aviso, setAviso] = useState("");
  const botones = useRef([]);

  function elegir(indice, enfocar) {
    const opcion = OPCIONES[indice];
    fijarTema(opcion.valor);
    setElegido(opcion.valor);
    setAviso(opcion.aviso);
    if (enfocar) botones.current[indice]?.focus();
  }

  function alPulsarTecla(evento, indice) {
    let paso = 0;
    if (evento.key === "ArrowRight" || evento.key === "ArrowDown") paso = 1;
    if (evento.key === "ArrowLeft" || evento.key === "ArrowUp") paso = -1;
    if (!paso) return;
    evento.preventDefault();
    elegir((indice + paso + OPCIONES.length) % OPCIONES.length, true);
  }

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Tema"
        className={sobreTinta ? "selector-tema selector-tema--sobre-tinta" : "selector-tema"}
      >
        {OPCIONES.map(({ valor, texto, Icono }, i) => {
          const activa = valor === elegido;
          return (
            <button
              key={texto}
              type="button"
              role="radio"
              aria-checked={activa}
              tabIndex={activa ? 0 : -1}
              ref={(el) => {
                botones.current[i] = el;
              }}
              title={compacto ? texto : undefined}
              className={activa ? "selector-tema__opcion es-activa" : "selector-tema__opcion"}
              onClick={() => elegir(i)}
              onKeyDown={(e) => alPulsarTecla(e, i)}
            >
              <Icono size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className={compacto ? "sr-only" : undefined}>{texto}</span>
            </button>
          );
        })}
      </div>
      <span className="sr-only" role="status">
        {aviso}
      </span>
    </>
  );
}
