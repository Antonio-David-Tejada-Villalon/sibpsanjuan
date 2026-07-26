import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { useFocoEnRuta } from "./useFocoEnRuta.js";
import api from "./api.js";
import { obtenerBibliotecaActivaId, fijarBibliotecaActivaId } from "./bibliotecaActiva.js";
import ThemeToggle from "./ThemeToggle.jsx";

const MATERIALES = [
  { to: "/libros", etiqueta: "Libros" },
  { to: "/seriadas", etiqueta: "Publicaciones seriadas" },
  { to: "/recursos-electronicos", etiqueta: "Recursos electrónicos" },
  { to: "/material-sonoro", etiqueta: "Material sonoro" },
  { to: "/material-audiovisual", etiqueta: "Material audiovisual" },
  { to: "/material-cartografico", etiqueta: "Material cartográfico" },
  { to: "/material-grafico", etiqueta: "Material gráfico" },
  { to: "/material-didactico", etiqueta: "Material didáctico" },
  { to: "/archivos", etiqueta: "Archivos" },
  { to: "/objetos", etiqueta: "Objetos" },
];

// Igual que en Koha: "Circulación" agrupa solicitudes (pedidos pendientes
// de aprobar) y préstamos activos/devoluciones bajo un solo módulo, en vez
// de dos links sueltos.
const CIRCULACION = [
  { to: "/circulacion", etiqueta: "Solicitudes" },
  { to: "/prestamos", etiqueta: "Préstamos" },
];

// Menú desplegable accesible: botón con aria-haspopup/aria-expanded, cierra
// con clic afuera, Escape o al elegir un ítem (sin esto último, el <nav>
// no se remonta entre rutas y el panel quedaría abierto después de navegar).
function MenuDesplegable({ etiqueta, rutas, children }) {
  const [abierto, setAbierto] = useState(false);
  const location = useLocation();
  const ref = useRef(null);
  const activo = rutas.some((r) => location.pathname.startsWith(r));

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    function onTecla(e) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    document.addEventListener("keydown", onTecla);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      document.removeEventListener("keydown", onTecla);
    };
  }, [abierto]);

  return (
    <div className="menu-desplegable" ref={ref}>
      <button
        type="button"
        className={activo ? "menu-desplegable__disparador active" : "menu-desplegable__disparador"}
        aria-haspopup="true"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        {etiqueta} <span aria-hidden="true">▾</span>
      </button>
      {abierto && (
        <div className="menu-desplegable__panel" role="menu" onClick={() => setAbierto(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

// superbibliotecario tiene acceso completo siempre; bibliotecario solo ve
// (y el backend solo le permite) lo que su superbibliotecario le haya
// otorgado en "permisos" — esto es puramente cosmético (ocultar un link que
// de todos modos daría 403), la restricción real siempre la hace el
// servidor vía requierePermiso.
// Orden calcado del módulo de Koha (Circulación, Usuarios, Catalogación,
// ...Administración al final) — mismo orden relativo que en la interfaz de
// referencia, salteando los módulos que SIBPSANJUAN todavía no tiene
// (Adquisiciones, Informes, Herramientas, Autoridades, etc.).
// admin y supervisor tienen acceso completo dentro de la biblioteca activa
// que hayan elegido (ver SelectorBibliotecaActiva) — mismo criterio que
// superbibliotecario, ya que el backend los deja pasar sin permisos
// granulares (ver requierePermiso en middleware/auth.js).
function NavPanelBiblioteca({ sesion }) {
  const accesoCompleto = ["superbibliotecario", "admin", "supervisor"].includes(sesion.rol);
  const tieneAcceso = accesoCompleto ? () => true : (permiso) => !!sesion.permisos?.[permiso];

  return (
    <>
      {(tieneAcceso("prestamos") || tieneAcceso("devoluciones")) && (
        <MenuDesplegable etiqueta="Circulación" rutas={CIRCULACION.map((c) => c.to)}>
          {CIRCULACION.map((c) => (
            <NavLink key={c.to} to={c.to} role="menuitem">
              {c.etiqueta}
            </NavLink>
          ))}
        </MenuDesplegable>
      )}
      {tieneAcceso("socios") && <NavLink to="/socios">Socios</NavLink>}
      {tieneAcceso("catalogar") && (
        <MenuDesplegable etiqueta="Catalogar" rutas={[...MATERIALES.map((m) => m.to), "/autores", "/materias"]}>
          {MATERIALES.map((m) => (
            <NavLink key={m.to} to={m.to} role="menuitem">
              {m.etiqueta}
            </NavLink>
          ))}
          <NavLink to="/autores" role="menuitem">
            Autores (autoridades)
          </NavLink>
          <NavLink to="/materias" role="menuitem">
            Materias (autoridades)
          </NavLink>
        </MenuDesplegable>
      )}
      {tieneAcceso("exportar") && <NavLink to="/exportar">Exportar</NavLink>}
      {sesion.rol === "superbibliotecario" && <NavLink to="/bibliotecarios">Bibliotecarios</NavLink>}
    </>
  );
}

// Elige sobre qué biblioteca opera un admin/supervisor en el resto del
// panel (catálogo, socios, circulación) — ellos no tienen una sola
// bibliotecaId fija en su sesión, así que las pantallas que sí la necesitan
// (ver ROLES_STAFF en App.jsx) quedan bloqueadas hasta elegir una acá.
function SelectorBibliotecaActiva() {
  const [bibliotecas, setBibliotecas] = useState(null);
  const [seleccion, setSeleccion] = useState(() => obtenerBibliotecaActivaId());

  useEffect(() => {
    api.listarBibliotecas().then(setBibliotecas);
  }, []);

  if (!bibliotecas) return null;

  const sinBibliotecas = bibliotecas.length === 0;

  return (
    <label className="selector-biblioteca-activa" title={sinBibliotecas ? "Todavía no tenés ninguna biblioteca en tu alcance." : undefined}>
      <span className="selector-biblioteca-activa__etiqueta">Biblioteca</span>
      <select
        value={seleccion}
        disabled={sinBibliotecas}
        onChange={(e) => {
          setSeleccion(e.target.value);
          fijarBibliotecaActivaId(e.target.value);
        }}
      >
        {sinBibliotecas ? (
          <option value="">Sin bibliotecas asignadas</option>
        ) : (
          <>
            <option value="">— elegir —</option>
            {bibliotecas.map((b) => (
              <option key={b._id} value={b._id}>
                {b.nombre} ({b.codigo})
              </option>
            ))}
          </>
        )}
      </select>
    </label>
  );
}

export default function Layout({ children }) {
  const { sesion, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useFocoEnRuta();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Cierra el menú mobile al navegar — si no, el panel desplegado quedaría
  // tapando la pantalla nueva (mismo motivo que MenuDesplegable cierra al
  // elegir un ítem).
  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <>
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <header className={menuAbierto ? "app menu-abierto" : "app"}>
        <div className="brand-nav">
          <span className="brand">
            <img src="/DBP.png" alt="" width="28" height="28" />
            SIBPSANJUAN
          </span>
          <nav>
            {(sesion?.rol === "admin" || sesion?.rol === "supervisor") && (
              <NavLink to="/admin">Bibliotecas</NavLink>
            )}
            {(sesion?.rol === "superbibliotecario" ||
              sesion?.rol === "bibliotecario" ||
              sesion?.rol === "admin" ||
              sesion?.rol === "supervisor") && <NavPanelBiblioteca sesion={sesion} />}
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
        {sesion && (
          <div className="header-derecha">
            {(sesion.rol === "admin" || sesion.rol === "supervisor") && <SelectorBibliotecaActiva />}
            <ThemeToggle />
            <span className="sesion-usuario">
              {sesion.usuario}
              <Link to="/cambiar-password">Cambiar contraseña</Link>
              <button className="secundario" onClick={onLogout}>
                Salir
              </button>
            </span>
          </div>
        )}
      </header>
      <main id="contenido" ref={mainRef} tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
