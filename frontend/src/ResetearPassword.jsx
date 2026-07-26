import React, { useState } from "react";
import api from "./api.js";
import CampoPassword from "./CampoPassword.jsx";

// Botón + mini formulario inline para resetear la contraseña de una cuenta
// que se gestiona (supervisor/superbibliotecario/bibliotecario) — usado
// desde AdminBibliotecas.jsx y Bibliotecarios.jsx. A diferencia de "Cambiar
// contraseña" (self-service, pide la actual), esto no necesita la vieja: es
// para cuando la propia persona se la olvidó. El backend valida con
// puedeGestionar() si a quien lo pide le corresponde esa cuenta puntual.
export default function ResetearPassword({ usuarioId, onListo }) {
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function onToggle() {
    setAbierto((a) => !a);
    setPassword("");
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await api.resetearPasswordUsuario(usuarioId, password);
      setAbierto(false);
      setPassword("");
      onListo?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (!abierto) {
    return (
      <button type="button" className="secundario" onClick={onToggle}>
        Resetear contraseña
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
    >
      {error && (
        <span className="flash error" role="alert">
          {error}
        </span>
      )}
      <CampoPassword
        aria-label="Contraseña nueva"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contraseña nueva (mínimo 8)"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <button type="submit" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" className="secundario" onClick={onToggle}>
        Cancelar
      </button>
    </form>
  );
}
