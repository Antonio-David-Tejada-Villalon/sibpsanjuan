import React, { createContext, useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "./api.js";

const SocioAuthContext = createContext(null);

export function SocioAuthProvider({ children }) {
  const { codigo } = useParams();
  const [sesion, setSesion] = useState(undefined); // undefined = cargando, null = sin sesión

  useEffect(() => {
    setSesion(undefined);
    api
      .opacYo(codigo)
      .then(setSesion)
      .catch(() => setSesion(null));
  }, [codigo]);

  async function login(numeroSocio, password) {
    const datos = await api.opacLoginSocio(codigo, numeroSocio, password);
    setSesion(datos);
    return datos;
  }

  async function logout() {
    await api.opacLogoutSocio(codigo);
    setSesion(null);
  }

  return (
    <SocioAuthContext.Provider value={{ codigo, sesion, login, logout }}>{children}</SocioAuthContext.Provider>
  );
}

export function useSocioAuth() {
  return useContext(SocioAuthContext);
}
