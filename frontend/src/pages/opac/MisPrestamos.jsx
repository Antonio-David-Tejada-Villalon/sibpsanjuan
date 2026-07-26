import React, { useEffect, useState } from "react";
import api from "../../api.js";
import { useSocioAuth } from "../../SocioAuthContext.jsx";

function formatear(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-AR");
}

export default function MisPrestamos() {
  const { codigo } = useSocioAuth();
  const [prestamos, setPrestamos] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [procesandoId, setProcesandoId] = useState(null);

  async function recargar() {
    setPrestamos(await api.opacMisPrestamos(codigo));
  }

  useEffect(() => {
    recargar();
  }, [codigo]);

  async function pedirRenovacion(prestamoId) {
    setMensaje("");
    setError("");
    setProcesandoId(prestamoId);
    try {
      await api.opacSolicitarRenovacion(codigo, prestamoId);
      setMensaje("Pedido de renovación enviado — la biblioteca lo va a revisar.");
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <>
      <h1>Mis préstamos</h1>
      {mensaje && <div className="flash ok" role="status">{mensaje}</div>}
      {error && <div className="flash error" role="alert">{error}</div>}
      {prestamos === null ? (
        <p>Cargando...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Libro</th>
              <th>Entrega</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {prestamos.map((p) => (
              <tr key={p._id}>
                <td>{p.item?.titulo}</td>
                <td>{formatear(p.fechaEntrega)}</td>
                <td>{formatear(p.fechaVencimiento)}</td>
                <td>
                  {p.fechaDevolucion
                    ? "devuelto"
                    : p.vencido
                    ? `atrasado${p.multa > 0 ? ` — multa: $${p.multa}` : ""}`
                    : "al día"}
                </td>
                <td>
                  {!p.fechaDevolucion && (
                    <button onClick={() => pedirRenovacion(p._id)} disabled={procesandoId === p._id}>
                      {procesandoId === p._id ? "Enviando…" : "Pedir renovación"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {prestamos.length === 0 && (
              <tr>
                <td colSpan={5}>Todavía no tenés préstamos.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
