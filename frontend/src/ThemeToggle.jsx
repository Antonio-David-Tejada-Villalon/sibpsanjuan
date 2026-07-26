import React, { useEffect, useState } from "react";
import { obtenerTemaGuardado, fijarTema } from "./tema.js";

function sistemaPrefiereOscuro() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Botón compartido entre Layout.jsx (staff) y OpacLayout.jsx (OPAC) — un
// solo lugar para la lógica de "cuál es el tema efectivo ahora mismo",
// que depende de la elección guardada O, si nunca se eligió una, del
// sistema operativo.
export default function ThemeToggle() {
  const [temaGuardado, setTemaGuardado] = useState(() => obtenerTemaGuardado());
  const [oscuroDelSistema, setOscuroDelSistema] = useState(() => sistemaPrefiereOscuro());

  useEffect(() => {
    const medio = window.matchMedia("(prefers-color-scheme: dark)");
    const onCambio = (e) => setOscuroDelSistema(e.matches);
    medio.addEventListener("change", onCambio);
    return () => medio.removeEventListener("change", onCambio);
  }, []);

  const esOscuro = temaGuardado ? temaGuardado === "dark" : oscuroDelSistema;

  function alternar() {
    const nuevo = esOscuro ? "light" : "dark";
    fijarTema(nuevo);
    setTemaGuardado(nuevo);
  }

  return (
    <>
      <button
        type="button"
        className="boton-tema"
        onClick={alternar}
        aria-label={esOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        title={esOscuro ? "Tema claro" : "Tema oscuro"}
      >
        {esOscuro ? "☀️" : "🌙"}
      </button>
      <span className="sr-only" role="status">
        {esOscuro ? "Tema oscuro activado" : "Tema claro activado"}
      </span>
    </>
  );
}
