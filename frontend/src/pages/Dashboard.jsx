import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { tienePermiso } from "../permisos.js";

// La página de inicio del panel, como la de Koha: una tarjeta por módulo, en
// el orden del menú (Layout.jsx), con los mismos permisos (alcanza con uno
// de la lista; sin permiso, la ve cualquiera).
const MODULOS = [
  { permiso: ["prestamos", "devoluciones"], to: "/notificaciones", etiqueta: "Notificaciones", descripcion: "Pedidos y reservas por resolver, préstamos vencidos y avisos" },
  { permiso: "prestamos", to: "/prestar", etiqueta: "Prestar", descripcion: "Elegir al socio y leer el código de barras" },
  { permiso: "devoluciones", to: "/devolver", etiqueta: "Devolver", descripcion: "Leer el código de barras del ejemplar" },
  { permiso: ["socios", "prestamos", "devoluciones"], to: "/socios", etiqueta: "Socios", descripcion: "Buscar, ver su ficha y sus préstamos, dar de alta" },
  { permiso: null, to: "/catalogo", etiqueta: "Catálogo", descripcion: "Todo lo cargado, por tipo, con su ficha MARC, ISBD e ítems" },
  { permiso: "catalogar", to: "/catalogar", etiqueta: "Catalogar", descripcion: "Cargar un material nuevo, o muchos libros desde una planilla" },
  { permiso: "exportar", to: "/exportar", etiqueta: "Exportar", descripcion: "MARCXML/CSV para Koha o DigiBepé" },
];

export default function Dashboard() {
  const { sesion } = useAuth();
  const [conteos, setConteos] = useState(null);

  const accesoCompleto = ["superbibliotecario", "admin", "supervisor"].includes(sesion?.rol);
  const tieneAcceso = (permiso) => !permiso || [permiso].flat().some((p) => tienePermiso(sesion, p));

  useEffect(() => {
    Promise.all([api.listarLibros(), api.listarSocios()]).then(([libros, socios]) =>
      setConteos({ libros: libros.length, socios: socios.length })
    );
  }, []);

  return (
    <>
      <h1>Panel</h1>
      {conteos && (
        <p>
          <strong>{conteos.libros}</strong> libros cargados, <strong>{conteos.socios}</strong> socios
          cargados.
        </p>
      )}
      <div className="grilla-modulos">
        {MODULOS.filter((m) => tieneAcceso(m.permiso)).map((m) => (
          <Link key={m.to} to={m.to} className="tarjeta-modulo">
            <strong>{m.etiqueta}</strong>
            <span>{m.descripcion}</span>
          </Link>
        ))}
        {accesoCompleto && (
          <Link to="/bibliotecarios" className="tarjeta-modulo">
            <strong>Bibliotecarios</strong>
            <span>Cuentas de staff y sus permisos</span>
          </Link>
        )}
      </div>
    </>
  );
}
