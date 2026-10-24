import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw, Sparkles, WifiOff } from "lucide-react";
import { actualizarVersion, pantallaNueva, usePwa } from "./pwa.js";

const DIA = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" });
const HORA = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function cuandoSeGuardo(fecha) {
  return `${DIA.format(fecha)} a las ${HORA.format(fecha)}`;
}

// Avisos de toda la app, arriba de todo: sin conexión (y desde cuándo es
// lo que se ve, si viene de lo guardado) y versión nueva disponible.
export default function EstadoConexion() {
  const { enLinea, guardadoEl, versionNueva } = usePwa();
  const { pathname, search } = useLocation();
  // Corre antes que los pedidos de la pantalla nueva (este componente va
  // antes que las rutas en App.jsx).
  useEffect(() => pantallaNueva(), [pathname, search]);
  const fecha = guardadoEl ? new Date(guardadoEl) : null;
  const fechaValida = fecha && !Number.isNaN(fecha.getTime());

  return (
    <>
      {(!enLinea || fechaValida) && (
        <div className="estado-app estado-app--sin-conexion" role="status">
          <WifiOff size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>
            {fechaValida
              ? `Sin conexión con el servidor. Estás viendo lo guardado en este dispositivo el ${cuandoSeGuardo(fecha)}.`
              : "Sin conexión. Pedir, renovar o guardar cambios necesita internet."}
          </span>
          <button type="button" className="secundario" onClick={() => window.location.reload()}>
            <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" /> Reintentar
          </button>
        </div>
      )}
      {versionNueva && (
        <div className="estado-app estado-app--version" role="status">
          <Sparkles size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>Hay una versión nueva.</span>
          <button type="button" onClick={actualizarVersion}>
            Actualizar
          </button>
        </div>
      )}
    </>
  );
}
