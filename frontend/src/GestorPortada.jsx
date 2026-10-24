import React, { useEffect, useState } from "react";
import api from "./api.js";
import Portada from "./Portada.jsx";

// Mismo origen que usa api.js: vacío salvo que el frontend se sirva aparte.
const ORIGEN_API = import.meta.env.VITE_API_URL || "";

const NOMBRE_FUENTE = {
  openlibrary: "Open Library",
  googlebooks: "Google Books",
  url: "una URL cargada por el personal",
};

function formatearFecha(fecha) {
  return new Date(fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

// Portada de un ítem en su formulario de catalogación. El orden lo marca el
// proyecto: buscar por ISBN (Open Library y después Google Books) y, como
// última opción, una imagen desde una URL — que descarga y procesa el
// servidor, nunca el navegador. Sin portada, el OPAC muestra una tapa con
// el título. isbn: solo para libros (undefined = el tipo no tiene ISBN).
// Va dentro del <form> de la página: por eso no usa un <form> propio.
export default function GestorPortada({ itemTipo, itemId, titulo, isbn }) {
  const [info, setInfo] = useState(undefined); // undefined = cargando, null = sin portada
  const [url, setUrl] = useState("");
  const [ocupado, setOcupado] = useState(null); // qué acción está en curso
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!itemId) return;
    setInfo(undefined);
    setError("");
    setAviso("");
    api
      .obtenerPortada(itemTipo, itemId)
      .then(setInfo)
      .catch((err) => {
        setInfo(null);
        if (err.status !== 404) setError(err.message);
      });
  }, [itemTipo, itemId]);

  if (!itemId) {
    return (
      <p>
        <small>
          Guardá el material y después vas a poder agregarle portada.
          {isbn !== undefined && " Los libros con ISBN la buscan solos al guardarse."}
        </small>
      </p>
    );
  }

  async function ejecutar(accion, llamada, mensaje) {
    setOcupado(accion);
    setError("");
    setAviso("");
    try {
      const resultado = await llamada();
      setInfo(accion === "quitar" ? null : resultado);
      setAviso(mensaje);
      if (accion === "url") setUrl("");
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(null);
    }
  }

  const buscar = () => ejecutar("isbn", () => api.buscarPortadaPorIsbn(itemTipo, itemId), "Portada encontrada y guardada.");
  const usarUrl = () =>
    ejecutar("url", () => api.portadaDesdeUrl(itemTipo, itemId, url.trim()), "Imagen descargada, procesada y guardada.");
  const quitar = () =>
    ejecutar("quitar", () => api.quitarPortada(itemTipo, itemId), "Portada quitada: el catálogo muestra la tapa con el título.");

  return (
    <fieldset className="gestor-portada">
      <legend>Portada</legend>
      <div className="gestor-portada__vista">
        <Portada src={info ? `${ORIGEN_API}${info.url}` : null} titulo={titulo || "Sin título"} tamano="grande" decorativa={false} />
      </div>
      <div className="gestor-portada__acciones">
        <p className="categoria__nota" role="status">
          {info === undefined
            ? "Cargando…"
            : info
              ? `Fuente: ${NOMBRE_FUENTE[info.fuente]}.${info.expiraEn ? ` Google permite conservarla hasta el ${formatearFecha(info.expiraEn)}; después se vuelve a buscar.` : ""}`
              : "Sin portada: el catálogo muestra una tapa con el título."}
        </p>
        {error && <div className="flash error" role="alert">{error}</div>}
        {aviso && <div className="flash ok" role="status">{aviso}</div>}
        {isbn !== undefined && (
          <button type="button" className="secundario" onClick={buscar} disabled={!isbn || ocupado !== null} aria-busy={ocupado === "isbn"}>
            {ocupado === "isbn" ? "Buscando…" : "Buscar por ISBN (Open Library, Google Books)"}
          </button>
        )}
        {isbn !== undefined && !isbn && (
          <p>
            <small>Para buscarla automáticamente, cargá y guardá el ISBN.</small>
          </p>
        )}
        <label>
          {isbn !== undefined ? "Si no aparece: imagen desde una URL" : "Imagen desde una URL"}
          <input
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              // Enter acá no tiene que guardar el formulario de la página.
              if (e.key === "Enter") {
                e.preventDefault();
                if (url.trim()) usarUrl();
              }
            }}
          />
        </label>
        <p>
          <small>El sistema descarga la imagen, la achica y la guarda; el catálogo nunca la pide al sitio original.</small>
        </p>
        <div className="categoria__acciones">
          <button type="button" className="secundario" onClick={usarUrl} disabled={!url.trim() || ocupado !== null} aria-busy={ocupado === "url"}>
            {ocupado === "url" ? "Descargando…" : "Usar esta imagen"}
          </button>
          {info && (
            <button type="button" className="peligro" onClick={quitar} disabled={ocupado !== null}>
              Quitar portada
            </button>
          )}
        </div>
      </div>
    </fieldset>
  );
}
