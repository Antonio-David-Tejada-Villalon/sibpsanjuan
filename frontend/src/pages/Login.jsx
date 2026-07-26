import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { rutaPorRol } from "../rutaPorRol.js";
import ThemeToggle from "../ThemeToggle.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const sesion = await login(usuario, password);
      navigate(rutaPorRol(sesion.rol));
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <ThemeToggle />
      </div>
      <form className="card" onSubmit={onSubmit} style={{ maxWidth: 360, margin: "3rem auto" }}>
        <h1>Captura DigiBepé</h1>
        {error && <div className="flash error" role="alert">{error}</div>}
        <label>
          Usuario
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
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
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
