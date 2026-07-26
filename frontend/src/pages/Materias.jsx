import React from "react";
import api from "../api.js";
import Pager from "../Pager.jsx";
import Campo from "../Campo.jsx";
import { useListaCrud } from "../useListaCrud.js";

const POR_PAGINA = 50;

// Catálogo simple de formas normalizadas de materia (ver BIBL-3 en
// AUDITORIA.md) — mismo criterio que Autores.jsx (BIBL-1): no toca ningún
// libro/seriada/etc. ya cargado. El OPAC usa esto para agrupar variantes de
// la misma materia en el facetado ("Historia argentina" e "Historia de la
// Argentina" como una sola), leyendo esta lista al momento de mostrar el
// catálogo, no al cargar los ítems.
const VACIO = {
  formaAutorizada: "",
  variantesTexto: "",
};

// Punto y coma entre variantes (mismo criterio de dos niveles que Autores.jsx
// — ver BIBL-5 en AUDITORIA.md): un encabezado de materia invertido puede
// traer una coma adentro (ej. "Argentina, Historia de"), así que partir por
// coma simple podría romperlo.
function aListaVariantes(texto) {
  return texto
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapEntidadAForm(materia) {
  return {
    formaAutorizada: materia.formaAutorizada || "",
    variantesTexto: (materia.variantes || []).join("; "),
  };
}

function mapFormADatos(form) {
  return {
    formaAutorizada: form.formaAutorizada,
    variantes: aListaVariantes(form.variantesTexto),
  };
}

export default function Materias() {
  const {
    items: materias,
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
    listar: (pagina, porPagina, q) => api.listarMateriaPaginado(pagina, porPagina, q),
    crear: (datos) => api.crearMateria(datos),
    actualizar: (id, datos) => api.actualizarMateria(id, datos),
    eliminar: (id) => api.eliminarMateria(id),
    vacio: VACIO,
    porPagina: POR_PAGINA,
    mapEntidadAForm,
    mapFormADatos,
    etiquetaItem: (item) => item.formaAutorizada,
  });

  return (
    <>
      <h1>Materias</h1>
      <p>
        <small>
          Catálogo de formas normalizadas — no es obligatorio cargar acá a cada materia que catalogás. Sirve para
          que el OPAC agrupe variantes de la misma materia (ej. "Historia argentina" e "Historia de la Argentina")
          como una sola en el filtro del catálogo público, sin tener que volver a editar los libros/seriadas/etc.
          ya cargados.
        </small>
      </p>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar materia" : "Nueva materia"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        <Campo
          nombre="formaAutorizada"
          etiqueta="Forma autorizada *"
          form={form}
          onCambiar={onCambiarCampo}
          required
        />
        <label>
          Variantes (separadas por punto y coma)
          <input
            value={form.variantesTexto}
            onChange={(e) => onCambiarCampo("variantesTexto", e.target.value)}
            placeholder="Historia de la Argentina; Argentina - Historia"
          />
          <small>
            Punto y coma entre una variante y la siguiente (ej.{" "}
            <code>Historia de la Argentina; Argentina - Historia</code>).
          </small>
        </label>
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
        Buscar por forma autorizada o variante
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Ej: Historia"
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
                onClick={() => onEliminarSeleccionados("¿Eliminar las materias seleccionadas?")}
                disabled={eliminandoSeleccion}
              >
                {eliminandoSeleccion ? "Eliminando…" : "Eliminar seleccionadas"}
              </button>
            </div>
          )}
          <table>
            <caption className="sr-only">
              Podés tildar más de una fila para actuar sobre varias a la vez con "Eliminar seleccionadas".
            </caption>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={materias.length > 0 && seleccionados.size === materias.length}
                    onChange={onToggleSeleccionTodos}
                    aria-label="Seleccionar todas"
                  />
                </th>
                <th>Forma autorizada</th>
                <th>Variantes</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {materias.map((materia) => (
                <tr key={materia._id} className={eliminandoId === materia._id ? "saliendo" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccionados.has(materia._id)}
                      onChange={() => onToggleSeleccion(materia._id)}
                      aria-label={`Seleccionar ${materia.formaAutorizada}`}
                    />
                  </td>
                  <td>{materia.formaAutorizada}</td>
                  <td>{(materia.variantes || []).join(", ")}</td>
                  <td>
                    <button className="secundario" onClick={() => onEditar(materia)}>
                      Editar
                    </button>{" "}
                    <button className="peligro" onClick={() => onEliminar(materia._id, "¿Eliminar esta materia?")}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {materias.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    {busqueda ? "Ninguna materia coincide con la búsqueda." : "Todavía no cargaste ninguna materia."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
      <Pager pagina={pagina} porPagina={POR_PAGINA} total={total} onCambiar={setPagina} etiqueta="materias" />
    </>
  );
}
