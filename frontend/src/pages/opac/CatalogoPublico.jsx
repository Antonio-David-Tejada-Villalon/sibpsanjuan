import React, { useEffect, useMemo, useState } from "react";
import api from "../../api.js";
import { useSocioAuth } from "../../SocioAuthContext.jsx";
import { useAvisoCargaLenta } from "../../useAvisoCargaLenta.js";
import Pager from "../../Pager.jsx";
import ListaColapsable from "../../ListaColapsable.jsx";

const POR_PAGINA_OPAC = 24;

// Un tipo de material por entrada — mismo dato que ya traía cada
// TablaCatalogo/TablaSoloLectura de la versión anterior, pero acá se usa
// para armar UNA sola lista combinada (como el buscador único de Koha) en
// vez de 10 tablas separadas. "extra" es el dato secundario que cada tipo
// mostraba en su propia columna (autor, periodicidad, subtipo, etc.).
// campos de detalle: pares [etiqueta, valor] con TODO lo que ese tipo
// expone en el OPAC más allá de lo que ya se ve en la tarjeta (título,
// subtítulo, portada, materias, disponibilidad) — se muestran en el modal
// de detalle al hacer clic en una tarjeta. Cada tipo tiene su propio set de
// campos (ver mapItem en backend/src/routes/opac.js), así que no hay una
// lista genérica única que sirva para los 10.
function autoresTexto(item) {
  return (item.autores || []).join(", ");
}

const CONFIG_TIPOS = [
  {
    itemTipo: "Libro",
    etiquetaTipo: "Libros",
    fetch: (c) => api.opacCatalogo(c),
    extra: autoresTexto,
    soloLectura: false,
    detalle: (i) => [
      ["Autor(es)", autoresTexto(i)],
      ["Editorial", i.editorial],
      ["Año", i.anio],
      ["ISBN", i.isbn],
    ],
  },
  {
    itemTipo: "Seriada",
    etiquetaTipo: "Publicaciones seriadas",
    fetch: (c) => api.opacCatalogoSeriadas(c),
    extra: (i) => i.periodicidad,
    soloLectura: false,
    detalle: (i) => [
      ["Autor(es)/Editor(es)", autoresTexto(i)],
      ["Editorial", i.editorial],
      ["Periodicidad", i.periodicidad],
      ["ISSN", i.issn],
    ],
  },
  {
    itemTipo: "RecursoElectronico",
    etiquetaTipo: "Recursos electrónicos",
    fetch: (c) => api.opacCatalogoRecursos(c),
    extra: (i) => i.tipoRecurso,
    soloLectura: false,
    detalle: (i) => [
      ["Autor(es)", autoresTexto(i)],
      ["Editorial", i.editorial],
      ["Año", i.anio],
      ["Tipo de recurso", i.tipoRecurso],
    ],
  },
  {
    itemTipo: "MaterialSonoro",
    etiquetaTipo: "Material sonoro",
    fetch: (c) => api.opacCatalogoMaterialSonoro(c),
    extra: (i) => i.subtipo,
    soloLectura: false,
    detalle: (i) => [
      ["Autor(es)/Intérprete(s)", autoresTexto(i)],
      ["Editorial/Sello", i.editorial],
      ["Año", i.anio],
      ["Formato", i.subtipo],
    ],
  },
  {
    itemTipo: "MaterialAudiovisual",
    etiquetaTipo: "Material audiovisual",
    fetch: (c) => api.opacCatalogoMaterialAudiovisual(c),
    extra: (i) => i.subtipo,
    soloLectura: false,
    detalle: (i) => [
      ["Autor(es)/Director(es)", autoresTexto(i)],
      ["Editorial/Productora", i.editorial],
      ["Año", i.anio],
      ["Formato", i.subtipo],
    ],
  },
  {
    itemTipo: "MaterialCartografico",
    etiquetaTipo: "Material cartográfico",
    fetch: (c) => api.opacCatalogoMaterialCartografico(c),
    extra: (i) => i.subtipo,
    soloLectura: false,
    detalle: (i) => [
      ["Autor(es)", autoresTexto(i)],
      ["Formato", i.subtipo],
      ["Escala", i.escala],
    ],
  },
  {
    itemTipo: "MaterialGrafico",
    etiquetaTipo: "Material gráfico",
    fetch: (c) => api.opacCatalogoMaterialGrafico(c),
    extra: (i) => i.subtipo,
    soloLectura: false,
    detalle: (i) => [
      ["Autor(es)", autoresTexto(i)],
      ["Formato", i.subtipo],
    ],
  },
  {
    itemTipo: "MaterialDidactico",
    etiquetaTipo: "Material didáctico",
    fetch: (c) => api.opacCatalogoMaterialDidactico(c),
    extra: (i) => i.subtipo,
    soloLectura: false,
    detalle: (i) => [
      ["Formato", i.subtipo],
      ["Edad recomendada", i.edadRecomendada],
    ],
  },
  {
    itemTipo: "Archivo",
    etiquetaTipo: "Archivos",
    fetch: (c) => api.opacCatalogoArchivos(c),
    extra: (i) => i.nivelDescripcion,
    soloLectura: true,
    detalle: (i) => [
      ["Tipo", i.subtipo],
      ["Nivel de descripción", i.nivelDescripcion],
      ["Fecha de inicio", i.fechaInicio],
      ["Fecha de fin", i.fechaFin],
    ],
  },
  {
    itemTipo: "Objeto",
    etiquetaTipo: "Objetos",
    fetch: (c) => api.opacCatalogoObjetos(c),
    extra: (i) => i.subtipo,
    soloLectura: true,
    detalle: (i) => [
      ["Tipo", i.subtipo],
      ["Período", i.periodo],
      ["Ubicación", i.ubicacion],
    ],
  },
];

// Texto de disponibilidad — compartido entre la tarjeta y el modal de
// detalle, para que no puedan desincronizarse mostrando algo distinto.
// Acceso digital (urlAcceso) y ejemplares físicos NO son excluyentes: un
// mismo título puede tener las dos cosas (ej. un libro con ejemplares
// impresos y además una versión digital de consulta) — se informan las
// dos si corresponde, en vez de que la digital tape a la física.
function textoDisponibilidad({ item, soloLectura }) {
  if (soloLectura) return "Se consulta en la biblioteca";
  const partes = [];
  if (item.urlAcceso) partes.push("Acceso digital");
  if (item.ejemplaresDisponibles > 0) partes.push(`${item.ejemplaresDisponibles} disponible(s) para préstamo`);
  if (partes.length === 0) partes.push("Sin ejemplares libres");
  return partes.join(" · ");
}

// Acciones (Acceder / Solicitar préstamo / "ingresá para pedirlo") —
// también compartidas entre tarjeta y modal, un solo lugar que sabe las
// reglas de qué mostrar según sesión/disponibilidad/tipo. Mismo criterio
// que textoDisponibilidad: pueden aparecer ambas acciones a la vez.
function AccionItem({ entrada, sesion, procesandoId, onSolicitar }) {
  const { item, itemTipo, soloLectura } = entrada;
  const hayPrestamoFisico = !soloLectura && item.ejemplaresDisponibles > 0;

  return (
    <>
      {item.urlAcceso && (
        <a href={item.urlAcceso} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          Acceder
        </a>
      )}
      {hayPrestamoFisico && sesion && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSolicitar(itemTipo, item._id);
          }}
          disabled={procesandoId === item._id}
        >
          {procesandoId === item._id ? "Enviando…" : "Solicitar préstamo"}
        </button>
      )}
      {hayPrestamoFisico && !sesion && <small>Ingresá para pedir un ejemplar en préstamo</small>}
    </>
  );
}

function TarjetaResultado({ entrada, sesion, procesandoId, onSolicitar, onAbrir }) {
  const { item, etiquetaTipo, extraTexto, soloLectura } = entrada;

  function onTecla(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onAbrir(entrada);
    }
  }

  return (
    <div
      className="tarjeta-catalogo"
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(entrada)}
      onKeyDown={onTecla}
    >
      <div className="tarjeta-catalogo__portada">
        {item.portadaUrl ? (
          <img src={item.portadaUrl} alt="" loading="lazy" />
        ) : (
          <span>Sin imagen de cubierta disponible</span>
        )}
      </div>
      <div className="tarjeta-catalogo__info">
        <span className="tarjeta-catalogo__tipo">{etiquetaTipo}</span>
        <h3>{item.titulo}</h3>
        {item.subtitulo && <p className="tarjeta-catalogo__subtitulo">{item.subtitulo}</p>}
        {extraTexto && <p className="tarjeta-catalogo__extra">{extraTexto}</p>}
        <p className="tarjeta-catalogo__disponibilidad">{textoDisponibilidad({ item, soloLectura })}</p>
        <div className="tarjeta-catalogo__accion">
          <AccionItem entrada={entrada} sesion={sesion} procesandoId={procesandoId} onSolicitar={onSolicitar} />
        </div>
      </div>
      <span className="tarjeta-catalogo__vermas" aria-hidden="true">
        Ver detalle →
      </span>
    </div>
  );
}

function DetalleModal({ entrada, sesion, procesandoId, onSolicitar, onCerrar }) {
  const { item, etiquetaTipo, soloLectura, detalle } = entrada;
  const camposConValor = detalle.filter(([, valor]) => valor);

  useEffect(() => {
    function onTecla(e) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onTecla);
    return () => document.removeEventListener("keydown", onTecla);
  }, [onCerrar]);

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div
        className="modal-detalle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-detalle-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-detalle__cerrar" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
        <div className="modal-detalle__portada">
          {item.portadaUrl ? <img src={item.portadaUrl} alt="" /> : <span>Sin imagen de cubierta disponible</span>}
        </div>
        <div className="modal-detalle__info">
          <span className="tarjeta-catalogo__tipo">{etiquetaTipo}</span>
          <h2 id="modal-detalle-titulo">{item.titulo}</h2>
          {item.subtitulo && <p className="tarjeta-catalogo__subtitulo">{item.subtitulo}</p>}

          {camposConValor.length > 0 && (
            <dl className="modal-detalle__campos">
              {camposConValor.map(([etiqueta, valor]) => (
                <React.Fragment key={etiqueta}>
                  <dt>{etiqueta}</dt>
                  <dd>{valor}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}

          {item.materias?.length > 0 && (
            <div className="modal-detalle__materias">
              {item.materias.map((m) => (
                <span key={m} className="pill-materia">
                  {m}
                </span>
              ))}
            </div>
          )}

          <p className="tarjeta-catalogo__disponibilidad">{textoDisponibilidad({ item, soloLectura })}</p>

          <div className="tarjeta-catalogo__accion">
            <AccionItem entrada={entrada} sesion={sesion} procesandoId={procesandoId} onSolicitar={onSolicitar} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CatalogoPublico() {
  const { codigo, sesion } = useSocioAuth();
  const tardando = useAvisoCargaLenta();
  const [todos, setTodos] = useState(null); // null = cargando
  // Catálogo de autoridades de autor (ver BIBL-1) — solo para resolver
  // variantes de nombre a una forma autorizada al facetar/filtrar; si la
  // biblioteca no cargó ninguno, queda [] y todo se comporta como antes
  // (cada string de autor es su propia faceta, sin agrupar nada).
  const [catalogoAutores, setCatalogoAutores] = useState([]);
  // Catálogo de autoridades de materia (ver BIBL-3) — mismo criterio que
  // catalogoAutores, para "Historia argentina"/"Historia de la Argentina".
  const [catalogoMaterias, setCatalogoMaterias] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [tiposActivos, setTiposActivos] = useState(() => new Set(CONFIG_TIPOS.map((t) => t.itemTipo)));
  const [materiasActivas, setMateriasActivas] = useState(() => new Set());
  const [autoresActivos, setAutoresActivos] = useState(() => new Set());
  const [soloDisponibles, setSoloDisponibles] = useState(false);
  const [ordenPor, setOrdenPor] = useState("relevancia");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [procesandoId, setProcesandoId] = useState(null);
  const [entradaAbierta, setEntradaAbierta] = useState(null);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    setTodos(null);
    Promise.all(
      CONFIG_TIPOS.map(({ itemTipo, etiquetaTipo, fetch, extra, soloLectura, detalle }) =>
        fetch(codigo).then((items) =>
          items.map((item) => ({
            item,
            itemTipo,
            etiquetaTipo,
            soloLectura,
            extraTexto: extra(item),
            detalle: detalle(item),
          }))
        )
      )
    ).then((listas) => setTodos(listas.flat()));
    api.opacAutores(codigo).then(setCatalogoAutores);
    api.opacMaterias(codigo).then(setCatalogoMaterias);
  }, [codigo]);

  // Mapa de búsqueda: cualquier variante o la forma autorizada misma →
  // forma autorizada, en minúsculas para que la resolución no dependa de
  // mayúsculas/acentos exactos con los que se haya tipeado cada uno.
  const mapaAutores = useMemo(() => {
    const m = new Map();
    for (const a of catalogoAutores) {
      m.set(a.formaAutorizada.toLowerCase(), a.formaAutorizada);
      for (const v of a.variantes || []) m.set(v.toLowerCase(), a.formaAutorizada);
    }
    return m;
  }, [catalogoAutores]);

  function resolverAutor(nombreCrudo) {
    return mapaAutores.get(nombreCrudo.toLowerCase()) || nombreCrudo;
  }

  const mapaMaterias = useMemo(() => {
    const m = new Map();
    for (const materia of catalogoMaterias) {
      m.set(materia.formaAutorizada.toLowerCase(), materia.formaAutorizada);
      for (const v of materia.variantes || []) m.set(v.toLowerCase(), materia.formaAutorizada);
    }
    return m;
  }, [catalogoMaterias]);

  function resolverMateria(nombreCrudo) {
    return mapaMaterias.get(nombreCrudo.toLowerCase()) || nombreCrudo;
  }

  // Facetas: se calculan una sola vez sobre TODO lo cargado (no se
  // recalculan al filtrar) — más simple, y en una biblioteca chica no hace
  // falta que los conteos se muevan en tiempo real como en un catálogo
  // enorme.
  const conteoPorTipo = useMemo(() => {
    const conteo = new Map();
    for (const t of CONFIG_TIPOS) conteo.set(t.itemTipo, 0);
    for (const e of todos || []) conteo.set(e.itemTipo, (conteo.get(e.itemTipo) || 0) + 1);
    return conteo;
  }, [todos]);

  const materiasDisponibles = useMemo(() => {
    const conteo = new Map();
    for (const e of todos || []) {
      for (const m of e.item.materias || []) {
        const canon = resolverMateria(m);
        conteo.set(canon, (conteo.get(canon) || 0) + 1);
      }
    }
    // Sin tope artificial de cantidad (antes .slice(0, 15)) — ListaColapsable
    // ya se encarga de no mostrar más de 5 de entrada, con "Ver más" para el
    // resto (ver UX/BIBL-6 en AUDITORIA.md).
    return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, mapaMaterias]);

  const autoresDisponibles = useMemo(() => {
    const conteo = new Map();
    for (const e of todos || []) {
      for (const a of e.item.autores || []) {
        const canon = resolverAutor(a);
        conteo.set(canon, (conteo.get(canon) || 0) + 1);
      }
    }
    // Sin tope artificial de cantidad, mismo criterio que materiasDisponibles.
    return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, mapaAutores]);

  function onToggleTipo(itemTipo) {
    setTiposActivos((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(itemTipo)) nuevo.delete(itemTipo);
      else nuevo.add(itemTipo);
      return nuevo;
    });
  }

  // Materias y autores son multi-selección (facetas típicas de catálogo: se
  // puede querer "Historia" + "Arte" a la vez) — a diferencia de tiposActivos
  // (que ya era multi-select desde el principio), estos dos empezaron como
  // radio de a uno y se convirtieron en Set por el mismo motivo.
  function onToggleMateria(materia) {
    setMateriasActivas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(materia)) nuevo.delete(materia);
      else nuevo.add(materia);
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

  const resultados = useMemo(() => {
    if (!todos) return [];
    const q = busqueda.trim().toLowerCase();
    let filtrados = todos.filter((e) => {
      if (!tiposActivos.has(e.itemTipo)) return false;
      if (
        materiasActivas.size > 0 &&
        !(e.item.materias || []).some((m) => materiasActivas.has(resolverMateria(m)))
      )
        return false;
      if (autoresActivos.size > 0 && !(e.item.autores || []).some((a) => autoresActivos.has(resolverAutor(a)))) return false;
      if (soloDisponibles && !e.soloLectura) {
        const disponible = Boolean(e.item.urlAcceso) || e.item.ejemplaresDisponibles > 0;
        if (!disponible) return false;
      }
      if (q) {
        const texto = `${e.item.titulo} ${e.item.subtitulo || ""} ${(e.item.autores || []).join(" ")}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });

    if (ordenPor === "titulo") {
      filtrados = [...filtrados].sort((a, b) => a.item.titulo.localeCompare(b.item.titulo));
    } else if (ordenPor === "anio") {
      filtrados = [...filtrados].sort((a, b) => (Number(b.item.anio) || 0) - (Number(a.item.anio) || 0));
    } else if (q) {
      // "Relevancia": el título que empieza con lo buscado primero.
      filtrados = [...filtrados].sort((a, b) => {
        const empiezaA = a.item.titulo.toLowerCase().startsWith(q) ? 0 : 1;
        const empiezaB = b.item.titulo.toLowerCase().startsWith(q) ? 0 : 1;
        return empiezaA - empiezaB || a.item.titulo.localeCompare(b.item.titulo);
      });
    } else {
      filtrados = [...filtrados].sort((a, b) => a.item.titulo.localeCompare(b.item.titulo));
    }
    return filtrados;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, busqueda, tiposActivos, materiasActivas, autoresActivos, soloDisponibles, ordenPor, mapaAutores, mapaMaterias]);

  // Volver a la página 1 cada vez que cambia qué se está mostrando —
  // quedarse en, digamos, la página 4 después de tipear una búsqueda que
  // solo tiene 2 páginas de resultados dejaría la grilla vacía.
  useEffect(() => {
    setPagina(1);
  }, [busqueda, tiposActivos, materiasActivas, autoresActivos, soloDisponibles, ordenPor]);

  const resultadosPagina = useMemo(
    () => resultados.slice((pagina - 1) * POR_PAGINA_OPAC, pagina * POR_PAGINA_OPAC),
    [resultados, pagina]
  );

  function onCambiarPagina(nueva) {
    setPagina(nueva);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function solicitar(itemTipo, itemId) {
    setMensaje("");
    setError("");
    setProcesandoId(itemId);
    try {
      await api.opacSolicitarPrestamo(codigo, itemTipo, itemId);
      setMensaje("Listo, tu pedido quedó registrado. Pasá por la biblioteca a retirarlo.");
      setEntradaAbierta(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <>
      <h1>Catálogo</h1>
      {mensaje && <div className="flash ok" role="status">{mensaje}</div>}
      {error && <div className="flash error" role="alert">{error}</div>}

      <div className="card">
        <label>
          Buscar por título, subtítulo o autor
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej: Borges, o Ficciones"
          />
        </label>
      </div>

      <div className="catalogo-layout">
        <aside className="catalogo-filtros">
          <div className="catalogo-filtros__grupo">
            <h2>Disponibilidad</h2>
            <label style={{ display: "block", fontWeight: "normal" }}>
              <input
                type="checkbox"
                checked={soloDisponibles}
                onChange={(e) => setSoloDisponibles(e.target.checked)}
              />{" "}
              Limitar a ítems disponibles
            </label>
          </div>

          <ListaColapsable
            titulo="Tipos de ítem"
            items={CONFIG_TIPOS}
            claveItem={(t) => t.itemTipo}
            renderItem={(t) => (
              <label style={{ display: "block", fontWeight: "normal" }}>
                <input
                  type="checkbox"
                  checked={tiposActivos.has(t.itemTipo)}
                  onChange={() => onToggleTipo(t.itemTipo)}
                />{" "}
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
              <button
                type="button"
                className={autoresActivos.has(autor) ? "activa" : ""}
                onClick={() => onToggleAutor(autor)}
              >
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
              <button
                type="button"
                className={materiasActivas.has(materia) ? "activa" : ""}
                onClick={() => onToggleMateria(materia)}
              >
                {materia} ({cantidad})
              </button>
            )}
          />
        </aside>

        <div className="catalogo-resultados">
          <div className="catalogo-resultados__barra">
            <span>
              {todos === null ? "Buscando…" : `${resultados.length} resultado(s)`}
            </span>
            <label>
              Ordenar por{" "}
              <select value={ordenPor} onChange={(e) => setOrdenPor(e.target.value)}>
                <option value="relevancia">Relevancia</option>
                <option value="titulo">Título (A-Z)</option>
                <option value="anio">Año (más nuevo primero)</option>
              </select>
            </label>
          </div>

          {todos === null ? (
            <p role="status">
              Cargando catálogo...
              {tardando && (
                <>
                  <br />
                  <small>
                    Puede tardar unos segundos si el servidor estaba inactivo — es normal, no hace falta recargar.
                  </small>
                </>
              )}
            </p>
          ) : (
            <>
              <div className="grilla-catalogo">
                {resultadosPagina.map((entrada) => (
                  <TarjetaResultado
                    key={`${entrada.itemTipo}:${entrada.item._id}`}
                    entrada={entrada}
                    sesion={sesion}
                    procesandoId={procesandoId}
                    onSolicitar={solicitar}
                    onAbrir={setEntradaAbierta}
                  />
                ))}
                {resultados.length === 0 && <p>Ningún resultado coincide con los filtros aplicados.</p>}
              </div>
              <Pager
                pagina={pagina}
                porPagina={POR_PAGINA_OPAC}
                total={resultados.length}
                onCambiar={onCambiarPagina}
                etiqueta="resultados"
              />
            </>
          )}
        </div>
      </div>

      {entradaAbierta && (
        <DetalleModal
          entrada={entradaAbierta}
          sesion={sesion}
          procesandoId={procesandoId}
          onSolicitar={solicitar}
          onCerrar={() => setEntradaAbierta(null)}
        />
      )}
    </>
  );
}
