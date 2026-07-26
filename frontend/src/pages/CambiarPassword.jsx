import React, { useState } from "react";
import api from "../api.js";

// Cambiar la propia contraseña estando logueado — ver CYBER-4 en
// AUDITORIA.md. No hay "olvidé mi contraseña" acá (necesitaría enviar un
// correo, y este proyecto no tiene ningún servicio de mail configurado);
// esto solo cubre la rotación normal para quien todavía se acuerda de la
// actual.
export default function CambiarPassword() {
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setMensaje("");
    if (passwordNueva !== confirmacion) {
      setError("La confirmación no coincide con la contraseña nueva.");
      return;
    }
    setGuardando(true);
    try {
      await api.cambiarPassword(passwordActual, passwordNueva);
      setMensaje("Contraseña actualizada.");
      setPasswordActual("");
      setPasswordNueva("");
      setConfirmacion("");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <h1>Cambiar mi contraseña</h1>
      <form className="card" onSubmit={onSubmit} style={{ maxWidth: 420 }}>
        {error && (
          <div className="flash error" role="alert">
            {error}
          </div>
        )}
        {mensaje && (
          <div className="flash ok" role="status">
            {mensaje}
          </div>
        )}
        <label>
          Contraseña actual
          <input
            type="password"
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          Contraseña nueva (mínimo 8 caracteres)
          <input
            type="password"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label>
          Confirmar contraseña nueva
          <input
            type="password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </>
  );
}
