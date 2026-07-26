import React, { useEffect, useState } from "react";
import api from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import ConfiguracionCirculacion from "../ConfiguracionCirculacion.jsx";
import ResetearPassword from "../ResetearPassword.jsx";
import CampoPassword from "../CampoPassword.jsx";

function PanelUsuarios({ biblioteca }) {
  const [usuarios, setUsuarios] = useState(null);
  const [nuevoUsuario, setNuevoUsuario] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    setUsuarios(await api.listarUsuariosDeBiblioteca(biblioteca._id));
  }

  useEffect(() => {
    recargar();
  }, [biblioteca._id]);

  async function onCrear(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      // Lo que antes era "el" login de la biblioteca ahora es
      // específicamente su superbibliotecario — quien a su vez puede crear
      // bibliotecarios internos desde /bibliotecarios.
      await api.crearSuperbibliotecario({ usuario: nuevoUsuario, password: nuevaPassword, bibliotecaId: biblioteca._id });
      setNuevoUsuario("");
      setNuevaPassword("");
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function onEliminar(usuarioId) {
    if (!confirm("¿Eliminar este login?")) return;
    await api.eliminarUsuario(usuarioId);
    await recargar();
  }

  return (
    <div className="card" style={{ marginLeft: "1.5rem" }}>
      <h3>Staff de {biblioteca.nombre}</h3>
      {error && <div className="flash error" role="alert">{error}</div>}
      <ul>
        {usuarios?.map((u) => (
          <li key={u._id}>
            {u.usuario} <small>({u.rol})</small>{" "}
            <ResetearPassword usuarioId={u._id} />{" "}
            <button className="peligro" onClick={() => onEliminar(u._id)}>
              Eliminar
            </button>
          </li>
        ))}
        {usuarios?.length === 0 && <li>Sin logins todavía.</li>}
      </ul>
      <form onSubmit={onCrear}>
        <h4>Nuevo superbibliotecario</h4>
        <label>
          Usuario
          <input
            value={nuevoUsuario}
            onChange={(e) => setNuevoUsuario(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <CampoPassword
          etiqueta="Contraseña (mínimo 8 caracteres)"
          value={nuevaPassword}
          onChange={(e) => setNuevaPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <button type="submit" disabled={guardando}>
          {guardando ? "Creando…" : "Crear superbibliotecario"}
        </button>
      </form>
    </div>
  );
}

const ETIQUETA_ESTADO_SOLICITUD = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" };

// Un supervisor no ve (vía GET /bibliotecas) las que no tiene en su alcance
// — este panel es la única forma de que sepa que existen otras y pida
// acceso a una en concreto. El admin es quien de verdad la otorga (ver
// PanelSolicitudesSupervision más abajo); pedirla acá no cambia nada por sí
// sola.
function SolicitarSupervision() {
  const [disponibles, setDisponibles] = useState([]);
  const [misSolicitudes, setMisSolicitudes] = useState([]);
  const [bibliotecaId, setBibliotecaId] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function recargar() {
    const [disp, mias] = await Promise.all([
      api.listarBibliotecasDisponiblesParaSupervisar(),
      api.listarMisSolicitudesSupervision(),
    ]);
    setDisponibles(disp);
    setMisSolicitudes(mias);
    setBibliotecaId((actual) => (disp.some((b) => b._id === actual) ? actual : disp[0]?._id || ""));
  }

  useEffect(() => {
    recargar();
  }, []);

  async function onPedir(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.pedirSupervisarBiblioteca(bibliotecaId);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card">
      <h2>Supervisar otra biblioteca</h2>
      {error && <div className="flash error" role="alert">{error}</div>}
      {disponibles.length === 0 ? (
        <p><small>Ya supervisás todas las bibliotecas existentes.</small></p>
      ) : (
        <form onSubmit={onPedir}>
          <label>
            Biblioteca
            <select value={bibliotecaId} onChange={(e) => setBibliotecaId(e.target.value)}>
              {disponibles.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Pedir aprobación al admin"}
          </button>
        </form>
      )}
      {misSolicitudes.length > 0 && (
        <>
          <h3>Mis solicitudes</h3>
          <ul>
            {misSolicitudes.map((s) => (
              <li key={s._id}>
                {s.bibliotecaId?.nombre || "(biblioteca eliminada)"} — {ETIQUETA_ESTADO_SOLICITUD[s.estado]}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Solo admin: aprobar agrega de verdad la biblioteca a bibliotecasSupervisadas
// del supervisor que la pidió (ver POST /solicitudes-supervision/:id/aprobar);
// rechazar solo cierra la solicitud, sin tocar su alcance.
function PanelSolicitudesSupervision() {
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState("");

  async function recargar() {
    setSolicitudes(await api.listarSolicitudesSupervision("pendiente"));
  }

  useEffect(() => {
    recargar();
  }, []);

  async function onResolver(id, accion) {
    setError("");
    try {
      if (accion === "aprobar") await api.aprobarSolicitudSupervision(id);
      else await api.rechazarSolicitudSupervision(id);
      await recargar();
    } catch (err) {
      setError(err.message);
    }
  }

  if (solicitudes === null || solicitudes.length === 0) return null;

  return (
    <div className="card">
      <h2>Solicitudes de supervisión pendientes</h2>
      {error && <div className="flash error" role="alert">{error}</div>}
      <ul>
        {solicitudes.map((s) => (
          <li key={s._id}>
            <strong>{s.supervisorId?.usuario}</strong> pide supervisar{" "}
            <strong>{s.bibliotecaId?.nombre}</strong>{" "}
            <button onClick={() => onResolver(s._id, "aprobar")}>Aprobar</button>{" "}
            <button className="peligro" onClick={() => onResolver(s._id, "rechazar")}>
              Rechazar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PanelSupervisores({ bibliotecas }) {
  const [supervisores, setSupervisores] = useState(null);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [puedeCrearBibliotecas, setPuedeCrearBibliotecas] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    setSupervisores(await api.listarSupervisores());
  }

  useEffect(() => {
    recargar();
  }, []);

  function onToggleBiblioteca(id) {
    setSeleccionadas((actual) => (actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]));
  }

  function onEditar(s) {
    setEditandoId(s._id);
    setSeleccionadas((s.bibliotecasSupervisadas || []).map((b) => (typeof b === "string" ? b : b._id)));
    setPuedeCrearBibliotecas(!!s.puedeCrearBibliotecas);
    setError("");
  }

  function onCancelar() {
    setEditandoId(null);
    setUsuario("");
    setPassword("");
    setSeleccionadas([]);
    setPuedeCrearBibliotecas(false);
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      if (editandoId) {
        await api.actualizarSupervisor(editandoId, {
          bibliotecasSupervisadas: seleccionadas,
          puedeCrearBibliotecas,
        });
      } else {
        await api.crearSupervisor({
          usuario,
          password,
          bibliotecasSupervisadas: seleccionadas,
          puedeCrearBibliotecas,
        });
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
    if (!confirm("¿Eliminar este supervisor?")) return;
    await api.eliminarUsuario(id);
    if (editandoId === id) onCancelar();
    await recargar();
  }

  return (
    <div className="card">
      <h2>Supervisores</h2>
      {error && <div className="flash error" role="alert">{error}</div>}
      <ul>
        {supervisores?.map((s) => (
          <li key={s._id}>
            {s.usuario} — {(s.bibliotecasSupervisadas || []).length} biblioteca(s)
            {s.puedeCrearBibliotecas ? ", puede crear bibliotecas" : ""}{" "}
            <button className="secundario" onClick={() => onEditar(s)}>
              Editar
            </button>{" "}
            <ResetearPassword usuarioId={s._id} />{" "}
            <button className="peligro" onClick={() => onEliminar(s._id)}>
              Eliminar
            </button>
          </li>
        ))}
        {supervisores?.length === 0 && <li>Sin supervisores todavía.</li>}
      </ul>
      <form onSubmit={onSubmit}>
        <h3>{editandoId ? "Editar alcance del supervisor" : "Nuevo supervisor"}</h3>
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
        <fieldset>
          <legend>Bibliotecas que va a supervisar</legend>
          {bibliotecas.map((b) => (
            <label key={b._id} style={{ display: "block", fontWeight: "normal" }}>
              <input
                type="checkbox"
                checked={seleccionadas.includes(b._id)}
                onChange={() => onToggleBiblioteca(b._id)}
              />{" "}
              {b.nombre}
            </label>
          ))}
        </fieldset>
        <label style={{ display: "block" }}>
          <input
            type="checkbox"
            checked={puedeCrearBibliotecas}
            onChange={(e) => setPuedeCrearBibliotecas(e.target.checked)}
          />{" "}
          Puede crear bibliotecas nuevas
        </label>
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear supervisor"}
        </button>{" "}
        {editandoId && (
          <button type="button" className="secundario" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </form>
    </div>
  );
}

export default function AdminBibliotecas() {
  const { sesion } = useAuth();
  const [bibliotecas, setBibliotecas] = useState([]);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [expandida, setExpandida] = useState(null);
  const [expandidaConfig, setExpandidaConfig] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Un supervisor sin puedeCrearBibliotecas no ve el formulario de creación
  // — el backend lo bloquearía igual, esto es solo para no mostrar un botón
  // que va a fallar.
  const puedeCrear = sesion?.rol === "admin" || sesion?.puedeCrearBibliotecas;

  async function recargar() {
    setBibliotecas(await api.listarBibliotecas());
  }

  useEffect(() => {
    recargar();
  }, []);

  async function onCrear(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await api.crearBiblioteca({ nombre, codigo });
      setNombre("");
      setCodigo("");
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function onEliminar(id) {
    if (
      !confirm(
        "¿Eliminar esta biblioteca? Se borran sus logins de staff. Su catálogo y sus socios no se pierden: quedan marcados como eliminados, igual que si se borraran uno por uno."
      )
    )
      return;
    await api.eliminarBiblioteca(id);
    await recargar();
  }

  return (
    <>
      <h1>Bibliotecas</h1>
      {sesion?.rol === "admin" && <PanelSolicitudesSupervision />}
      {sesion?.rol === "supervisor" && <SolicitarSupervision />}
      {puedeCrear && (
        <form className="card" onSubmit={onCrear}>
          <h2>Nueva biblioteca</h2>
          {error && <div className="flash error" role="alert">{error}</div>}
          <label>
            Nombre
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Biblioteca Popular Domingo Faustino Sarmiento"
              required
            />
          </label>
          <label>
            Número de registro (el que le otorgaron a la biblioteca — solo minúsculas/números, sin
            espacios, ej: 100 o bpsanjuan)
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ej: 100"
              pattern="[a-z0-9]{1,20}"
              required
            />
          </label>
          <button type="submit" disabled={guardando}>
            {guardando ? "Creando…" : "Crear"}
          </button>
        </form>
      )}

      {bibliotecas.map((b) => (
        <div key={b._id} className="card">
          <strong>{b.nombre}</strong> (<code>{b.codigo}</code>){" "}
          <button className="secundario" onClick={() => setExpandida(expandida === b._id ? null : b._id)}>
            {expandida === b._id ? "Ocultar staff" : "Gestionar staff"}
          </button>{" "}
          <button
            className="secundario"
            onClick={() => setExpandidaConfig(expandidaConfig === b._id ? null : b._id)}
          >
            {expandidaConfig === b._id ? "Ocultar préstamos" : "Configurar préstamos"}
          </button>{" "}
          {sesion?.rol === "admin" && (
            <button className="peligro" onClick={() => onEliminar(b._id)}>
              Eliminar biblioteca
            </button>
          )}
          {expandida === b._id && <PanelUsuarios biblioteca={b} />}
          {expandidaConfig === b._id && <ConfiguracionCirculacion bibliotecaId={b._id} />}
        </div>
      ))}
      {bibliotecas.length === 0 && <p>Todavía no hay bibliotecas dadas de alta.</p>}

      {sesion?.rol === "admin" && <PanelSupervisores bibliotecas={bibliotecas} />}
    </>
  );
}
