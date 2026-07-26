import { stringify } from "csv-stringify/sync";

// Columnas del importador de socios de Koha (Herramientas → Importar
// socios). Koha empareja por NOMBRE de columna en el encabezado, no por
// posición, así que no hace falta mandar las ~60 columnas posibles: alcanza
// con las que tenemos dato. Los 4 campos obligatorios de Koha son
// cardnumber, surname, branchcode y categorycode — confirmá igual contra
// la plantilla real de tu Koha (Importar socios → descargar plantilla)
// antes de una importación con datos reales, porque puede variar según
// versión y BorrowerMandatoryField configurado.
const COLUMNAS = [
  "cardnumber",
  "surname",
  "firstname",
  "address",
  "city",
  "phone",
  "email",
  "dateofbirth",
  "branchcode",
  "categorycode",
  "borrowernotes",
];

function fila(socio) {
  const notas = [socio.dni ? `DNI: ${socio.dni}` : null].filter(Boolean).join(" — ");
  return {
    cardnumber: socio.numeroSocio || "",
    surname: socio.apellido || "",
    firstname: socio.nombre || "",
    address: socio.direccion || "",
    city: socio.localidad || "",
    phone: socio.telefono || "",
    email: socio.email || "",
    dateofbirth: socio.fechaNacimiento || "",
    // Vacío a propósito: el código de biblioteca (branchcode) lo define la
    // instancia Koha de destino, no esta herramienta. Koha permite elegir
    // una biblioteca por defecto para todo el lote al importar si esta
    // columna viene vacía — confirmalo en la pantalla de importación.
    branchcode: "",
    categorycode: socio.categoria || "",
    borrowernotes: notas,
  };
}

/**
 * Genera el CSV de socios en el formato que espera el importador de
 * socios de Koha. Devuelve el CSV como string.
 */
export function sociosACsv(socios) {
  const filas = socios.map(fila);
  return stringify(filas, { header: true, columns: COLUMNAS });
}
