import React from "react";
import api from "../api.js";
import Pager from "../Pager.jsx";
import Campo from "../Campo.jsx";
import { useListaCrud } from "../useListaCrud.js";

const POR_PAGINA = 50;

// Catálogo simple de formas normalizadas de autor (ver BIBL-1 en
// AUDITORIA.md) — no toca ningún libro/seriada/etc. ya cargado: el OPAC
// usa esto para agrupar variantes del mismo nombre en el facetado
// ("Borges, Jorge Luis" y "Borges, J.L." como un solo autor), leyendo
// esta lista al momento de mostrar el catálogo, no al cargar los ítems.
const VACIO = {
  formaAutorizada: "",
  variantesTexto: "",
};

// Punto y coma, no coma: a diferencia de "materias" o listas simples, cada
// variante acá suele ser un nombre en formato "Apellido, Nombre" — la
// forma estándar bibliotecaria — que ya trae una coma adentro. Partir por
// coma simple rompería "Borges, J.L." en dos fragmentos ("Borges" y
// "J.L."). Mismo criterio de dos niveles que ya usa el resto de la app
// para ejemplares (`;` entre ítems, `,` permitido dentro de cada uno).
function aListaVariantes(texto) {
  return texto
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapEntidadAForm(autor) {
  return {
    formaAutorizada: autor.formaAutorizada || "",
    variantesTexto: (autor.variantes || []).join("; "),
  };
}

function mapFormADatos(form) {
  return {
    formaAutorizada: form.formaAutorizada,
    variantes: aListaVariantes(form.variantesTexto),
  };
}

export default function Autores() {
  const {
    items: autores,
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
    listar: (pagina, porPagina, q) => api.listarAutorPaginado(pagina, porPagina, q),
    crear: (datos) => api.crearAutor(datos),
    actualizar: (id, datos) => api.actualizarAutor(id, datos),
    eliminar: (id) => api.eliminarAutor(id),
    vacio: VACIO,
    porPagina: POR_PAGINA,
    mapEntidadAForm,
    mapFormADatos,
    etiquetaItem: (item) => item.formaAutorizada,
  });

  return (
    <>
      <h1>Autores</h1>
      <p>
        <small>
          Catálogo de formas normalizadas — no es obligatorio cargar acá a cada autor que catalogás. Sirve para
          que el OPAC agrupe variantes del mismo nombre (ej. "Borges, Jorge Luis" y "Borges, J.L.") como un solo
          autor en el filtro del catálogo público, sin tener que volver a editar los libros/seriadas/etc. ya
          cargados.
        </small>
      </p>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar autor" : "Nuevo autor"}</h2>
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
            placeholder="Borges, J.L.; Jorge Luis Borges"
          />
          <small>
            Punto y coma entre una variante y la siguiente — no coma, porque cada variante suele ser un nombre
            en formato "Apellido, Nombre" (ej. <code>Borges, J.L.; Jorge Luis Borges</code>).
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
          placeholder="Ej: Borges"
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
                onClick={() => onEliminarSeleccionados("¿Eliminar los autores seleccionados?")}
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
                    checked={autores.length > 0 && seleccionados.size === autores.length}
                    onChange={onToggleSeleccionTodos}
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th>Forma autorizada</th>
                <th>Variantes</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {autores.map((autor) => (
                <tr key={autor._id} className={eliminandoId === autor._id ? "saliendo" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccionados.has(autor._id)}
                      onChange={() => onToggleSeleccion(autor._id)}
                      aria-label={`Seleccionar ${autor.formaAutorizada}`}
                    />
                  </td>
                  <td>{autor.formaAutorizada}</td>
                  <td>{(autor.variantes || []).join(", ")}</td>
                  <td>
                    <button className="secundario" onClick={() => onEditar(autor)}>
                      Editar
                    </button>{" "}
                    <button className="peligro" onClick={() => onEliminar(autor._id, "¿Eliminar este autor?")}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {autores.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    {busqueda ? "Ningún autor coincide con la búsqueda." : "Todavía no cargaste ningún autor."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
      <Pager pagina={pagina} porPagina={POR_PAGINA} total={total} onCambiar={setPagina} etiqueta="autores" />
    </>
  );
}
