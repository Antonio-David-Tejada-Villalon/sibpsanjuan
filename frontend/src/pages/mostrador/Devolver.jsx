import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api.js";
import { fechaCorta, nombreSocio } from "../../circulacion.js";

// Devolver con el lector de códigos: un ejemplar por vez, sin buscar al
// socio. Si alguien lo estaba esperando, avisa para apartarlo en vez de
// devolverlo al estante (como "Reserva encontrada" en Koha).
export default function Devolver() {
  const [codigo, setCodigo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [devueltos, setDevueltos] = useState([]);
  const codigoRef = useRef(null);

  async function devolver(e) {
    e.preventDefault();
    const valor = codigo.trim();
    if (!valor) return;
    setProcesando(true);
    setError("");
    try {
      const r = await api.devolverPorCodigo(valor);
      setDevueltos((d) => [r, ...d]);
      setCodigo("");
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
      codigoRef.current?.focus();
    }
  }

  const [ultimo] = devueltos;

  return (
    <>
      <h1>Devolver</h1>
      <form className="card" onSubmit={devolver}>
        <label htmlFor="codigo-devolucion">Código de barras del ejemplar</label>
        <div className="fila-campo-boton">
          <input
            id="codigo-devolucion"
            ref={codigoRef}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Escaneá o escribí el código"
            autoComplete="off"
            autoFocus
          />
          <button type="submit" disabled={procesando || !codigo.trim()}>
            {procesando ? "Devolviendo…" : "Devolver"}
          </button>
        </div>
        {error && <div className="flash error" role="alert">{error}</div>}
      </form>

      {ultimo?.reservaSiguiente && (
        <div className="flash aviso aviso-reserva" role="alert">
          <strong>No lo pongas en el estante.</strong> «{ultimo.item?.titulo ?? ultimo.codigoBarras}» tiene una reserva: quedó apartado para{" "}
          <Link to={`/socios/${ultimo.reservaSiguiente.socio._id}`}>
            {nombreSocio(ultimo.reservaSiguiente.socio)} (n.º {ultimo.reservaSiguiente.socio.numeroSocio})
          </Link>
          . Ya se le avisó que pase a buscarlo.
        </div>
      )}

      {devueltos.length > 0 && (
        <section className="card">
          <h2>Devuelto ahora</h2>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Lo tenía</th>
                <th>Vencía</th>
                <th>Atraso</th>
              </tr>
            </thead>
            <tbody>
              {devueltos.map((d) => {
                const atraso = Math.max(0, Math.floor((new Date(d.fechaDevolucion) - new Date(d.fechaVencimiento)) / 86400000));
                return (
                  <tr key={d._id}>
                    <td>{d.codigoBarras}</td>
                    <td>{d.item?.titulo ?? "—"}</td>
                    <td>{d.socio ? <Link to={`/socios/${d.socioId}`}>{nombreSocio(d.socio)}</Link> : "—"}</td>
                    <td>{fechaCorta(d.fechaVencimiento)}</td>
                    <td>{atraso ? `${atraso} ${atraso === 1 ? "día" : "días"}` : "A tiempo"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
