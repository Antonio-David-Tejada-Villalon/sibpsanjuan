import React, { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import api from "./api.js";
import { nombreSocio } from "./circulacion.js";

// Buscar un socio por número, apellido, nombre o DNI (como "Buscar para
// reservar" de Koha): el servidor busca mientras se escribe, sin bajar la
// lista entera. Con un número exacto (el lector de credenciales), Enter lo
// elige directo.
export default function SelectorSocio({ etiqueta = "Socio", onElegir, autoFocus = false }) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const id = useId();

  useEffect(() => {
    const q = texto.trim();
    if (!q) {
      setResultados([]);
      return undefined;
    }
    let vigente = true;
    setBuscando(true);
    const espera = setTimeout(() => {
      api
        .listarSociosPaginado(1, 8, q)
        .then(({ items }) => vigente && setResultados(items))
        .catch(() => vigente && setResultados([]))
        .finally(() => vigente && setBuscando(false));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto]);

  function onTecla(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const exacto = resultados.find((s) => s.numeroSocio === texto.trim());
    if (exacto || resultados.length === 1) onElegir(exacto || resultados[0]);
  }

  return (
    <div className="buscador-combo selector-socio">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="selector-socio__campo">
        <Search size={16} strokeWidth={1.5} aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onTecla}
          placeholder="Número de socio, apellido, nombre o DNI"
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </div>
      {texto.trim() && (
        <ul className="buscador-combo__resultados" aria-live="polite">
          {resultados.map((s) => (
            <li key={s._id}>
              <button type="button" onClick={() => onElegir(s)}>
                <strong>{nombreSocio(s)}</strong> <span className="texto-secundario">n.º {s.numeroSocio}</span>
                {s.curso && <span className="texto-secundario"> · {s.curso}</span>}
              </button>
            </li>
          ))}
          {!buscando && resultados.length === 0 && <li className="buscador-combo__sin-resultados">Ningún socio coincide.</li>}
        </ul>
      )}
    </div>
  );
}
