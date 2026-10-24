import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleCheck, Clock, Globe, Landmark, SlidersHorizontal, X } from "lucide-react";
import api, { urlPortada } from "../../api.js";
import Portada from "../../Portada.jsx";
import TextoSeguro from "../../TextoSeguro.jsx";
import ListaColapsable from "../../ListaColapsable.jsx";
import { useContenidoOpac } from "../../ContenidoOpacContext.jsx";
import { useSocioAuth } from "../../SocioAuthContext.jsx";
import { useAvisoCargaLenta } from "../../useAvisoCargaLenta.js";
import { textoDisponibilidad, urlFicha } from "../../opac.js";
import { useMetadatos } from "../../metadatos.js";
import { usePreferencias } from "../../preferencias.js";
import InstalarApp from "../../InstalarApp.jsx";

// Catálogo público. La búsqueda la hace el servidor (ver
// backend/src/opac/catalogo.js): el navegador pide una página de resultados
// con sus facetas, no el catálogo entero. Todo el estado (texto, filtros,
// orden, página) vive en la URL, así una búsqueda se puede compartir,
// guardar o volver atrás con el navegador.

const ORDENES = [
  ["relevancia", "Relevancia"],
  ["titulo", "Título (A-Z)"],
  ["anio", "Año (más nuevo primero)"],
  ["disponibilidad", "Disponibilidad"],
];

function AvisosOpac() {
  const { contenido } = useContenidoOpac();
  const avisos = contenido?.avisos || [];
  if (!avisos.length) return null;
  return (
    <section className="avisos-opac" aria-label="Avisos de la biblioteca">
      {avisos.map((a, i) => (
        <article key={i} className="aviso-opac">
          <h2>{a.titulo}</h2>
          {a.texto && <TextoSeguro texto={a.texto} className="texto-cms" />}
        </article>
      ))}
    </section>
  );
}

function IconoDisponibilidad({ material }) {
  if (material.soloLectura) return <Landmark size={16} strokeWidth={1.5} aria-hidden="true" />;
  if (material.disponibles > 0) return <CircleCheck size={16} strokeWidth={1.5} aria-hidden="true" />;
  if (material.urlAcceso) return <Globe size={16} strokeWidth={1.5} aria-hidden="true" />;
  return <Clock size={16} strokeWidth={1.5} aria-hidden="true" />;
}

// Tarjeta: el título es el enlace a la ficha y se estira (CSS) para que
// toda la tarjeta sea clicable, sin anidar botones dentro de un enlace.
function Tarjeta({ codigo, material }) {
  const disponible = material.soloLectura || material.disponibles > 0 || Boolean(material.urlAcceso);
  return (
    <article className="tarjeta-catalogo">
      <div className="tarjeta-catalogo__portada">
        <Portada src={urlPortada(codigo, material.id, material.portada)} titulo={material.titulo} autor={material.autores[0]} />
      </div>
      <div className="tarjeta-catalogo__info">
        <span className="tarjeta-catalogo__tipo">{material.etiquetaTipo}</span>
        <h2 className="tarjeta-catalogo__titulo">
          <Link to={urlFicha(codigo, material)} className="tarjeta-catalogo__enlace">
            {material.titulo}
          </Link>
        </h2>
        {material.subtitulo && <p className="tarjeta-catalogo__subtitulo">{material.subtitulo}</p>}
        {material.extra && <p className="tarjeta-catalogo__extra">{material.extra}</p>}
        <p className={`tarjeta-catalogo__disponibilidad${disponible ? " es-disponible" : ""}`}>
          <IconoDisponibilidad material={material} />
          {textoDisponibilidad(material)}
        </p>
      </div>
    </article>
  );
}

// Paginación numerada con enlaces de verdad (se pueden abrir en otra
// pestaña y los buscadores los siguen): primera, última y dos a cada lado.
function Paginacion({ pagina, totalPaginas, hrefDe }) {
  if (totalPaginas <= 1) return null;
  const numeros = new Set([1, totalPaginas]);
  for (let n = pagina - 2; n <= pagina + 2; n++) if (n >= 1 && n <= totalPaginas) numeros.add(n);
  const ordenados = [...numeros].sort((a, b) => a - b);
  return (
    <nav className="paginacion" aria-label="Páginas de resultados">
      {pagina > 1 && <Link to={hrefDe(pagina - 1)}>Anterior</Link>}
      {ordenados.map((n, i) => (
        <React.Fragment key={n}>
          {i > 0 && n - ordenados[i - 1] > 1 && <span aria-hidden="true">…</span>}
          {n === pagina ? (
            <span aria-current="page" className="paginacion__actual">
              {n}
            </span>
          ) : (
            <Link to={hrefDe(n)} aria-label={`Página ${n}`}>
              {n}
            </Link>
          )}
        </React.Fragment>
      ))}
      {pagina < totalPaginas && <Link to={hrefDe(pagina + 1)}>Siguiente</Link>}
    </nav>
  );
}

export default function CatalogoPublico() {
  const { codigo } = useSocioAuth();
  const { contenido } = useContenidoOpac();
  const { ahorro } = usePreferencias();
  const tardando = useAvisoCargaLenta();
  const [params, setParams] = useSearchParams();
  const [datos, setDatos] = useState(null); // la última respuesta (se conserva mientras carga la siguiente)
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const entradaRef = useRef(null);

  const q = params.get("q") || "";
  const tipos = params.getAll("tipo");
  const autores = params.getAll("autor");
  const materias = params.getAll("materia");
  const soloDisponibles = params.get("disponible") === "1";
  const orden = params.get("orden") || "relevancia";
  const [texto, setTexto] = useState(q);

  // Sin "buscar" (lo usa la navegación inferior solo para enfocar el campo).
  const consultaParams = new URLSearchParams(params);
  consultaParams.delete("buscar");
  const consulta = consultaParams.toString();

  // Con búsqueda o filtros es una página de resultados: no se indexa (sería
  // una copia por cada búsqueda posible), pero sus enlaces sí se siguen.
  const seo = contenido?.seo;
  useMetadatos(
    seo && (consulta ? { ...seo, titulo: q ? `Resultados para «${q}» · ${seo.titulo}` : seo.titulo, robots: "noindex,follow" } : seo)
  );

  useEffect(() => {
    setTexto(q);
  }, [q]);

  useEffect(() => {
    if (params.has("buscar")) entradaRef.current?.focus();
  }, [params]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError("");
    // Con ahorro de datos, la mitad de resultados por página.
    api
      .opacBuscar(codigo, ahorro ? [consulta, "porPagina=12"].filter(Boolean).join("&") : consulta)
      .then((r) => vigente && setDatos(r))
      .catch((err) => vigente && setError(err.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [codigo, consulta, intento, ahorro]);

  // Cambiar un filtro vuelve a la página 1 (la 4 de antes puede no existir).
  function cambiar(cambio) {
    const p = new URLSearchParams(params);
    p.delete("buscar");
    p.delete("pagina");
    cambio(p);
    setParams(p);
  }

  function alternar(nombre, valor) {
    cambiar((p) => {
      const actuales = p.getAll(nombre);
      p.delete(nombre);
      for (const v of actuales) if (v !== valor) p.append(nombre, v);
      if (!actuales.includes(valor)) p.append(nombre, valor);
    });
  }

  function onBuscar(e) {
    e.preventDefault();
    cambiar((p) => (texto.trim() ? p.set("q", texto.trim()) : p.delete("q")));
  }

  function hrefPagina(n) {
    const p = new URLSearchParams(consulta);
    if (n > 1) p.set("pagina", String(n));
    else p.delete("pagina");
    return `?${p.toString()}`;
  }

  const etiquetaTipo = new Map((datos?.facetas.tipos || []).map((t) => [t.valor, t.etiqueta]));
  const activos = [
    ...tipos.map((v) => ({ grupo: "tipo", valor: v, texto: etiquetaTipo.get(v) || v })),
    ...autores.map((v) => ({ grupo: "autor", valor: v, texto: `Autor: ${v}` })),
    ...materias.map((v) => ({ grupo: "materia", valor: v, texto: `Materia: ${v}` })),
    ...(soloDisponibles ? [{ grupo: "disponible", valor: "1", texto: "Solo disponibles" }] : []),
  ];

  return (
    <>
      <h1>Catálogo</h1>
      <AvisosOpac />
      {!consulta && <InstalarApp />}

      <form className="card buscador-opac" role="search" onSubmit={onBuscar}>
        <label htmlFor="busqueda-opac">Buscar por título, autor, materia o ISBN</label>
        <div className="buscador-opac__fila">
          <input
            id="busqueda-opac"
            ref={entradaRef}
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej.: Borges, o Ficciones"
            enterKeyHint="search"
          />
          <button type="submit">Buscar</button>
        </div>
      </form>

      <div className="catalogo-layout">
        <button
          type="button"
          className="secundario boton-filtros"
          aria-expanded={filtrosAbiertos}
          aria-controls="filtros-opac"
          onClick={() => setFiltrosAbiertos((a) => !a)}
        >
          <SlidersHorizontal size={18} strokeWidth={1.5} aria-hidden="true" />
          Filtros{activos.length ? ` (${activos.length})` : ""}
        </button>
        <aside id="filtros-opac" className={`catalogo-filtros${filtrosAbiertos ? " esta-abierto" : ""}`} aria-label="Filtros">
          <div className="catalogo-filtros__grupo">
            <h2>Disponibilidad</h2>
            <label style={{ display: "block", fontWeight: "normal" }}>
              <input
                type="checkbox"
                checked={soloDisponibles}
                onChange={() => cambiar((p) => (soloDisponibles ? p.delete("disponible") : p.set("disponible", "1")))}
              />{" "}
              Solo lo que se puede llevar o consultar ahora
            </label>
          </div>
          {datos && (
            <>
              <ListaColapsable
                titulo="Tipo de material"
                items={datos.facetas.tipos.filter((t) => t.cantidad > 0 || tipos.includes(t.valor))}
                claveItem={(t) => t.valor}
                renderItem={(t) => (
                  <label style={{ display: "block", fontWeight: "normal" }}>
                    <input type="checkbox" checked={tipos.includes(t.valor)} onChange={() => alternar("tipo", t.valor)} />{" "}
                    {t.etiqueta} ({t.cantidad})
                  </label>
                )}
              />
              <ListaColapsable
                titulo="Autores"
                items={datos.facetas.autores}
                claveItem={(a) => a.valor}
                className="catalogo-filtros__materias"
                renderItem={(a) => (
                  <button
                    type="button"
                    className={autores.includes(a.valor) ? "activa" : ""}
                    aria-pressed={autores.includes(a.valor)}
                    onClick={() => alternar("autor", a.valor)}
                  >
                    {a.valor} ({a.cantidad})
                  </button>
                )}
              />
              <ListaColapsable
                titulo="Materias"
                items={datos.facetas.materias}
                claveItem={(m) => m.valor}
                className="catalogo-filtros__materias"
                renderItem={(m) => (
                  <button
                    type="button"
                    className={materias.includes(m.valor) ? "activa" : ""}
                    aria-pressed={materias.includes(m.valor)}
                    onClick={() => alternar("materia", m.valor)}
                  >
                    {m.valor} ({m.cantidad})
                  </button>
                )}
              />
            </>
          )}
        </aside>

        <div className="catalogo-resultados" aria-busy={cargando}>
          <div className="catalogo-resultados__barra">
            <span role="status">
              {cargando && !datos
                ? "Buscando…"
                : datos
                  ? `${datos.total} ${datos.total === 1 ? "resultado" : "resultados"}${q ? ` para «${q}»` : ""}`
                  : ""}
            </span>
            <label>
              Ordenar por{" "}
              <select
                value={orden}
                onChange={(e) => cambiar((p) => (e.target.value === "relevancia" ? p.delete("orden") : p.set("orden", e.target.value)))}
              >
                {ORDENES.map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {activos.length > 0 && (
            <div className="filtros-activos">
              {activos.map((f) => (
                <button
                  key={`${f.grupo}:${f.valor}`}
                  type="button"
                  className="chip-filtro"
                  onClick={() => (f.grupo === "disponible" ? cambiar((p) => p.delete("disponible")) : alternar(f.grupo, f.valor))}
                >
                  {f.texto}
                  <X size={14} strokeWidth={1.5} aria-hidden="true" />
                  <span className="sr-only"> (quitar filtro)</span>
                </button>
              ))}
              <button
                type="button"
                className="enlace-boton"
                onClick={() => cambiar((p) => ["tipo", "autor", "materia", "disponible"].forEach((n) => p.delete(n)))}
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {error ? (
            <div className="flash error" role="alert">
              No se pudo buscar: {error}{" "}
              <button type="button" className="secundario" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </button>
            </div>
          ) : !datos ? (
            <p role="status">
              Cargando catálogo…
              {tardando && (
                <>
                  <br />
                  <small>Puede tardar unos segundos si el servidor estaba inactivo — es normal, no hace falta recargar.</small>
                </>
              )}
            </p>
          ) : datos.total === 0 ? (
            <div className="sin-resultados">
              <p>
                No encontramos nada{q ? ` para «${q}»` : ""}
                {activos.length ? " con esos filtros" : ""}.
              </p>
              <p>Probá con otra palabra, revisá la ortografía{activos.length ? " o quitá algún filtro" : ""}.</p>
            </div>
          ) : (
            <>
              <div className="grilla-catalogo">
                {datos.resultados.map((m) => (
                  <Tarjeta key={`${m.itemTipo}:${m.id}`} codigo={codigo} material={m} />
                ))}
              </div>
              <Paginacion pagina={datos.pagina} totalPaginas={datos.totalPaginas} hrefDe={hrefPagina} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
