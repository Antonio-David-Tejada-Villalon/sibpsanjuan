// A qué pantalla mandar a cada rol después de loguearse (o al pisar una
// ruta que no le corresponde) — un solo lugar, usado por Login.jsx y
// App.jsx, para que no queden dos copias de este mapeo desincronizadas.
export function rutaPorRol(rol) {
  if (rol === "admin" || rol === "supervisor") return "/admin";
  return "/dashboard"; // superbibliotecario, bibliotecario
}
