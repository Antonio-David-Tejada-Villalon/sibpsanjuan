import { useEffect } from "react";

// Formularios de catalogación en modo edición (/catalogar/:tipo/:id): la
// pantalla que los envuelve (pages/catalogo/FormularioMaterial.jsx) trae el
// material y acá se carga en el formulario, como un clic en "Editar".
export function usePrecargar(entidad, onEditar) {
  useEffect(() => {
    if (entidad) onEditar(entidad);
    // Solo cuando llega otro material: onEditar cambia en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidad]);
}
