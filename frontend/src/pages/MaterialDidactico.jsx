import React from "react";
import api from "../api.js";
import Campo from "../Campo.jsx";
import GestorPortada from "../GestorPortada.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { usePrecargar } from "../usePrecargar.js";
import { aEjemplares } from "../ejemplaresTexto.js";

const SUBTIPOS = [
  { valor: "juego_educativo", etiqueta: "Juego educativo" },
  { valor: "kit_escolar", etiqueta: "Kit escolar" },
  { valor: "rompecabezas", etiqueta: "Rompecabezas" },
  { valor: "material_montessori", etiqueta: "Material Montessori" },
  { valor: "material_manipulativo", etiqueta: "Material manipulativo" },
];

const VACIO = {
  titulo: "",
  subtitulo: "",
  subtipo: "juego_educativo",
  componentes: "",
  edadRecomendada: "",
  portadaUrl: "",
  materiasTexto: "",
  notas: "",
  ejemplaresTexto: "",
};

function aLista(texto) {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapEntidadAForm(item) {
  return {
    titulo: item.titulo || "",
    subtitulo: item.subtitulo || "",
    subtipo: item.subtipo || "juego_educativo",
    componentes: item.componentes || "",
    edadRecomendada: item.edadRecomendada || "",
    portadaUrl: item.portadaUrl || "",
    materiasTexto: (item.materias || []).join(", "),
    notas: item.notas || "",
    ejemplaresTexto: "",
  };
}

function mapFormADatos(form) {
  return {
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    subtipo: form.subtipo,
    componentes: form.componentes,
    edadRecomendada: form.edadRecomendada,
    portadaUrl: form.portadaUrl,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
  };
}

export default function MaterialDidactico({ entidad, alGuardar, alCancelar }) {
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
    crear: (datos, form) => api.crearMaterialDidactico({ ...datos, ejemplares: aEjemplares(form.ejemplaresTexto) }),
    actualizar: (id, datos) => api.actualizarMaterialDidactico(id, datos),
    vacio: VACIO,
    mapEntidadAForm,
    mapFormADatos,
    alGuardar,
    alCancelar,
  });

  usePrecargar(entidad, onEditar);

  return (
    <>
      <h1>Material didáctico</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar material didáctico" : "Nuevo material didáctico"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        <Campo nombre="titulo" etiqueta="Título (245$a) *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="subtitulo" etiqueta="Subtítulo (245$b)" form={form} onCambiar={onCambiarCampo} />
        <GestorPortada itemTipo="MaterialDidactico" itemId={editandoId} titulo={form.titulo} />
        <Campo
          nombre="subtipo"
          etiqueta="Subtipo"
          tipo="select"
          opciones={SUBTIPOS}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo
          nombre="componentes"
          etiqueta="Componentes (qué incluye el kit/juego) (300$e)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="edadRecomendada" etiqueta="Edad recomendada (ej: 6-9 años) (521$a)" form={form} onCambiar={onCambiarCampo} />
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
            <small>Los ejemplares (copias, códigos de barras, si se prestan) se agregan y editan en la pestaña «Ítems» de la ficha del material.</small>
          </p>
        ) : (
          <label>
            Ejemplares (uno por línea: código de barras, signatura) (952$p / $o)
            <textarea
              rows={3}
              placeholder={"BPDID-000001, JUE 001\nBPDID-000002, JUE 002"}
              value={form.ejemplaresTexto}
              onChange={(e) => onCambiarCampo("ejemplaresTexto", e.target.value)}
            />
            <small>
              Igual que en Libros: la coma separa el código de barras de la signatura <em>dentro de la misma
              línea</em> — cada línea nueva es un ejemplar distinto.
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
