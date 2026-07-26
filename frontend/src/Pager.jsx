import React from "react";

// Solo se muestra cuando hay más de una página — para "varias bibliotecas
// chicas" (el caso de uso de hoy) esto no aparece nunca, y no molesta.
export default function Pager({ pagina, porPagina, total, onCambiar, etiqueta }) {
  if (total <= porPagina) return null;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <nav
      aria-label={`Paginación de ${etiqueta}`}
      style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.75rem 0" }}
    >
      <button className="secundario" onClick={() => onCambiar(pagina - 1)} disabled={pagina <= 1}>
        Anterior
      </button>
      <span style={{ fontSize: "var(--text-sm)" }}>
        Página {pagina} de {totalPaginas} — {total} {etiqueta} en total
      </span>
      <button className="secundario" onClick={() => onCambiar(pagina + 1)} disabled={pagina >= totalPaginas}>
        Siguiente
      </button>
    </nav>
  );
}
