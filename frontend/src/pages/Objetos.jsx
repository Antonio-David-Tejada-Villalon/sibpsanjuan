import React from "react";
import api from "../api.js";
import Campo from "../Campo.jsx";
import GestorPortada from "../GestorPortada.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { usePrecargar } from "../usePrecargar.js";

const SUBTIPOS = [
  { valor: "obra_de_arte", etiqueta: "Obra de arte" },
  { valor: "medalla", etiqueta: "Medalla" },
  { valor: "objeto_historico", etiqueta: "Objeto histórico" },
  { valor: "maqueta", etiqueta: "Maqueta" },
];

const ESTADOS_CONSERVACION = [
  { valor: "excelente", etiqueta: "Excelente" },
  { valor: "bueno", etiqueta: "Bueno" },
  { valor: "regular", etiqueta: "Regular" },
  { valor: "malo", etiqueta: "Malo" },
];

const VACIO = {
  titulo: "",
  subtitulo: "",
  subtipo: "objeto_historico",
  numeroInventario: "",
  procedencia: "",
  estadoConservacion: "bueno",
  ubicacion: "",
  periodo: "",
  materiales: "",
  dimensiones: "",
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

function mapEntidadAForm(item) {
  return {
    titulo: item.titulo || "",
    subtitulo: item.subtitulo || "",
    subtipo: item.subtipo || "objeto_historico",
    numeroInventario: item.numeroInventario || "",
    procedencia: item.procedencia || "",
    estadoConservacion: item.estadoConservacion || "bueno",
    ubicacion: item.ubicacion || "",
    periodo: item.periodo || "",
    materiales: item.materiales || "",
    dimensiones: item.dimensiones || "",
    portadaUrl: item.portadaUrl || "",
    materiasTexto: (item.materias || []).join(", "),
    notas: item.notas || "",
  };
}

function mapFormADatos(form) {
  return {
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    subtipo: form.subtipo,
    numeroInventario: form.numeroInventario,
    procedencia: form.procedencia,
    estadoConservacion: form.estadoConservacion,
    ubicacion: form.ubicacion,
    periodo: form.periodo,
    materiales: form.materiales,
    dimensiones: form.dimensiones,
    portadaUrl: form.portadaUrl,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
  };
}

export default function Objetos({ entidad, alGuardar, alCancelar }) {
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
    crear: (datos) => api.crearObjeto(datos),
    actualizar: (id, datos) => api.actualizarObjeto(id, datos),
    vacio: VACIO,
    mapEntidadAForm,
    mapFormADatos,
    alGuardar,
    alCancelar,
  });

  usePrecargar(entidad, onEditar);

  return (
    <>
      <h1>Objetos</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar objeto" : "Nuevo objeto"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        <Campo nombre="titulo" etiqueta="Título *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="subtitulo" etiqueta="Subtítulo" form={form} onCambiar={onCambiarCampo} />
        <GestorPortada itemTipo="Objeto" itemId={editandoId} titulo={form.titulo} />
        <Campo
          nombre="subtipo"
          etiqueta="Subtipo"
          tipo="select"
          opciones={SUBTIPOS}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="numeroInventario" etiqueta="Número de inventario" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="procedencia" etiqueta="Procedencia (de dónde proviene/quién lo donó)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="estadoConservacion"
          etiqueta="Estado de conservación"
          tipo="select"
          opciones={ESTADOS_CONSERVACION}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="ubicacion" etiqueta="Ubicación (dónde está guardado/exhibido)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="periodo" etiqueta="Período o fecha de creación" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="materiales" etiqueta="Materiales (de qué está hecho)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="dimensiones" etiqueta="Dimensiones" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="materiasTexto"
          etiqueta="Materias (separadas por coma)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <label>
          Notas
          <textarea value={form.notas} onChange={(e) => onCambiarCampo("notas", e.target.value)} />
        </label>
        <p>
          <small>No circula ni tiene ejemplares — es una pieza única que se consulta o exhibe en la biblioteca.</small>
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
