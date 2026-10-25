import React, { useEffect, useRef, useState } from "react";
import { Copy, Pencil, Printer, Trash2 } from "lucide-react";
import api from "../../api.js";
import { CONDICIONES, ESTADOS_EJEMPLAR, USOS, fechaCorta, nombreSocio, tonoEstado } from "../../circulacion.js";

// La pestaña "Ítems" de un material, como "Agregar ítem" de Koha (campo
// 952): la lista de ejemplares con su estado, y el formulario para agregar
// uno, agregar y duplicar (queda el formulario con el código siguiente),
// agregar varias copias de una vez o editar uno.

const VACIO = {
  codigoBarras: "",
  signatura: "",
  numeroCopia: "",
  ubicacion: "",
  uso: "prestamo",
  condicion: "",
  fechaAdquisicion: "",
  fuenteAdquisicion: "",
  precio: "",
  numeroInventario: "",
  notaPublica: "",
  notaInterna: "",
};

// "BPSJ-000009" → "BPSJ-000010" (mismo criterio que el servidor).
export function siguienteCodigo(codigo) {
  const m = /^(.*?)(\d+)$/.exec(codigo);
  if (!m) return codigo ? `${codigo}-2` : "";
  return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0");
}

function aFormulario(ejemplar) {
  const form = {};
  for (const campo of Object.keys(VACIO)) form[campo] = ejemplar[campo] ?? VACIO[campo];
  form.precio = ejemplar.precio ?? "";
  return form;
}

function Campo({ id, etiqueta, codigo, ayuda, children }) {
  return (
    <div className="campo-item">
      <label htmlFor={id}>
        {etiqueta} {codigo && <span className="codigo-marc">952${codigo}</span>}
      </label>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </div>
  );
}

export function EstadoEjemplar({ ejemplar }) {
  const estado = ejemplar.estadoVisible;
  return (
    <>
      <span className={`etiqueta-estado etiqueta-estado--${tonoEstado(estado)}`}>{ESTADOS_EJEMPLAR[estado] ?? estado}</span>
      {ejemplar.prestamo && (
        <small className="detalle-estado">
          A {nombreSocio(ejemplar.prestamo.socio)}, vence el {fechaCorta(ejemplar.prestamo.fechaVencimiento)}
        </small>
      )}
      {ejemplar.reserva && <small className="detalle-estado">Apartado para {nombreSocio(ejemplar.reserva.socio)}</small>}
    </>
  );
}

export default function PestanaItems({ itemTipo, itemId, signaturaSugerida, ejemplares, onCambio, editarId, onImprimir, puedeCatalogar }) {
  const [form, setForm] = useState(() => ({ ...VACIO, signatura: signaturaSugerida || "" }));
  const [editando, setEditando] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [seleccion, setSeleccion] = useState(() => new Set());
  const codigoRef = useRef(null);
  const formRef = useRef(null);

  // "Editar" desde la pestaña Normal llega con el id del ejemplar.
  useEffect(() => {
    const ejemplar = editarId && ejemplares.find((e) => e._id === editarId);
    if (ejemplar) editar(ejemplar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId]);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  function editar(ejemplar) {
    setEditando(ejemplar);
    setForm(aFormulario(ejemplar));
    setError("");
    setAviso("");
    formRef.current?.scrollIntoView({ block: "start" });
    setTimeout(() => codigoRef.current?.focus(), 0);
  }

  function duplicar(ejemplar) {
    setEditando(null);
    setForm({ ...aFormulario(ejemplar), codigoBarras: siguienteCodigo(ejemplar.codigoBarras), numeroCopia: "" });
    setAviso(`Copiado de ${ejemplar.codigoBarras}: revisá el código de barras y el número de copia, y guardá.`);
    formRef.current?.scrollIntoView({ block: "start" });
    setTimeout(() => codigoRef.current?.focus(), 0);
  }

  function limpiar() {
    setEditando(null);
    setForm({ ...VACIO, signatura: signaturaSugerida || "" });
    setCantidad(1);
  }

  async function guardar(e, { duplicarDespues = false } = {}) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      if (editando) {
        await api.actualizarEjemplar(editando._id, form);
        setAviso(`Ejemplar ${form.codigoBarras} guardado.`);
        limpiar();
      } else {
        const creados = await api.crearEjemplares({ ...form, itemTipo, itemId, cantidad: Number(cantidad) || 1 });
        setAviso(creados.length > 1 ? `Se agregaron ${creados.length} ejemplares (${creados[0].codigoBarras} a ${creados.at(-1).codigoBarras}).` : `Ejemplar ${creados[0].codigoBarras} agregado.`);
        if (duplicarDespues) {
          const ultimo = creados.at(-1);
          const copia = Number.parseInt(ultimo.numeroCopia, 10);
          setForm({ ...form, codigoBarras: siguienteCodigo(ultimo.codigoBarras), numeroCopia: Number.isInteger(copia) ? String(copia + 1) : "" });
          setCantidad(1);
          setTimeout(() => codigoRef.current?.select(), 0);
        } else {
          limpiar();
        }
      }
      await onCambio();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(ejemplar) {
    if (!window.confirm(`¿Borrar el ejemplar ${ejemplar.codigoBarras}?`)) return;
    setError("");
    try {
      await api.eliminarEjemplar(ejemplar._id);
      setAviso(`Ejemplar ${ejemplar.codigoBarras} borrado.`);
      if (editando?._id === ejemplar._id) limpiar();
      await onCambio();
    } catch (err) {
      setError(err.message);
    }
  }

  function alternar(id) {
    setSeleccion((s) => {
      const nueva = new Set(s);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
  }

  const seleccionados = ejemplares.filter((e) => seleccion.has(e._id));

  return (
    <>
      {error && <div className="flash error" role="alert">{error}</div>}
      {aviso && <div className="flash ok" role="status">{aviso}</div>}

      <div className="barra-seleccion-items">
        <button type="button" className="enlace-boton" onClick={() => setSeleccion(new Set(ejemplares.map((e) => e._id)))}>
          Seleccionar todo
        </button>{" "}
        |{" "}
        <button type="button" className="enlace-boton" onClick={() => setSeleccion(new Set())}>
          Limpiar
        </button>
        <button type="button" className="secundario" disabled={!seleccionados.length} onClick={() => onImprimir(seleccionados)}>
          <Printer size={16} strokeWidth={1.5} aria-hidden="true" /> Imprimir etiquetas ({seleccionados.length})
        </button>
      </div>

      <div className="tabla-desplazable">
        <table className="tabla-items">
          <thead>
            <tr>
              <th><span className="sr-only">Seleccionar</span></th>
              <th>Código de barras</th>
              <th>Copia</th>
              <th>Signatura</th>
              <th>Ubicación</th>
              <th>Estado</th>
              <th>Última vez visto</th>
              {puedeCatalogar && <th><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {ejemplares.map((e) => (
              <tr key={e._id} className={editando?._id === e._id ? "fila-editando" : undefined}>
                <td>
                  <input type="checkbox" checked={seleccion.has(e._id)} onChange={() => alternar(e._id)} aria-label={`Seleccionar ${e.codigoBarras}`} />
                </td>
                <td>{e.codigoBarras}</td>
                <td>{e.numeroCopia || "—"}</td>
                <td>{e.signatura || "—"}</td>
                <td>{e.ubicacion || "—"}</td>
                <td>
                  <EstadoEjemplar ejemplar={e} />
                </td>
                <td>{fechaCorta(e.ultimaVezVisto)}</td>
                {puedeCatalogar && (
                  <td className="acciones-fila">
                    <button type="button" className="secundario" onClick={() => editar(e)} aria-label={`Editar ${e.codigoBarras}`}>
                      <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button type="button" className="secundario" onClick={() => duplicar(e)} aria-label={`Duplicar ${e.codigoBarras}`} title="Duplicar">
                      <Copy size={16} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button type="button" className="peligro" onClick={() => eliminar(e)} aria-label={`Borrar ${e.codigoBarras}`} title="Borrar">
                      <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {ejemplares.length === 0 && (
              <tr>
                <td colSpan={8}>Todavía no tiene ejemplares: agregá el primero abajo.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {puedeCatalogar && (
        <form className="card formulario-item" ref={formRef} onSubmit={guardar}>
          <h3>{editando ? `Editar ejemplar ${editando.codigoBarras}` : "Agregar ejemplar"}</h3>
          <div className="grilla-campos">
            <Campo id="item-codigo" etiqueta="Código de barras *" codigo="p">
              <input id="item-codigo" ref={codigoRef} value={form.codigoBarras} onChange={cambiar("codigoBarras")} required autoComplete="off" />
            </Campo>
            <Campo id="item-signatura" etiqueta="Signatura topográfica" codigo="o">
              <input id="item-signatura" value={form.signatura} onChange={cambiar("signatura")} placeholder="Ej.: 863 COR" />
            </Campo>
            <Campo id="item-copia" etiqueta="Número de copia" codigo="t">
              <input id="item-copia" value={form.numeroCopia} onChange={cambiar("numeroCopia")} inputMode="numeric" />
            </Campo>
            <Campo id="item-ubicacion" etiqueta="Ubicación en estantería" codigo="c">
              <input id="item-ubicacion" value={form.ubicacion} onChange={cambiar("ubicacion")} placeholder="Ej.: Literatura, estante 3" />
            </Campo>
            <Campo id="item-uso" etiqueta="¿Se presta?" codigo="7">
              <select id="item-uso" value={form.uso} onChange={cambiar("uso")}>
                {USOS.map((u) => (
                  <option key={u.valor} value={u.valor}>
                    {u.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="item-condicion" etiqueta="Estado físico" codigo="4" ayuda="Dañado, en reparación, extraviado o retirado: no se presta hasta corregirlo.">
              <select id="item-condicion" value={form.condicion} onChange={cambiar("condicion")}>
                {CONDICIONES.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="item-fecha" etiqueta="Fecha de adquisición" codigo="d">
              <input id="item-fecha" type="date" value={form.fechaAdquisicion} onChange={cambiar("fechaAdquisicion")} />
            </Campo>
            <Campo id="item-fuente" etiqueta="Fuente de adquisición" codigo="e">
              <input id="item-fuente" value={form.fuenteAdquisicion} onChange={cambiar("fuenteAdquisicion")} placeholder="Compra, donación…" />
            </Campo>
            <Campo id="item-precio" etiqueta="Precio" codigo="g">
              <input id="item-precio" type="number" min="0" step="0.01" value={form.precio} onChange={cambiar("precio")} />
            </Campo>
            <Campo id="item-inventario" etiqueta="Número de inventario" codigo="i">
              <input id="item-inventario" value={form.numeroInventario} onChange={cambiar("numeroInventario")} />
            </Campo>
            <Campo id="item-nota-publica" etiqueta="Nota pública" codigo="z" ayuda="La ve cualquiera en el catálogo.">
              <input id="item-nota-publica" value={form.notaPublica} onChange={cambiar("notaPublica")} />
            </Campo>
            <Campo id="item-nota-interna" etiqueta="Nota interna" codigo="x" ayuda="Solo la ve el personal.">
              <input id="item-nota-interna" value={form.notaInterna} onChange={cambiar("notaInterna")} />
            </Campo>
          </div>
          <div className="acciones-formulario">
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Agregar ejemplar"}
            </button>
            {!editando && (
              <>
                <button type="button" className="secundario" disabled={guardando} onClick={(e) => guardar(e, { duplicarDespues: true })}>
                  Agregar y duplicar
                </button>
                <label className="cantidad-copias">
                  Copias iguales
                  <input type="number" min="1" max="50" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                </label>
              </>
            )}
            {(editando || form.codigoBarras) && (
              <button type="button" className="enlace-boton" onClick={limpiar}>
                {editando ? "Cancelar" : "Vaciar"}
              </button>
            )}
          </div>
          {!editando && Number(cantidad) > 1 && (
            <p>
              <small>
                Se cargan {cantidad} copias: los códigos de barras y los números de copia siguen la numeración desde el que escribiste.
              </small>
            </p>
          )}
        </form>
      )}
    </>
  );
}
