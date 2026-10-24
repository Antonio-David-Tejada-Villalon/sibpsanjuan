// Datos personales de socios: qué se enmascara en las respuestas de la API
// y qué no se carga para categorías de datos mínimos (alumnos). Ver
// routes/socios.js y Categoria.datosMinimos.

// Se devuelven enmascarados siempre; completos solo por POST
// /socios/:id/datos-contacto, con permiso "datosSocios" y registro en
// Auditoria.
export const CAMPOS_CONTACTO = ["dni", "direccion", "telefono", "email", "emailTutor", "fechaNacimiento"];

// Lo que no se pide (y la API rechaza) para un socio de una categoría de
// datos mínimos: alcanza con legajo, apellido y nombre, curso y un correo.
export const CAMPOS_NO_MINIMOS = ["dni", "direccion", "localidad", "telefono", "fechaNacimiento"];

const OCULTO = "•••";

// Deja ver lo justo para reconocer el dato (últimos dígitos, dominio del
// correo) sin exponerlo. Un valor vacío queda vacío: así se distingue "no
// cargado" de "cargado pero oculto".
export function enmascarar(campo, valor) {
  if (valor === null || valor === undefined || valor === "") return valor ?? "";
  const texto = String(valor);
  if (campo === "email" || campo === "emailTutor") {
    const [usuario, dominio] = texto.split("@");
    return dominio ? `${usuario.charAt(0)}${OCULTO}@${dominio}` : OCULTO;
  }
  if (campo === "dni" || campo === "telefono") {
    const digitos = texto.replace(/\D/g, "");
    return digitos.length > 3 ? `${OCULTO}${digitos.slice(-3)}` : OCULTO;
  }
  return OCULTO;
}

// Socio tal como lo ve el panel: sin el hash de la contraseña (solo si tiene
// login de OPAC) y con los datos de contacto enmascarados.
export function socioParaPanel(socio) {
  const { passwordHash, ...resto } = typeof socio.toObject === "function" ? socio.toObject() : socio;
  for (const campo of CAMPOS_CONTACTO) resto[campo] = enmascarar(campo, resto[campo]);
  return { ...resto, tieneLoginOpac: Boolean(passwordHash) };
}

// Lo mínimo para mostrar un socio en Circulación/Préstamos: quién es, sin
// ningún dato de contacto.
export const CAMPOS_SOCIO_EN_CIRCULACION = "numeroSocio apellido nombre categoria curso";
