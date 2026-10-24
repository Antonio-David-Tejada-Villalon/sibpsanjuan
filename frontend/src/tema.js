// Tema claro/oscuro para todo el sistema (staff + OPAC). Se aplica acá, en
// un módulo separado importado antes que nada en main.jsx, para que
// document.documentElement tenga el atributo correcto ANTES del primer
// render — si esto viviera dentro de un componente React, habría un
// parpadeo del tema equivocado mientras React arranca.
//
// Sin elección guardada, se sigue el "prefers-color-scheme" del sistema
// (ver el media query en estilos.css) — acá solo se resuelve la elección
// EXPLÍCITA del usuario (data-theme="light"/"dark"), que la gana.
const CLAVE = "tema";
const TEMAS = ["light", "dark"];

// null = Automático. Con el almacenamiento bloqueado (ventana privada,
// datos del sitio borrados) también se cae en Automático en vez de romper.
export function obtenerTemaGuardado() {
  try {
    const tema = localStorage.getItem(CLAVE);
    return TEMAS.includes(tema) ? tema : null;
  } catch {
    return null;
  }
}

export function aplicarTema(tema) {
  if (tema) document.documentElement.setAttribute("data-theme", tema);
  else document.documentElement.removeAttribute("data-theme");
}

export function fijarTema(tema) {
  try {
    if (tema) localStorage.setItem(CLAVE, tema);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento, el tema se aplica igual en esta visita.
  }
  aplicarTema(tema);
}

aplicarTema(obtenerTemaGuardado());
