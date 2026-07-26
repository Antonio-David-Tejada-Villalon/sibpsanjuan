import React, { useState } from "react";
import api from "../api.js";
import Pager from "../Pager.jsx";
import Campo from "../Campo.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { aEjemplares } from "../ejemplaresTexto.js";

const POR_PAGINA = 50;

const SUBTIPOS_LIBRO = [
  { valor: "impreso", etiqueta: "Impreso" },
  { valor: "digital", etiqueta: "Digital" },
  { valor: "ebook", etiqueta: "Ebook" },
  { valor: "folleto", etiqueta: "Folleto" },
  { valor: "manual", etiqueta: "Manual" },
  { valor: "diccionario", etiqueta: "Diccionario" },
  { valor: "enciclopedia", etiqueta: "Enciclopedia" },
  { valor: "tesis", etiqueta: "Tesis" },
  { valor: "tesina", etiqueta: "Tesina" },
  { valor: "monografia", etiqueta: "Monografía" },
  { valor: "atlas", etiqueta: "Atlas" },
  { valor: "anuario", etiqueta: "Anuario" },
  { valor: "memoria", etiqueta: "Memoria institucional" },
  { valor: "informe", etiqueta: "Informe" },
];

const VACIO = {
  isbn: "",
  titulo: "",
  subtitulo: "",
  autoresTexto: "",
  editorial: "",
  lugarPublicacion: "",
  anio: "",
  paginas: "",
  materiasTexto: "",
  notas: "",
  subtipo: "impreso",
  urlAcceso: "",
  portadaUrl: "",
  ejemplaresTexto: "",
  ejemplaresExistentes: [],
};

function aLista(texto) {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Punto y coma, no coma: a diferencia de "materias", cada autor acá suele
// venir en formato "Apellido, Nombre" — la forma estándar bibliotecaria —
// que ya trae una coma adentro. Partir por coma simple rompía "Borges,
// Jorge Luis" en dos fragmentos apenas había un segundo autor en el mismo
// campo (ver BIBL-5 en AUDITORIA.md). La carga masiva por CSV ya usaba
// este mismo criterio (`;` dentro de la celda) — esto solo alinea el
// alta/edición individual con lo que el CSV ya hacía bien.
function aListaAutores(texto) {
  return texto
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapEntidadAForm(libro) {
  return {
    isbn: libro.isbn || "",
    titulo: libro.titulo || "",
    subtitulo: libro.subtitulo || "",
    autoresTexto: (libro.autores || []).join("; "),
    editorial: libro.editorial || "",
    lugarPublicacion: libro.lugarPublicacion || "",
    anio: libro.anio || "",
    paginas: libro.paginas || "",
    materiasTexto: (libro.materias || []).join(", "),
    notas: libro.notas || "",
    subtipo: libro.subtipo || "impreso",
    urlAcceso: libro.urlAcceso || "",
    portadaUrl: libro.portadaUrl || "",
    ejemplaresTexto: "",
    // Solo para mostrarlos (de solo lectura) mientras se edita — no se
    // manda de vuelta al servidor (ver mapFormADatos, que no la incluye).
    ejemplaresExistentes: libro.ejemplares || [],
  };
}

function mapFormADatos(form) {
  return {
    isbn: form.isbn,
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    autores: aListaAutores(form.autoresTexto),
    editorial: form.editorial,
    lugarPublicacion: form.lugarPublicacion,
    anio: form.anio,
    paginas: form.paginas,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
    subtipo: form.subtipo,
    urlAcceso: form.urlAcceso,
    portadaUrl: form.portadaUrl,
  };
}

// Carga masiva por CSV: una fila por libro, con sus ejemplares (columna
// "ejemplares" — ver backend/src/utils/importarLibrosCsv.js). No sube el
// archivo tal cual: lo lee en el navegador con FileReader y manda el texto
// ya parseado, para no tener que sumar multipart/form-data a este backend
// (que hoy solo habla JSON).
function CargaMasivaLibros({ onImportado }) {
  const [archivo, setArchivo] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  async function onImportar() {
    if (!archivo) return;
    setError("");
    setResultado(null);
    setProcesando(true);
    try {
      const texto = await archivo.text();
      const r = await api.importarLibrosCsv(texto);
      setResultado(r);
      if (r.creados > 0) await onImportado();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <details className="card" id="carga-masiva-csv">
      <summary>Carga masiva desde CSV/Excel</summary>
      <p>
        <a href={api.urlPlantillaLibrosCsv()}>Descargar plantilla CSV</a> — abrila y editala con Excel, Google
        Sheets o similar (dejá la primera fila de encabezados tal cual). Autores y materias van separados por
        punto y coma (;) dentro de la misma celda. La columna "ejemplares" también: cada ejemplar es código de
        barras y signatura separados por coma, y punto y coma entre un ejemplar y el siguiente — ej.{" "}
        <code>BPSJ-000001,863 BOR;BPSJ-000002,863 BOR</code>.
      </p>
      <label>
        Archivo CSV completado
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] || null);
            setResultado(null);
            setError("");
          }}
        />
      </label>
      {error && <div className="flash error" role="alert">{error}</div>}
      {resultado && (
        <div className={resultado.creados > 0 ? "flash ok" : "flash error"} role="status">
          {resultado.creados} libro(s) cargado(s).
          {resultado.avisos?.length > 0 && (
            <>
              <p>Se cargaron igual, pero revisá esto:</p>
              <ul>
                {resultado.avisos.map((a, i) => (
                  <li key={i}>
                    Fila {a.fila}: {a.mensaje}
                  </li>
                ))}
              </ul>
            </>
          )}
          {resultado.errores.length > 0 && (
            <>
              <p>No se pudieron cargar estas filas:</p>
              <ul>
                {resultado.errores.map((e, i) => (
                  <li key={i}>
                    Fila {e.fila}: {e.mensaje}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <button type="button" onClick={onImportar} disabled={!archivo || procesando}>
        {procesando ? "Importando…" : "Importar"}
      </button>
    </details>
  );
}

// Una fila editable por ejemplar (mientras se edita el libro): muestra
// código de barras/signatura/estado de solo lectura, con "Editar" que la
// convierte en dos inputs + Guardar/Cancelar, y "Eliminar" (deshabilitado
// si no está "disponible" — el backend rechaza igual, esto solo evita el
// viaje al servidor para un caso que ya se sabe que va a fallar).
function FilaEjemplar({ libroId, ejemplar, onCambiar, onEliminar }) {
  const [editando, setEditando] = useState(false);
  const [codigoBarras, setCodigoBarras] = useState(ejemplar.codigoBarras);
  const [signatura, setSignatura] = useState(ejemplar.signatura || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function onGuardar() {
    setGuardando(true);
    setError("");
    try {
      const actualizado = await api.actualizarEjemplarLibro(libroId, ejemplar._id, { codigoBarras, signatura });
      onCambiar(actualizado);
      setEditando(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function onBorrar() {
    if (!confirm(`¿Eliminar el ejemplar ${ejemplar.codigoBarras}?`)) return;
    setError("");
    try {
      await api.eliminarEjemplarLibro(libroId, ejemplar._id);
      onEliminar();
    } catch (err) {
      setError(err.message);
    }
  }

  if (editando) {
    return (
      <li>
        <div className="fila-ejemplar-edicion">
          <input
            value={codigoBarras}
            onChange={(e) => setCodigoBarras(e.target.value)}
            aria-label="Código de barras"
          />
          <input value={signatura} onChange={(e) => setSignatura(e.target.value)} aria-label="Signatura" />
          <button type="button" onClick={onGuardar} disabled={guardando || !codigoBarras.trim()}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>{" "}
          <button type="button" className="secundario" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
        {error && <div className="flash error" role="alert">{error}</div>}
      </li>
    );
  }

  return (
    <li>
      <code>{ejemplar.codigoBarras}</code>
      {ejemplar.signatura && <> — {ejemplar.signatura}</>} <span className="pill-estado">{ejemplar.estado}</span>{" "}
      <button type="button" className="secundario" onClick={() => setEditando(true)}>
        Editar
      </button>{" "}
      <button
        type="button"
        className="peligro"
        onClick={onBorrar}
        disabled={ejemplar.estado !== "disponible"}
        title={ejemplar.estado !== "disponible" ? "Solo se puede eliminar un ejemplar disponible" : undefined}
      >
        Eliminar
      </button>
      {error && <div className="flash error" role="alert">{error}</div>}
    </li>
  );
}

// Alta de un ejemplar nuevo directamente desde la edición del libro (antes
// solo se podían agregar ejemplares en la carga inicial).
function FormularioNuevoEjemplar({ libroId, onAgregado }) {
  const [codigoBarras, setCodigoBarras] = useState("");
  const [signatura, setSignatura] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function onAgregar() {
    if (!codigoBarras.trim()) return;
    setGuardando(true);
    setError("");
    try {
      const [creado] = await api.agregarEjemplaresLibro(libroId, [
        { codigoBarras: codigoBarras.trim(), signatura: signatura.trim() },
      ]);
      onAgregado(creado);
      setCodigoBarras("");
      setSignatura("");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  // div, no <form>: esto vive DENTRO del <form> de edición del libro más
  // abajo, y un <form> anidado es HTML inválido — el navegador lo "abre" y
  // su botón termina enviando el formulario de afuera (guarda el libro Y
  // sale del modo edición) en vez de solo agregar el ejemplar.
  return (
    <div className="formulario-nuevo-ejemplar">
      {error && <div className="flash error" role="alert">{error}</div>}
      <label>
        Código de barras
        <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} />
      </label>
      <label>
        Signatura
        <input value={signatura} onChange={(e) => setSignatura(e.target.value)} />
      </label>
      <button type="button" onClick={onAgregar} disabled={guardando || !codigoBarras.trim()}>
        {guardando ? "Agregando…" : "Agregar ejemplar"}
      </button>
    </div>
  );
}

export default function Libros() {
  const {
    items: libros,
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
    recargar,
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
    listar: (pagina, porPagina, q) => api.listarLibrosPaginado(pagina, porPagina, q),
    crear: (datos, form) => api.crearLibro({ ...datos, ejemplares: aEjemplares(form.ejemplaresTexto) }),
    actualizar: (id, datos) => api.actualizarLibro(id, datos),
    eliminar: (id) => api.eliminarLibro(id),
    vacio: VACIO,
    porPagina: POR_PAGINA,
    mapEntidadAForm,
    mapFormADatos,
  });

  return (
    <>
      <h1>Libros</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar libro" : "Nuevo libro"}</h2>
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
          etiqueta="Autores (separados por punto y coma) (100$a / 700$a)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <p>
          <small>
            Punto y coma entre un autor y el siguiente — no coma, porque cada autor suele ir en formato
            "Apellido, Nombre" (ej. <code>Borges, Jorge Luis; Cortázar, Julio</code>).
          </small>
        </p>
        <Campo nombre="isbn" etiqueta="ISBN (020$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="editorial" etiqueta="Editorial (260$b)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="lugarPublicacion" etiqueta="Lugar de publicación (260$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="anio" etiqueta="Año (260$c)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="paginas" etiqueta="Páginas (300$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="materiasTexto"
          etiqueta="Materias (separadas por coma) (650$a)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo
          nombre="subtipo"
          etiqueta="Subtipo"
          tipo="select"
          opciones={SUBTIPOS_LIBRO}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo
          nombre="urlAcceso"
          etiqueta="URL de acceso (opcional) (856$u)"
          type="url"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <p>
          <small>
            Un libro puede tener ejemplares físicos y además una URL de acceso digital al mismo tiempo — el
            OPAC muestra las dos opciones si corresponde, no hace falta elegir una sola.
          </small>
        </p>
        <label>
          Notas (500$a)
          <textarea value={form.notas} onChange={(e) => onCambiarCampo("notas", e.target.value)} />
        </label>
        {editandoId ? (
          <div>
            <label>Ejemplares (952$p / $o)</label>
            {form.ejemplaresExistentes.length > 0 ? (
              <ul className="lista-ejemplares">
                {form.ejemplaresExistentes.map((e) => (
                  <FilaEjemplar
                    key={e._id}
                    libroId={editandoId}
                    ejemplar={e}
                    onCambiar={(actualizado) =>
                      onCambiarCampo(
                        "ejemplaresExistentes",
                        form.ejemplaresExistentes.map((x) => (x._id === actualizado._id ? actualizado : x))
                      )
                    }
                    onEliminar={() =>
                      onCambiarCampo(
                        "ejemplaresExistentes",
                        form.ejemplaresExistentes.filter((x) => x._id !== e._id)
                      )
                    }
                  />
                ))}
              </ul>
            ) : (
              <p>
                <small>Este libro todavía no tiene ejemplares cargados.</small>
              </p>
            )}
            <FormularioNuevoEjemplar
              libroId={editandoId}
              onAgregado={(nuevo) =>
                onCambiarCampo("ejemplaresExistentes", [...form.ejemplaresExistentes, nuevo])
              }
            />
          </div>
        ) : (
          <label>
            Ejemplares (uno por línea: código de barras, signatura) (952$p / $o)
            <textarea
              rows={3}
              placeholder={"BPSJ-000001, 863 BOR\nBPSJ-000002, 863 BOR"}
              value={form.ejemplaresTexto}
              onChange={(e) => onCambiarCampo("ejemplaresTexto", e.target.value)}
            />
            <small>
              A diferencia de Autores/Materias (donde la coma separa cada ítem de la lista), acá la coma separa
              el código de barras de la signatura <em>dentro de la misma línea</em> — cada línea nueva es un
              ejemplar distinto.
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

      <CargaMasivaLibros onImportado={recargar} />

      <label>
        Buscar por título, autor o ISBN
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Ej: Borges, o 978..."
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
                onClick={() => onEliminarSeleccionados("¿Eliminar los libros seleccionados?")}
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
                    checked={libros.length > 0 && seleccionados.size === libros.length}
                    onChange={onToggleSeleccionTodos}
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th>Título</th>
                <th>Autores</th>
                <th>Año</th>
                <th>Ejemplares</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {libros.map((libro) => (
                <tr key={libro._id} className={eliminandoId === libro._id ? "saliendo" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccionados.has(libro._id)}
                      onChange={() => onToggleSeleccion(libro._id)}
                      aria-label={`Seleccionar ${libro.titulo}`}
                    />
                  </td>
                  <td>{libro.titulo}</td>
                  <td>{(libro.autores || []).join(", ")}</td>
                  <td>{libro.anio}</td>
                  <td>{(libro.ejemplares || []).length}</td>
                  <td>
                    <button className="secundario" onClick={() => onEditar(libro)}>
                      Editar
                    </button>{" "}
                    <button className="peligro" onClick={() => onEliminar(libro._id, "¿Eliminar este libro?")}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {libros.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    {busqueda ? (
                      "Ningún libro coincide con la búsqueda."
                    ) : (
                      <>
                        Todavía no cargaste ningún libro. Si tenés varios, probá la{" "}
                        <a
                          href="#carga-masiva-csv"
                          onClick={() => {
                            const detalle = document.getElementById("carga-masiva-csv");
                            if (detalle) detalle.open = true;
                          }}
                        >
                          carga masiva desde CSV/Excel
                        </a>
                        .
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
      <Pager pagina={pagina} porPagina={POR_PAGINA} total={total} onCambiar={setPagina} etiqueta="libros" />
    </>
  );
}
