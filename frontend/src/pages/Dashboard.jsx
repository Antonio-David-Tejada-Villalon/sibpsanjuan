import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../AuthContext.jsx";

// Mismo orden que el menú de Layout.jsx (que a su vez calca el de Koha:
// Circulación, Usuarios, Catalogación, ...Administración al final) — esta
// grilla es el equivalente de la página de inicio de Koha, con una tarjeta
// por módulo en vez de un link de texto suelto.
const MODULOS = [
  { permiso: "circulacion", to: "/circulacion", etiqueta: "Circulación", descripcion: "Solicitudes pendientes y préstamos activos" },
  { permiso: "socios", to: "/socios", etiqueta: "Socios", descripcion: "Alta, edición y credenciales de OPAC" },
  { permiso: "catalogar", to: "/libros", etiqueta: "Catalogación", descripcion: "Los 10 tipos de material" },
  {
    permiso: "catalogar",
    to: "/catalogo",
    etiqueta: "Buscar en el catálogo",
    descripcion: "Todo lo cargado, con filtros, ficha ISBD y edición",
  },
  { permiso: "exportar", to: "/exportar", etiqueta: "Exportar", descripcion: "MARCXML/CSV para Koha o DigiBepé" },
];

export default function Dashboard() {
  const { sesion } = useAuth();
  const [conteos, setConteos] = useState(null);

  const accesoCompleto = ["superbibliotecario", "admin", "supervisor"].includes(sesion?.rol);
  const tieneAcceso = accesoCompleto
    ? () => true
    : (permiso) =>
        permiso === "circulacion"
          ? !!(sesion?.permisos?.prestamos || sesion?.permisos?.devoluciones)
          : !!sesion?.permisos?.[permiso];

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
