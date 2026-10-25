import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../AuthContext.jsx";
import { tienePermiso } from "../../permisos.js";

// Las dos pestañas de la sección Socios: buscar (la lista) y el formulario
// de alta, separado. El alta solo para quien puede gestionar socios.
export default function PestanasSocios() {
  const { sesion } = useAuth();
  return (
    <nav className="pestanas-seccion" aria-label="Socios">
      <NavLink to="/socios" end>
        Buscar socios
      </NavLink>
      {tienePermiso(sesion, "socios") && <NavLink to="/socios/nuevo">Nuevo socio</NavLink>}
    </nav>
  );
}
