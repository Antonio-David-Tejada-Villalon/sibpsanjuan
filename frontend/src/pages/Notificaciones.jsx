import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";
import { avisarCambioDeNotificaciones } from "../CampanaNotificaciones.jsx";
import { nombreSocio } from "../circulacion.js";

// Lo que antes era "Circulación": todo lo que el personal tiene que
// resolver o mirar, con las acciones ahí mismo. Al abrir la página, lo
// mostrado queda como leído (la campana deja de contarlo).
const GRUPOS = [
  { titulo: "Para resolver", tipos: ["pedido", "renovacion", "reserva_lista", "reserva_sin_retirar"], vacio: "No hay pedidos ni reservas esperando." },
  { titulo: "Préstamos vencidos", tipos: ["vencido"], vacio: "No hay préstamos vencidos." },
  { titulo: "Avisos del sistema", tipos: ["sistema"], vacio: "Sin avisos." },
];

const fecha = (iso) => new Date(iso).toLocaleDateString("es-AR");

export default function Notificaciones() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [procesando, setProcesando] = useState(null);

  async function cargar({ marcarComoVistas = false } = {}) {
    const r = await api.notificaciones();
    setDatos(r);
    if (marcarComoVistas) {
      const nuevas = r.notificaciones.filter((n) => !n.leida).map((n) => n.clave);
      if (nuevas.length) {
        await api.marcarNotificacionesVistas(nuevas).catch(() => {});
        avisarCambioDeNotificaciones();
      }
    }
  }

  useEffect(() => {
    cargar({ marcarComoVistas: true }).catch((err) => setError(err.message));
  }, []);

  async function accion(n, tipo) {
    setError("");
    setMensaje("");
    setProcesando(n.clave);
    try {
      if (tipo === "aprobar") {
        await api.aprobarSolicitud(n.solicitudId);
        setMensaje(n.tipo === "renovacion" ? "Renovación aprobada." : "Listo: quedó prestado. El socio ve en su campana que puede pasar a buscarlo.");
      } else {
        const nota = window.prompt("Motivo (opcional, lo ve el socio):") ?? "";
        const r = tipo === "rechazar" ? await api.rechazarSolicitud(n.solicitudId, nota) : await api.cancelarSolicitud(n.solicitudId, nota);
        setMensaje(
          r.reservaSiguiente
            ? `Anulado. El ejemplar quedó apartado para ${nombreSocio(r.reservaSiguiente.socio)}, que estaba esperando.`
            : "Anulado: el ejemplar volvió a estar disponible."
        );
      }
      await cargar();
      avisarCambioDeNotificaciones();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  if (!datos) return error ? <div className="flash error" role="alert">{error}</div> : <p>Cargando…</p>;

  return (
    <>
      <h1>Notificaciones</h1>
      {error && <div className="flash error" role="alert">{error}</div>}
      {mensaje && <div className="flash ok" role="status">{mensaje}</div>}
      {GRUPOS.map((grupo) => {
        const lista = datos.notificaciones.filter((n) => grupo.tipos.includes(n.tipo));
        return (
          <section key={grupo.titulo} className="card grupo-notificaciones">
            <h2>
              {grupo.titulo} <span className="texto-secundario">({lista.length})</span>
            </h2>
            {lista.length === 0 ? (
              <p>{grupo.vacio}</p>
            ) : (
              <ul className="lista-notificaciones">
                {lista.map((n) => (
                  <li key={n.clave} className={`notificacion notificacion--${n.tipo}${n.leida ? "" : " es-nueva"}`}>
                    <div>
                      <p className="notificacion__titulo">
                        {n.enlace ? <Link to={n.enlace}>{n.titulo}</Link> : n.titulo}
                        {!n.leida && <span className="etiqueta-nueva">Nueva</span>}
                      </p>
                      <p className="notificacion__detalle">
                        {n.detalle} <span className="texto-secundario">· {fecha(n.fecha)}</span>
                      </p>
                    </div>
                    {n.acciones && (
                      <div className="acciones-fila">
                        {n.acciones.includes("aprobar") && (
                          <button type="button" disabled={procesando === n.clave} onClick={() => accion(n, "aprobar")}>
                            {n.tipo === "renovacion" ? "Aprobar" : n.tipo === "pedido" ? "Aprobar y prestar" : "Prestar"}
                          </button>
                        )}
                        {n.acciones.includes("rechazar") && (
                          <button type="button" className="secundario" disabled={procesando === n.clave} onClick={() => accion(n, "rechazar")}>
                            Rechazar
                          </button>
                        )}
                        {n.acciones.includes("cancelar") && (
                          <button type="button" className="secundario" disabled={procesando === n.clave} onClick={() => accion(n, "cancelar")}>
                            Cancelar reserva
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
