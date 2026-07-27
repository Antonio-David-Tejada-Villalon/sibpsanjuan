import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import Pager from "../Pager.jsx";
import ListaColapsable from "../ListaColapsable.jsx";
import FichaIsbdModal from "../FichaIsbd.jsx";
import { useAvisoCargaLenta } from "../useAvisoCargaLenta.js";

const POR_PAGINA = 25;
const NOTA_RECUPERABLE = "Queda guardado y se puede restaurar desde la base de datos si hace falta.";

function autoresTexto(item) {
  return (item.autores || []).join(", ");
}

// Un tipo por entrada, mismo criterio que CONFIG_TIPOS de
// opac/CatalogoPublico.jsx — acá con las funciones de listar/eliminar del
// lado staff (siempre el documento completo, no la versión recortada que
// expone el OPAC) y la ruta de edición de cada tipo, para el botón
// "Editar" (ver useEditarDesdeNavegacion.js). `circula` distingue los 8
// tipos con ejemplares físicos de Archivo/Objeto (piezas únicas, sin
// disponibilidad que mostrar).
const CONFIG_TIPOS = [
  {
    itemTipo: "Libro",
    etiquetaTipo: "Libro",
    rutaEdicion: "/libros",
    circula: true,
    listar: () => api.listarLibros(),
    eliminar: (id) => api.eliminarLibro(id),
    extra: autoresTexto,
  },
  {
    itemTipo: "Seriada",
    etiquetaTipo: "Publicación seriada",
    rutaEdicion: "/seriadas",
    circula: true,
    listar: () => api.listarSeriadas(),
    eliminar: (id) => api.eliminarSeriada(id),
    extra: autoresTexto,
  },
  {
    itemTipo: "RecursoElectronico",
    etiquetaTipo: "Recurso electrónico",
    rutaEdicion: "/recursos-electronicos",
    circula: false,
    listar: () => api.listarRecursosElectronicos(),
    eliminar: (id) => api.eliminarRecursoElectronico(id),
    extra: autoresTexto,
  },
  {
    itemTipo: "MaterialSonoro",
    etiquetaTipo: "Material sonoro",
    rutaEdicion: "/material-sonoro",
    circula: true,
    listar: () => api.listarMaterialSonoro(),
    eliminar: (id) => api.eliminarMaterialSonoro(id),
    extra: autoresTexto,
  },
  {
    itemTipo: "MaterialAudiovisual",
    etiquetaTipo: "Material audiovisual",
    rutaEdicion: "/material-audiovisual",
    circula: true,
    listar: () => api.listarMaterialAudiovisual(),
    eliminar: (id) => api.eliminarMaterialAudiovisual(id),
    extra: autoresTexto,
  },
  {
    itemTipo: "MaterialCartografico",
    etiquetaTipo: "Material cartográfico",
    rutaEdicion: "/material-cartografico",
    circula: true,
    listar: () => api.listarMaterialCartografico(),
    eliminar: (id) => api.eliminarMaterialCartografico(id),
    extra: autoresTexto,
  },
  {
    itemTipo: "MaterialGrafico",
    etiquetaTipo: "Material gráfico",
    rutaEdicion: "/material-grafico",
    circula: true,
    listar: () => api.listarMaterialGrafico(),
    eliminar: (id) => api.eliminarMaterialGrafico(id),
    extra: autoresTexto,
  },
  {
    itemTipo: "MaterialDidactico",
    etiquetaTipo: "Material didáctico",
    rutaEdicion: "/material-didactico",
    circula: true,
    listar: () => api.listarMaterialDidactico(),
    eliminar: (id) => api.eliminarMaterialDidactico(id),
    extra: (i) => i.subtipo,
  },
  {
    itemTipo: "Archivo",
    etiquetaTipo: "Archivo",
    rutaEdicion: "/archivos",
    circula: false,
    listar: () => api.listarArchivo(),
    eliminar: (id) => api.eliminarArchivo(id),
    extra: (i) => i.nivelDescripcion,
  },
  {
    itemTipo: "Objeto",
    etiquetaTipo: "Objeto de museo",
    rutaEdicion: "/objetos",
    circula: false,
    listar: () => api.listarObjeto(),
    eliminar: (id) => api.eliminarObjeto(id),
    extra: (i) => i.subtipo,
  },
];

const CONFIG_POR_TIPO = new Map(CONFIG_TIPOS.map((t) => [t.itemTipo, t]));

function anioOPeriodo(item) {
  return item.anio || item.fechaInicio || item.periodo || "";
}

function ejemplaresTexto(entrada) {
  const { item, circula } = entrada;
  if (!circula) return "—";
  const total = (item.ejemplares || []).length;
  if (total === 0) return "0";
  const disponibles = item.ejemplares.filter((e) => e.estado === "disponible").length;
  return `${disponibles}/${total}`;
}

function claveSeleccion(entrada) {
  return `${entrada.item.itemTipo}:${entrada.item._id}`;
}

export default function BuscarCatalogo() {
  const navigate = useNavigate();
  const tardando = useAvisoCargaLenta();
  const [todos, setTodos] = useState(null); // null = cargando
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [avanzadaAbierta, setAvanzadaAbierta] = useState(false);
  const [avanzada, setAvanzada] = useState({ titulo: "", autor: "", materia: "", isbnIssn: "", anio: "" });

  const [tiposActivos, setTiposActivos] = useState(() => new Set(CONFIG_TIPOS.map((t) => t.itemTipo)));
  const [autoresActivos, setAutoresActivos] = useState(() => new Set());
  const [materiasActivas, setMateriasActivas] = useState(() => new Set());

  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [eliminandoSeleccion, setEliminandoSeleccion] = useState(false);
  const [eliminandoClave, setEliminandoClave] = useState(null);
  const [fichaAbierta, setFichaAbierta] = useState(null);
  const [pagina, setPagina] = useState(1);

  async function recargar() {
    const listas = await Promise.all(
      CONFIG_TIPOS.map(({ itemTipo, etiquetaTipo, rutaEdicion, circula, extra, listar }) =>
        listar().then((items) =>
          items.map((item) => ({
            item: { ...item, itemTipo },
            itemTipo,
            etiquetaTipo,
            rutaEdicion,
            circula,
            extraTexto: extra(item),
          }))
        )
      )
    );
    setTodos(listas.flat());
  }

  useEffect(() => {
    setTodos(null);
    setError("");
    recargar().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conteoPorTipo = useMemo(() => {
    const conteo = new Map();
    for (const t of CONFIG_TIPOS) conteo.set(t.itemTipo, 0);
    for (const e of todos || []) conteo.set(e.itemTipo, (conteo.get(e.itemTipo) || 0) + 1);
    return conteo;
  }, [todos]);

  const autoresDisponibles = useMemo(() => {
    const conteo = new Map();
    for (const e of todos || []) {
      for (const a of e.item.autores || []) conteo.set(a, (conteo.get(a) || 0) + 1);
    }
    return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [todos]);

  const materiasDisponibles = useMemo(() => {
    const conteo = new Map();
    for (const e of todos || []) {
      for (const m of e.item.materias || []) conteo.set(m, (conteo.get(m) || 0) + 1);
    }
    return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [todos]);

  function onToggleTipo(itemTipo) {
    setTiposActivos((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(itemTipo)) nuevo.delete(itemTipo);
      else nuevo.add(itemTipo);
      return nuevo;
    });
  }
  function onToggleAutor(autor) {
    setAutoresActivos((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(autor)) nuevo.delete(autor);
      else nuevo.add(autor);
      return nuevo;
    });
  }
  function onToggleMateria(materia) {
    setMateriasActivas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(materia)) nuevo.delete(materia);
      else nuevo.add(materia);
      return nuevo;
    });
  }

  const resultados = useMemo(() => {
    if (!todos) return [];
    const q = busqueda.trim().toLowerCase();
    const fTitulo = avanzada.titulo.trim().toLowerCase();
    const fAutor = avanzada.autor.trim().toLowerCase();
    const fMateria = avanzada.materia.trim().toLowerCase();
    const fIsbn = avanzada.isbnIssn.trim().toLowerCase();
    const fAnio = avanzada.anio.trim();

    const filtrados = todos.filter((e) => {
      if (!tiposActivos.has(e.itemTipo)) return false;
      if (autoresActivos.size > 0 && !(e.item.autores || []).some((a) => autoresActivos.has(a))) return false;
      if (materiasActivas.size > 0 && !(e.item.materias || []).some((m) => materiasActivas.has(m))) return false;

      if (q) {
        const texto = `${e.item.titulo} ${e.item.subtitulo || ""} ${autoresTexto(e.item)} ${(e.item.materias || []).join(" ")} ${e.item.isbn || ""} ${e.item.issn || ""}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      if (fTitulo && !`${e.item.titulo} ${e.item.subtitulo || ""}`.toLowerCase().includes(fTitulo)) return false;
      if (fAutor && !autoresTexto(e.item).toLowerCase().includes(fAutor)) return false;
      if (fMateria && !(e.item.materias || []).some((m) => m.toLowerCase().includes(fMateria))) return false;
      if (fIsbn && !`${e.item.isbn || ""} ${e.item.issn || ""}`.toLowerCase().includes(fIsbn)) return false;
      if (fAnio && String(anioOPeriodo(e.item)).toLowerCase() !== fAnio.toLowerCase()) return false;
      return true;
    });

    return [...filtrados].sort((a, b) => a.item.titulo.localeCompare(b.item.titulo));
  }, [todos, busqueda, avanzada, tiposActivos, autoresActivos, materiasActivas]);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, avanzada, tiposActivos, autoresActivos, materiasActivas]);

  const resultadosPagina = useMemo(
    () => resultados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
    [resultados, pagina]
  );

  function onCambiarAvanzada(campo, valor) {
    setAvanzada((actual) => ({ ...actual, [campo]: valor }));
  }

  function onToggleSeleccion(clave) {
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });
  }

  function onToggleSeleccionTodos() {
    setSeleccionados((actual) =>
      actual.size === resultadosPagina.length ? new Set() : new Set(resultadosPagina.map(claveSeleccion))
    );
  }

  function onEditar(entrada) {
    navigate(entrada.rutaEdicion, { state: { editar: entrada.item } });
  }

  async function onEliminar(entrada) {
    if (!confirm(`¿Eliminar "${entrada.item.titulo}"? ${NOTA_RECUPERABLE}`)) return;
    const clave = claveSeleccion(entrada);
    setError("");
    setEliminandoClave(clave);
    try {
      await CONFIG_POR_TIPO.get(entrada.itemTipo).eliminar(entrada.item._id);
      await recargar();
      setSeleccionados((actual) => {
        const nuevo = new Set(actual);
        nuevo.delete(clave);
        return nuevo;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setEliminandoClave(null);
    }
  }

  async function onEliminarSeleccionados() {
    if (seleccionados.size === 0) return;
    const entradas = resultados.filter((e) => seleccionados.has(claveSeleccion(e)));
    const LIMITE_LISTADO = 10;
    const etiquetas = entradas.map((e) => e.item.titulo);
    const detalle = etiquetas
      .slice(0, LIMITE_LISTADO)
      .map((t) => `• ${t}`)
      .join("\n");
    const restantes = etiquetas.length - LIMITE_LISTADO;
    const listado = restantes > 0 ? `${detalle}\n…y ${restantes} más` : detalle;
    if (!confirm(`¿Eliminar los ítems seleccionados? (${entradas.length})\n\n${listado}\n\n${NOTA_RECUPERABLE}`)) return;

    setEliminandoSeleccion(true);
    setError("");
    const errores = [];
    try {
      for (const entrada of entradas) {
        try {
          await CONFIG_POR_TIPO.get(entrada.itemTipo).eliminar(entrada.item._id);
        } catch (err) {
          errores.push(`${entrada.item.titulo}: ${err.message}`);
        }
      }
      await recargar();
      setSeleccionados(new Set());
      if (errores.length > 0) {
        setError(`Algunos ítems no se pudieron eliminar:\n${errores.join("\n")}`);
      } else {
        setMensaje(`${entradas.length} ítem(s) eliminado(s).`);
      }
    } finally {
      setEliminandoSeleccion(false);
    }
  }

  return (
    <>
      <h1>Buscar en el catálogo</h1>
      <p>
        Todo lo que catalogaste, en un solo lugar — con los mismos filtros que ve el socio en el OPAC, más las
        acciones del staff: editar, ver la ficha ISBD completa, y eliminar (uno por uno o varios a la vez).
      </p>

      {mensaje && <div className="flash ok" role="status">{mensaje}</div>}
      {error && (
        <div className="flash error" role="alert" style={{ whiteSpace: "pre-line" }}>
          {error}
        </div>
      )}

      <div className="card">
        <label>
          Buscar por título, autor, materia o ISBN/ISSN
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej: Borges, o 978..."
          />
        </label>
        <details
          className="busqueda-avanzada"
          open={avanzadaAbierta}
          onToggle={(e) => setAvanzadaAbierta(e.target.open)}
        >
          <summary>Búsqueda especializada</summary>
          <div className="busqueda-avanzada__campos">
            <label>
              Título
              <input value={avanzada.titulo} onChange={(e) => onCambiarAvanzada("titulo", e.target.value)} />
            </label>
            <label>
              Autor
              <input value={avanzada.autor} onChange={(e) => onCambiarAvanzada("autor", e.target.value)} />
            </label>
            <label>
              Materia
              <input value={avanzada.materia} onChange={(e) => onCambiarAvanzada("materia", e.target.value)} />
            </label>
            <label>
              ISBN / ISSN
              <input value={avanzada.isbnIssn} onChange={(e) => onCambiarAvanzada("isbnIssn", e.target.value)} />
            </label>
            <label>
              Año
              <input value={avanzada.anio} onChange={(e) => onCambiarAvanzada("anio", e.target.value)} />
            </label>
          </div>
          <p>
            <small>Los campos completados se combinan entre sí y con la búsqueda de arriba (todos deben coincidir).</small>
          </p>
        </details>
      </div>

      <div className="catalogo-layout">
        <aside className="catalogo-filtros">
          <ListaColapsable
            titulo="Tipos de ítem"
            items={CONFIG_TIPOS}
            claveItem={(t) => t.itemTipo}
            renderItem={(t) => (
              <label style={{ display: "block", fontWeight: "normal" }}>
                <input type="checkbox" checked={tiposActivos.has(t.itemTipo)} onChange={() => onToggleTipo(t.itemTipo)} />{" "}
                {t.etiquetaTipo} ({conteoPorTipo.get(t.itemTipo) || 0})
              </label>
            )}
          />
          <ListaColapsable
            titulo="Autores"
            items={autoresDisponibles}
            claveItem={([autor]) => autor}
            className="catalogo-filtros__materias"
            renderItem={([autor, cantidad]) => (
              <button type="button" className={autoresActivos.has(autor) ? "activa" : ""} onClick={() => onToggleAutor(autor)}>
                {autor} ({cantidad})
              </button>
            )}
          />
          <ListaColapsable
            titulo="Materias"
            items={materiasDisponibles}
            claveItem={([materia]) => materia}
            className="catalogo-filtros__materias"
            renderItem={([materia, cantidad]) => (
              <button type="button" className={materiasActivas.has(materia) ? "activa" : ""} onClick={() => onToggleMateria(materia)}>
                {materia} ({cantidad})
              </button>
            )}
          />
        </aside>

        <div className="catalogo-resultados">
          <div className="catalogo-resultados__barra">
            <span>{todos === null ? "Buscando…" : `${resultados.length} resultado(s)`}</span>
          </div>

          {todos === null ? (
            <p role="status">
              Cargando catálogo...
              {tardando && (
                <>
                  <br />
                  <small>Puede tardar unos segundos si el servidor estaba inactivo — es normal, no hace falta recargar.</small>
                </>
              )}
            </p>
          ) : (
            <>
              {seleccionados.size > 0 && (
                <div className="barra-seleccion">
                  <span>{seleccionados.size} seleccionado(s)</span>
                  <button type="button" className="peligro" onClick={onEliminarSeleccionados} disabled={eliminandoSeleccion}>
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
                        checked={resultadosPagina.length > 0 && seleccionados.size === resultadosPagina.length}
                        onChange={onToggleSeleccionTodos}
                        aria-label="Seleccionar todos"
                      />
                    </th>
                    <th>Título</th>
                    <th>Tipo</th>
                    <th>Autores</th>
                    <th>Año</th>
                    <th>Ejemplares</th>
                    <th><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {resultadosPagina.map((entrada) => {
                    const clave = claveSeleccion(entrada);
                    return (
                      <tr key={clave} className={eliminandoClave === clave ? "saliendo" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={seleccionados.has(clave)}
                            onChange={() => onToggleSeleccion(clave)}
                            aria-label={`Seleccionar ${entrada.item.titulo}`}
                          />
                        </td>
                        <td>
                          {entrada.item.titulo}
                          {entrada.item.subtitulo && (
                            <>
                              <br />
                              <small>{entrada.item.subtitulo}</small>
                            </>
                          )}
                        </td>
                        <td>{entrada.etiquetaTipo}</td>
                        <td>{entrada.extraTexto}</td>
                        <td>{anioOPeriodo(entrada.item)}</td>
                        <td>{ejemplaresTexto(entrada)}</td>
                        <td>
                          <button className="secundario" onClick={() => onEditar(entrada)}>
                            Editar
                          </button>{" "}
                          <button className="secundario" onClick={() => setFichaAbierta(entrada)}>
                            Ficha ISBD
                          </button>{" "}
                          <button className="peligro" onClick={() => onEliminar(entrada)}>
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {resultadosPagina.length === 0 && (
                    <tr>
                      <td colSpan={7}>Ningún ítem coincide con los filtros aplicados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <Pager pagina={pagina} porPagina={POR_PAGINA} total={resultados.length} onCambiar={setPagina} etiqueta="resultados" />
            </>
          )}
        </div>
      </div>

      {fichaAbierta && (
        <FichaIsbdModal
          item={fichaAbierta.item}
          etiquetaTipo={fichaAbierta.etiquetaTipo}
          onCerrar={() => setFichaAbierta(null)}
        />
      )}
    </>
  );
}
