// Qué copia se puede prestar o reservar, y cómo se la muestra. Un ejemplar
// circula si está libre, es de préstamo (no "sala" ni "no_prestable") y no
// está dañado, en reparación, extraviado ni retirado. Ver models/Ejemplar.js.

// Para consultas: los ejemplares cargados antes de que existieran "uso" y
// "condicion" no tienen esos campos, y en Mongo un campo ausente solo
// coincide con null.
export const FILTRO_PRESTABLE = { uso: { $in: ["prestamo", null] }, condicion: { $in: ["", null] } };

export function esPrestable(ejemplar) {
  return (ejemplar.uso ?? "prestamo") === "prestamo" && !ejemplar.condicion;
}

// Una sola palabra para el estado que importa: primero lo físico, después
// si se presta, y recién ahí la situación de circulación.
export function estadoVisible(ejemplar) {
  if (ejemplar.condicion) return ejemplar.condicion;
  if (ejemplar.uso === "sala" || ejemplar.uso === "no_prestable") {
    return ejemplar.estado === "disponible" ? ejemplar.uso : ejemplar.estado;
  }
  return ejemplar.estado;
}

export const ETIQUETAS_ESTADO = {
  disponible: "Disponible",
  prestado: "Prestado",
  reservado: "Reservado",
  sala: "Solo en sala",
  no_prestable: "No se presta",
  danado: "Dañado",
  reparacion: "En reparación",
  extraviado: "Extraviado",
  retirado: "Retirado",
};

// "BPSJ-000009" → "BPSJ-000010": para cargar varias copias de una vez, como
// "Agregar múltiples copias" de Koha. Sin dígitos al final, se les agrega
// "-2", "-3"…
export function siguienteCodigo(codigo, salto) {
  const coincidencia = /^(.*?)(\d+)$/.exec(codigo);
  if (!coincidencia) return `${codigo}-${salto + 1}`;
  const [, prefijo, numero] = coincidencia;
  return prefijo + String(Number(numero) + salto).padStart(numero.length, "0");
}
