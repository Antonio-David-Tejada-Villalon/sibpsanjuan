// Reglas de circulación, como funciones puras (sin Mongo) para poder
// testearlas directo. Todo lo que necesita fecha actual la recibe como
// parámetro (default: ahora) — así los tests no dependen del reloj real.

const UN_DIA_MS = 24 * 60 * 60 * 1000;

// contarSabados/contarDomingos viven en Biblioteca (default true = cuenta
// todos los días, comportamiento de siempre). Solo entran en juego si al
// menos uno es false — así calcularVencimiento/diasDeAtraso sin biblioteca,
// o con una que no trae estos dos campos (fixtures viejos de test), hacen
// exactamente la cuenta calendario de antes, sin loop día por día.
function saltaFinDeSemana(biblioteca) {
  return !!biblioteca && (biblioteca.contarSabados === false || biblioteca.contarDomingos === false);
}

function esDiaContable(fecha, biblioteca) {
  // getUTCDay(), no getDay(): las fechas acá son instantes construidos a
  // partir de sumar milisegundos (fechaEntrega/fechaVencimiento vienen de
  // Mongo en UTC) — con getDay() (huso horario local del proceso) el
  // resultado cambia según en qué zona horaria corra el servidor, y el
  // mismo instante puede "caer" en un día distinto según la máquina.
  const dia = fecha.getUTCDay(); // 0 = domingo, 6 = sábado
  if (dia === 6 && biblioteca.contarSabados === false) return false;
  if (dia === 0 && biblioteca.contarDomingos === false) return false;
  return true;
}

export function calcularVencimiento(fechaEntrega, diasPrestamo, biblioteca) {
  if (!saltaFinDeSemana(biblioteca)) {
    return new Date(fechaEntrega.getTime() + diasPrestamo * UN_DIA_MS);
  }
  let fecha = new Date(fechaEntrega.getTime());
  let contados = 0;
  while (contados < diasPrestamo) {
    fecha = new Date(fecha.getTime() + UN_DIA_MS);
    if (esDiaContable(fecha, biblioteca)) contados++;
  }
  return fecha;
}

export function estaVencido(prestamo, ahora = new Date()) {
  if (prestamo.fechaDevolucion) return false; // ya devuelto, no cuenta
  return prestamo.fechaVencimiento.getTime() < ahora.getTime();
}

export function diasDeAtraso(prestamo, ahora = new Date(), biblioteca) {
  if (!estaVencido(prestamo, ahora)) return 0;
  if (!saltaFinDeSemana(biblioteca)) {
    const diff = ahora.getTime() - prestamo.fechaVencimiento.getTime();
    return Math.floor(diff / UN_DIA_MS);
  }
  let contados = 0;
  let fecha = new Date(prestamo.fechaVencimiento.getTime());
  while (fecha.getTime() + UN_DIA_MS <= ahora.getTime()) {
    fecha = new Date(fecha.getTime() + UN_DIA_MS);
    if (esDiaContable(fecha, biblioteca)) contados++;
  }
  return contados;
}

export function calcularMulta(prestamo, biblioteca, ahora = new Date()) {
  const multaPorDia = biblioteca.multaPorDiaVencido || 0;
  if (multaPorDia === 0) return 0;
  return diasDeAtraso(prestamo, ahora, biblioteca) * multaPorDia;
}

export function puedeRenovar(prestamo, biblioteca) {
  return prestamo.renovaciones < biblioteca.maxRenovaciones;
}
