// Textos compartidos por las pantallas del mostrador (ficha del socio,
// prestar, devolver, ítems y reservas de un material). Los estados son los
// de backend/src/circulacion/ejemplares.js.

export const ESTADOS_EJEMPLAR = {
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

export const USOS = [
  { valor: "prestamo", etiqueta: "Se presta" },
  { valor: "sala", etiqueta: "Solo en sala (consulta)" },
  { valor: "no_prestable", etiqueta: "No se presta (referencia)" },
];

export const CONDICIONES = [
  { valor: "", etiqueta: "En buen estado" },
  { valor: "danado", etiqueta: "Dañado" },
  { valor: "reparacion", etiqueta: "En reparación" },
  { valor: "extraviado", etiqueta: "Extraviado" },
  { valor: "retirado", etiqueta: "Retirado (dado de baja)" },
];

// Qué tan bien está un estado, para el color de la etiqueta.
export function tonoEstado(estado) {
  if (estado === "disponible") return "ok";
  if (estado === "prestado" || estado === "reservado") return "aviso";
  return "neutro";
}

export function fechaCorta(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-AR");
}

// "2026-12-31" → "31/12/2026", sin pasar por Date (que la correría de día
// según el huso horario).
export function fechaIso(iso) {
  return iso ? iso.split("-").reverse().join("/") : "";
}

export function nombreSocio(socio) {
  if (!socio) return "Socio dado de baja";
  return `${socio.apellido}, ${socio.nombre}`;
}

export function hoyIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/San_Juan" }).format(new Date());
}

export function cuentaVencida(socio) {
  return Boolean(socio?.vigenteHasta) && socio.vigenteHasta < hoyIso();
}
