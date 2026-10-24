import React, { useEffect, useState } from "react";
import api from "./api.js";

// Las reglas que una categoría puede fijar por su cuenta. Vacío = usa la
// de la biblioteca (el formulario de ConfiguracionCirculacion, justo
// arriba). Préstamos a la vez no tiene regla general: vacío = sin tope.
const REGLAS = [
  { campo: "diasPrestamo", etiqueta: "Días de préstamo", min: 1, paso: 1 },
  { campo: "maxRenovaciones", etiqueta: "Renovaciones máximas", min: 0, paso: 1 },
  { campo: "maxPrestamos", etiqueta: "Préstamos a la vez", min: 1, paso: 1 },
  { campo: "multaPorDiaVencido", etiqueta: "Multa por día de atraso ($)", min: 0, paso: "any" },
];

const VACIA = {
  codigo: "",
  nombre: "",
  datosMinimos: false,
  diasPrestamo: "",
  maxRenovaciones: "",
  maxPrestamos: "",
  multaPorDiaVencido: "",
};

export function describirRegla(campo, valor) {
  if (campo === "diasPrestamo") return `${valor} ${valor === 1 ? "día" : "días"}`;
  if (campo === "maxRenovaciones") return valor === 0 ? "No renueva" : String(valor);
  if (campo === "maxPrestamos") return valor == null ? "Sin tope" : String(valor);
  return valor > 0 ? `$${valor} por día` : "No cobra";
}

function formDesde(categoria) {
  const form = { codigo: categoria.codigo, nombre: categoria.nombre, datosMinimos: Boolean(categoria.datosMinimos) };
  for (const { campo } of REGLAS) form[campo] = categoria[campo] ?? "";
  return form;
}

// Usado dentro de ConfiguracionCirculacion: mismo alcance (admin,
// supervisor con esta biblioteca, o su superbibliotecario). version cambia
// cuando se guarda la configuración general, para refrescar lo heredado.
export default function CategoriasSocios({ bibliotecaId, version = 0 }) {
  const [categorias, setCategorias] = useState(null); // null = cargando
  const [general, setGeneral] = useState(null);
  const [form, setForm] = useState(VACIA);
  const [editandoId, setEditandoId] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function recargar() {
    const [lista, biblioteca] = await Promise.all([
      api.listarCategorias(bibliotecaId),
      api.obtenerBiblioteca(bibliotecaId),
    ]);
    setCategorias(lista);
    setGeneral(biblioteca);
  }

  useEffect(() => {
    setError("");
    recargar().catch((err) => setError(err.message));
  }, [bibliotecaId, version]);

  function onCambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setAviso("");
  }

  function onEditar(categoria) {
    setEditandoId(categoria._id);
    setForm(formDesde(categoria));
    setError("");
    setAviso("");
  }

  function onCancelar() {
    setEditandoId(null);
    setForm(VACIA);
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setAviso("");
    setGuardando(true);
    // "" = usar la regla general: el backend lo guarda como null.
    const datos = { nombre: form.nombre, datosMinimos: form.datosMinimos };
    for (const { campo } of REGLAS) datos[campo] = form[campo] === "" ? null : Number(form[campo]);
    try {
      if (editandoId) {
        await api.actualizarCategoria(bibliotecaId, editandoId, datos);
      } else {
        await api.crearCategoria(bibliotecaId, { ...datos, codigo: form.codigo });
      }
      setAviso(editandoId ? `Se guardó la categoría ${form.nombre}.` : `Se creó la categoría ${form.nombre}.`);
      setEditandoId(null);
      setForm(VACIA);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function onEliminar(categoria) {
    setError("");
    setAviso("");
    if (categoria.socios > 0) {
      const n = categoria.socios;
      setError(`${n} ${n === 1 ? "socio tiene" : "socios tienen"} la categoría ${categoria.nombre}. Pasalos a otra antes de eliminarla.`);
      return;
    }
    if (!window.confirm(`¿Eliminar la categoría ${categoria.nombre}?`)) return;
    try {
      await api.eliminarCategoria(bibliotecaId, categoria._id);
      if (editandoId === categoria._id) onCancelar();
      setAviso(`Se eliminó la categoría ${categoria.nombre}.`);
      await recargar();
    } catch (err) {
      setError(err.message);
    }
  }

  function sugerencia(campo) {
    if (campo === "maxPrestamos") return "Sin tope";
    return general ? `General: ${describirRegla(campo, general[campo])}` : "";
  }

  const idTitulo = `categorias-${bibliotecaId}`;

  return (
    <section className="card" aria-labelledby={idTitulo}>
      <h3 id={idTitulo}>Categorías de socio</h3>
      <p>
        <small>
          Cada socio tiene una categoría, por ejemplo Alumno o Docente. Lo que una categoría deja vacío usa la
          configuración general de préstamos.
        </small>
      </p>
      {error && <div className="flash error" role="alert">{error}</div>}
      {aviso && <div className="flash ok" role="status">{aviso}</div>}

      {categorias === null ? (
        !error && <p>Cargando categorías…</p>
      ) : (
        <ul className="lista-categorias">
          {categorias.map((c) => (
            <li key={c._id}>
              <div className="categoria__encabezado">
                <strong>{c.nombre}</strong>
                <span className="pill-estado">{c.codigo}</span>
                <span className="categoria__nota">
                  {c.socios} {c.socios === 1 ? "socio" : "socios"}
                </span>
                {c.datosMinimos && <span className="categoria__nota">· datos mínimos</span>}
              </div>
              <dl className="categoria__reglas">
                {REGLAS.map(({ campo, etiqueta }) => (
                  <div key={campo}>
                    <dt>{etiqueta}</dt>
                    <dd>
                      {describirRegla(campo, c.reglas[campo])}
                      {c[campo] == null && campo !== "maxPrestamos" && <span className="categoria__nota"> · general</span>}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="categoria__acciones">
                <button type="button" className="secundario" onClick={() => onEditar(c)} aria-label={`Editar ${c.nombre}`}>
                  Editar
                </button>
                <button type="button" className="peligro" onClick={() => onEliminar(c)} aria-label={`Eliminar ${c.nombre}`}>
                  Eliminar
                </button>
              </div>
            </li>
          ))}
          {categorias.length === 0 && <li>Todavía no hay categorías.</li>}
        </ul>
      )}

      <form onSubmit={onSubmit}>
        <h4>{editandoId ? `Editar ${form.nombre || "categoría"}` : "Nueva categoría"}</h4>
        {!editandoId && (
          <label>
            Código *
            <input
              value={form.codigo}
              onChange={(e) => onCambiar("codigo", e.target.value.toUpperCase())}
              required
              maxLength={10}
              pattern="[A-Za-z0-9_\-]{1,10}"
              title="Hasta 10 letras o números, sin espacios. Ej.: PRECEPTOR"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
        )}
        <label>
          Nombre *
          <input value={form.nombre} onChange={(e) => onCambiar("nombre", e.target.value)} required maxLength={60} />
        </label>
        <label style={{ fontWeight: "normal" }}>
          <input
            type="checkbox"
            checked={form.datosMinimos}
            onChange={(e) => onCambiar("datosMinimos", e.target.checked)}
          />{" "}
          Datos mínimos (alumnos): pedir solo legajo, apellido y nombre, curso y un correo — sin DNI, domicilio,
          teléfono ni fecha de nacimiento
        </label>
        <div className="campos-reglas">
          {REGLAS.map(({ campo, etiqueta, min, paso }) => (
            <label key={campo}>
              {etiqueta}
              <input
                type="number"
                inputMode={paso === 1 ? "numeric" : "decimal"}
                min={min}
                step={paso}
                value={form[campo]}
                onChange={(e) => onCambiar(campo, e.target.value)}
                placeholder={sugerencia(campo)}
              />
            </label>
          ))}
        </div>
        <p>
          <small>
            Dejá vacío un campo para usar la regla general.
            {!editandoId && " El código no se puede cambiar después: es lo que queda guardado en cada socio."}
          </small>
        </p>
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear categoría"}
        </button>{" "}
        {editandoId && (
          <button type="button" className="secundario" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </form>
    </section>
  );
}
