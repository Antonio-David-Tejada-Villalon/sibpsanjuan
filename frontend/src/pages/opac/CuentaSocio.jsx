import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CircleCheck, CircleX, Hourglass } from "lucide-react";
import api from "../../api.js";
import { useSocioAuth } from "../../SocioAuthContext.jsx";
import { urlFicha } from "../../opac.js";
import { ReglasDelSocio } from "./MisPrestamos.jsx";
import { useMetadatosPrivados } from "../../metadatos.js";

// Estados de un pedido, en palabras y con ícono (nunca solo con color).
const ESTADOS = {
  pendiente: { texto: "Pendiente: la biblioteca todavía no lo revisó", Icono: Hourglass, clase: "vigente" },
  aprobada: { texto: "Aprobado", Icono: CircleCheck, clase: "devuelto" },
  rechazada: { texto: "Rechazado", Icono: CircleX, clase: "vencido" },
};

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

  useEffect(() => {
    api.opacMisReglas(codigo).then(setReglas, () => setReglas(null));
    api
      .opacMisSolicitudes(codigo)
      .then(setPedidos)
      .catch((err) => {
        setPedidos([]);
        setError(err.message);
      });
  }, [codigo]);

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
        {pedidos === null ? (
          <p role="status">Cargando…</p>
        ) : pedidos.length === 0 ? (
          <p>
            Todavía no pediste nada. <Link to={`/opac/${codigo}`}>Buscá en el catálogo</Link>.
          </p>
        ) : (
          <ul className="lista-pedidos">
            {pedidos.map((p) => {
              const estado = ESTADOS[p.estado] || { texto: p.estado, Icono: Hourglass, clase: "vigente" };
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
