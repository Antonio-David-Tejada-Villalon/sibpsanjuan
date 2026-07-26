import React, { useState } from "react";
import api from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import CampoPassword from "../CampoPassword.jsx";

const ETIQUETA_ROL = {
  admin: "Administrador/a",
  supervisor: "Supervisor/a",
  superbibliotecario: "Superbibliotecario/a",
  bibliotecario: "Bibliotecario/a",
};

// Resumen de solo lectura de la propia cuenta — el resto del "perfil"
// (usuario, rol, alcance) lo asigna quien gestiona la cuenta desde arriba
// en la jerarquía (ver ResetearPassword.jsx y las páginas de gestión de
// cada nivel); acá cada uno ve su propia situación y controla lo único que
// le corresponde configurar por sí mismo: la contraseña.
function ResumenCuenta({ sesion }) {
  const detalle = [];
  if (sesion.rol === "supervisor") {
    const n = (sesion.bibliotecasSupervisadas || []).length;
    detalle.push(`Supervisás ${n} biblioteca${n === 1 ? "" : "s"}.`);
    if (sesion.puedeCrearBibliotecas) detalle.push("Podés crear bibliotecas nuevas.");
  }
  if (sesion.rol === "superbibliotecario") {
    detalle.push("Acceso completo a tu biblioteca (catálogo, socios, circulación, export).");
  }
  if (sesion.rol === "bibliotecario") {
    const otorgados = Object.entries(sesion.permisos || {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    detalle.push(otorgados.length ? `Permisos otorgados: ${otorgados.join(", ")}.` : "Sin permisos otorgados todavía.");
  }
  if (sesion.rol === "admin") {
    detalle.push("Control total del sistema — nadie puede editar ni eliminar esta cuenta.");
  }
  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <h2>Tu cuenta</h2>
      <p>
        <strong>{sesion.usuario}</strong> — {ETIQUETA_ROL[sesion.rol] || sesion.rol}
      </p>
      {detalle.map((linea) => (
        <p key={linea}>
          <small>{linea}</small>
        </p>
      ))}
    </div>
  );
}

// Cambiar la propia contraseña estando logueado — ver CYBER-4 en
// AUDITORIA.md. No hay "olvidé mi contraseña" acá (necesitaría enviar un
// correo, y este proyecto no tiene ningún servicio de mail configurado);
// esto solo cubre la rotación normal para quien todavía se acuerda de la
// actual. Quien gestiona la cuenta desde arriba (admin/supervisor/
// superbibliotecario) puede resetearla sin la actual — ver
// ResetearPassword.jsx — para cuando alguien se la olvida de verdad.
export default function CambiarPassword() {
  const { sesion } = useAuth();
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
      <h1>Mi perfil</h1>
      {sesion && <ResumenCuenta sesion={sesion} />}
      <form className="card" onSubmit={onSubmit} style={{ maxWidth: 420 }}>
        <h2>Cambiar contraseña</h2>
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
        <CampoPassword
          etiqueta="Contraseña actual"
          value={passwordActual}
          onChange={(e) => setPasswordActual(e.target.value)}
          autoComplete="current-password"
          required
        />
        <CampoPassword
          etiqueta="Contraseña nueva (mínimo 8 caracteres)"
          value={passwordNueva}
          onChange={(e) => setPasswordNueva(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <CampoPassword
          etiqueta="Confirmar contraseña nueva"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </>
  );
}
