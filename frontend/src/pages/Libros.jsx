import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";
import Campo from "../Campo.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { useEditarDesdeNavegacion } from "../useEditarDesdeNavegacion.js";
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
  cdu: "",
  dewey: "",
  titulo: "",
  subtitulo: "",
  mencionResponsabilidad: "",
  tituloVariante: "",
  edicion: "",
  autores: [""],
  autorCorporativo: "",
  editorial: "",
  lugarPublicacion: "",
  anio: "",
  paginas: "",
  detallesFisicos: "",
  dimensiones: "",
  materialComplementario: "",
  serie: "",
  serieVolumen: "",
  issn: "",
  materias: [""],
  notas: "",
  notaAudiencia: "",
  notaIdioma: "",
  subtipo: "impreso",
  urlAcceso: "",
  urlInstruccion: "",
  portadaUrl: "",
  ejemplaresTexto: "",
  ejemplaresExistentes: [],
  // Informativos (900/005) — no se mandan al servidor, ver mapFormADatos.
  creado: "",
  actualizado: "",
};

function mapEntidadAForm(libro) {
  return {
    isbn: libro.isbn || "",
    cdu: libro.cdu || "",
    dewey: libro.dewey || "",
    titulo: libro.titulo || "",
    subtitulo: libro.subtitulo || "",
    mencionResponsabilidad: libro.mencionResponsabilidad || "",
    tituloVariante: libro.tituloVariante || "",
    edicion: libro.edicion || "",
    autores: libro.autores?.length ? libro.autores : [""],
    autorCorporativo: libro.autorCorporativo || "",
    editorial: libro.editorial || "",
    lugarPublicacion: libro.lugarPublicacion || "",
    anio: libro.anio || "",
    paginas: libro.paginas || "",
    detallesFisicos: libro.detallesFisicos || "",
    dimensiones: libro.dimensiones || "",
    materialComplementario: libro.materialComplementario || "",
    serie: libro.serie || "",
    serieVolumen: libro.serieVolumen || "",
    issn: libro.issn || "",
    materias: libro.materias?.length ? libro.materias : [""],
    notas: libro.notas || "",
    notaAudiencia: libro.notaAudiencia || "",
    notaIdioma: libro.notaIdioma || "",
    subtipo: libro.subtipo || "impreso",
    urlAcceso: libro.urlAcceso || "",
    urlInstruccion: libro.urlInstruccion || "",
    portadaUrl: libro.portadaUrl || "",
    ejemplaresTexto: "",
    // Solo para mostrarlos (de solo lectura) mientras se edita — no se
    // manda de vuelta al servidor (ver mapFormADatos, que no la incluye).
    ejemplaresExistentes: libro.ejemplares || [],
    creado: libro.creado || "",
    actualizado: libro.actualizado || "",
  };
}

function limpiarLista(valores) {
  return valores.map((v) => v.trim()).filter(Boolean);
}

function mapFormADatos(form) {
  return {
    isbn: form.isbn,
    cdu: form.cdu,
    dewey: form.dewey,
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    mencionResponsabilidad: form.mencionResponsabilidad,
    tituloVariante: form.tituloVariante,
    edicion: form.edicion,
    autores: limpiarLista(form.autores),
    autorCorporativo: form.autorCorporativo,
    editorial: form.editorial,
    lugarPublicacion: form.lugarPublicacion,
    anio: form.anio,
    paginas: form.paginas,
    detallesFisicos: form.detallesFisicos,
    dimensiones: form.dimensiones,
    materialComplementario: form.materialComplementario,
    serie: form.serie,
    serieVolumen: form.serieVolumen,
    issn: form.issn,
    materias: limpiarLista(form.materias),
    notas: form.notas,
    notaAudiencia: form.notaAudiencia,
    notaIdioma: form.notaIdioma,
    subtipo: form.subtipo,
    urlAcceso: form.urlAcceso,
    urlInstruccion: form.urlInstruccion,
    portadaUrl: form.portadaUrl,
  };
}

// Las nueve solapas replican el layout del editor MARC de Koha ("Add MARC
// record"): cada una agrupa los campos/subcampos MARC21 que le
// corresponden, en el mismo orden. 952 (ejemplares) es un campo local de
// Koha, no del estándar — se deja como última solapa porque es donde
// vive el resto de los datos "operativos" (códigos de barras/signaturas).
const SOLAPAS_LIBRO = [
  { indice: 0, titulo: "Clasificación", tags: "000 · 020 · 080 · 082 · 900" },
  { indice: 1, titulo: "Autores", tags: "100 · 110 · 700" },
  { indice: 2, titulo: "Título y publicación", tags: "245 · 246 · 250 · 260" },
  { indice: 3, titulo: "Descripción física", tags: "300" },
  { indice: 4, titulo: "Serie", tags: "490" },
  { indice: 5, titulo: "Notas", tags: "500 · 521 · 546" },
  { indice: 6, titulo: "Materias", tags: "650" },
  { indice: 7, titulo: "Acceso electrónico", tags: "856" },
  { indice: 8, titulo: "Ejemplares", tags: "952 (local)" },
];

// Grupo de campos repetibles (100/700 para autores, 650 para materias): un
// "◨ Repetir" agrega una fila nueva vacía (como el ícono de duplicar del
// editor de Koha) y "✕ Quitar" borra una fila ya repetida — solo aparece
// si hay más de una, porque no tiene sentido "quitar" el único campo.
function GrupoRepetible({ valores, onCambiar, etiquetaFila, placeholder }) {
  function actualizarFila(indice, valor) {
    const copia = [...valores];
    copia[indice] = valor;
    onCambiar(copia);
  }
  function agregarFila() {
    onCambiar([...valores, ""]);
  }
  function quitarFila(indice) {
    const copia = valores.filter((_, i) => i !== indice);
    onCambiar(copia.length ? copia : [""]);
  }
  return (
    <div className="marc-grupo">
      {valores.map((valor, indice) => (
        <div className="marc-grupo__fila" key={indice}>
          <label>
            {etiquetaFila(indice)}
            <input value={valor} placeholder={placeholder} onChange={(e) => actualizarFila(indice, e.target.value)} />
          </label>
          <div className="marc-grupo__acciones">
            <button
              type="button"
              className="marc-icono-boton"
              onClick={agregarFila}
              title="Repetir este campo (agregar otro)"
              aria-label={`Repetir el campo ${etiquetaFila(indice)}`}
            >
              <span aria-hidden="true">⧉</span>
            </button>
            {valores.length > 1 && (
              <button
                type="button"
                className="marc-icono-boton marc-icono-boton--peligro"
                onClick={() => quitarFila(indice)}
                title="Quitar este campo repetido"
                aria-label={`Quitar el campo ${etiquetaFila(indice)}`}
              >
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function fechaLegible(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return null;
  }
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
    form,
    editandoId,
    error,
    guardando,
    recargar,
    onEditar,
    onCancelarEdicion,
    onCambiarCampo,
    onSubmit,
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

  // Si se llegó acá con "Editar" desde "Buscar en el catálogo" (ver
  // BuscarCatalogo.jsx), precarga esa entidad en el formulario.
  useEditarDesdeNavegacion(onEditar);

  const [solapaActiva, setSolapaActiva] = useState(0);
  useEffect(() => {
    setSolapaActiva(0);
  }, [editandoId]);

  return (
    <>
      <h1>Libros</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar libro" : "Nuevo libro"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}

        <div className="card marc-extra">
          <h3>Datos internos de SIBPSANJUAN</h3>
          <p className="marc-panel__ayuda">
            Estos dos campos no forman parte del estándar MARC21 — son de uso interno del sistema (ícono en el
            catálogo, imagen en el OPAC).
          </p>
          <Campo
            nombre="subtipo"
            etiqueta="Subtipo"
            tipo="select"
            opciones={SUBTIPOS_LIBRO}
            form={form}
            onCambiar={onCambiarCampo}
          />
          <Campo
            nombre="portadaUrl"
            etiqueta="URL de portada/imagen (opcional)"
            type="url"
            form={form}
            onCambiar={onCambiarCampo}
          />
        </div>

        <div className="marc-editor">
          <div className="marc-tabs" role="tablist" aria-label="Campos del registro bibliográfico (MARC21)">
            {SOLAPAS_LIBRO.map((s) => (
              <button
                key={s.indice}
                type="button"
                role="tab"
                id={`solapa-libro-${s.indice}`}
                aria-selected={solapaActiva === s.indice}
                aria-controls={`panel-libro-${s.indice}`}
                className="marc-tab"
                onClick={() => setSolapaActiva(s.indice)}
                title={s.tags}
              >
                <span className="marc-tab__numero">{s.indice}</span>
                {s.titulo}
              </button>
            ))}
          </div>

          <div
            id="panel-libro-0"
            role="tabpanel"
            aria-labelledby="solapa-libro-0"
            className="marc-panel"
            hidden={solapaActiva !== 0}
          >
            <h3>Clasificación</h3>
            <div className="marc-campo-fijo">
              000 — Registro bibliográfico de tipo Libro (MARC21 Bibliographic, nivel monografía).
            </div>
            <Campo nombre="isbn" etiqueta="ISBN (020 $a)" form={form} onCambiar={onCambiarCampo} />
            <Campo nombre="cdu" etiqueta="Clasificación Decimal Universal — CDU (080 $a)" form={form} onCambiar={onCambiarCampo} />
            <Campo nombre="dewey" etiqueta="Clasificación Decimal Dewey (082 $a)" form={form} onCambiar={onCambiarCampo} />
            {editandoId && (form.creado || form.actualizado) && (
              <div className="marc-campo-fijo">
                900 — Bibliotecario responsable: carga {fechaLegible(form.creado) || "—"}, última modificación{" "}
                {fechaLegible(form.actualizado) || "—"}.
              </div>
            )}
          </div>

          <div
            id="panel-libro-1"
            role="tabpanel"
            aria-labelledby="solapa-libro-1"
            className="marc-panel"
            hidden={solapaActiva !== 1}
          >
            <h3>Autores</h3>
            <p className="marc-panel__ayuda">
              El primer autor es el asiento principal (100); los que agregues con "Repetir" son asientos
              secundarios (700).
            </p>
            <GrupoRepetible
              valores={form.autores}
              onCambiar={(nuevos) => onCambiarCampo("autores", nuevos)}
              placeholder="Apellido, Nombre"
              etiquetaFila={(i) => (i === 0 ? "Autor/a principal (100 $a)" : `Autor/a secundario/a (700 $a)`)}
            />
            <Campo
              nombre="autorCorporativo"
              etiqueta="Entidad corporativa / institución responsable (110 $b)"
              form={form}
              onCambiar={onCambiarCampo}
            />
          </div>

          <div
            id="panel-libro-2"
            role="tabpanel"
            aria-labelledby="solapa-libro-2"
            className="marc-panel"
            hidden={solapaActiva !== 2}
          >
            <h3>Título y publicación</h3>
            <Campo nombre="titulo" etiqueta="Título propiamente dicho (245 $a) *" form={form} onCambiar={onCambiarCampo} required />
            <Campo nombre="subtitulo" etiqueta="Parte restante del título (245 $b)" form={form} onCambiar={onCambiarCampo} />
            <Campo
              nombre="mencionResponsabilidad"
              etiqueta="Mención de responsabilidad (245 $c)"
              form={form}
              onCambiar={onCambiarCampo}
              placeholder="ej. por Jorge Luis Borges"
            />
            <Campo nombre="tituloVariante" etiqueta="Forma variante del título (246)" form={form} onCambiar={onCambiarCampo} />
            <Campo nombre="edicion" etiqueta="Mención de edición (250 $a)" form={form} onCambiar={onCambiarCampo} placeholder="ej. 2a ed." />
            <Campo nombre="lugarPublicacion" etiqueta="Lugar de publicación (260 $a)" form={form} onCambiar={onCambiarCampo} />
            <Campo nombre="editorial" etiqueta="Nombre del editor (260 $b)" form={form} onCambiar={onCambiarCampo} />
            <Campo nombre="anio" etiqueta="Fecha de publicación (260 $c)" form={form} onCambiar={onCambiarCampo} />
          </div>

          <div
            id="panel-libro-3"
            role="tabpanel"
            aria-labelledby="solapa-libro-3"
            className="marc-panel"
            hidden={solapaActiva !== 3}
          >
            <h3>Descripción física</h3>
            <Campo nombre="paginas" etiqueta="Extensión — cantidad de páginas (300 $a)" form={form} onCambiar={onCambiarCampo} />
            <Campo
              nombre="detallesFisicos"
              etiqueta="Otros detalles físicos (300 $b)"
              form={form}
              onCambiar={onCambiarCampo}
              placeholder="ej. il."
            />
            <Campo nombre="dimensiones" etiqueta="Dimensiones (300 $c)" form={form} onCambiar={onCambiarCampo} placeholder="ej. 21 cm" />
            <Campo
              nombre="materialComplementario"
              etiqueta="Material complementario (300 $e)"
              form={form}
              onCambiar={onCambiarCampo}
              placeholder="ej. 1 CD-ROM"
            />
          </div>

          <div
            id="panel-libro-4"
            role="tabpanel"
            aria-labelledby="solapa-libro-4"
            className="marc-panel"
            hidden={solapaActiva !== 4}
          >
            <h3>Serie</h3>
            <Campo nombre="serie" etiqueta="Mención de serie (490 $a)" form={form} onCambiar={onCambiarCampo} />
            <Campo
              nombre="serieVolumen"
              etiqueta="Designación numérica/secuencial del volumen (490 $v)"
              form={form}
              onCambiar={onCambiarCampo}
            />
            <Campo nombre="issn" etiqueta="ISSN de la serie (490 $x)" form={form} onCambiar={onCambiarCampo} />
          </div>

          <div
            id="panel-libro-5"
            role="tabpanel"
            aria-labelledby="solapa-libro-5"
            className="marc-panel"
            hidden={solapaActiva !== 5}
          >
            <h3>Notas</h3>
            <label>
              Nota general (500 $a)
              <textarea value={form.notas} onChange={(e) => onCambiarCampo("notas", e.target.value)} />
            </label>
            <Campo
              nombre="notaAudiencia"
              etiqueta="Nota de audiencia (521 $a)"
              form={form}
              onCambiar={onCambiarCampo}
              placeholder="ej. Para niños de 8 a 10 años"
            />
            <Campo
              nombre="notaIdioma"
              etiqueta="Nota de idioma (546 $a)"
              form={form}
              onCambiar={onCambiarCampo}
              placeholder="ej. Texto en español, con resumen en inglés"
            />
          </div>

          <div
            id="panel-libro-6"
            role="tabpanel"
            aria-labelledby="solapa-libro-6"
            className="marc-panel"
            hidden={solapaActiva !== 6}
          >
            <h3>Materias</h3>
            <GrupoRepetible
              valores={form.materias}
              onCambiar={(nuevos) => onCambiarCampo("materias", nuevos)}
              placeholder="ej. Literatura argentina"
              etiquetaFila={(i) => `Materia ${i + 1} (650 $a)`}
            />
          </div>

          <div
            id="panel-libro-7"
            role="tabpanel"
            aria-labelledby="solapa-libro-7"
            className="marc-panel"
            hidden={solapaActiva !== 7}
          >
            <h3>Acceso electrónico</h3>
            <Campo
              nombre="urlInstruccion"
              etiqueta="Instrucción / texto del enlace (856 $i)"
              form={form}
              onCambiar={onCambiarCampo}
              placeholder="ej. Acceder al texto completo"
            />
            <Campo nombre="urlAcceso" etiqueta="Dirección web (856 $u)" type="url" form={form} onCambiar={onCambiarCampo} />
            <p>
              <small>
                Un libro puede tener ejemplares físicos y además una URL de acceso digital al mismo tiempo — el
                OPAC muestra las dos opciones si corresponde, no hace falta elegir una sola.
              </small>
            </p>
          </div>

          <div
            id="panel-libro-8"
            role="tabpanel"
            aria-labelledby="solapa-libro-8"
            className="marc-panel"
            hidden={solapaActiva !== 8}
          >
            <h3>Ejemplares</h3>
            <p className="marc-panel__ayuda">
              952 es un campo local (de Koha), no del estándar MARC21 — acá viven los códigos de barras y
              signaturas de cada copia física.
            </p>
            {editandoId ? (
              <div>
                <label>Ejemplares (952 $p / $o)</label>
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
                  onAgregado={(nuevo) => onCambiarCampo("ejemplaresExistentes", [...form.ejemplaresExistentes, nuevo])}
                />
              </div>
            ) : (
              <label>
                Ejemplares (uno por línea: código de barras, signatura) (952 $p / $o)
                <textarea
                  rows={3}
                  placeholder={"BPSJ-000001, 863 BOR\nBPSJ-000002, 863 BOR"}
                  value={form.ejemplaresTexto}
                  onChange={(e) => onCambiarCampo("ejemplaresTexto", e.target.value)}
                />
                <small>
                  A diferencia de Autores/Materias (donde cada fila es un ítem de la lista), acá la coma separa
                  el código de barras de la signatura <em>dentro de la misma línea</em> — cada línea nueva es un
                  ejemplar distinto.
                </small>
              </label>
            )}
          </div>
        </div>

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

      <p className="card">
        ¿Buscás un libro ya cargado (para editarlo, ver su ficha ISBD o eliminarlo)?{" "}
        <Link to="/catalogo">Buscá en el catálogo</Link> — ahí también aparecen el resto de los tipos de
        material, con filtros por autor, materia, tipo y disponibilidad.
      </p>
    </>
  );
}
