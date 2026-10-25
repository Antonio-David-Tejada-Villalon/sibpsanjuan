import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../../api.js";
import Campo from "../../Campo.jsx";
import { useAuth } from "../../AuthContext.jsx";
import { obtenerBibliotecaActivaId } from "../../bibliotecaActiva.js";
import PestanasSocios from "./PestanasSocios.jsx";

// Alta y edición de un socio, sola en su pantalla (/socios/nuevo y
// /socios/:id/editar). Al guardar va a la ficha del socio.

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
  vigenteHasta: "",
};

function aFormulario(socio) {
  const form = {};
  for (const campo of Object.keys(VACIO)) form[campo] = socio[campo] || "";
  // En mayúsculas como los códigos de categoría (el backend compara igual).
  form.categoria = form.categoria.toUpperCase();
  return form;
}

export default function FormularioSocio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sesion } = useAuth();
  const bibliotecaId = sesion?.bibliotecaId || obtenerBibliotecaActivaId();
  const [form, setForm] = useState(VACIO);
  const base = useRef(VACIO);
  const [cargando, setCargando] = useState(Boolean(id));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [categorias, setCategorias] = useState([]);
  const [revelado, setRevelado] = useState(false);
  const [borrarSobrantes, setBorrarSobrantes] = useState(false);
  const [avisoDatos, setAvisoDatos] = useState("");

  useEffect(() => {
    if (!bibliotecaId) return;
    api
      .listarCategorias(bibliotecaId)
      .then(setCategorias)
      .catch((err) => setError(`No se pudieron cargar las categorías: ${err.message}`));
  }, [bibliotecaId]);

  useEffect(() => {
    if (!id) {
      setForm(VACIO);
      base.current = VACIO;
      return;
    }
    setCargando(true);
    api
      .obtenerSocio(id)
      .then((socio) => {
        const cargado = aFormulario(socio);
        setForm(cargado);
        base.current = cargado;
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [id]);

  // Aviso del navegador al irse con cambios sin guardar.
  useEffect(() => {
    function alSalir(e) {
      if (JSON.stringify(form) === JSON.stringify(base.current)) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [form]);

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const nombrePorCodigo = new Map(categorias.map((c) => [c.codigo, c.nombre]));
  const opcionesCategoria = [{ valor: "", etiqueta: "Elegí una categoría" }, ...categorias.map((c) => ({ valor: c.codigo, etiqueta: c.nombre }))];
  // Un socio cargado antes de las categorías puede tener un código que no
  // existe (ej. "ADULTO"): se muestra igual para poder editarle otros datos.
  if (form.categoria && !nombrePorCodigo.has(form.categoria)) {
    opcionesCategoria.push({ valor: form.categoria, etiqueta: `${form.categoria} (sin reglas propias)` });
  }
  const categoriaElegida = categorias.find((c) => c.codigo === form.categoria);
  const minimos = Boolean(categoriaElegida?.datosMinimos);

  // Los datos de contacto llegan enmascarados; verlos completos es una
  // acción aparte, con permiso y registrada (POST /socios/:id/datos-contacto).
  const puedeVerDatos = sesion?.rol !== "bibliotecario" || Boolean(sesion?.permisos?.datosSocios);
  const hayOcultos = Boolean(id) && CAMPOS_CONTACTO.some((c) => estaOculto(form[c]));
  const sobrantes = minimos && id ? CAMPOS_NO_MINIMOS.filter((c) => form[c]) : [];

  async function verDatos() {
    setError("");
    try {
      const datos = await api.verDatosContactoSocio(id);
      setForm((f) => ({ ...f, ...datos }));
      base.current = { ...base.current, ...datos };
      setRevelado(true);
      setAvisoDatos("Quedó registrado que viste los datos completos de este socio.");
    } catch (err) {
      setError(err.message);
    }
  }

  // Un dato enmascarado se muestra pero no se edita: hay que verlo completo primero.
  function protegido(campo) {
    return estaOculto(form[campo]) ? { readOnly: true, type: "text", "aria-describedby": "ayuda-datos-ocultos" } : {};
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    // Para datos mínimos, lo que no se pide tampoco se manda (un dato viejo
    // queda como estaba), salvo que se elija borrarlo.
    const datos = { ...form };
    if (minimos) {
      for (const campo of CAMPOS_NO_MINIMOS) {
        if (borrarSobrantes) datos[campo] = "";
        else delete datos[campo];
      }
    }
    try {
      const socio = id ? await api.actualizarSocio(id, datos) : await api.crearSocio(datos);
      base.current = form;
      navigate(`/socios/${socio._id}`, { state: { aviso: id ? "Cambios guardados." : "Socio dado de alta." } });
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  if (cargando) return <p>Cargando…</p>;

  return (
    <>
      <h1>{id ? "Editar socio" : "Socios"}</h1>
      {!id && <PestanasSocios />}
      <form className="card formulario-socio" onSubmit={guardar}>
        <h2>{id ? `${form.apellido}, ${form.nombre}` : "Nuevo socio"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        {/* Primero la categoría: decide qué datos se piden. */}
        <Campo nombre="categoria" etiqueta="Categoría *" form={form} onCambiar={cambiar} tipo="select" opciones={opcionesCategoria} required />
        <Campo nombre="numeroSocio" etiqueta={minimos ? "Legajo *" : "Número de socio *"} form={form} onCambiar={cambiar} required />
        <Campo nombre="apellido" etiqueta="Apellido *" form={form} onCambiar={cambiar} required />
        <Campo nombre="nombre" etiqueta="Nombre *" form={form} onCambiar={cambiar} required />
        {minimos ? (
          <>
            <Campo nombre="curso" etiqueta="Curso y división" form={form} onCambiar={cambiar} placeholder="Ej.: 3° B" />
            <Campo nombre="email" etiqueta="Correo institucional" form={form} onCambiar={cambiar} type="email" {...protegido("email")} />
            <Campo nombre="emailTutor" etiqueta="Correo del tutor o tutora" form={form} onCambiar={cambiar} type="email" {...protegido("emailTutor")} />
            <p>
              <small>
                Para {categoriaElegida.nombre} se piden solo los datos necesarios para prestar: no se cargan DNI, domicilio, teléfono ni
                fecha de nacimiento.
              </small>
            </p>
            {sobrantes.length > 0 && (
              <div className="flash aviso" role="status">
                Este socio tiene datos que para {categoriaElegida.nombre} ya no se piden ({sobrantes.join(", ")}).{" "}
                <label style={{ display: "inline", fontWeight: "normal" }}>
                  <input type="checkbox" checked={borrarSobrantes} onChange={(e) => setBorrarSobrantes(e.target.checked)} /> Borrarlos al
                  guardar
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            <Campo nombre="dni" etiqueta="DNI" form={form} onCambiar={cambiar} {...protegido("dni")} />
            <Campo nombre="direccion" etiqueta="Dirección" form={form} onCambiar={cambiar} {...protegido("direccion")} />
            <Campo nombre="localidad" etiqueta="Localidad" form={form} onCambiar={cambiar} />
            <Campo nombre="fechaNacimiento" etiqueta="Fecha de nacimiento" form={form} onCambiar={cambiar} type="date" {...protegido("fechaNacimiento")} />
            <Campo nombre="telefono" etiqueta="Teléfono" form={form} onCambiar={cambiar} {...protegido("telefono")} />
            <Campo nombre="email" etiqueta="Email" form={form} onCambiar={cambiar} type="email" {...protegido("email")} />
          </>
        )}
        <Campo
          nombre="vigenteHasta"
          etiqueta="La cuenta vence el (opcional)"
          form={form}
          onCambiar={cambiar}
          type="date"
          aria-describedby="ayuda-vencimiento"
        />
        <p id="ayuda-vencimiento">
          <small>Por ejemplo, al terminar el ciclo lectivo. Con la cuenta vencida no se le presta ni reserva hasta renovarla.</small>
        </p>
        {hayOcultos && (
          <p id="ayuda-datos-ocultos" className="datos-ocultos">
            <small>
              Los datos de contacto se muestran ocultos.
              {puedeVerDatos
                ? " Para verlos o cambiarlos, mostralos completos (queda registrado quién los vio)."
                : " Para verlos completos hace falta el permiso «Ver datos de contacto de socios»."}
            </small>
            {puedeVerDatos && !revelado && (
              <button type="button" className="secundario" onClick={verDatos}>
                Ver datos completos
              </button>
            )}
          </p>
        )}
        {avisoDatos && <div className="flash ok" role="status">{avisoDatos}</div>}
        <p>
          <small>Estos datos se usan solo para la gestión de préstamos de la biblioteca y no se comparten con terceros.</small>
        </p>
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : id ? "Guardar cambios" : "Guardar"}
        </button>{" "}
        <Link className="boton-enlace secundario" to={id ? `/socios/${id}` : "/socios"}>
          Cancelar
        </Link>
      </form>
    </>
  );
}
