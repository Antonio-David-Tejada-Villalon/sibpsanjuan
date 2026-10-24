import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useSocioAuth } from "../../SocioAuthContext.jsx";
import { useContenidoOpac } from "../../ContenidoOpacContext.jsx";
import { useFocoEnRuta } from "../../useFocoEnRuta.js";
import { cssDeMarca } from "../../marca.js";
import SelectorTema from "../../SelectorTema.jsx";

// Mismo origen que usa api.js: vacío salvo que el frontend se sirva aparte.
const ORIGEN_API = import.meta.env.VITE_API_URL || "";

// Pie del OPAC con lo que cargó la institución en el CMS: contacto,
// páginas (incluidas las legales) y el aviso de privacidad del sistema.
function PieOpac({ codigo, contenido }) {
  const { contacto = {}, paginas = [], identidad = {} } = contenido;
  const telefono = contacto.telefono?.replace(/[^\d+]/g, "");
  return (
    <footer className="footer-opac">
      {(contacto.email || contacto.telefono || contacto.direccion || contacto.horario || contacto.web) && (
        <address className="footer-opac__contacto">
          {contacto.direccion && <span>{contacto.direccion}</span>}
          {contacto.horario && <span>{contacto.horario}</span>}
          {contacto.telefono && <a href={`tel:${telefono}`}>{contacto.telefono}</a>}
          {contacto.email && <a href={`mailto:${contacto.email}`}>{contacto.email}</a>}
          {contacto.web && (
            <a href={contacto.web} target="_blank" rel="noopener noreferrer">
              Sitio de la institución
            </a>
          )}
        </address>
      )}
      <nav className="footer-opac__paginas" aria-label="Páginas de la biblioteca">
        {paginas.map((p) => (
          <Link key={p.slug} to={`/opac/${codigo}/pagina/${p.slug}`}>
            {p.titulo}
          </Link>
        ))}
        <Link to={`/opac/${codigo}/privacidad`}>Aviso de privacidad</Link>
      </nav>
      <p className="footer-opac__legal">
        {identidad.nombreLegal && <span>{identidad.nombreLegal} · </span>}
        Catálogo con SIBPSANJUAN
      </p>
    </footer>
  );
}

export default function OpacLayout({ children }) {
  const { codigo, sesion, logout } = useSocioAuth();
  const { contenido, vistaPrevia, error } = useContenidoOpac();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useFocoEnRuta();
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  const identidad = contenido?.identidad;
  const nombre = identidad?.nombre || "Catálogo de la biblioteca";
  // La barra superior siempre es oscura: primero el logo para fondo oscuro.
  const logo = identidad && (identidad.logos.oscuro || identidad.logos.horizontal || identidad.logos.cuadrado);

  useEffect(() => {
    document.title = `${nombre} · Catálogo`;
  }, [nombre]);

  async function onLogout() {
    await logout();
    navigate(`/opac/${codigo}`);
  }

  return (
    // El OPAC lleva la identidad de la institución (nombre, logo, color);
    // SIBPSANJUAN queda como marca del panel y en el pie.
    <div className="marca-institucion">
      {identidad && <style>{cssDeMarca(identidad.colorAcento)}</style>}
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      {vistaPrevia && (
        <div className="aviso-vista-previa" role="status">
          {error || "Vista previa del borrador: así se va a ver cuando se publique."}
        </div>
      )}
      <header className={menuAbierto ? "app app-opac menu-abierto" : "app app-opac"}>
        <div className="brand-nav">
          <Link to={`/opac/${codigo}`} className="brand">
            {logo ? (
              <img src={`${ORIGEN_API}${logo}`} alt="" className="brand__logo" height="32" />
            ) : (
              <img src="/logo.png" alt="" width="28" height="28" />
            )}
            <span className="brand__nombre">{contenido ? nombre : ""}</span>
            <span className="badge-opac">Catálogo</span>
          </Link>
          <nav>
            <NavLink to={`/opac/${codigo}`} end>Catálogo</NavLink>
            {sesion && <NavLink to={`/opac/${codigo}/mis-prestamos`}>Mis préstamos</NavLink>}
          </nav>
        </div>
        <button
          type="button"
          className="boton-hamburguesa"
          aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto((a) => !a)}
        >
          {menuAbierto ? <X size={22} strokeWidth={1.5} aria-hidden="true" /> : <Menu size={22} strokeWidth={1.5} aria-hidden="true" />}
        </button>
        <div className="header-derecha">
          <SelectorTema sobreTinta compacto />
          {sesion === undefined ? null : sesion ? (
            <span className="sesion-usuario">
              {sesion.nombre} {sesion.apellido}
              <button className="secundario" onClick={onLogout}>
                Salir
              </button>
            </span>
          ) : (
            <Link to={`/opac/${codigo}/login`}>
              <button className="secundario">Ingresar</button>
            </Link>
          )}
        </div>
      </header>
      <main id="contenido" ref={mainRef} tabIndex={-1}>
        {children}
      </main>
      {contenido && <PieOpac codigo={codigo} contenido={contenido} />}
    </div>
  );
}
