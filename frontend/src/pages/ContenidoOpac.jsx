import React, { useEffect, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import api from "../api.js";
import TextoSeguro from "../TextoSeguro.jsx";
import { contrasteDelAcento, CONTRASTE_MINIMO, esColorValido, TEXTO_SOBRE_ACENTO } from "../marca.js";

// CMS del OPAC: lo que ve el público en el catálogo de esta biblioteca
// (identidad, logos, contacto, avisos y páginas). Se edita un borrador; lo
// publica un admin, supervisor o superbibliotecario, y cada publicación
// queda en el historial (ver backend/src/routes/contenido.js).

const ORIGEN_API = import.meta.env.VITE_API_URL || "";
const MAX_AVISOS = 10;
const MAX_PAGINAS = 20;
const MAX_LOGO_BYTES = 1024 * 1024;

const SLOTS_LOGO = [
  { clave: "cuadrado", etiqueta: "Logo cuadrado (escudo o isotipo)" },
  { clave: "horizontal", etiqueta: "Logo horizontal (con el nombre)" },
  { clave: "oscuro", etiqueta: "Logo para fondo oscuro (barra superior del catálogo)" },
];

const DISPOSITIVOS = [
  { etiqueta: "Celular", ancho: 360 },
  { etiqueta: "Tablet", ancho: 768 },
  { etiqueta: "Escritorio", ancho: 1280 },
];

const AYUDA_FORMATO =
  "Formato: **negrita**, *cursiva*, listas con «- » o «1. » y enlaces [texto](https://…). Una línea en blanco separa párrafos. No se acepta HTML.";

export function slugDe(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function fechaHora(fecha) {
  return fecha ? new Date(fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "";
}

function MuestraContraste({ color }) {
  if (!esColorValido(color)) return <p className="categoria__nota">Usá el formato #RRGGBB (por ejemplo #ff8300).</p>;
  const valor = contrasteDelAcento(color);
  const alcanza = valor >= CONTRASTE_MINIMO;
  const Icono = alcanza ? Check : TriangleAlert;
  return (
    <div className="muestra-acento">
      <span className="muestra-acento__boton" style={{ background: color, color: TEXTO_SOBRE_ACENTO }}>
        Pedir préstamo
      </span>
      <span className={alcanza ? "contraste-ok" : "contraste-mal"} role="status">
        <Icono size={16} strokeWidth={1.5} aria-hidden="true" /> Texto sobre este color: {valor.toFixed(2)}:1
        {alcanza ? " — se lee bien." : ` — hace falta al menos ${CONTRASTE_MINIMO}:1 para publicar. Probá un tono más claro.`}
      </span>
    </div>
  );
}

function TextoConFormato({ etiqueta, valor, onCambiar, filas = 4, maxLength }) {
  return (
    <>
      <label>
        {etiqueta}
        <textarea rows={filas} value={valor} maxLength={maxLength} onChange={(e) => onCambiar(e.target.value)} />
      </label>
      <p className="categoria__nota">{AYUDA_FORMATO}</p>
      {valor.trim() && (
        <details className="previa-texto">
          <summary>Ver cómo queda</summary>
          <TextoSeguro texto={valor} className="texto-cms" />
        </details>
      )}
    </>
  );
}

export default function ContenidoOpac() {
  const [estado, setEstado] = useState(null); // respuesta de GET /contenido/borrador
  const [datos, setDatos] = useState(null);
  const [guardado, setGuardado] = useState(""); // lo último guardado, para saber si hay cambios
  const [versiones, setVersiones] = useState([]);
  const [error, setError] = useState("");
  const [errores, setErrores] = useState([]);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(null);
  const [anchoVista, setAnchoVista] = useState(null);
  const [recargaVista, setRecargaVista] = useState(0);

  function aplicar(nuevo) {
    setEstado(nuevo);
    setDatos(nuevo.datos);
    setGuardado(JSON.stringify(nuevo.datos));
    setRecargaVista((n) => n + 1);
  }

  async function cargar() {
    const [borrador, lista] = await Promise.all([api.obtenerBorradorContenido(), api.listarVersionesContenido()]);
    aplicar(borrador);
    setVersiones(lista);
  }

  useEffect(() => {
    cargar().catch((err) => setError(err.message));
  }, []);

  const hayCambios = Boolean(datos) && JSON.stringify(datos) !== guardado;

  useEffect(() => {
    if (!hayCambios) return undefined;
    function avisar(e) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayCambios]);

  // Cambios sobre una copia: el estado nunca se muta en el lugar.
  function editar(cambio) {
    setDatos((actual) => {
      const copia = structuredClone(actual);
      cambio(copia);
      return copia;
    });
    setAviso("");
  }

  async function ejecutar(accion, llamada, mensajeOk) {
    setOcupado(accion);
    setError("");
    setErrores([]);
    setAviso("");
    try {
      const resultado = await llamada();
      if (mensajeOk) setAviso(mensajeOk);
      return resultado;
    } catch (err) {
      setError(err.message);
      setErrores(err.datos?.errores || []);
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function onGuardar(e) {
    e.preventDefault();
    const nuevo = await ejecutar("guardar", () => api.guardarBorradorContenido(datos), "Borrador guardado.");
    if (nuevo) {
      aplicar(nuevo);
      setVersiones(await api.listarVersionesContenido());
    }
  }

  async function onPublicar() {
    if (!window.confirm("¿Publicar estos cambios? Los va a ver cualquiera que entre al catálogo.")) return;
    const r = await ejecutar("publicar", () => api.publicarContenido());
    if (r) {
      await cargar();
      setAviso(`Publicado: versión ${r.version}.`);
    }
  }

  async function onDescartar() {
    if (!window.confirm("¿Descartar el borrador? Se pierden los cambios que no se publicaron.")) return;
    const nuevo = await ejecutar("descartar", () => api.descartarBorradorContenido(), "Borrador descartado.");
    if (nuevo) {
      aplicar(nuevo);
      setVersiones(await api.listarVersionesContenido());
    }
  }

  async function onRestaurar(v) {
    if (!window.confirm(`¿Usar la versión ${v.version} como borrador? Reemplaza el borrador actual; no se publica sola.`)) return;
    const nuevo = await ejecutar("restaurar", () => api.restaurarVersionContenido(v._id), `Versión ${v.version} restaurada como borrador.`);
    if (nuevo) {
      aplicar(nuevo);
      setVersiones(await api.listarVersionesContenido());
    }
  }

  async function onSubirLogo(slot, archivo) {
    if (!archivo) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(archivo.type)) {
      setError("Subí una imagen PNG, JPG o WebP.");
      return;
    }
    if (archivo.size > MAX_LOGO_BYTES) {
      setError("La imagen pesa más de 1 MB.");
      return;
    }
    const subida = await ejecutar(`logo-${slot}`, () => api.subirImagenContenido(archivo), "Logo cargado. Guardá el borrador para conservarlo.");
    if (subida) editar((d) => (d.identidad.logos[slot] = subida.id));
  }

  if (!datos) {
    return (
      <>
        <h1>Contenido del OPAC</h1>
        {error ? <div className="flash error" role="alert">{error}</div> : <p>Cargando…</p>}
      </>
    );
  }

  const { identidad, contacto, avisos, paginas } = datos;
  const urlLogo = (id) => (id ? `${ORIGEN_API}/api/v1/opac/${estado.codigo}/imagenes/${id}.webp` : null);
  const falta = estado.faltaParaPublicar;
  const puedePublicarAhora = estado.puedePublicar && estado.borrador && !hayCambios && falta.length === 0;

  return (
    <>
      <h1>Contenido del OPAC</h1>
      <p className="categoria__nota">
        {estado.publicada
          ? `Publicada: versión ${estado.publicada.version} (${fechaHora(estado.publicada.publicadoEn)}).`
          : "Todavía no se publicó nada: el catálogo muestra solo el nombre de la biblioteca."}{" "}
        {estado.borrador
          ? `Borrador: versión ${estado.borrador.version}${
              estado.borrador.restauradaDe ? ` (restaurada de la ${estado.borrador.restauradaDe})` : ""
            }, guardado ${fechaHora(estado.borrador.actualizadoEn)}.`
          : "No hay cambios en borrador."}
      </p>
      {error && (
        <div className="flash error" role="alert">
          {errores.length > 1 ? (
            <>
              Hay que corregir:
              <ul>
                {errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          ) : (
            error
          )}
        </div>
      )}
      {aviso && <div className="flash ok" role="status">{aviso}</div>}

      <form className="contenido-opac" onSubmit={onGuardar}>
        <fieldset className="card">
          <legend>Identidad</legend>
          <label>
            Nombre de la institución *
            <input value={identidad.nombre} maxLength={120} onChange={(e) => editar((d) => (d.identidad.nombre = e.target.value))} />
          </label>
          <label>
            Nombre legal (para el pie y los textos legales)
            <input value={identidad.nombreLegal} maxLength={160} onChange={(e) => editar((d) => (d.identidad.nombreLegal = e.target.value))} />
          </label>
          <div className="campo-color">
            <label>
              Color de acento
              <input
                type="color"
                value={esColorValido(identidad.colorAcento) ? identidad.colorAcento : "#ff8300"}
                onChange={(e) => editar((d) => (d.identidad.colorAcento = e.target.value))}
              />
            </label>
            <label>
              Código del color
              <input
                value={identidad.colorAcento}
                maxLength={7}
                spellCheck={false}
                onChange={(e) => editar((d) => (d.identidad.colorAcento = e.target.value.trim()))}
              />
            </label>
          </div>
          <MuestraContraste color={identidad.colorAcento} />
        </fieldset>

        <fieldset className="card">
          <legend>Logos</legend>
          <p className="categoria__nota">PNG, JPG o WebP de hasta 1 MB. El sistema los achica y les quita los metadatos.</p>
          <div className="slots-logo">
            {SLOTS_LOGO.map(({ clave, etiqueta }) => {
              const id = identidad.logos[clave];
              return (
                <div key={clave} className={`slot-logo${clave === "oscuro" ? " slot-logo--oscuro" : ""}`}>
                  <span className="slot-logo__etiqueta">{etiqueta}</span>
                  <div className="slot-logo__vista">
                    {id ? <img src={urlLogo(id)} alt={etiqueta} /> : <span className="categoria__nota">Sin logo</span>}
                  </div>
                  <label className="boton-archivo">
                    {ocupado === `logo-${clave}` ? "Subiendo…" : id ? "Cambiar" : "Subir"}
                    <span className="sr-only"> {etiqueta}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={ocupado !== null}
                      onChange={(e) => {
                        onSubirLogo(clave, e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {id && (
                    <button type="button" className="secundario" onClick={() => editar((d) => (d.identidad.logos[clave] = null))}>
                      Quitar<span className="sr-only"> {etiqueta}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="card">
          <legend>Contacto</legend>
          <div className="campos-reglas">
            {[
              ["email", "Correo", "email", 120],
              ["telefono", "Teléfono", "tel", 40],
              ["direccion", "Dirección", "text", 200],
              ["horario", "Horario de atención", "text", 200],
              ["web", "Sitio web de la institución", "url", 200],
            ].map(([campo, etiqueta, tipo, max]) => (
              <label key={campo}>
                {etiqueta}
                <input type={tipo} value={contacto[campo]} maxLength={max} onChange={(e) => editar((d) => (d.contacto[campo] = e.target.value))} />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="card">
          <legend>Avisos</legend>
          <p className="categoria__nota">Aparecen arriba del catálogo entre las fechas que elijas (sin fechas: siempre).</p>
          {avisos.map((a, i) => (
            <div key={i} className="item-contenido">
              <label>
                Título *
                <input value={a.titulo} maxLength={120} onChange={(e) => editar((d) => (d.avisos[i].titulo = e.target.value))} />
              </label>
              <TextoConFormato etiqueta="Texto" valor={a.texto} maxLength={2000} onCambiar={(v) => editar((d) => (d.avisos[i].texto = v))} />
              <div className="campos-reglas">
                <label>
                  Desde
                  <input type="date" value={a.desde || ""} onChange={(e) => editar((d) => (d.avisos[i].desde = e.target.value || null))} />
                </label>
                <label>
                  Hasta
                  <input type="date" value={a.hasta || ""} onChange={(e) => editar((d) => (d.avisos[i].hasta = e.target.value || null))} />
                </label>
              </div>
              <button type="button" className="peligro" onClick={() => editar((d) => d.avisos.splice(i, 1))}>
                Quitar aviso<span className="sr-only"> {a.titulo}</span>
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secundario"
            disabled={avisos.length >= MAX_AVISOS}
            onClick={() => editar((d) => d.avisos.push({ titulo: "", texto: "", desde: null, hasta: null }))}
          >
            Agregar aviso
          </button>
        </fieldset>

        <fieldset className="card">
          <legend>Páginas</legend>
          <p className="categoria__nota">
            Se enlazan en el pie del catálogo. Las legales (términos, reglamento, privacidad) muestran versión, vigencia y
            responsable.
          </p>
          {paginas.map((p, i) => (
            <div key={i} className="item-contenido">
              <label>
                Título *
                <input
                  value={p.titulo}
                  maxLength={120}
                  onChange={(e) =>
                    editar((d) => {
                      const pagina = d.paginas[i];
                      // La dirección sigue al título mientras nadie la cambie a mano.
                      if (!pagina.slug || pagina.slug === slugDe(pagina.titulo)) pagina.slug = slugDe(e.target.value);
                      pagina.titulo = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Dirección *
                <input value={p.slug} maxLength={60} spellCheck={false} onChange={(e) => editar((d) => (d.paginas[i].slug = slugDe(e.target.value)))} />
              </label>
              <p className="categoria__nota">
                Queda en /opac/{estado.codigo}/pagina/{p.slug || "…"}
              </p>
              <label style={{ fontWeight: "normal" }}>
                <input
                  type="checkbox"
                  checked={Boolean(p.legal)}
                  onChange={(e) =>
                    editar((d) => (d.paginas[i].legal = e.target.checked ? { responsable: "", version: "", vigenteDesde: null } : null))
                  }
                />{" "}
                Es un texto legal (términos, reglamento, privacidad)
              </label>
              {p.legal && (
                <div className="campos-reglas">
                  <label>
                    Responsable *
                    <input value={p.legal.responsable} maxLength={120} onChange={(e) => editar((d) => (d.paginas[i].legal.responsable = e.target.value))} />
                  </label>
                  <label>
                    Versión *
                    <input value={p.legal.version} maxLength={30} placeholder="1.0" onChange={(e) => editar((d) => (d.paginas[i].legal.version = e.target.value))} />
                  </label>
                  <label>
                    Vigente desde *
                    <input
                      type="date"
                      value={p.legal.vigenteDesde || ""}
                      onChange={(e) => editar((d) => (d.paginas[i].legal.vigenteDesde = e.target.value || null))}
                    />
                  </label>
                </div>
              )}
              <TextoConFormato etiqueta="Texto *" valor={p.cuerpo} filas={10} maxLength={20000} onCambiar={(v) => editar((d) => (d.paginas[i].cuerpo = v))} />
              <button type="button" className="peligro" onClick={() => editar((d) => d.paginas.splice(i, 1))}>
                Quitar página<span className="sr-only"> {p.titulo}</span>
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secundario"
            disabled={paginas.length >= MAX_PAGINAS}
            onClick={() => editar((d) => d.paginas.push({ titulo: "", slug: "", cuerpo: "", legal: null }))}
          >
            Agregar página
          </button>
        </fieldset>

        <div className="barra-contenido">
          {/* Sin borrador todavía se puede guardar igual: así se crea el primero. */}
          <button type="submit" disabled={ocupado !== null || (!hayCambios && Boolean(estado.borrador))} aria-busy={ocupado === "guardar"}>
            {ocupado === "guardar" ? "Guardando…" : "Guardar borrador"}
          </button>
          <button type="button" className="secundario" onClick={() => setAnchoVista(anchoVista ? null : 360)}>
            {anchoVista ? "Cerrar vista previa" : "Vista previa"}
          </button>
          {estado.puedePublicar && (
            <button type="button" onClick={onPublicar} disabled={ocupado !== null || !puedePublicarAhora} aria-busy={ocupado === "publicar"}>
              {ocupado === "publicar" ? "Publicando…" : "Publicar"}
            </button>
          )}
          {estado.puedePublicar && estado.borrador && (
            <button type="button" className="peligro" onClick={onDescartar} disabled={ocupado !== null}>
              Descartar borrador
            </button>
          )}
          <span className="categoria__nota" role="status">
            {hayCambios
              ? "Hay cambios sin guardar."
              : !estado.puedePublicar
                ? "Lo publica un admin, supervisor o superbibliotecario."
                : !estado.borrador
                  ? "Sin cambios para publicar."
                  : ""}
          </span>
        </div>
      </form>

      {estado.borrador && falta.length > 0 && (
        <div className="flash aviso" role="status">
          Para publicar falta:
          <ul>
            {falta.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {anchoVista && (
        <section className="vista-previa card" aria-label="Vista previa del catálogo">
          <div className="categoria__acciones" role="group" aria-label="Tamaño de pantalla">
            {DISPOSITIVOS.map((d) => (
              <button
                key={d.ancho}
                type="button"
                className={anchoVista === d.ancho ? "" : "secundario"}
                aria-pressed={anchoVista === d.ancho}
                onClick={() => setAnchoVista(d.ancho)}
              >
                {d.etiqueta}
              </button>
            ))}
          </div>
          <p className="categoria__nota">Muestra el último borrador guardado (o lo publicado, si no hay borrador).</p>
          <div className="vista-previa__marco">
            <iframe key={recargaVista} title="Vista previa del catálogo" src={`/opac/${estado.codigo}?vistaPrevia=1`} style={{ width: anchoVista }} />
          </div>
        </section>
      )}

      <section className="card">
        <h2>Historial</h2>
        {versiones.length === 0 ? (
          <p>Todavía no hay versiones.</p>
        ) : (
          <ul className="lista-categorias">
            {versiones.map((v) => (
              <li key={v._id}>
                <div className="categoria__encabezado">
                  <strong>Versión {v.version}</strong>
                  <span className="pill-estado">{v.estado}</span>
                  <span className="categoria__nota">
                    {v.publicadoEn
                      ? `publicada ${fechaHora(v.publicadoEn)}${v.publicadoPor ? ` por ${v.publicadoPor}` : ""}`
                      : `editada ${fechaHora(v.actualizadoEn)}${v.actualizadoPor ? ` por ${v.actualizadoPor}` : ""}`}
                    {v.restauradaDe ? ` · restaurada de la ${v.restauradaDe}` : ""}
                  </span>
                </div>
                {estado.puedePublicar && v.estado !== "borrador" && (
                  <button type="button" className="secundario" onClick={() => onRestaurar(v)} disabled={ocupado !== null}>
                    Restaurar como borrador<span className="sr-only"> la versión {v.version}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
