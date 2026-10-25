import React from "react";
import api from "../api.js";
import Campo from "../Campo.jsx";
import GestorPortada from "../GestorPortada.jsx";
import { useListaCrud } from "../useListaCrud.js";
import { usePrecargar } from "../usePrecargar.js";
import { aEjemplares } from "../ejemplaresTexto.js";

const SUBTIPOS = [
  { valor: "cd", etiqueta: "CD" },
  { valor: "vinilo", etiqueta: "Vinilo" },
  { valor: "cassette", etiqueta: "Cassette" },
  { valor: "audiolibro", etiqueta: "Audiolibro" },
  { valor: "podcast", etiqueta: "Podcast" },
  { valor: "mp3", etiqueta: "MP3" },
  { valor: "musica_digital", etiqueta: "Música digital" },
];

// Subtipos sin ejemplar físico que prestar — mismo criterio que Libros.jsx
// para digital/ebook: acá tiene sentido mostrar urlAcceso y, en el OPAC,
// "Acceder" en vez de "Pedir préstamo".
const SUBTIPOS_SIN_EJEMPLAR = ["podcast", "mp3", "musica_digital"];

const VACIO = {
  titulo: "",
  subtitulo: "",
  autoresTexto: "",
  editorial: "",
  anio: "",
  subtipo: "cd",
  duracion: "",
  urlAcceso: "",
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

// Punto y coma, no coma: ver el mismo comentario en Libros.jsx (BIBL-5 en
// AUDITORIA.md) — un autor puede traer una coma adentro ("Apellido, Nombre").
function aListaAutores(texto) {
  return texto
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapEntidadAForm(item) {
  return {
    titulo: item.titulo || "",
    subtitulo: item.subtitulo || "",
    autoresTexto: (item.autores || []).join("; "),
    editorial: item.editorial || "",
    anio: item.anio || "",
    subtipo: item.subtipo || "cd",
    duracion: item.duracion || "",
    urlAcceso: item.urlAcceso || "",
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
    autores: aListaAutores(form.autoresTexto),
    editorial: form.editorial,
    anio: form.anio,
    subtipo: form.subtipo,
    duracion: form.duracion,
    urlAcceso: form.urlAcceso,
    portadaUrl: form.portadaUrl,
    materias: aLista(form.materiasTexto),
    notas: form.notas,
  };
}

export default function MaterialSonoro({ entidad, alGuardar, alCancelar }) {
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
    crear: (datos, form) => api.crearMaterialSonoro({ ...datos, ejemplares: aEjemplares(form.ejemplaresTexto) }),
    actualizar: (id, datos) => api.actualizarMaterialSonoro(id, datos),
    vacio: VACIO,
    mapEntidadAForm,
    mapFormADatos,
    alGuardar,
    alCancelar,
  });

  usePrecargar(entidad, onEditar);

  return (
    <>
      <h1>Material sonoro</h1>
      <form className="card" onSubmit={onSubmit}>
        <h2>{editandoId ? "Editar material sonoro" : "Nuevo material sonoro"}</h2>
        {error && <div className="flash error" role="alert">{error}</div>}
        <Campo nombre="titulo" etiqueta="Título (245$a) *" form={form} onCambiar={onCambiarCampo} required />
        <Campo nombre="subtitulo" etiqueta="Subtítulo (245$b)" form={form} onCambiar={onCambiarCampo} />
        <GestorPortada itemTipo="MaterialSonoro" itemId={editandoId} titulo={form.titulo} />
        <Campo
          nombre="autoresTexto"
          etiqueta="Intérprete(s)/compositor(es) (separados por punto y coma) (100$a / 700$a)"
          form={form}
          onCambiar={onCambiarCampo}
        />
        <p>
          <small>
            Punto y coma entre un autor y el siguiente — no coma, porque cada uno suele ir en formato
            "Apellido, Nombre".
          </small>
        </p>
        <Campo nombre="editorial" etiqueta="Sello discográfico (260$b)" form={form} onCambiar={onCambiarCampo} />
        <Campo nombre="anio" etiqueta="Año (260$c)" form={form} onCambiar={onCambiarCampo} />
        <Campo
          nombre="subtipo"
          etiqueta="Subtipo"
          tipo="select"
          opciones={SUBTIPOS}
          form={form}
          onCambiar={onCambiarCampo}
        />
        <Campo nombre="duracion" etiqueta="Duración (ej: 01:32:00) (306$a)" form={form} onCambiar={onCambiarCampo} />
        {SUBTIPOS_SIN_EJEMPLAR.includes(form.subtipo) && (
          <Campo nombre="urlAcceso" etiqueta="URL de acceso (856$u)" type="url" form={form} onCambiar={onCambiarCampo} />
        )}
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
              placeholder={"BPSON-000001, 780 CD\nBPSON-000002, 780 CD"}
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
