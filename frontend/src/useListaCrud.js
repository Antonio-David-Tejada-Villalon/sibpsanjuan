import { useEffect, useRef, useState } from "react";

// Encapsula el estado y los handlers que Libros.jsx y Socios.jsx tenían
// duplicados casi al calibre (misma forma de estado, mismos nombres de
// handler, mismo fade-out de 150ms antes de borrar — ver MOT-3 en la
// auditoría). Cada página sigue siendo dueña de su propio JSX/campos; acá
// solo vive la "plomería" de listar/crear/editar/eliminar con búsqueda y
// paginación.
//
// `crear`/`actualizar` reciben (datos, formCompleto) — formCompleto permite
// que una página (ej. Libros, con su textarea de ejemplares) arme un payload
// con campos que no viven en `datos` sin que el hook tenga que saber de
// ellos.
// Nota agregada a toda confirmación de borrado (individual y masivo) — ver
// UX-3 en AUDITORIA.md: "Eliminar" se sentía igual de irreversible que un
// borrado permanente, aunque técnicamente sea soft-delete (GOB-2).
const NOTA_RECUPERABLE = "Queda guardado y se puede restaurar desde la base de datos si hace falta.";

export function useListaCrud({
  listar,
  crear,
  actualizar,
  eliminar,
  vacio,
  porPagina,
  mapEntidadAForm,
  mapFormADatos,
  // Cómo mostrar cada elemento en la confirmación de borrado masivo (ver
  // UX-2) — default para las páginas de catalogación, que siempre tienen
  // "titulo"; Socios (que no lo tiene) pasaría su propia función si algún
  // día suma selección masiva.
  etiquetaItem = (item) => item.titulo || "",
}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState(vacio);
  const [editandoId, setEditandoId] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [eliminandoSeleccion, setEliminandoSeleccion] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Aviso nativo de "salir sin guardar" si el formulario tiene cambios sin
  // enviar (ver UX-4 en AUDITORIA.md) — cubre cerrar la pestaña, recargar o
  // navegar a otra URL; no cubre navegar a otra pantalla *dentro* de esta
  // SPA (eso necesitaría un router de datos con bloqueo de navegación, que
  // este proyecto no usa todavía). `formBase` es contra qué se compara para
  // saber si hay cambios: `vacio` al crear, o la entidad cargada al editar.
  const formRef = useRef(form);
  formRef.current = form;
  const formBaseRef = useRef(vacio);

  useEffect(() => {
    function onBeforeUnload(e) {
      if (JSON.stringify(formRef.current) === JSON.stringify(formBaseRef.current)) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  async function recargar() {
    const { items, total } = await listar(pagina, porPagina, busqueda);
    setItems(items);
    setTotal(total);
  }

  useEffect(() => {
    setCargando(true);
    setSeleccionados(new Set());
    recargar().finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, busqueda]);

  function onBuscar(valor) {
    setBusqueda(valor);
    setPagina(1);
  }

  function onEditar(entidad) {
    setError("");
    setEditandoId(entidad._id);
    const formCargado = mapEntidadAForm ? mapEntidadAForm(entidad) : entidad;
    setForm(formCargado);
    formBaseRef.current = formCargado;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onCancelarEdicion() {
    setEditandoId(null);
    setForm(vacio);
    formBaseRef.current = vacio;
    setError("");
  }

  function onCambiarCampo(nombre, valor) {
    setForm((f) => ({ ...f, [nombre]: valor }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const datos = mapFormADatos ? mapFormADatos(form) : form;
      if (editandoId) {
        await actualizar(editandoId, datos, form);
      } else {
        await crear(datos, form);
      }
      setForm(vacio);
      formBaseRef.current = vacio;
      setEditandoId(null);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function onEliminar(id, mensajeConfirmacion = "¿Eliminar este elemento?") {
    if (!confirm(`${mensajeConfirmacion} ${NOTA_RECUPERABLE}`)) return;
    // Deja ver la fila desvaneciéndose antes de sacarla de la lista, en vez
    // de que desaparezca de un salto (ver MOT-3 en la auditoría).
    setEliminandoId(id);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await eliminar(id);
    if (editandoId === id) onCancelarEdicion();
    await recargar();
    setEliminandoId(null);
  }

  function onToggleSeleccion(id) {
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function onToggleSeleccionTodos() {
    setSeleccionados((actual) =>
      actual.size === items.length ? new Set() : new Set(items.map((i) => i._id))
    );
  }

  // Borrado masivo: reusa el mismo `eliminar` de a uno (no hay endpoint de
  // borrado en lote todavía) — para las cantidades que maneja una biblioteca
  // chica (decenas, no miles, por página) no vale la pena sumar una ruta
  // nueva solo para esto.
  async function onEliminarSeleccionados(mensajeConfirmacion = "¿Eliminar los elementos seleccionados?") {
    if (seleccionados.size === 0) return;
    // Mostrar qué se va a borrar, no solo cuántos — un número solo invita a
    // confirmar de apuro sin fijarse si la selección es la correcta (ver
    // UX-2 en AUDITORIA.md).
    const LIMITE_LISTADO = 10;
    const etiquetas = [...seleccionados]
      .map((id) => items.find((i) => i._id === id))
      .filter(Boolean)
      .map(etiquetaItem)
      .filter(Boolean);
    const detalle = etiquetas
      .slice(0, LIMITE_LISTADO)
      .map((e) => `• ${e}`)
      .join("\n");
    const restantes = etiquetas.length - LIMITE_LISTADO;
    const listado = restantes > 0 ? `${detalle}\n…y ${restantes} más` : detalle;
    const mensaje = `${mensajeConfirmacion} (${seleccionados.size})\n\n${listado}\n\n${NOTA_RECUPERABLE}`;
    if (!confirm(mensaje)) return;
    setEliminandoSeleccion(true);
    try {
      for (const id of seleccionados) {
        await eliminar(id);
        if (editandoId === id) onCancelarEdicion();
      }
      setSeleccionados(new Set());
      await recargar();
    } finally {
      setEliminandoSeleccion(false);
    }
  }

  return {
    items,
    total,
    pagina,
    setPagina,
    busqueda,
    form,
    editandoId,
    eliminandoId,
    seleccionados,
    eliminandoSeleccion,
    error,
    cargando,
    guardando,
    recargar,
    setError,
    onBuscar,
    onEditar,
    onCancelarEdicion,
    onCambiarCampo,
    onSubmit,
    onEliminar,
    onToggleSeleccion,
    onToggleSeleccionTodos,
    onEliminarSeleccionados,
  };
}
