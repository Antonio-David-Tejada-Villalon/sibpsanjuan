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
