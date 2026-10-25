import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CircleCheck, CircleX, Hourglass, PackageCheck } from "lucide-react";
import api from "../../api.js";
import { useSocioAuth } from "../../SocioAuthContext.jsx";
import { urlFicha } from "../../opac.js";
import { ReglasDelSocio } from "./MisPrestamos.jsx";
import { useMetadatosPrivados } from "../../metadatos.js";
import { useEnLinea, SIN_CONEXION } from "../../opac.js";
import { avisarCambioDeNotificaciones } from "../../CampanaNotificaciones.jsx";

// Estados de un pedido, en palabras y con ícono (nunca solo con color).
const ESTADOS = {
  pendiente: { texto: "Pendiente: la biblioteca todavía no lo revisó", Icono: Hourglass, clase: "vigente" },
  en_espera: { texto: "En espera: te avisamos cuando vuelva un ejemplar", Icono: Hourglass, clase: "vigente" },
  lista: { texto: "Listo para retirar: pasá por la biblioteca", Icono: PackageCheck, clase: "devuelto" },
  aprobada: { texto: "Aprobado", Icono: CircleCheck, clase: "devuelto" },
  rechazada: { texto: "Rechazado", Icono: CircleX, clase: "vencido" },
  cancelada: { texto: "Cancelado", Icono: CircleX, clase: "vencido" },
};

// Un pedido pendiente cuyo ejemplar se apartó después (estaba en espera, o
// lo reservó la biblioteca) ya está para retirar.
function estadoDe(p) {
  const apartadoDespues = p.fechaDisponible && new Date(p.fechaDisponible) - new Date(p.fechaSolicitud) > 60 * 1000;
  if (p.estado === "pendiente" && p.tipo === "prestamo" && (apartadoDespues || p.origen === "staff")) return "lista";
  return p.estado;
}

function fecha(f) {
  return f ? new Date(f).toLocaleDateString("es-AR") : "";
}

// Lo del socio en un solo lugar: quién es, sus reglas y en qué quedó cada
// cosa que pidió. Solo sus datos: todo sale de rutas que filtran por la
// sesión (ver /mis-reglas y /mis-solicitudes en el backend).
export default function CuentaSocio() {
  const { codigo, sesion, logout } = useSocioAuth();
  const navigate = useNavigate();
  useMetadatosPrivados("Mi cuenta");
  const [reglas, setReglas] = useState(null);
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState("");
  const [cancelandoId, setCancelandoId] = useState(null);
  const enLinea = useEnLinea();

  function cargarPedidos() {
    return api
      .opacMisSolicitudes(codigo)
      .then(setPedidos)
      .catch((err) => {
        setPedidos([]);
        setError(err.message);
      });
  }

  useEffect(() => {
    api.opacMisReglas(codigo).then(setReglas, () => setReglas(null));
    cargarPedidos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  async function cancelar(p) {
    if (!window.confirm(`¿Cancelar ${p.estado === "en_espera" ? "la reserva" : "el pedido"} de «${p.material?.titulo ?? "este material"}»?`)) return;
    setCancelandoId(p._id);
    setError("");
    try {
      await api.opacCancelarSolicitud(codigo, p._id);
      await cargarPedidos();
      avisarCambioDeNotificaciones();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelandoId(null);
    }
  }

  async function salir() {
    await logout();
    navigate(`/opac/${codigo}`);
  }

  return (
    <>
      <h1>Mi cuenta</h1>
      <p>
        {sesion?.nombre} {sesion?.apellido} · Socio n.º {sesion?.numeroSocio}
      </p>
      {reglas && <ReglasDelSocio reglas={reglas} />}

      <section className="card">
        <h2>Mis pedidos</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        {!enLinea && <p className="categoria__nota">{SIN_CONEXION}</p>}
        {pedidos === null ? (
          <p role="status">Cargando…</p>
        ) : pedidos.length === 0 ? (
          <p>
            Todavía no pediste nada. <Link to={`/opac/${codigo}`}>Buscá en el catálogo</Link>.
          </p>
        ) : (
          <ul className="lista-pedidos">
            {pedidos.map((p) => {
              const estado = ESTADOS[estadoDe(p)] || { texto: p.estado, Icono: Hourglass, clase: "vigente" };
              const { Icono } = estado;
              return (
                <li key={p._id}>
                  <span className="lista-pedidos__titulo">
                    {p.tipo === "renovacion" ? "Renovación de " : ""}
                    {p.material?.titulo ? (
                      <Link to={urlFicha(codigo, p.material)}>{p.material.titulo}</Link>
                    ) : (
                      "un material que ya no está en el catálogo"
                    )}
                  </span>
                  <span className={`estado-prestamo estado-prestamo--${estado.clase}`}>
                    <Icono size={16} strokeWidth={1.5} aria-hidden="true" />
                    {estado.texto}
                  </span>
                  <span className="categoria__nota">
                    Pedido el {fecha(p.fechaSolicitud)}
                    {p.fechaResolucion ? ` · resuelto el ${fecha(p.fechaResolucion)}` : ""}
                  </span>
                  {p.notaStaff && <span className="categoria__nota">Nota de la biblioteca: {p.notaStaff}</span>}
                  {["pendiente", "en_espera"].includes(p.estado) && (
                    <button type="button" className="secundario" disabled={cancelandoId === p._id || !enLinea} onClick={() => cancelar(p)}>
                      {cancelandoId === p._id ? "Cancelando…" : "Cancelar"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="categoria__acciones">
        <Link to={`/opac/${codigo}/mis-prestamos`}>Ver mis préstamos</Link>
        <Link to={`/opac/${codigo}/privacidad`}>Cómo se usan tus datos</Link>
        <button type="button" className="secundario" onClick={salir}>
          Salir
        </button>
      </p>
    </>
  );
}
