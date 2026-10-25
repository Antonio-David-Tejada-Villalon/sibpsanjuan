import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "./AuthContext.jsx";
import { useFocoEnRuta } from "./useFocoEnRuta.js";
import api from "./api.js";
import { obtenerBibliotecaActivaId, fijarBibliotecaActivaId } from "./bibliotecaActiva.js";
import SelectorTema from "./SelectorTema.jsx";
import Preferencias from "./Preferencias.jsx";
import CampanaNotificaciones from "./CampanaNotificaciones.jsx";
import { tienePermiso } from "./permisos.js";

// Igual que en Koha, los módulos van en el orden de uso. "Circulación" ya
// no es una sección: lo que había que resolver está en la campana
// (/notificaciones), y prestar, devolver y los préstamos de cada socio,
// en "Socios".
const SOCIOS = [
  // Buscar, también para el mostrador: la ficha es donde se presta y devuelve.
  { to: "/socios", etiqueta: "Buscar socios", permiso: ["socios", "prestamos", "devoluciones"], fin: true },
  { to: "/socios/nuevo", etiqueta: "Nuevo socio", permiso: "socios" },
  { to: "/prestar", etiqueta: "Prestar", permiso: "prestamos" },
  { to: "/devolver", etiqueta: "Devolver", permiso: "devoluciones" },
  { to: "/prestamos", etiqueta: "Préstamos en curso", permiso: ["prestamos", "devoluciones"] },
];

const CATALOGO = [
  { to: "/catalogo", etiqueta: "Catálogo" },
  { to: "/catalogar", etiqueta: "Catalogar", permiso: "catalogar" },
  { to: "/autores", etiqueta: "Autores (autoridades)", permiso: "catalogar" },
  { to: "/materias", etiqueta: "Materias (autoridades)", permiso: "catalogar" },
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

// Un bibliotecario solo ve lo que le otorgaron en "permisos"; admin,
// supervisor y superbibliotecario, todo (ver permisos.js). Es cosmético: la
// restricción real la hace el servidor (requierePermiso).
function NavPanelBiblioteca({ sesion }) {
  const accesoCompleto = ["superbibliotecario", "admin", "supervisor"].includes(sesion.rol);
  const puede = (permiso) => !permiso || [permiso].flat().some((p) => tienePermiso(sesion, p));
  const socios = SOCIOS.filter((m) => puede(m.permiso));
  const catalogo = CATALOGO.filter((m) => puede(m.permiso));

  return (
    <>
      {socios.length > 0 && (
        <MenuDesplegable etiqueta="Socios" rutas={["/socios", "/prestar", "/devolver", "/prestamos"]}>
          {socios.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.fin} role="menuitem">
              {m.etiqueta}
            </NavLink>
          ))}
        </MenuDesplegable>
      )}
      <MenuDesplegable etiqueta="Catálogo" rutas={["/catalogo", "/catalogar", "/autores", "/materias"]}>
        {catalogo.map((m) => (
          <NavLink key={m.to} to={m.to} role="menuitem">
            {m.etiqueta}
          </NavLink>
        ))}
      </MenuDesplegable>
      {tienePermiso(sesion, "exportar") && <NavLink to="/exportar">Exportar</NavLink>}
      {tienePermiso(sesion, "contenido") && <NavLink to="/contenido">Contenido del OPAC</NavLink>}
      {accesoCompleto && <NavLink to="/bibliotecarios">Bibliotecarios</NavLink>}
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

  // Las notificaciones son de una biblioteca: admin y supervisor las ven
  // cuando eligieron una en el selector.
  const conCampana =
    Boolean(sesion) &&
    (["superbibliotecario", "bibliotecario"].includes(sesion.rol) || (["admin", "supervisor"].includes(sesion.rol) && Boolean(obtenerBibliotecaActivaId()))) &&
    ["prestamos", "devoluciones", "socios"].some((p) => tienePermiso(sesion, p));

  return (
    <>
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <header className={menuAbierto ? "app menu-abierto" : "app"}>
        <div className="brand-nav">
          <NavLink to="/dashboard" className="brand">
            <img src="/logo-64.png" alt="" width="28" height="28" />
            SIBPSANJUAN
          </NavLink>
          <nav>
            {sesion && (
              <NavLink to="/dashboard" end>
                Panel
              </NavLink>
            )}
            {(sesion?.rol === "admin" || sesion?.rol === "supervisor") && (
              <NavLink to="/admin">Bibliotecas</NavLink>
            )}
            {(sesion?.rol === "superbibliotecario" ||
              sesion?.rol === "bibliotecario" ||
              sesion?.rol === "admin" ||
              sesion?.rol === "supervisor") && <NavPanelBiblioteca sesion={sesion} />}
            {/* Última a propósito: es referencia/ayuda, no una tarea — mismo
                criterio que separa "Panel" (primero, siempre visible) del
                resto de los ítems funcionales/con permiso. */}
            {sesion && <NavLink to="/documentacion">Documentación</NavLink>}
          </nav>
        </div>
        {conCampana && (
          <div className="header-campana">
            <CampanaNotificaciones
              cargar={api.notificaciones}
              marcarVistas={api.marcarNotificacionesVistas}
              rutaDe={(n) => n.enlace || "/notificaciones"}
              rutaTodas="/notificaciones"
              sobreTinta
            />
          </div>
        )}
        <button
          type="button"
          className="boton-hamburguesa"
          aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto((a) => !a)}
        >
          {menuAbierto ? <X size={22} strokeWidth={1.5} aria-hidden="true" /> : <Menu size={22} strokeWidth={1.5} aria-hidden="true" />}
        </button>
        {sesion && (
          <div className="header-derecha">
            {(sesion.rol === "admin" || sesion.rol === "supervisor") && <SelectorBibliotecaActiva />}
            <SelectorTema sobreTinta compacto />
            <Preferencias sobreTinta />
            <span className="sesion-usuario">
              {sesion.usuario}
              <Link to="/cambiar-password">Mi perfil</Link>
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
