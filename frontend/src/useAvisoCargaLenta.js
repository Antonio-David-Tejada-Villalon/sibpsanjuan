import { useEffect, useState } from "react";

// El free tier de Render "duerme" tras ~15 min sin tráfico — la primera
// carga después de eso tarda unos segundos en responder. Este hook avisa
// recién pasado ese umbral, para no mostrar nada en cargas normales y
// rápidas. Compartido entre el panel de staff (App.jsx) y el catálogo
// público del OPAC (CatalogoPublico.jsx) — ver GOB-4 en AUDITORIA.md.
export function useAvisoCargaLenta(umbralMs = 2500) {
  const [tardando, setTardando] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTardando(true), umbralMs);
    return () => clearTimeout(timer);
  }, [umbralMs]);

  return tardando;
}
