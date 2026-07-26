import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Mueve el foco de teclado al contenido de la vista en cada cambio de
// ruta — sin esto, una SPA deja el foco donde estaba al navegar (ej. en el
// link del menú que se acaba de clickear), lo que rompe la orientación de
// usuarios de teclado/lector de pantalla (ver A11Y-2 en la auditoría).
export function useFocoEnRuta() {
  const ref = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    ref.current?.focus();
  }, [pathname]);

  return ref;
}
