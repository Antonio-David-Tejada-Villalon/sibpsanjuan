import React from "react";
import api from "../api.js";
import Pager from "../Pager.jsx";
import Campo from "../Campo.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { useEditarDesdeNavegacion } from "../useEditarDesdeNavegacion.js";
import { aEjemplares } from "../ejemplaresTexto.js";

const POR_PAGINA = 50;

const PERIODICIDADES = [
  { valor: "diaria", etiqueta: "Diaria" },
  { valor: "semanal", etiqueta: "Semanal" },
  { valor: "quincenal", etiqueta: "Quincenal" },
  { valor: "mensual", etiqueta: "Mensual" },
  { valor: "bimestral", etiqueta: "Bimestral" },
  { valor: "trimestral", etiqueta: "Trimestral" },
  { valor: "cuatrimestral", etiqueta: "Cuatrimestral" },
  { valor: "semestral", etiqueta: "Semestral" },
  { valor: "anual", etiqueta: "Anual" },
  { valor: "irregular", etiqueta: "Irregular" },
];

const VACIO = {
  issn: "",
  titulo: "",
  subtitulo: "",
  autoresTexto: "",
  editorial: "",
  lugarPublicacion: "",
  periodicidad: "irregular",
  numeracionInicial: "",
  anioInicio: "",
  anioFin: "",
  materiasTexto: "",
  notas: "",
  portadaUrl: "",
  ejemplaresTexto: "",
};

function aLista(texto) {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Punto y coma, no coma: ver el mismo comentario en Libros.jsx (BIBL-5 en
// AUDITORIA.md) — una entidad responsable puede traer una coma adentro.
function aListaAutores(texto) {
  return texto
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapEntidadAForm(seriada) {
  return {
    issn: seriada.issn || "",
    titulo: seriada.titulo || "",
    subtitulo: seriada.subtitulo || "",
    autoresTexto: (seriada.autores || []).join("; "),
    editorial: seriada.editorial || "",
    lugarPublicacion: seriada.lugarPublicacion || "",
    periodicidad: seriada.periodicidad || "irregular",
    numeracionInicial: seriada.numeracionInicial || "",
    anioInicio: seriada.anioInicio || "",
    anioFin: seriada.anioFin || "",
    materiasTexto: (seriada.materias || []).join(", "),
    notas: seriada.notas || "",
    portadaUrl: seriada.portadaUrl || "",
    ejemplaresTexto: "",
  };
}

function mapFormADatos(form) {
  return {
    issn: form.issn,
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    autores: aListaAutores(form.autoresTexto),
    editorial: form.editorial,
    lugarPublicacion: form.lugarPublicacion,
    periodicidad: form.periodicidad,
    numeracionInicial: form.numeracionInicial,
    anioInicio: form.anioInicio,
    anioFin: form.anioFin,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
    portadaUrl: form.portadaUrl,
  };
}

export default function Seriadas() {
  const {
    items: seriadas,
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
    listar: (pagina, porPagina, q) => api.listarSeriadasPaginado(pagina, porPagina, q),
    crear: (datos, form) => api.crearSeriada({ ...datos, ejemplares: aEjemplares(form.ejemplaresTexto) }),
    actualizar: (id, datos) => api.actualizarSeriada(id, datos),
    eliminar: (id) => api.eliminarSeriada(id),
    vacio: VACIO,
    porPagina: POR_PAGINA,
    mapEntidadAForm,
    mapFormADatos,
  });

  useEditarDesdeNavegacion(onEditar);

  return (
    <>
      <h1>Publicaciones seriadas</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar publicación seriada" : "Nueva publicación seriada"}</h2>
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
          nombre="autoresTexto"
          etiqueta="Entidad(es) responsable(s) (separadas por punto y coma) (710$a)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <p>
          <small>
            Punto y coma entre una entidad y la siguiente — no coma, porque el nombre de una entidad puede traer
            una coma adentro.
          </small>
        </p>
        <Campo nombre="issn" etiqueta="ISSN (022$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="editorial" etiqueta="Editorial (260$b)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="lugarPublicacion" etiqueta="Lugar de publicación (260$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="periodicidad"
          etiqueta="Periodicidad (310$a)"
          tipo="select"
          opciones={PERIODICIDADES}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo
          nombre="numeracionInicial"
          etiqueta="Numeración inicial (ej: Vol. 1, no. 1) (362$a)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="anioInicio" etiqueta="Año de inicio (362$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="anioFin"
          etiqueta="Año de cierre (vacío si sigue publicándose) (362$a)"
          form={form}
          onCambiar={onCambiarCampo}
        />
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
            <small>
              Los ejemplares no se editan acá — agregalos desde la carga inicial.
            </small>
          </p>
        ) : (
          <label>
            Ejemplares (uno por línea: código de barras, signatura) (952$p / $o)
            <textarea
              rows={3}
              placeholder={"BPSJ-R-000001, 2024 v.1\nBPSJ-R-000002, 2024 v.2"}
              value={form.ejemplaresTexto}
              onChange={(e) => onCambiarCampo("ejemplaresTexto", e.target.value)}
            />
            <small>
              Igual que en Libros: la coma separa el código de barras de la signatura <em>dentro de la misma
              línea</em> — cada línea nueva es un ejemplar (fascículo/volumen) distinto.
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
        Buscar por título, entidad responsable o ISSN
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Ej: Boletín, o 1234-5678"
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
                onClick={() => onEliminarSeleccionados("¿Eliminar las publicaciones seriadas seleccionadas?")}
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
                    checked={seriadas.length > 0 && seleccionados.size === seriadas.length}
                    onChange={onToggleSeleccionTodos}
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th>Título</th>
                <th>Periodicidad</th>
                <th>Ejemplares</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {seriadas.map((seriada) => (
                <tr key={seriada._id} className={eliminandoId === seriada._id ? "saliendo" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccionados.has(seriada._id)}
                      onChange={() => onToggleSeleccion(seriada._id)}
                      aria-label={`Seleccionar ${seriada.titulo}`}
                    />
                  </td>
                  <td>{seriada.titulo}</td>
                  <td>{seriada.periodicidad}</td>
                  <td>{(seriada.ejemplares || []).length}</td>
                  <td>
                    <button className="secundario" onClick={() => onEditar(seriada)}>
                      Editar
                    </button>{" "}
                    <button
                      className="peligro"
                      onClick={() => onEliminar(seriada._id, "¿Eliminar esta publicación seriada?")}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {seriadas.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    {busqueda
                      ? "Ninguna publicación seriada coincide con la búsqueda."
                      : "Todavía no cargaste ninguna publicación seriada."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
      <Pager pagina={pagina} porPagina={POR_PAGINA} total={total} onCambiar={setPagina} etiqueta="publicaciones seriadas" />
    </>
  );
}
