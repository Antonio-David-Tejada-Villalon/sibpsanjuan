import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";

// La campana con el número de notificaciones sin leer, para el personal
// (panel) y para el socio (OPAC). Las notificaciones las arma el servidor
// (backend/src/notificaciones/); acá se muestran, se marcan como vistas al
// abrirlas y se vuelven a pedir cada minuto, al volver a la pestaña y
// cuando otra pantalla avisa que algo cambió (evento "notificaciones").

export function avisarCambioDeNotificaciones() {
  window.dispatchEvent(new Event("notificaciones"));
}

const CADA = 60 * 1000;

export default function CampanaNotificaciones({ cargar, marcarVistas, rutaDe, rutaTodas, sobreTinta = false, maximo = 8 }) {
  const [datos, setDatos] = useState({ noLeidas: 0, notificaciones: [] });
  const [abierta, setAbierta] = useState(false);
  const contenedor = useRef(null);
  const boton = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const idPanel = useId();

  const actualizar = useCallback(() => {
    cargar()
      .then(setDatos)
      .catch(() => {});
  }, [cargar]);

  useEffect(() => {
    actualizar();
    const intervalo = setInterval(actualizar, CADA);
    const alVolver = () => document.visibilityState === "visible" && actualizar();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("notificaciones", actualizar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("notificaciones", actualizar);
    };
  }, [actualizar]);

  useEffect(() => setAbierta(false), [location.pathname]);

  useEffect(() => {
    if (!abierta) return undefined;
    const afuera = (e) => !contenedor.current?.contains(e.target) && setAbierta(false);
    const tecla = (e) => {
      if (e.key === "Escape") {
        setAbierta(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierta]);

  async function marcar(claves) {
    const nuevas = claves.filter((c) => datos.notificaciones.some((n) => n.clave === c && !n.leida));
    if (!nuevas.length) return;
    setDatos((d) => ({
      noLeidas: Math.max(0, d.noLeidas - nuevas.length),
      notificaciones: d.notificaciones.map((n) => (nuevas.includes(n.clave) ? { ...n, leida: true } : n)),
    }));
    await marcarVistas(nuevas).catch(() => {});
  }

  function abrir(n) {
    marcar([n.clave]);
    setAbierta(false);
    navigate(rutaDe(n));
  }

  const { noLeidas, notificaciones } = datos;
  const etiqueta = noLeidas ? `Notificaciones: ${noLeidas} sin leer` : "Notificaciones";

  return (
    <div className="campana" ref={contenedor}>
      <button
        ref={boton}
        type="button"
        className={sobreTinta ? "campana__boton campana__boton--sobre-tinta" : "campana__boton"}
        aria-expanded={abierta}
        aria-controls={idPanel}
        aria-label={etiqueta}
        title={etiqueta}
        onClick={() => setAbierta((a) => !a)}
      >
        <Bell size={18} strokeWidth={1.5} aria-hidden="true" />
        {noLeidas > 0 && (
          <span className="campana__numero" aria-hidden="true">
            {noLeidas > 99 ? "99+" : noLeidas}
          </span>
        )}
      </button>
      {abierta && (
        <div className="campana__panel" id={idPanel} role="region" aria-label="Notificaciones">
          <div className="campana__cabecera">
            <strong>Notificaciones</strong>
            {noLeidas > 0 && (
              <button type="button" className="enlace-boton" onClick={() => marcar(notificaciones.map((n) => n.clave))}>
                Marcar todo como leído
              </button>
            )}
          </div>
          {notificaciones.length === 0 ? (
            <p className="campana__vacia">No hay nada pendiente.</p>
          ) : (
            <ul className="campana__lista">
              {notificaciones.slice(0, maximo).map((n) => (
                <li key={n.clave} className={n.leida ? undefined : "es-nueva"}>
                  <button type="button" onClick={() => abrir(n)} className={`notificacion notificacion--${n.tipo}`}>
                    <span className="notificacion__titulo">{n.titulo}</span>
                    {n.detalle && <span className="notificacion__detalle">{n.detalle}</span>}
                    {!n.leida && <span className="sr-only"> (sin leer)</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {rutaTodas && (
            <Link className="campana__todas" to={rutaTodas} onClick={() => setAbierta(false)}>
              Ver todas{notificaciones.length > maximo ? ` (${notificaciones.length})` : ""}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
