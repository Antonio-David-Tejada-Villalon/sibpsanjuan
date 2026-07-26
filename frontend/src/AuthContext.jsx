import React, { createContext, useContext, useEffect, useState } from "react";
import api from "./api.js";
import { limpiarBibliotecaActiva } from "./bibliotecaActiva.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(undefined); // undefined = cargando, null = sin sesión

  useEffect(() => {
    api
      .yo()
      .then(setSesion)
      .catch(() => setSesion(null));
  }, []);

  async function login(usuario, password) {
    const datos = await api.login(usuario, password);
    setSesion(datos);
    return datos;
  }

  async function logout() {
    await api.logout();
    limpiarBibliotecaActiva();
    setSesion(null);
  }

  return <AuthContext.Provider value={{ sesion, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
