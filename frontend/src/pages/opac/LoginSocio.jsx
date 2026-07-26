import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocioAuth } from "../../SocioAuthContext.jsx";

export default function LoginSocio() {
  const { codigo, login } = useSocioAuth();
  const navigate = useNavigate();
  const [numeroSocio, setNumeroSocio] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await login(numeroSocio, password);
      navigate(`/opac/${codigo}/mis-prestamos`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ maxWidth: 360, margin: "3rem auto" }}>
      <h1>Ingresar</h1>
      {error && <div className="flash error" role="alert">{error}</div>}
      <label>
        Número de socio
        <input
          value={numeroSocio}
          onChange={(e) => setNumeroSocio(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button type="submit" disabled={enviando}>
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>
      <p><small>¿No tenés contraseña todavía? Pedila en la biblioteca.</small></p>
    </form>
  );
}
