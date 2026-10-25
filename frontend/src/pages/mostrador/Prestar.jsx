import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api.js";
import SelectorSocio from "../../SelectorSocio.jsx";
import { cuentaVencida, fechaCorta, fechaIso, nombreSocio } from "../../circulacion.js";

// Prestar, solo: elegir al socio (o leer su credencial) y leer el código de
// barras de cada ejemplar. Lo mismo se puede hacer desde la ficha del socio.
export default function Prestar() {
  const [params, setParams] = useSearchParams();
  const socioId = params.get("socio");
  const [socio, setSocio] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [prestando, setPrestando] = useState(false);
  const [error, setError] = useState("");
  const [hechos, setHechos] = useState([]);
  const codigoRef = useRef(null);

  useEffect(() => {
    if (!socioId) {
      setSocio(null);
      return;
    }
    api
      .obtenerSocio(socioId)
      .then((s) => {
        setSocio(s);
        setTimeout(() => codigoRef.current?.focus(), 0);
      })
      .catch((err) => setError(err.message));
  }, [socioId]);

  function elegir(s) {
    setHechos([]);
    setError("");
    setParams({ socio: s._id });
  }

  async function prestar(e) {
    e.preventDefault();
    const valor = codigo.trim();
    if (!valor) return;
    setPrestando(true);
    setError("");
    try {
      const prestamo = await api.prestarPorCodigo(socio._id, valor);
      const ejemplar = await api.buscarEjemplarPorCodigo(valor).catch(() => null);
      setHechos((h) => [{ codigo: valor, titulo: ejemplar?.item?.titulo ?? "", vence: prestamo.fechaVencimiento }, ...h]);
      setCodigo("");
      setSocio(await api.obtenerSocio(socio._id));
    } catch (err) {
      setError(err.message);
    } finally {
      setPrestando(false);
      codigoRef.current?.focus();
    }
  }

  const vencida = cuentaVencida(socio);
  const reglas = socio?.reglas;

  return (
    <>
      <h1>Prestar</h1>
      {!socio ? (
        <div className="card">
          <SelectorSocio etiqueta="¿A quién?" onElegir={elegir} autoFocus />
          {error && <div className="flash error" role="alert">{error}</div>}
        </div>
      ) : (
        <>
          <div className="card socio-elegido">
            <div>
              <strong>
                <Link to={`/socios/${socio._id}`}>{nombreSocio(socio)}</Link>
              </strong>{" "}
              <span className="texto-secundario">n.º {socio.numeroSocio}</span>
              <p>
                {socio.categoriaInfo?.nombre ?? socio.categoria}
                {reglas && ` · ${reglas.diasPrestamo} días por préstamo · lleva ${reglas.enCurso}${reglas.maxPrestamos != null ? ` de ${reglas.maxPrestamos}` : ""}`}
              </p>
            </div>
            <button type="button" className="secundario" onClick={() => setParams({})}>
              Cambiar de socio
            </button>
          </div>
          {vencida && (
            <div className="flash error" role="alert">
              La cuenta venció el {fechaIso(socio.vigenteHasta)}. Renovala en su ficha para poder prestarle.
            </div>
          )}
          <form className="card" onSubmit={prestar}>
            <label htmlFor="codigo-ejemplar">Código de barras del ejemplar</label>
            <div className="fila-campo-boton">
              <input
                id="codigo-ejemplar"
                ref={codigoRef}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Escaneá o escribí el código"
                autoComplete="off"
                disabled={vencida}
              />
              <button type="submit" disabled={prestando || vencida || !codigo.trim()}>
                {prestando ? "Prestando…" : "Prestar"}
              </button>
            </div>
            {error && <div className="flash error" role="alert">{error}</div>}
          </form>
          {hechos.length > 0 && (
            <section className="card">
              <h2>Prestado ahora</h2>
              <ul className="lista-simple">
                {hechos.map((h) => (
                  <li key={h.codigo}>
                    <strong>{h.titulo || h.codigo}</strong> <span className="texto-secundario">({h.codigo})</span> · vence el {fechaCorta(h.vence)}
                  </li>
                ))}
              </ul>
              <p>
                <Link to={`/socios/${socio._id}`}>Ver la ficha de {socio.nombre}</Link>
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
