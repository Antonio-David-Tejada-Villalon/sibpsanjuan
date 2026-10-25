// Igual que requierePermiso en el backend: admin, supervisor y
// superbibliotecario pueden todo en su biblioteca; un bibliotecario, lo que
// le otorgaron. Solo sirve para no mostrar botones que darían 403: la
// restricción real la hace el servidor.
export function tienePermiso(sesion, permiso) {
  if (!sesion) return false;
  if (["admin", "supervisor", "superbibliotecario"].includes(sesion.rol)) return true;
  return Boolean(sesion.permisos?.[permiso]);
}
