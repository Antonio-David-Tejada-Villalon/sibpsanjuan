import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSocioAuth } from "../../SocioAuthContext.jsx";
import { useFocoEnRuta } from "../../useFocoEnRuta.js";
import ThemeToggle from "../../ThemeToggle.jsx";

export default function OpacLayout({ children }) {
  const { codigo, sesion, logout } = useSocioAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useFocoEnRuta();
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  async function onLogout() {
    await logout();
    navigate(`/opac/${codigo}`);
  }

  return (
    <>
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <header className={menuAbierto ? "app app-opac menu-abierto" : "app app-opac"}>
        <div className="brand-nav">
          <span className="brand">
            <img src="/DBP.png" alt="" width="28" height="28" />
            SIBPSANJUAN
            <span className="badge-opac">Catálogo público</span>
          </span>
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
          <span aria-hidden="true">{menuAbierto ? "✕" : "☰"}</span>
        </button>
        <div className="header-derecha">
          <ThemeToggle />
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
      <footer className="footer-opac">
        <Link to={`/opac/${codigo}/privacidad`}>Aviso de privacidad</Link>
      </footer>
    </>
  );
}
