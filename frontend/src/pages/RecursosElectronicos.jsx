import React from "react";
import api from "../api.js";
import Campo from "../Campo.jsx";
import GestorPortada from "../GestorPortada.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { usePrecargar } from "../usePrecargar.js";

const TIPOS_RECURSO = [
  { valor: "pdf", etiqueta: "PDF" },
  { valor: "epub", etiqueta: "EPUB" },
  { valor: "mobi", etiqueta: "MOBI" },
  { valor: "html", etiqueta: "HTML" },
  { valor: "sitio_web", etiqueta: "Sitio web" },
  { valor: "base_de_datos", etiqueta: "Base de datos" },
  { valor: "software", etiqueta: "Software" },
];

const VACIO = {
  titulo: "",
  subtitulo: "",
  autoresTexto: "",
  editorial: "",
  anio: "",
  tipoRecurso: "pdf",
  urlAcceso: "",
  portadaUrl: "",
  materiasTexto: "",
  notas: "",
};

function aLista(texto) {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Punto y coma, no coma: ver el mismo comentario en Libros.jsx (BIBL-5 en
// AUDITORIA.md) — un autor puede traer una coma adentro ("Apellido, Nombre").
function aListaAutores(texto) {
  return texto
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapEntidadAForm(recurso) {
  return {
    titulo: recurso.titulo || "",
    subtitulo: recurso.subtitulo || "",
    autoresTexto: (recurso.autores || []).join("; "),
    editorial: recurso.editorial || "",
    anio: recurso.anio || "",
    tipoRecurso: recurso.tipoRecurso || "pdf",
    urlAcceso: recurso.urlAcceso || "",
    portadaUrl: recurso.portadaUrl || "",
    materiasTexto: (recurso.materias || []).join(", "),
    notas: recurso.notas || "",
  };
}

function mapFormADatos(form) {
  return {
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    autores: aListaAutores(form.autoresTexto),
    editorial: form.editorial,
    anio: form.anio,
    tipoRecurso: form.tipoRecurso,
    urlAcceso: form.urlAcceso,
    portadaUrl: form.portadaUrl,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
  };
}

export default function RecursosElectronicos({ entidad, alGuardar, alCancelar }) {
  const {
    form,
    editandoId,
    error,
    guardando,
    onEditar,
    onCancelarEdicion,
    onCambiarCampo,
    onSubmit,
  } = useListaCrud({
    crear: (datos) => api.crearRecursoElectronico(datos),
    actualizar: (id, datos) => api.actualizarRecursoElectronico(id, datos),
    vacio: VACIO,
    mapEntidadAForm,
    mapFormADatos,
    alGuardar,
    alCancelar,
  });

  usePrecargar(entidad, onEditar);

  return (
    <>
      <h1>Recursos electrónicos</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar recurso electrónico" : "Nuevo recurso electrónico"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        <Campo nombre="titulo" etiqueta="Título (245$a) *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="subtitulo" etiqueta="Subtítulo (245$b)" form={form} onCambiar={onCambiarCampo} />
        <GestorPortada itemTipo="RecursoElectronico" itemId={editandoId} titulo={form.titulo} />
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
        <Campo nombre="editorial" etiqueta="Editorial (260$b)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="anio" etiqueta="Año (260$c)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="tipoRecurso"
          etiqueta="Tipo de recurso (256$a)"
          tipo="select"
          opciones={TIPOS_RECURSO}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo
          nombre="urlAcceso"
          etiqueta="URL de acceso (856$u) *"
          type="url"
          form={form}
          onCambiar={onCambiarCampo}
          required
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
        <p>
          <small>
            No tiene ejemplares ni se presta: el socio accede directo desde el catálogo público con la URL de
            acceso.
          </small>
        </p>
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar"}
        </button>{" "}
        {(editandoId || alCancelar) && (
          <button type="button" className="secundario" onClick={onCancelarEdicion}>
            Cancelar
          </button>
        )}
      </form>
    </>
  );
}
