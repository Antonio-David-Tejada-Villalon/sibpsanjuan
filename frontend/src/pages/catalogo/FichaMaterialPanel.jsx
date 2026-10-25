import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarPlus, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import api, { urlPortada } from "../../api.js";
import Portada from "../../Portada.jsx";
import { formatearFichaIsbd, datosAdicionales } from "../../FichaIsbd.jsx";
import { useAuth } from "../../AuthContext.jsx";
import { tienePermiso } from "../../permisos.js";
import { fechaCorta, nombreSocio } from "../../circulacion.js";
import { TIPO_POR_ITEM } from "./tipos.js";
import PestanaItems, { EstadoEjemplar } from "./PestanaItems.jsx";
import PestanaReservas from "./PestanaReservas.jsx";
import EtiquetasLomo from "./EtiquetasLomo.jsx";

// La ficha de un material en el panel, como la de Koha: a la izquierda las
// vistas (Normal, MARC, ISBD, Ítems, Reservas, Historial de préstamos), que
// quedan en la dirección (?vista=), y arriba las acciones.

const VISTAS = [
  { clave: "normal", texto: "Normal" },
  { clave: "marc", texto: "MARC", soloMarc: true },
  { clave: "isbd", texto: "ISBD" },
  { clave: "items", texto: "Ítems", soloCircula: true },
  { clave: "reservas", texto: "Reservas", soloCircula: true },
  { clave: "historial", texto: "Historial de préstamos", soloCircula: true },
];
const SIN_MARC = ["Archivo", "Objeto"];

// Los datos que se muestran en la vista Normal, en el orden de una ficha.
const CAMPOS = [
  ["autores", "Autor(es)"],
  ["autorCorporativo", "Autor corporativo"],
  ["mencionResponsabilidad", "Mención de responsabilidad"],
  ["edicion", "Edición"],
  ["editorial", "Editorial"],
  ["lugarPublicacion", "Lugar de publicación"],
  ["anio", "Año"],
  ["paginas", "Extensión"],
  ["detallesFisicos", "Otros detalles físicos"],
  ["dimensiones", "Dimensiones"],
  ["materialComplementario", "Material complementario"],
  ["duracion", "Duración"],
  ["isbn", "ISBN"],
  ["issn", "ISSN"],
  ["cdu", "CDU"],
  ["dewey", "Dewey"],
  ["periodicidad", "Periodicidad"],
  ["tipoRecurso", "Tipo de recurso"],
  ["escala", "Escala"],
  ["edadRecomendada", "Edad recomendada"],
  ["nivelDescripcion", "Nivel de descripción"],
  ["fechaInicio", "Fecha de inicio"],
  ["fechaFin", "Fecha de fin"],
  ["periodo", "Período"],
  ["procedencia", "Procedencia"],
  ["numeroInventario", "Número de inventario"],
  ["estadoConservacion", "Estado de conservación"],
  ["ubicacion", "Ubicación"],
  ["notaAudiencia", "Público"],
  ["notaIdioma", "Idioma"],
  ["notas", "Notas"],
];

function textoCampo(item, campo) {
  if (campo === "serie") return [item.serie, item.serieVolumen].filter(Boolean).join(" ; ");
  const valor = item[campo];
  return Array.isArray(valor) ? valor.filter(Boolean).join("; ") : valor;
}

function VistaNormal({ datos, ejemplares, onEditarEjemplar, onImprimir, puedeCatalogar }) {
  const { item } = datos;
  const portada = datos.portada ? urlPortada(datos.biblioteca.codigo, item._id, datos.portada, "grande") : null;
  return (
    <>
      <div className="ficha-normal">
        <div className="ficha-normal__portada">
          <Portada src={portada} titulo={item.titulo} autor={item.autores?.[0]} tamano="grande" decorativa={false} />
        </div>
        <dl className="ficha-datos">
          {CAMPOS.filter(([campo]) => textoCampo(item, campo)).map(([campo, etiqueta]) => (
            <div className="ficha-dato" key={campo}>
              <dt>{etiqueta}</dt>
              <dd>
                {campo === "autores"
                  ? item.autores.map((a, i) => (
                      <React.Fragment key={a}>
                        {i > 0 && "; "}
                        <Link to={`/catalogo?autor=${encodeURIComponent(a)}`}>{a}</Link>
                      </React.Fragment>
                    ))
                  : textoCampo(item, campo)}
              </dd>
            </div>
          ))}
          {textoCampo(item, "serie") && (
            <div className="ficha-dato">
              <dt>Serie</dt>
              <dd>{textoCampo(item, "serie")}</dd>
            </div>
          )}
          {item.materias?.length > 0 && (
            <div className="ficha-dato">
              <dt>Materias</dt>
              <dd className="lista-materias">
                {item.materias.map((m) => (
                  <Link key={m} className="pill-materia" to={`/catalogo?materia=${encodeURIComponent(m)}`}>
                    {m}
                  </Link>
                ))}
              </dd>
            </div>
          )}
          {item.urlAcceso && (
            <div className="ficha-dato">
              <dt>Acceso en línea</dt>
              <dd>
                <a href={item.urlAcceso} target="_blank" rel="noreferrer">
                  {item.urlInstruccion || item.urlAcceso}
                </a>
              </dd>
            </div>
          )}
          <div className="ficha-dato">
            <dt>Cargado</dt>
            <dd>
              {fechaCorta(item.creado)}
              {item.actualizado && ` · modificado el ${fechaCorta(item.actualizado)}`}
            </dd>
          </div>
        </dl>
      </div>

      {datos.circula && (
        <section className="existencias">
          <h2>Existencias ({ejemplares.length})</h2>
          {ejemplares.length === 0 ? (
            <p>Todavía no tiene ejemplares. Cargalos en la vista «Ítems».</p>
          ) : (
            <div className="tabla-desplazable">
              <table className="tabla-existencias">
                <thead>
                  <tr>
                    <th>Tipo de ítem</th>
                    <th>Ubicación actual</th>
                    <th>Biblioteca de origen</th>
                    <th>Signatura</th>
                    <th>Estado</th>
                    <th>Última vez visto</th>
                    <th>Código de barras</th>
                    <th>Copia</th>
                    <th>Etiqueta de lomo</th>
                    {puedeCatalogar && <th><span className="sr-only">Editar</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {ejemplares.map((e) => (
                    <tr key={e._id}>
                      <td>{datos.etiquetaTipo}</td>
                      <td>{datos.biblioteca.nombre}</td>
                      <td>
                        {datos.biblioteca.nombre}
                        {e.ubicacion && <em className="ubicacion-estante">{e.ubicacion}</em>}
                      </td>
                      <td>{e.signatura || "—"}</td>
                      <td>
                        <EstadoEjemplar ejemplar={e} />
                      </td>
                      <td>{fechaCorta(e.ultimaVezVisto)}</td>
                      <td>{e.codigoBarras}</td>
                      <td>{e.numeroCopia || "—"}</td>
                      <td>
                        <button type="button" className="enlace-boton" onClick={() => onImprimir([e])}>
                          Imprimir etiqueta
                        </button>
                      </td>
                      {puedeCatalogar && (
                        <td>
                          <button type="button" className="enlace-boton" onClick={() => onEditarEjemplar(e._id)}>
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function VistaMarc({ itemTipo, id }) {
  const [campos, setCampos] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.obtenerMarc(itemTipo, id).then((r) => setCampos(r.campos), (err) => setError(err.message));
  }, [itemTipo, id]);
  if (error) return <p>{error}</p>;
  if (!campos) return <p>Cargando…</p>;
  const indicador = (i) => (i && i.trim() ? i : "#");
  return (
    <>
      <h2>Registro MARC</h2>
      <p className="texto-secundario">El mismo registro que se exporta a Koha (MARC21), campo por campo.</p>
      <div className="registro-marc">
        {campos.map((c, i) => (
          <div key={`${c.tag}-${i}`} className="campo-marc">
            <p className="campo-marc__cabecera">
              <span className="campo-marc__tag">{c.tag}</span>
              {c.subcampos && (
                <span className="campo-marc__indicadores">
                  {indicador(c.ind1)}
                  {indicador(c.ind2)}
                </span>
              )}{" "}
              - {c.nombre}
            </p>
            {c.subcampos ? (
              <dl className="campo-marc__subcampos">
                {c.subcampos.map((s, j) => (
                  <div key={j}>
                    <dt>
                      <span className="campo-marc__codigo">{s.codigo}</span> {s.nombre}
                    </dt>
                    <dd>{s.valor}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="campo-marc__valor">
                <span className="campo-marc__codigo">@</span> {c.valor}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function VistaIsbd({ datos, ejemplares }) {
  const item = { ...datos.item, itemTipo: datos.itemTipo, ejemplares };
  const adicionales = datosAdicionales(item);
  return (
    <>
      <h2>Ficha ISBD</h2>
      <p className="ficha-isbd__parrafo">{formatearFichaIsbd(item)}</p>
      {item.materias?.length > 0 && <p>Materias: {item.materias.join(" — ")}</p>}
      {adicionales.length > 0 && (
        <dl className="ficha-datos">
          {adicionales.map(([etiqueta, valor]) => (
            <div className="ficha-dato" key={etiqueta}>
              <dt>{etiqueta}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

function VistaHistorial({ itemTipo, id }) {
  const [prestamos, setPrestamos] = useState(null);
  useEffect(() => {
    Promise.all([api.listarPrestamos({ estado: "activo", itemTipo, itemId: id }), api.listarPrestamos({ estado: "devuelto", itemTipo, itemId: id })]).then(
      ([activos, devueltos]) => setPrestamos([...activos, ...devueltos]),
      () => setPrestamos([])
    );
  }, [itemTipo, id]);
  if (prestamos === null) return <p>Cargando…</p>;
  return (
    <>
      <h2>Historial de préstamos</h2>
      {prestamos.length === 0 ? (
        <p>Todavía no se prestó.</p>
      ) : (
        <div className="tabla-desplazable">
          <table>
            <thead>
              <tr>
                <th>Socio</th>
                <th>Ejemplar</th>
                <th>Prestado el</th>
                <th>Vence o venció</th>
                <th>Devuelto el</th>
              </tr>
            </thead>
            <tbody>
              {prestamos.map((p) => (
                <tr key={p._id}>
                  <td>{p.socio ? <Link to={`/socios/${p.socioId}`}>{nombreSocio(p.socio)}</Link> : "Socio dado de baja"}</td>
                  <td>{p.ejemplar?.codigoBarras ?? "—"}</td>
                  <td>{fechaCorta(p.fechaEntrega)}</td>
                  <td>{fechaCorta(p.fechaVencimiento)}</td>
                  <td>{p.fechaDevolucion ? fechaCorta(p.fechaDevolucion) : "Todavía prestado"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function FichaMaterialPanel() {
  const { itemTipo, id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { sesion } = useAuth();
  const [datos, setDatos] = useState(undefined);
  const [ejemplares, setEjemplares] = useState([]);
  const [error, setError] = useState("");
  const [aviso] = useState(location.state?.aviso ?? "");
  const [aImprimir, setAImprimir] = useState(null);
  const tipo = TIPO_POR_ITEM[itemTipo];
  const vista = params.get("vista") || "normal";

  const cargar = useCallback(async () => {
    try {
      const d = await api.obtenerMaterial(itemTipo, id);
      // Los dos juntos: la pestaña Ítems toma la signatura sugerida al abrirse.
      const ejs = d.circula ? await api.listarEjemplares(itemTipo, id) : [];
      setEjemplares(ejs);
      setDatos(d);
    } catch (err) {
      if (err.status === 404) setDatos(null);
      else setError(err.message);
    }
  }, [itemTipo, id]);

  useEffect(() => {
    setDatos(undefined);
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (datos) document.title = `${datos.item.titulo} · Catálogo`;
  }, [datos]);

  const terminarImpresion = useCallback(() => setAImprimir(null), []);

  if (datos === undefined) return error ? <div className="flash error" role="alert">{error}</div> : <p>Cargando…</p>;
  if (datos === null || !tipo) {
    return (
      <>
        <h1>Material no encontrado</h1>
        <p>
          Puede que se haya dado de baja. <Link to="/catalogo">Volver al catálogo</Link>
        </p>
      </>
    );
  }

  const puedeCatalogar = tienePermiso(sesion, "catalogar");
  const puedeReservar = tienePermiso(sesion, "prestamos");
  const vistas = VISTAS.filter((v) => (!v.soloCircula || datos.circula) && (!v.soloMarc || !SIN_MARC.includes(itemTipo)));
  const irA = (clave, extra = {}) => setParams({ ...(clave === "normal" ? {} : { vista: clave }), ...extra });

  async function eliminar() {
    if (ejemplares.some((e) => e.estado !== "disponible")) {
      setError("Tiene ejemplares prestados o apartados: primero hay que resolver eso.");
      return;
    }
    if (!window.confirm(`¿Dar de baja «${datos.item.titulo}»? Queda guardado y se puede recuperar desde la base de datos.`)) return;
    try {
      await api[`eliminar${itemTipo}`](id);
      navigate("/catalogo", { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="ficha-material-panel">
      <nav className="ficha-material-panel__vistas" aria-label="Vistas del material">
        {vistas.map((v) => (
          <button key={v.clave} type="button" className={vista === v.clave ? "es-activa" : ""} aria-current={vista === v.clave ? "page" : undefined} onClick={() => irA(v.clave)}>
            {v.texto}
            {v.clave === "items" && ` (${ejemplares.length})`}
            {v.clave === "reservas" && datos.reservasAbiertas > 0 && ` (${datos.reservasAbiertas})`}
          </button>
        ))}
      </nav>

      <div className="ficha-material-panel__principal">
        <div className="barra-herramientas" role="toolbar" aria-label="Acciones sobre el material">
          {puedeCatalogar && (
            <Link className="boton-enlace secundario" to={`/catalogar/${tipo.segmento}`}>
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Nuevo
            </Link>
          )}
          {puedeCatalogar && (
            <Link className="boton-enlace secundario" to={`/catalogar/${tipo.segmento}/${id}`}>
              <Pencil size={16} strokeWidth={1.5} aria-hidden="true" /> Editar registro
            </Link>
          )}
          {puedeCatalogar && datos.circula && (
            <button type="button" className="secundario" onClick={() => irA("items")}>
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Agregar ítem
            </button>
          )}
          {puedeReservar && datos.circula && (
            <button type="button" className="secundario" onClick={() => irA("reservas")}>
              <CalendarPlus size={16} strokeWidth={1.5} aria-hidden="true" /> Reservar
            </button>
          )}
          <button type="button" className="secundario" onClick={() => window.print()}>
            <Printer size={16} strokeWidth={1.5} aria-hidden="true" /> Imprimir
          </button>
          {puedeCatalogar && (
            <button type="button" className="peligro" onClick={eliminar}>
              <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" /> Dar de baja
            </button>
          )}
        </div>

        <nav aria-label="Ubicación" className="migas">
          <ol>
            <li>
              <Link to="/catalogo">Catálogo</Link>
            </li>
            <li>
              <Link to={`/catalogo?tipo=${itemTipo}`}>{tipo.plural}</Link>
            </li>
            <li aria-current="page">{datos.item.titulo}</li>
          </ol>
        </nav>
        <h1>
          {datos.item.titulo}
          {datos.item.subtitulo && <span className="subtitulo-ficha">: {datos.item.subtitulo}</span>}
        </h1>
        {error && <div className="flash error" role="alert">{error}</div>}
        {aviso && <div className="flash ok" role="status">{aviso}</div>}

        {vista === "normal" && (
          <VistaNormal datos={datos} ejemplares={ejemplares} onEditarEjemplar={(eid) => irA("items", { editar: eid })} onImprimir={setAImprimir} puedeCatalogar={puedeCatalogar} />
        )}
        {vista === "marc" && <VistaMarc itemTipo={itemTipo} id={id} />}
        {vista === "isbd" && <VistaIsbd datos={datos} ejemplares={ejemplares} />}
        {vista === "items" && datos.circula && (
          <>
            <h2>Ítems</h2>
            <PestanaItems
              itemTipo={itemTipo}
              itemId={id}
              signaturaSugerida={ejemplares[0]?.signatura}
              ejemplares={ejemplares}
              onCambio={cargar}
              editarId={params.get("editar")}
              onImprimir={setAImprimir}
              puedeCatalogar={puedeCatalogar}
            />
          </>
        )}
        {vista === "reservas" && datos.circula && (
          <PestanaReservas
            itemTipo={itemTipo}
            itemId={id}
            titulo={datos.item.titulo}
            ejemplares={ejemplares}
            socioInicial={params.get("socio")}
            onCambio={cargar}
            puedeReservar={puedeReservar}
          />
        )}
        {vista === "historial" && datos.circula && <VistaHistorial itemTipo={itemTipo} id={id} />}
      </div>
      <EtiquetasLomo ejemplares={aImprimir} alTerminar={terminarImpresion} />
    </div>
  );
}
