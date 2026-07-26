import React, { useEffect, useState } from "react";
import api from "../api.js";

export default function Circulacion() {
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState("");
  const [procesandoId, setProcesandoId] = useState(null);

  async function recargar() {
    setSolicitudes(await api.listarSolicitudes("pendiente"));
  }

  useEffect(() => {
    recargar();
  }, []);

  async function aprobar(id) {
    setError("");
    setProcesandoId(id);
    try {
      await api.aprobarSolicitud(id);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  async function rechazar(id) {
    const nota = prompt("Motivo del rechazo (opcional):") || "";
    setError("");
    setProcesandoId(id);
    try {
      await api.rechazarSolicitud(id, nota);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <>
      <h1>Solicitudes pendientes</h1>
      {error && <div className="flash error" role="alert">{error}</div>}
      {solicitudes === null ? (
        <p>Cargando...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Socio</th>
              <th>Ítem</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => (
              <tr key={s._id}>
                <td>{s.tipo === "prestamo" ? "Préstamo" : "Renovación"}</td>
                <td>
                  {s.socio ? `${s.socio.apellido}, ${s.socio.nombre} (${s.socio.numeroSocio})` : "—"}
                </td>
                <td>{s.item ? s.item.titulo : "—"}</td>
                <td>
                  <button onClick={() => aprobar(s._id)} disabled={procesandoId === s._id}>
                    {procesandoId === s._id ? "Procesando…" : "Aprobar"}
                  </button>{" "}
                  <button
                    className="peligro"
                    onClick={() => rechazar(s._id)}
                    disabled={procesandoId === s._id}
                  >
                    Rechazar
                  </button>
                </td>
              </tr>
            ))}
            {solicitudes.length === 0 && (
              <tr>
                <td colSpan={4}>No hay solicitudes pendientes.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
