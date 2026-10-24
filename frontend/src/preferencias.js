import { useSyncExternalStore } from "react";

// "Ahorro de datos" y "Reducir movimiento", como el tema (ver tema.js): se
// aplican como atributos de <html> antes del primer render, y los estilos
// responden a ellos (sistema-diseno/tokens.css, estilos.css).
//
// Ahorro de datos: sin elección guardada sigue al dispositivo (Save-Data,
// navigator.connection.saveData). Activo: fuentes del sistema (no se
// descargan las tipografías), sin animaciones, portadas chicas (120 px) y
// menos resultados por página.
//
// Son preferencias de este dispositivo, no de la cuenta: se guardan en
// localStorage y, si está bloqueado, valen solo para esta visita.

const CLAVE_AHORRO = "ahorroDatos";
const CLAVE_MOVIMIENTO = "movimiento";

function leer(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento, la preferencia vale para esta visita.
  }
}

export function dispositivoPideAhorro() {
  return typeof navigator !== "undefined" && navigator.connection?.saveData === true;
}

let estado = calcular();

function calcular() {
  const elegido = leer(CLAVE_AHORRO); // "1", "0" o null (automático)
  return {
    ahorroElegido: elegido === "1" ? true : elegido === "0" ? false : null,
    ahorro: elegido === "1" || (elegido === null && dispositivoPideAhorro()),
    reducirMovimiento: leer(CLAVE_MOVIMIENTO) === "reducido",
  };
}

const suscriptores = new Set();

function aplicar() {
  estado = calcular();
  const raiz = document.documentElement;
  if (estado.ahorro) raiz.setAttribute("data-ahorro", "1");
  else raiz.removeAttribute("data-ahorro");
  if (estado.reducirMovimiento) raiz.setAttribute("data-movimiento", "reducido");
  else raiz.removeAttribute("data-movimiento");
  for (const avisar of suscriptores) avisar();
}

// valor: true, false o null (volver a seguir al dispositivo).
export function fijarAhorroDeDatos(valor) {
  guardar(CLAVE_AHORRO, valor === null ? null : valor ? "1" : "0");
  aplicar();
}

export function fijarReducirMovimiento(activo) {
  guardar(CLAVE_MOVIMIENTO, activo ? "reducido" : null);
  aplicar();
}

export function ahorroDeDatosActivo() {
  return estado.ahorro;
}

export function usePreferencias() {
  return useSyncExternalStore(
    (avisar) => {
      suscriptores.add(avisar);
      return () => suscriptores.delete(avisar);
    },
    () => estado
  );
}

// Si el dispositivo cambia de modo (ej. el celular activa el ahorro), y no
// hay una elección propia, se sigue el cambio.
navigator.connection?.addEventListener?.("change", aplicar);
aplicar();
