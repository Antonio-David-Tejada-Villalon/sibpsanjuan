import React from "react";
import api from "../api.js";
import Pager from "../Pager.jsx";
import Campo from "../Campo.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { useEditarDesdeNavegacion } from "../useEditarDesdeNavegacion.js";
import { aEjemplares } from "../ejemplaresTexto.js";

const POR_PAGINA = 50;

const SUBTIPOS = [
  { valor: "juego_educativo", etiqueta: "Juego educativo" },
  { valor: "kit_escolar", etiqueta: "Kit escolar" },
  { valor: "rompecabezas", etiqueta: "Rompecabezas" },
  { valor: "material_montessori", etiqueta: "Material Montessori" },
  { valor: "material_manipulativo", etiqueta: "Material manipulativo" },
];

const VACIO = {
  titulo: "",
  subtitulo: "",
  subtipo: "juego_educativo",
  componentes: "",
  edadRecomendada: "",
  portadaUrl: "",
  materiasTexto: "",
  notas: "",
  ejemplaresTexto: "",
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
    subtipo: item.subtipo || "juego_educativo",
    componentes: item.componentes || "",
    edadRecomendada: item.edadRecomendada || "",
    portadaUrl: item.portadaUrl || "",
    materiasTexto: (item.materias || []).join(", "),
    notas: item.notas || "",
    ejemplaresTexto: "",
  };
}

function mapFormADatos(form) {
  return {
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    subtipo: form.subtipo,
    componentes: form.componentes,
    edadRecomendada: form.edadRecomendada,
    portadaUrl: form.portadaUrl,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
  };
}

export default function MaterialDidactico() {
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
    listar: (pagina, porPagina, q) => api.listarMaterialDidacticoPaginado(pagina, porPagina, q),
    crear: (datos, form) => api.crearMaterialDidactico({ ...datos, ejemplares: aEjemplares(form.ejemplaresTexto) }),
    actualizar: (id, datos) => api.actualizarMaterialDidactico(id, datos),
    eliminar: (id) => api.eliminarMaterialDidactico(id),
    vacio: VACIO,
    porPagina: POR_PAGINA,
    mapEntidadAForm,
    mapFormADatos,
  });

  useEditarDesdeNavegacion(onEditar);

  return (
    <>
      <h1>Material didáctico</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar material didáctico" : "Nuevo material didáctico"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        <Campo nombre="titulo" etiqueta="Título (245$a) *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="subtitulo" etiqueta="Subtítulo (245$b)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="portadaUrl"
          etiqueta="URL de portada/imagen (opcional)"
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
        <Campo
          nombre="componentes"
          etiqueta="Componentes (qué incluye el kit/juego) (300$e)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="edadRecomendada" etiqueta="Edad recomendada (ej: 6-9 años) (521$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="materiasTexto"
          etiqueta="Materias (separadas por coma) (650$a)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <label>
          Notas (500$a)
          <textarea value={form.notas} onChange={(e) => onCambiarCampo("notas", e.target.value)} />
        </label>
        {editandoId ? (
          <p>
            <small>Los ejemplares no se editan acá — agregalos desde la carga inicial.</small>
          </p>
        ) : (
          <label>
            Ejemplares (uno por línea: código de barras, signatura) (952$p / $o)
            <textarea
              rows={3}
              placeholder={"BPDID-000001, JUE 001\nBPDID-000002, JUE 002"}
              value={form.ejemplaresTexto}
              onChange={(e) => onCambiarCampo("ejemplaresTexto", e.target.value)}
            />
            <small>
              Igual que en Libros: la coma separa el código de barras de la signatura <em>dentro de la misma
              línea</em> — cada línea nueva es un ejemplar distinto.
            </small>
          </label>
        )}
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
        Buscar por título
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Ej: rompecabezas mapa argentina"
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
                onClick={() => onEliminarSeleccionados("¿Eliminar los materiales didácticos seleccionados?")}
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
                <th>Ejemplares</th>
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
                  <td>{(item.ejemplares || []).length}</td>
                  <td>
                    <button className="secundario" onClick={() => onEditar(item)}>
                      Editar
                    </button>{" "}
                    <button
                      className="peligro"
                      onClick={() => onEliminar(item._id, "¿Eliminar este material didáctico?")}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    {busqueda
                      ? "Ningún material didáctico coincide con la búsqueda."
                      : "Todavía no cargaste ningún material didáctico."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
      <Pager pagina={pagina} porPagina={POR_PAGINA} total={total} onCambiar={setPagina} etiqueta="material didáctico" />
    </>
  );
}
