// Biblioteca "activa" para sesiones de admin/supervisor: a diferencia de
// superbibliotecario/bibliotecario/socio (que tienen una sola bibliotecaId
// fija en su sesión), admin ve/opera cualquier biblioteca y supervisor las
// que tenga en su alcance — necesitan elegir con cuál están trabajando en
// cada momento (ver el selector en Layout.jsx). Se guarda en sessionStorage
// (no localStorage: no debería sobrevivir a cerrar la pestaña) para que la
// elección persista al recargar la página sin depender de un backend nuevo.
const CLAVE = "bibliotecaActivaId";

export function obtenerBibliotecaActivaId() {
  return sessionStorage.getItem(CLAVE) || "";
}

// Cambiar de biblioteca recarga la página a propósito: es la forma más
// simple y segura de garantizar que todas las pantallas (listados,
// paginación, formularios a medio llenar) vuelvan a pedir datos scoped a la
// nueva biblioteca, en vez de tener que hacer reactivo cada componente que
// ya existe.
export function fijarBibliotecaActivaId(id) {
  if (id) sessionStorage.setItem(CLAVE, id);
  else sessionStorage.removeItem(CLAVE);
  window.location.reload();
}

// Sin recarga — se usa al cerrar sesión, donde la navegación a /login ya se
// encarga de refrescar la pantalla.
export function limpiarBibliotecaActiva() {
  sessionStorage.removeItem(CLAVE);
}
