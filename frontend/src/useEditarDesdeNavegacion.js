import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Si se navegó a esta página con state:{ editar: entidadCompleta } — ej.
// desde BuscarCatalogo.jsx, al hacer clic en "Editar" sobre un resultado de
// otro tipo de material — precarga esa entidad en el formulario de edición
// apenas monta la página, igual que si se hubiera hecho clic en "Editar"
// desde la propia lista de esta pantalla. Limpia el state después (history
// replace) para que un refresh o volver atrás no la vuelva a disparar.
export function useEditarDesdeNavegacion(onEditar) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.editar) {
      onEditar(location.state.editar);
      navigate(location.pathname, { replace: true });
    }
    // Solo al montar: la entidad a precargar viaja una sola vez, en la
    // navegación que trajo hasta acá.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
