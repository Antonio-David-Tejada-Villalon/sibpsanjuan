import React, { useEffect, useState } from "react";
import api from "../api.js";
import ConfiguracionCirculacion from "../ConfiguracionCirculacion.jsx";
import ResetearPassword from "../ResetearPassword.jsx";
import CampoPassword from "../CampoPassword.jsx";
import { useAuth } from "../AuthContext.jsx";

// Mismo orden/claves que PERMISOS_BIBLIOTECARIO en backend/src/models/Usuario.js.
const PERMISOS = [
  { clave: "catalogar", etiqueta: "Catalogar (libros, seriadas, y el resto del catálogo)" },
  { clave: "prestamos", etiqueta: "Aprobar solicitudes y registrar préstamos directos" },
  { clave: "devoluciones", etiqueta: "Procesar devoluciones" },
  { clave: "socios", etiqueta: "Gestionar socios (alta, edición, login OPAC)" },
  { clave: "exportar", etiqueta: "Exportar (MARCXML / CSV)" },
];

function permisosVacios() {
  const vacio = {};
  for (const { clave } of PERMISOS) vacio[clave] = false;
  return vacio;
}

function CasillasPermisos({ permisos, onCambiar }) {
  return (
    <fieldset>
      <legend>Permisos</legend>
      {PERMISOS.map(({ clave, etiqueta }) => (
        <label key={clave} style={{ display: "block", fontWeight: "normal" }}>
          <input
            type="checkbox"
            checked={!!permisos[clave]}
            onChange={(e) => onCambiar(clave, e.target.checked)}
          />{" "}
          {etiqueta}
        </label>
      ))}
    </fieldset>
  );
}

export default function Bibliotecarios() {
  const { sesion } = useAuth();
  const [items, setItems] = useState(null);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [permisos, setPermisos] = useState(permisosVacios());
  const [editandoId, setEditandoId] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    setItems(await api.listarBibliotecarios());
  }

  useEffect(() => {
    recargar();
  }, []);

  function onCambiarPermiso(clave, valor) {
    setPermisos((actual) => ({ ...actual, [clave]: valor }));
  }

  function onEditar(cuenta) {
    setEditandoId(cuenta._id);
    setPermisos({ ...permisosVacios(), ...cuenta.permisos });
    setError("");
  }

  function onCancelar() {
    setEditandoId(null);
    setUsuario("");
    setPassword("");
    setPermisos(permisosVacios());
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      if (editandoId) {
        await api.actualizarBibliotecario(editandoId, { permisos });
      } else {
        await api.crearBibliotecario({ usuario, password, permisos });
      }
      onCancelar();
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function onEliminar(id) {
    if (!confirm("¿Eliminar este bibliotecario?")) return;
    await api.eliminarUsuario(id);
    if (editandoId === id) onCancelar();
    await recargar();
  }

  return (
    <>
      <h1>Bibliotecarios</h1>
      <p>
        <small>
          Cuentas de staff con acceso limitado a los permisos que les des acá — a diferencia de un
          superbibliotecario, que siempre tiene acceso completo a su biblioteca.
        </small>
      </p>

      {sesion?.bibliotecaId && <ConfiguracionCirculacion bibliotecaId={sesion.bibliotecaId} />}

      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar permisos" : "Nuevo bibliotecario"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        {!editandoId && (
          <>
            <label>
              Usuario
              <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" required />
            </label>
            <CampoPassword
              etiqueta="Contraseña (mínimo 8 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </>
        )}
        <CasillasPermisos permisos={permisos} onCambiar={onCambiarPermiso} />
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : editandoId ? "Guardar permisos" : "Crear bibliotecario"}
        </button>{" "}
        {editandoId && (
          <button type="button" className="secundario" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </form>

      {items === null ? (
        <p>Cargando...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Permisos otorgados</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it._id}>
                <td>{it.usuario}</td>
                <td>
                  {PERMISOS.filter(({ clave }) => it.permisos?.[clave])
                    .map(({ etiqueta }) => etiqueta)
                    .join("; ") || "ninguno"}
                </td>
                <td>
                  <button className="secundario" onClick={() => onEditar(it)}>
                    Editar
                  </button>{" "}
                  <ResetearPassword usuarioId={it._id} />{" "}
                  <button className="peligro" onClick={() => onEliminar(it._id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3}>Todavía no creaste ningún bibliotecario.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
