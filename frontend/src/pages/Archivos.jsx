import React, { useEffect, useState } from "react";
import api from "../api.js";
import Pager from "../Pager.jsx";
import Campo from "../Campo.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { useEditarDesdeNavegacion } from "../useEditarDesdeNavegacion.js";

const POR_PAGINA = 50;

const SUBTIPOS = [
  { valor: "manuscrito", etiqueta: "Manuscrito" },
  { valor: "carta", etiqueta: "Carta" },
  { valor: "acta", etiqueta: "Acta" },
  { valor: "decreto", etiqueta: "Decreto" },
  { valor: "resolucion", etiqueta: "Resolución" },
  { valor: "expediente", etiqueta: "Expediente" },
  { valor: "documento_historico", etiqueta: "Documento histórico" },
];

const NIVELES = [
  { valor: "fondo", etiqueta: "Fondo" },
  { valor: "serie", etiqueta: "Serie" },
  { valor: "subserie", etiqueta: "Subserie" },
  { valor: "expediente", etiqueta: "Expediente" },
  { valor: "unidad_documental", etiqueta: "Unidad documental" },
];

// Campo estructurado opcional al lado de "Condiciones de acceso" en texto
// libre (ver ARCHIV-3 en AUDITORIA.md) — sirve para poder filtrar por nivel
// de acceso más adelante, sin tener que parsear la descripción.
const NIVELES_ACCESO = [
  { valor: "", etiqueta: "(sin especificar)" },
  { valor: "libre", etiqueta: "Libre" },
  { valor: "restringido", etiqueta: "Restringido (con autorización)" },
  { valor: "confidencial", etiqueta: "Confidencial" },
];

const VACIO = {
  titulo: "",
  subtitulo: "",
  codigoReferencia: "",
  subtipo: "documento_historico",
  nivelDescripcion: "unidad_documental",
  productor: "",
  fechaInicio: "",
  fechaFin: "",
  volumenSoporte: "",
  alcanceContenido: "",
  condicionesAcceso: "",
  nivelAcceso: "",
  padreId: "",
  portadaUrl: "",
  materiasTexto: "",
  notas: "",
};

function aLista(texto) {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapEntidadAForm(item) {
  return {
    titulo: item.titulo || "",
    subtitulo: item.subtitulo || "",
    codigoReferencia: item.codigoReferencia || "",
    subtipo: item.subtipo || "documento_historico",
    nivelDescripcion: item.nivelDescripcion || "unidad_documental",
    productor: item.productor || "",
    fechaInicio: item.fechaInicio || "",
    fechaFin: item.fechaFin || "",
    volumenSoporte: item.volumenSoporte || "",
    alcanceContenido: item.alcanceContenido || "",
    condicionesAcceso: item.condicionesAcceso || "",
    nivelAcceso: item.nivelAcceso || "",
    padreId: item.padreId || "",
    portadaUrl: item.portadaUrl || "",
    materiasTexto: (item.materias || []).join(", "),
    notas: item.notas || "",
  };
}

function mapFormADatos(form) {
  return {
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    codigoReferencia: form.codigoReferencia,
    subtipo: form.subtipo,
    nivelDescripcion: form.nivelDescripcion,
    productor: form.productor,
    fechaInicio: form.fechaInicio,
    fechaFin: form.fechaFin,
    volumenSoporte: form.volumenSoporte,
    alcanceContenido: form.alcanceContenido,
    condicionesAcceso: form.condicionesAcceso,
    nivelAcceso: form.nivelAcceso || null,
    padreId: form.padreId || null,
    portadaUrl: form.portadaUrl,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
  };
}

export default function Archivos() {
  const {
    items,
    total,
    pagina,
    setPagina,
    busqueda,
    form,
    editandoId,
    eliminandoId,
    seleccionados,
    eliminandoSeleccion,
    error,
    cargando,
    guardando,
    onBuscar,
    onEditar,
    onCancelarEdicion,
    onCambiarCampo,
    onSubmit,
    onEliminar,
    onToggleSeleccion,
    onToggleSeleccionTodos,
    onEliminarSeleccionados,
  } = useListaCrud({
    listar: (pagina, porPagina, q) => api.listarArchivoPaginado(pagina, porPagina, q),
    crear: (datos) => api.crearArchivo(datos),
    actualizar: (id, datos) => api.actualizarArchivo(id, datos),
    eliminar: (id) => api.eliminarArchivo(id),
    vacio: VACIO,
    porPagina: POR_PAGINA,
    mapEntidadAForm,
    mapFormADatos,
  });

  useEditarDesdeNavegacion(onEditar);

  // Lista completa (no paginada) para el select de "padre" — la jerarquía
  // es opcional (ver ARCHIV-2), así que solo hace falta un listado liviano
  // de título+código para elegir, no la ficha completa de cada uno.
  const [todosLosArchivos, setTodosLosArchivos] = useState([]);
  useEffect(() => {
    api.listarArchivo().then(setTodosLosArchivos);
  }, [items]);

  const opcionesPadre = [
    { valor: "", etiqueta: "(sin padre)" },
    ...todosLosArchivos
      .filter((a) => a._id !== editandoId)
      .map((a) => ({
        valor: a._id,
        etiqueta: a.codigoReferencia ? `${a.titulo} (${a.codigoReferencia})` : a.titulo,
      })),
  ];

  return (
    <>
      <h1>Archivos</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar archivo" : "Nuevo archivo"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        <Campo nombre="titulo" etiqueta="Título *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="subtitulo" etiqueta="Subtítulo" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="portadaUrl"
          etiqueta="URL de foto/imagen (opcional)"
          type="url"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="codigoReferencia" etiqueta="Código de referencia" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="subtipo"
          etiqueta="Subtipo"
          tipo="select"
          opciones={SUBTIPOS}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo
          nombre="nivelDescripcion"
          etiqueta="Nivel de descripción"
          tipo="select"
          opciones={NIVELES}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo
          nombre="padreId"
          etiqueta="Pertenece a (opcional)"
          tipo="select"
          opciones={opcionesPadre}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <p>
          <small>
            Para expresar una jerarquía de un solo nivel (ej. este expediente pertenece a esa serie) — no hace
            falta completarlo si tu biblioteca no maneja jerarquía.
          </small>
        </p>
        <Campo nombre="productor" etiqueta="Productor (entidad o persona)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="fechaInicio" etiqueta="Fecha de inicio" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="fechaFin" etiqueta="Fecha de cierre" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="volumenSoporte" etiqueta="Volumen y soporte (ej: 3 cajas, papel)" form={form} onCambiar={onCambiarCampo} />
        <label>
          Alcance y contenido
          <textarea
            value={form.alcanceContenido}
            onChange={(e) => onCambiarCampo("alcanceContenido", e.target.value)}
          />
        </label>
        <Campo
          nombre="condicionesAcceso"
          etiqueta="Condiciones de acceso (restricciones, si las hay)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo
          nombre="nivelAcceso"
          etiqueta="Nivel de acceso (opcional)"
          tipo="select"
          opciones={NIVELES_ACCESO}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <p>
          <small>
            Para poder filtrar por nivel de acceso más adelante — no reemplaza al texto de arriba, es un campo
            aparte y no hace falta completarlo.
          </small>
        </p>
        <Campo
          nombre="materiasTexto"
          etiqueta="Materias (separadas por coma)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <label>
          Notas
          <textarea value={form.notas} onChange={(e) => onCambiarCampo("notas", e.target.value)} />
        </label>
        <p>
          <small>No circula ni tiene ejemplares — es una pieza única que se consulta en la biblioteca.</small>
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
        Buscar por título, código de referencia o productor
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Ej: acta fundacional"
        />
      </label>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <>
          {seleccionados.size > 0 && (
            <div className="barra-seleccion">
              <span>{seleccionados.size} seleccionado(s)</span>
              <button
                type="button"
                className="peligro"
                onClick={() => onEliminarSeleccionados("¿Eliminar los archivos seleccionados?")}
                disabled={eliminandoSeleccion}
              >
                {eliminandoSeleccion ? "Eliminando…" : "Eliminar seleccionados"}
              </button>
            </div>
          )}
          <table>
            <caption className="sr-only">
              Podés tildar más de una fila para actuar sobre varias a la vez con "Eliminar seleccionados".
            </caption>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={items.length > 0 && seleccionados.size === items.length}
                    onChange={onToggleSeleccionTodos}
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th>Título</th>
                <th>Subtipo</th>
                <th>Nivel</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className={eliminandoId === item._id ? "saliendo" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccionados.has(item._id)}
                      onChange={() => onToggleSeleccion(item._id)}
                      aria-label={`Seleccionar ${item.titulo}`}
                    />
                  </td>
                  <td>{item.titulo}</td>
                  <td>{item.subtipo}</td>
                  <td>{item.nivelDescripcion}</td>
                  <td>
                    <button className="secundario" onClick={() => onEditar(item)}>
                      Editar
                    </button>{" "}
                    <button className="peligro" onClick={() => onEliminar(item._id, "¿Eliminar este archivo?")}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    {busqueda ? "Ningún archivo coincide con la búsqueda." : "Todavía no cargaste ningún archivo."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
      <Pager pagina={pagina} porPagina={POR_PAGINA} total={total} onCambiar={setPagina} etiqueta="archivos" />
    </>
  );
}
