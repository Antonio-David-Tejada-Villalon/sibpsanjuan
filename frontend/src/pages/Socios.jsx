import React, { useEffect, useState } from "react";
import api from "../api.js";
import Pager from "../Pager.jsx";
import Campo from "../Campo.jsx";
import CampoPassword from "../CampoPassword.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { useAuth } from "../AuthContext.jsx";
import { obtenerBibliotecaActivaId } from "../bibliotecaActiva.js";

const POR_PAGINA = 50;

// Mismos campos que CAMPOS_CONTACTO y CAMPOS_NO_MINIMOS en
// backend/src/utils/datosSocio.js: la API devuelve los primeros
// enmascarados ("•••222"), y los segundos no se piden para categorías de
// datos mínimos (alumnos).
const CAMPOS_CONTACTO = ["dni", "direccion", "telefono", "email", "emailTutor", "fechaNacimiento"];
const CAMPOS_NO_MINIMOS = ["dni", "direccion", "localidad", "telefono", "fechaNacimiento"];
const estaOculto = (valor) => typeof valor === "string" && valor.includes("•••");

const VACIO = {
  numeroSocio: "",
  apellido: "",
  nombre: "",
  dni: "",
  direccion: "",
  localidad: "",
  categoria: "",
  fechaNacimiento: "",
  telefono: "",
  email: "",
  curso: "",
  emailTutor: "",
};

function mapEntidadAForm(socio) {
  return {
    numeroSocio: socio.numeroSocio || "",
    apellido: socio.apellido || "",
    nombre: socio.nombre || "",
    dni: socio.dni || "",
    direccion: socio.direccion || "",
    localidad: socio.localidad || "",
    // En mayúsculas como los códigos de categoría (el backend compara igual).
    categoria: (socio.categoria || "").toUpperCase(),
    fechaNacimiento: socio.fechaNacimiento || "",
    telefono: socio.telefono || "",
    email: socio.email || "",
    curso: socio.curso || "",
    emailTutor: socio.emailTutor || "",
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
    onCargarDelServidor,
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
    mapFormADatos,
  });

  // Para una categoría de datos mínimos, los campos que no se piden ni se
  // mandan: así un dato viejo queda como estaba (no se borra solo), salvo
  // que el staff elija borrarlo.
  function mapFormADatos(f) {
    if (!minimos) return f;
    const datos = { ...f };
    for (const campo of CAMPOS_NO_MINIMOS) {
      if (borrarSobrantes) datos[campo] = "";
      else delete datos[campo];
    }
    return datos;
  }

  // La categoría decide las reglas de préstamo del socio (ver
  // CategoriasSocios.jsx), así que se elige de las que tiene la biblioteca
  // en vez de escribirse a mano.
  const { sesion } = useAuth();
  const bibliotecaId = sesion?.bibliotecaId || obtenerBibliotecaActivaId();
  const [categorias, setCategorias] = useState([]);
  const [errorCategorias, setErrorCategorias] = useState("");

  useEffect(() => {
    if (!bibliotecaId) return;
    api
      .listarCategorias(bibliotecaId)
      .then(setCategorias)
      .catch((err) => setErrorCategorias(`No se pudieron cargar las categorías: ${err.message}`));
  }, [bibliotecaId]);

  const nombrePorCodigo = new Map(categorias.map((c) => [c.codigo, c.nombre]));
  const opcionesCategoria = [
    { valor: "", etiqueta: "Elegí una categoría" },
    ...categorias.map((c) => ({ valor: c.codigo, etiqueta: c.nombre })),
  ];
  // Un socio cargado antes de las categorías puede tener un código que no
  // existe (ej. "ADULTO"): se muestra igual para poder editarle otros datos
  // sin obligar a cambiarlo.
  if (form.categoria && !nombrePorCodigo.has(form.categoria)) {
    opcionesCategoria.push({ valor: form.categoria, etiqueta: `${form.categoria} (sin reglas propias)` });
  }

  const categoriaElegida = categorias.find((c) => c.codigo === form.categoria);
  const minimos = Boolean(categoriaElegida?.datosMinimos);

  // Los datos de contacto llegan enmascarados; verlos completos es una
  // acción aparte, con permiso y registrada (POST /socios/:id/datos-contacto).
  const puedeVerDatos = sesion?.rol !== "bibliotecario" || Boolean(sesion?.permisos?.datosSocios);
  const [reveladoId, setReveladoId] = useState(null);
  const [borrarSobrantes, setBorrarSobrantes] = useState(false);
  const [avisoDatos, setAvisoDatos] = useState("");

  useEffect(() => {
    setReveladoId(null);
    setBorrarSobrantes(false);
    setAvisoDatos("");
  }, [editandoId]);

  const hayOcultos = Boolean(editandoId) && CAMPOS_CONTACTO.some((c) => estaOculto(form[c]));
  const sobrantes = minimos && editandoId ? CAMPOS_NO_MINIMOS.filter((c) => form[c]) : [];

  async function onVerDatos() {
    setError("");
    try {
      const datos = await api.verDatosContactoSocio(editandoId);
      onCargarDelServidor(datos);
      setReveladoId(editandoId);
      setAvisoDatos("Quedó registrado que viste los datos completos de este socio.");
    } catch (err) {
      setError(err.message);
    }
  }

  // Un dato enmascarado se muestra pero no se edita (y no se valida como
  // correo): hay que verlo completo primero.
  function propsProtegido(campo) {
    return estaOculto(form[campo]) ? { readOnly: true, type: "text", "aria-describedby": "ayuda-datos-ocultos" } : {};
  }

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
        {errorCategorias && <div className="flash error" role="alert">{errorCategorias}</div>}
        {/* Primero la categoría: decide qué datos se piden. */}
        <Campo
          nombre="categoria"
          etiqueta="Categoría *"
          form={form}
          onCambiar={onCambiarCampo}
          tipo="select"
          opciones={opcionesCategoria}
          required
        />
        <Campo
          nombre="numeroSocio"
          etiqueta={minimos ? "Legajo *" : "Número de socio *"}
          form={form}
          onCambiar={onCambiarCampo}
          required
        />
        <Campo nombre="apellido" etiqueta="Apellido *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="nombre" etiqueta="Nombre *" form={form} onCambiar={onCambiarCampo} required />
        {minimos ? (
          <>
            <Campo nombre="curso" etiqueta="Curso y división" form={form} onCambiar={onCambiarCampo} placeholder="Ej.: 3° B" />
            <Campo
              nombre="email"
              etiqueta="Correo institucional"
              form={form}
              onCambiar={onCambiarCampo}
              type="email"
              {...propsProtegido("email")}
            />
            <Campo
              nombre="emailTutor"
              etiqueta="Correo del tutor o tutora"
              form={form}
              onCambiar={onCambiarCampo}
              type="email"
              {...propsProtegido("emailTutor")}
            />
            <p>
              <small>
                Para {categoriaElegida.nombre} se piden solo los datos necesarios para prestar: no se cargan DNI,
                domicilio, teléfono ni fecha de nacimiento.
              </small>
            </p>
            {sobrantes.length > 0 && (
              <div className="flash aviso" role="status">
                Este socio tiene datos que para {categoriaElegida.nombre} ya no se piden ({sobrantes.join(", ")}).{" "}
                <label style={{ display: "inline", fontWeight: "normal" }}>
                  <input type="checkbox" checked={borrarSobrantes} onChange={(e) => setBorrarSobrantes(e.target.checked)} />{" "}
                  Borrarlos al guardar
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            <Campo nombre="dni" etiqueta="DNI" form={form} onCambiar={onCambiarCampo} {...propsProtegido("dni")} />
            <Campo
              nombre="direccion"
              etiqueta="Dirección"
              form={form}
              onCambiar={onCambiarCampo}
              {...propsProtegido("direccion")}
            />
            <Campo nombre="localidad" etiqueta="Localidad" form={form} onCambiar={onCambiarCampo} />
            <Campo
              nombre="fechaNacimiento"
              etiqueta="Fecha de nacimiento"
              form={form}
              onCambiar={onCambiarCampo}
              type="date"
              {...propsProtegido("fechaNacimiento")}
            />
            <Campo
              nombre="telefono"
              etiqueta="Teléfono"
              form={form}
              onCambiar={onCambiarCampo}
              {...propsProtegido("telefono")}
            />
            <Campo
              nombre="email"
              etiqueta="Email"
              form={form}
              onCambiar={onCambiarCampo}
              type="email"
              {...propsProtegido("email")}
            />
          </>
        )}
        {hayOcultos && (
          <p id="ayuda-datos-ocultos" className="datos-ocultos">
            <small>
              Los datos de contacto se muestran ocultos.
              {puedeVerDatos
                ? " Para verlos o cambiarlos, mostralos completos (queda registrado quién los vio)."
                : " Para verlos completos hace falta el permiso «Ver datos de contacto de socios»."}
            </small>
            {puedeVerDatos && reveladoId !== editandoId && (
              <button type="button" className="secundario" onClick={onVerDatos}>
                Ver datos completos
              </button>
            )}
          </p>
        )}
        {avisoDatos && <div className="flash ok" role="status">{avisoDatos}</div>}
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
              <th>Categoría</th>
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
                  <td>{nombrePorCodigo.get((socio.categoria || "").toUpperCase()) || socio.categoria}</td>
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
                    <td colSpan={5}>
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
                <td colSpan={5}>
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
