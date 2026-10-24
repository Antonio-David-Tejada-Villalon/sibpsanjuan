import { useSyncExternalStore } from "react";

// Estado de la app instalable (ver el service worker en
// src/service-worker/sw.js): conexión, información guardada que se está
// mostrando sin conexión, versión nueva lista para activar e instalación.

let estado = {
  enLinea: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  // Fecha (ISO) en que se guardó la información que se está mostrando sin
  // conexión. Solo la pone una respuesta que vino del caché del service
  // worker (cabecera X-Sibp-Desde-Cache): nunca se inventa.
  guardadoEl: null,
  versionNueva: false,
  // Instalación: "prompt" (Chrome/Edge/Android ofrecen instalar), "ios"
  // (Safari: se agrega a mano desde Compartir) o null.
  instalable: null,
};

const suscriptores = new Set();

function cambiar(cambios) {
  estado = { ...estado, ...cambios };
  for (const avisar of suscriptores) avisar();
}

export function usePwa() {
  return useSyncExternalStore(
    (avisar) => {
      suscriptores.add(avisar);
      return () => suscriptores.delete(avisar);
    },
    () => estado
  );
}

// La llama api.js con cada respuesta de la API. Si alguna de las que arman
// la pantalla vino de lo guardado, se avisa con la fecha más vieja. Una
// respuesta "nueva" no apaga el aviso: puede venir del caché HTTP del
// navegador aunque el servidor no responda, y no dice nada de las demás.
export function registrarOrigenDeRespuesta(res) {
  const guardado = res.headers?.get?.("x-sibp-desde-cache");
  if (guardado && (!estado.guardadoEl || guardado < estado.guardadoEl)) cambiar({ guardadoEl: guardado });
}

// Cada pantalla nueva empieza sin aviso (ver EstadoConexion).
export function pantallaNueva() {
  if (estado.guardadoEl) cambiar({ guardadoEl: null });
}

// --- Service worker ---

let trabajadorEnEspera = null;

function avisarVersionNueva(trabajador) {
  trabajadorEnEspera = trabajador;
  cambiar({ versionNueva: true });
}

export function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then((registro) => {
      // Solo si ya había uno funcionando: la primera instalación no es
      // "una versión nueva".
      if (registro.waiting && navigator.serviceWorker.controller) avisarVersionNueva(registro.waiting);
      registro.addEventListener("updatefound", () => {
        const nuevo = registro.installing;
        nuevo?.addEventListener("statechange", () => {
          if (nuevo.state === "installed" && navigator.serviceWorker.controller) avisarVersionNueva(nuevo);
        });
      });
      // Una pestaña abierta todo el día (el mostrador) también se entera.
      setInterval(() => registro.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registro.update().catch(() => {});
      });
    })
    .catch(() => {
      // Sin service worker la app funciona igual, solo que sin modo offline.
    });

  let recargando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (recargando) return;
    recargando = true;
    window.location.reload();
  });
}

// "Actualizar": el service worker nuevo toma el control y la página se
// recarga con la versión nueva (ver controllerchange arriba).
export function actualizarVersion() {
  trabajadorEnEspera?.postMessage({ tipo: "activar" });
}

// Al cerrar sesión: el catálogo guardado para usar sin conexión (lo que se
// miró) se borra, para que en una computadora compartida no quede el
// rastro. Datos personales no se guardan nunca (ver sw.js).
export async function limpiarDatosGuardados() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ tipo: "limpiar" });
  } catch {
    // Sin service worker no hay nada guardado.
  }
}

// --- Instalación ---

let pedidoDeInstalacion = null;

export function esIos(nav = navigator) {
  return /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

export function yaInstalada() {
  return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
}

export function escucharInstalacion() {
  if (yaInstalada()) return;
  if (esIos()) cambiar({ instalable: "ios" });
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    pedidoDeInstalacion = evento;
    cambiar({ instalable: "prompt" });
  });
  window.addEventListener("appinstalled", () => {
    pedidoDeInstalacion = null;
    cambiar({ instalable: null });
  });
}

export async function instalar() {
  if (!pedidoDeInstalacion) return false;
  pedidoDeInstalacion.prompt();
  const { outcome } = await pedidoDeInstalacion.userChoice;
  if (outcome === "accepted") {
    pedidoDeInstalacion = null;
    cambiar({ instalable: null });
  }
  return outcome === "accepted";
}

// --- Conexión ---

if (typeof window !== "undefined") {
  window.addEventListener("online", () => cambiar({ enLinea: true }));
  window.addEventListener("offline", () => cambiar({ enLinea: false }));
}
