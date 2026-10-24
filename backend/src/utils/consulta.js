// Lectura segura de parámetros de la query string. Express entrega
// req.query.x como texto, como lista (?x=a&x=b) o, con el parser extendido,
// como objeto (?x[a]=1) — y un objeto así, copiado tal cual a un filtro de
// Mongo, es un operador ({ $ne: ... }). Estas funciones aceptan solo texto y
// cortan con un 400 cualquier otra forma, en vez de que la ruta falle o
// filtre de más (ver "Vulnerabilidad concreta" en el prompt maestro de
// implementación).

export class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.name = "ErrorHttp";
    this.estado = estado;
  }
}

// Texto libre (búsquedas): "" si no vino, recortado si vino como texto.
export function textoDeConsulta(valor, nombre = "q") {
  if (valor === undefined) return "";
  if (typeof valor !== "string") {
    throw new ErrorHttp(400, `El parámetro "${nombre}" tiene que ser un texto.`);
  }
  return valor.trim();
}

// Uno de varios valores fijos (estado=pendiente…): undefined si no vino.
export function opcionDeConsulta(valor, permitidos, nombre) {
  if (valor === undefined || valor === "") return undefined;
  if (typeof valor !== "string" || !permitidos.includes(valor)) {
    throw new ErrorHttp(400, `El parámetro "${nombre}" tiene que ser uno de: ${permitidos.join(", ")}.`);
  }
  return valor;
}

// Varios valores del mismo parámetro (?autor=a&autor=b, o uno solo): lista
// de textos no vacíos. Cualquier otra forma, o demasiados, cortan con 400.
export function listaDeConsulta(valor, nombre, { maximo = 20, largo = 200 } = {}) {
  if (valor === undefined || valor === "") return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  if (lista.length > maximo || lista.some((v) => typeof v !== "string" || v.length > largo)) {
    throw new ErrorHttp(400, `El parámetro "${nombre}" no tiene un formato válido.`);
  }
  return lista.map((v) => v.trim()).filter(Boolean);
}

// Número entero dentro de un rango; si no vino o no es un número, el valor
// por defecto (no es un error: ?pagina=abc muestra la primera página).
export function enteroDeConsulta(valor, { minimo, maximo, defecto }) {
  if (typeof valor !== "string") return defecto;
  const n = Number(valor);
  if (!Number.isInteger(n)) return defecto;
  return Math.min(Math.max(n, minimo), maximo);
}
