import React from "react";
import api from "../api.js";
import Campo from "../Campo.jsx";
import GestorPortada from "../GestorPortada.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { usePrecargar } from "../usePrecargar.js";
import { aEjemplares } from "../ejemplaresTexto.js";

const PERIODICIDADES = [
  { valor: "diaria", etiqueta: "Diaria" },
  { valor: "semanal", etiqueta: "Semanal" },
  { valor: "quincenal", etiqueta: "Quincenal" },
  { valor: "mensual", etiqueta: "Mensual" },
  { valor: "bimestral", etiqueta: "Bimestral" },
  { valor: "trimestral", etiqueta: "Trimestral" },
  { valor: "cuatrimestral", etiqueta: "Cuatrimestral" },
  { valor: "semestral", etiqueta: "Semestral" },
  { valor: "anual", etiqueta: "Anual" },
  { valor: "irregular", etiqueta: "Irregular" },
];

const VACIO = {
  issn: "",
  titulo: "",
  subtitulo: "",
  autoresTexto: "",
  editorial: "",
  lugarPublicacion: "",
  periodicidad: "irregular",
  numeracionInicial: "",
  anioInicio: "",
  anioFin: "",
  materiasTexto: "",
  notas: "",
  portadaUrl: "",
  ejemplaresTexto: "",
};

function aLista(texto) {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Punto y coma, no coma: ver el mismo comentario en Libros.jsx (BIBL-5 en
// AUDITORIA.md) — una entidad responsable puede traer una coma adentro.
function aListaAutores(texto) {
  return texto
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapEntidadAForm(seriada) {
  return {
    issn: seriada.issn || "",
    titulo: seriada.titulo || "",
    subtitulo: seriada.subtitulo || "",
    autoresTexto: (seriada.autores || []).join("; "),
    editorial: seriada.editorial || "",
    lugarPublicacion: seriada.lugarPublicacion || "",
    periodicidad: seriada.periodicidad || "irregular",
    numeracionInicial: seriada.numeracionInicial || "",
    anioInicio: seriada.anioInicio || "",
    anioFin: seriada.anioFin || "",
    materiasTexto: (seriada.materias || []).join(", "),
    notas: seriada.notas || "",
    portadaUrl: seriada.portadaUrl || "",
    ejemplaresTexto: "",
  };
}

function mapFormADatos(form) {
  return {
    issn: form.issn,
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    autores: aListaAutores(form.autoresTexto),
    editorial: form.editorial,
    lugarPublicacion: form.lugarPublicacion,
    periodicidad: form.periodicidad,
    numeracionInicial: form.numeracionInicial,
    anioInicio: form.anioInicio,
    anioFin: form.anioFin,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
    portadaUrl: form.portadaUrl,
  };
}

export default function Seriadas({ entidad, alGuardar, alCancelar }) {
  const {
    items: seriadas,
    form,
    editandoId,
    error,
    guardando,
    onEditar,
    onCancelarEdicion,
    onCambiarCampo,
    onSubmit,
  } = useListaCrud({
    crear: (datos, form) => api.crearSeriada({ ...datos, ejemplares: aEjemplares(form.ejemplaresTexto) }),
    actualizar: (id, datos) => api.actualizarSeriada(id, datos),
    vacio: VACIO,
    mapEntidadAForm,
    mapFormADatos,
    alGuardar,
    alCancelar,
  });

  usePrecargar(entidad, onEditar);

  return (
    <>
      <h1>Publicaciones seriadas</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar publicación seriada" : "Nueva publicación seriada"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        <Campo nombre="titulo" etiqueta="Título (245$a) *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="subtitulo" etiqueta="Subtítulo (245$b)" form={form} onCambiar={onCambiarCampo} />
        <GestorPortada itemTipo="Seriada" itemId={editandoId} titulo={form.titulo} />
        <Campo
          nombre="autoresTexto"
          etiqueta="Entidad(es) responsable(s) (separadas por punto y coma) (710$a)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <p>
          <small>
            Punto y coma entre una entidad y la siguiente — no coma, porque el nombre de una entidad puede traer
            una coma adentro.
          </small>
        </p>
        <Campo nombre="issn" etiqueta="ISSN (022$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="editorial" etiqueta="Editorial (260$b)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="lugarPublicacion" etiqueta="Lugar de publicación (260$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="periodicidad"
          etiqueta="Periodicidad (310$a)"
          tipo="select"
          opciones={PERIODICIDADES}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo
          nombre="numeracionInicial"
          etiqueta="Numeración inicial (ej: Vol. 1, no. 1) (362$a)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="anioInicio" etiqueta="Año de inicio (362$a)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="anioFin"
          etiqueta="Año de cierre (vacío si sigue publicándose) (362$a)"
          form={form}
          onCambiar={onCambiarCampo}
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
        {editandoId ? (
          <p>
            <small>
              Los ejemplares (copias, códigos de barras, si se prestan) se agregan y editan en la pestaña «Ítems» de la ficha del material.
            </small>
          </p>
        ) : (
          <label>
            Ejemplares (uno por línea: código de barras, signatura) (952$p / $o)
            <textarea
              rows={3}
              placeholder={"BPSJ-R-000001, 2024 v.1\nBPSJ-R-000002, 2024 v.2"}
              value={form.ejemplaresTexto}
              onChange={(e) => onCambiarCampo("ejemplaresTexto", e.target.value)}
            />
            <small>
              Igual que en Libros: la coma separa el código de barras de la signatura <em>dentro de la misma
              línea</em> — cada línea nueva es un ejemplar (fascículo/volumen) distinto.
            </small>
          </label>
        )}
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
