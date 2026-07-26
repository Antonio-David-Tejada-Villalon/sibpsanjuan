import React from "react";
import api from "../api.js";
import Pager from "../Pager.jsx";
import Campo from "../Campo.jsx";
import { useListaCrud } from "../useListaCrud.js";

const POR_PAGINA = 50;

const SUBTIPOS = [
  { valor: "obra_de_arte", etiqueta: "Obra de arte" },
  { valor: "medalla", etiqueta: "Medalla" },
  { valor: "objeto_historico", etiqueta: "Objeto histórico" },
  { valor: "maqueta", etiqueta: "Maqueta" },
];

const ESTADOS_CONSERVACION = [
  { valor: "excelente", etiqueta: "Excelente" },
  { valor: "bueno", etiqueta: "Bueno" },
  { valor: "regular", etiqueta: "Regular" },
  { valor: "malo", etiqueta: "Malo" },
];

const VACIO = {
  titulo: "",
  subtitulo: "",
  subtipo: "objeto_historico",
  numeroInventario: "",
  procedencia: "",
  estadoConservacion: "bueno",
  ubicacion: "",
  periodo: "",
  materiales: "",
  dimensiones: "",
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
    subtipo: item.subtipo || "objeto_historico",
    numeroInventario: item.numeroInventario || "",
    procedencia: item.procedencia || "",
    estadoConservacion: item.estadoConservacion || "bueno",
    ubicacion: item.ubicacion || "",
    periodo: item.periodo || "",
    materiales: item.materiales || "",
    dimensiones: item.dimensiones || "",
    portadaUrl: item.portadaUrl || "",
    materiasTexto: (item.materias || []).join(", "),
    notas: item.notas || "",
  };
}

function mapFormADatos(form) {
  return {
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    subtipo: form.subtipo,
    numeroInventario: form.numeroInventario,
    procedencia: form.procedencia,
    estadoConservacion: form.estadoConservacion,
    ubicacion: form.ubicacion,
    periodo: form.periodo,
    materiales: form.materiales,
    dimensiones: form.dimensiones,
    portadaUrl: form.portadaUrl,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
  };
}

export default function Objetos() {
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
    listar: (pagina, porPagina, q) => api.listarObjetoPaginado(pagina, porPagina, q),
    crear: (datos) => api.crearObjeto(datos),
    actualizar: (id, datos) => api.actualizarObjeto(id, datos),
    eliminar: (id) => api.eliminarObjeto(id),
    vacio: VACIO,
    porPagina: POR_PAGINA,
    mapEntidadAForm,
    mapFormADatos,
  });

  return (
    <>
      <h1>Objetos</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar objeto" : "Nuevo objeto"}</h2>
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
        <Campo
          nombre="subtipo"
          etiqueta="Subtipo"
          tipo="select"
          opciones={SUBTIPOS}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="numeroInventario" etiqueta="Número de inventario" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="procedencia" etiqueta="Procedencia (de dónde proviene/quién lo donó)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="estadoConservacion"
          etiqueta="Estado de conservación"
          tipo="select"
          opciones={ESTADOS_CONSERVACION}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="ubicacion" etiqueta="Ubicación (dónde está guardado/exhibido)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="periodo" etiqueta="Período o fecha de creación" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="materiales" etiqueta="Materiales (de qué está hecho)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="dimensiones" etiqueta="Dimensiones" form={form} onCambiar={onCambiarCampo} />
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
          <small>No circula ni tiene ejemplares — es una pieza única que se consulta o exhibe en la biblioteca.</small>
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
        Buscar por título, número de inventario o procedencia
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Ej: medalla conmemorativa"
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
                onClick={() => onEliminarSeleccionados("¿Eliminar los objetos seleccionados?")}
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
                <th>Estado</th>
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
                  <td>{item.estadoConservacion}</td>
                  <td>
                    <button className="secundario" onClick={() => onEditar(item)}>
                      Editar
                    </button>{" "}
                    <button className="peligro" onClick={() => onEliminar(item._id, "¿Eliminar este objeto?")}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    {busqueda ? "Ningún objeto coincide con la búsqueda." : "Todavía no cargaste ningún objeto."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
      <Pager pagina={pagina} porPagina={POR_PAGINA} total={total} onCambiar={setPagina} etiqueta="objetos" />
    </>
  );
}
