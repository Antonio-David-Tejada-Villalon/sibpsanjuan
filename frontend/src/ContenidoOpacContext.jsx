import React, { createContext, useContext, useEffect, useState } from "react";
import api from "./api.js";

// Contenido del CMS (identidad de la institución, contacto, avisos, índice
// de páginas) para todo el OPAC. Normalmente el publicado; en la vista
// previa del panel (iframe con ?vistaPrevia), el borrador — que solo puede
// pedir alguien con sesión del panel.

const ContenidoOpacContext = createContext(null);

const SIN_CONTENIDO = {
  identidad: { nombre: "", nombreLegal: "", colorAcento: "#ff8300", logos: {} },
  contacto: {},
  avisos: [],
  paginas: [],
};

// Se decide una vez, con la URL con la que se abrió el OPAC: la navegación
// interna no conserva el ?vistaPrevia, pero dentro del iframe de la vista
// previa tiene que seguir mostrando el borrador en todas las pantallas.
let modoVistaPrevia = null;
export function enVistaPrevia() {
  if (modoVistaPrevia === null) modoVistaPrevia = new URLSearchParams(window.location.search).has("vistaPrevia");
  return modoVistaPrevia;
}

export function ContenidoOpacProvider({ codigo, children }) {
  const [contenido, setContenido] = useState(null); // null = cargando
  const [error, setError] = useState("");
  const vistaPrevia = enVistaPrevia();

  useEffect(() => {
    setContenido(null);
    setError("");
    (vistaPrevia ? api.vistaPreviaContenido() : api.opacContenido(codigo))
      .then(setContenido)
      .catch((err) => {
        setContenido(SIN_CONTENIDO);
        setError(vistaPrevia ? `No se pudo cargar el borrador: ${err.message}` : "");
      });
  }, [codigo, vistaPrevia]);

  return (
    <ContenidoOpacContext.Provider value={{ contenido, vistaPrevia, error }}>{children}</ContenidoOpacContext.Provider>
  );
}

export function useContenidoOpac() {
  return useContext(ContenidoOpacContext) || { contenido: SIN_CONTENIDO, vistaPrevia: false, error: "" };
}
