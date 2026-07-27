import React, { useState } from "react";
import api from "../api.js";
import Pager from "../Pager.jsx";
import Campo from "../Campo.jsx";
import CampoPassword from "../CampoPassword.jsx";
import { useListaCrud } from "../useListaCrud.js";

const POR_PAGINA = 50;

const VACIO = {
  numeroSocio: "",
  apellido: "",
  nombre: "",
  dni: "",
  direccion: "",
  localidad: "",
  categoria: "ADULTO",
  fechaNacimiento: "",
  telefono: "",
  email: "",
};

function mapEntidadAForm(socio) {
  return {
    numeroSocio: socio.numeroSocio || "",
    apellido: socio.apellido || "",
    nombre: socio.nombre || "",
    dni: socio.dni || "",
    direccion: socio.direccion || "",
    localidad: socio.localidad || "",
    categoria: socio.categoria || "ADULTO",
    fechaNacimiento: socio.fechaNacimiento || "",
    telefono: socio.telefono || "",
    email: socio.email || "",
  };
}

export default function Socios() {
  const {
    items: socios,
    total,
    pagina,
    setPagina,
    busqueda,
    form,
    editandoId,
    eliminandoId,
    error,
    cargando,
    guardando,
    recargar,
    onBuscar,
    onEditar,
    onCancelarEdicion,
    onCambiarCampo,
    onSubmit,
    onEliminar,
    setError,
  } = useListaCrud({
    listar: (pagina, porPagina, q) => api.listarSociosPaginado(pagina, porPagina, q),
    crear: (datos) => api.crearSocio(datos),
    actualizar: (id, datos) => api.actualizarSocio(id, datos),
    eliminar: (id) => api.eliminarSocio(id),
    vacio: VACIO,
    porPagina: POR_PAGINA,
    mapEntidadAForm,
  });

  const [credencialesId, setCredencialesId] = useState(null);
  const [nuevaPasswordSocio, setNuevaPasswordSocio] = useState("");
  const [guardandoCredenciales, setGuardandoCredenciales] = useState(false);
  const [mensajeCredenciales, setMensajeCredenciales] = useState("");

  function onAbrirLogin(id) {
    setCredencialesId(credencialesId === id ? null : id);
    setNuevaPasswordSocio("");
    setMensajeCredenciales("");
    setError("");
  }

  async function onGuardarCredenciales(e, id) {
    e.preventDefault();
    setError("");
    setMensajeCredenciales("");
    setGuardandoCredenciales(true);
    try {
      await api.crearCredencialesSocio(id, nuevaPasswordSocio);
      setMensajeCredenciales("Login creado/actualizado.");
      setNuevaPasswordSocio("");
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoCredenciales(false);
    }
  }

  return (
    <>
      <h1>Socios</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar socio" : "Nuevo socio"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        <Campo nombre="numeroSocio" etiqueta="Número de socio *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="apellido" etiqueta="Apellido *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="nombre" etiqueta="Nombre *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="dni" etiqueta="DNI" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="direccion" etiqueta="Dirección" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="localidad" etiqueta="Localidad" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="categoria" etiqueta="Categoría" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="fechaNacimiento"
          etiqueta="Fecha de nacimiento"
          form={form}
          onCambiar={onCambiarCampo}
          type="date"
        />
        <Campo nombre="telefono" etiqueta="Teléfono" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="email" etiqueta="Email" form={form} onCambiar={onCambiarCampo} type="email" />
        <p>
          <small>
            Estos datos se usan solo para la gestión de préstamos de la biblioteca y no se comparten con
            terceros.
          </small>
        </p>
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar"}
        </button>{" "}
        {editandoId && (
          <button type="button" className="secundario" onClick={onCancelarEdicion}>
            Cancelar
          </button>
        )}
      </form>

      <label>
        Buscar por número, apellido, nombre o DNI
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Ej: 123, o García"
        />
      </label>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>N° socio</th>
              <th>Apellido y nombre</th>
              <th>Localidad</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {socios.map((socio) => (
              <React.Fragment key={socio._id}>
                <tr className={eliminandoId === socio._id ? "saliendo" : ""}>
                  <td>{socio.numeroSocio}</td>
                  <td>
                    {socio.apellido}, {socio.nombre}
                  </td>
                  <td>{socio.localidad}</td>
                  <td>
                    <button className="secundario" onClick={() => onEditar(socio)}>
                      Editar
                    </button>{" "}
                    <button className="secundario" onClick={() => onAbrirLogin(socio._id)}>
                      Login OPAC
                    </button>{" "}
                    <span
                      className="pill-estado"
                      title={
                        socio.tieneLoginOpac
                          ? "Ya tiene una contraseña de OPAC configurada"
                          : "Todavía no tiene ninguna contraseña de OPAC — no puede entrar al catálogo público"
                      }
                    >
                      OPAC: {socio.tieneLoginOpac ? "sí" : "no"}
                    </span>{" "}
                    <button className="peligro" onClick={() => onEliminar(socio._id, "¿Eliminar este socio?")}>
                      Eliminar
                    </button>
                  </td>
                </tr>
                {credencialesId === socio._id && (
                  <tr>
                    <td colSpan={4}>
                      <form
                        className="card"
                        onSubmit={(e) => onGuardarCredenciales(e, socio._id)}
                        style={{ margin: "0.5rem 0" }}
                      >
                        <CampoPassword
                          etiqueta={`Contraseña para el login del OPAC de ${socio.nombre} ${socio.apellido} (mínimo 8 caracteres)`}
                          value={nuevaPasswordSocio}
                          onChange={(e) => setNuevaPasswordSocio(e.target.value)}
                          autoComplete="new-password"
                          minLength={8}
                          required
                        />
                        {mensajeCredenciales && (
                          <div className="flash ok" role="status">
                            {mensajeCredenciales}
                          </div>
                        )}
                        <button type="submit" disabled={guardandoCredenciales}>
                          {guardandoCredenciales ? "Guardando…" : "Guardar contraseña"}
                        </button>{" "}
                        <button type="button" className="secundario" onClick={() => onAbrirLogin(socio._id)}>
                          Cerrar
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {socios.length === 0 && (
              <tr>
                <td colSpan={4}>
                  {busqueda ? "Ningún socio coincide con la búsqueda." : "Todavía no cargaste ningún socio."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <Pager pagina={pagina} porPagina={POR_PAGINA} total={total} onCambiar={setPagina} etiqueta="socios" />
    </>
  );
}
