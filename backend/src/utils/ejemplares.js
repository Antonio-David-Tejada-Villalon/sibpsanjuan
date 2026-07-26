import Ejemplar from "../models/Ejemplar.js";

// Fábricas de los dos helpers de ejemplares que libros.js ya usaba,
// parametrizadas por itemTipo ("Libro", "Seriada", ...) para que cada ruta
// de un bucket circulante (routes/libros.js, routes/seriadas.js) los use
// idénticos en vez de reescribirlos — la única diferencia entre buckets es
// qué valor de itemTipo se filtra/graba, nunca la lógica en sí.

export function crearEjemplaresPara(itemTipo) {
  return async function crearEjemplares(bibliotecaId, itemId, ejemplares) {
    const datos = (ejemplares || [])
      .filter((e) => e && e.codigoBarras)
      .map((e) => ({ bibliotecaId, itemTipo, itemId, codigoBarras: e.codigoBarras, signatura: e.signatura }));
    if (datos.length === 0) return [];
    return Ejemplar.insertMany(datos);
  };
}

export function adjuntarEjemplaresPara(itemTipo) {
  return async function adjuntarEjemplares(items) {
    const ids = items.map((i) => i._id);
    const ejemplares = await Ejemplar.find({ itemTipo, itemId: { $in: ids } });
    const porItem = new Map();
    for (const e of ejemplares) {
      const key = String(e.itemId);
      if (!porItem.has(key)) porItem.set(key, []);
      porItem.get(key).push(e);
    }
    return items.map((i) => ({ ...i.toObject(), ejemplares: porItem.get(String(i._id)) || [] }));
  };
}
