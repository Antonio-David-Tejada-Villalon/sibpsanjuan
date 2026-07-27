import React, { useState } from "react";

const LIMITE_DEFAULT = 5;

// Colapsa una lista de facetas (tipos de ítem, autores, materias) a un
// máximo de `limite` entradas con un botón "Ver N más" — si hay más de
// cinco valores distintos, no tiene sentido ocupar toda la pantalla del
// sidebar de filtros apenas se entra; un segundo click ("Ver menos") vuelve
// a las primeras `limite`. `renderItem` decide la marca completa de cada
// entrada (un <button> pill para autores/materias, un <label> con checkbox
// para tipos de ítem) — este componente solo se ocupa de cuántas mostrar,
// no de cómo se ven. Compartido entre el OPAC (CatalogoPublico.jsx) y el
// buscador de catálogo del panel de biblioteca (BuscarCatalogo.jsx).
export default function ListaColapsable({ titulo, items, renderItem, claveItem, limite = LIMITE_DEFAULT, className }) {
  const [expandido, setExpandido] = useState(false);
  if (items.length === 0) return null;
  const visibles = expandido ? items : items.slice(0, limite);
  const restantes = items.length - limite;

  return (
    <div className="catalogo-filtros__grupo">
      <h2>{titulo}</h2>
      <div className={className}>
        {visibles.map((item) => (
          <React.Fragment key={claveItem(item)}>{renderItem(item)}</React.Fragment>
        ))}
      </div>
      {restantes > 0 && !expandido && (
        <button type="button" className="catalogo-filtros__vermas" onClick={() => setExpandido(true)}>
          Ver {restantes} más
        </button>
      )}
      {expandido && items.length > limite && (
        <button type="button" className="catalogo-filtros__vermas" onClick={() => setExpandido(false)}>
          Ver menos
        </button>
      )}
    </div>
  );
}
