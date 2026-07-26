// Rango de la jerarquía de staff (ver models/Usuario.js). Mayor número =
// más poder. Se usa con "<=" (no "<") en puedeGestionar: nadie puede
// gestionar una cuenta de su propio nivel, solo estrictamente por debajo.
export const RANGO = { admin: 4, supervisor: 3, superbibliotecario: 2, bibliotecario: 1 };

// ¿Puede "actor" (req.usuario, o un objeto con la misma forma) gestionar
// (editar/eliminar) la cuenta "cuentaObjetivo"? Además del rango, cada
// nivel tiene su propio chequeo de alcance: un supervisor no puede tocar
// cualquier biblioteca, solo las que tiene asignadas; un superbibliotecario
// no puede tocar cualquier bibliotecario, solo los de su propia biblioteca.
export function puedeGestionar(actor, cuentaObjetivo) {
  const rangoActor = RANGO[actor?.rol];
  const rangoObjetivo = RANGO[cuentaObjetivo?.rol];
  if (!rangoActor || !rangoObjetivo || rangoActor <= rangoObjetivo) {
    return false;
  }
  if (actor.rol === "admin") {
    return true; // sin restricción de alcance
  }
  if (actor.rol === "supervisor") {
    const alcance = (actor.bibliotecasSupervisadas || []).map(String);
    return alcance.includes(String(cuentaObjetivo.bibliotecaId));
  }
  if (actor.rol === "superbibliotecario") {
    return String(actor.bibliotecaId) === String(cuentaObjetivo.bibliotecaId);
  }
  return false; // bibliotecario: rango más bajo, nunca gestiona a nadie
}
