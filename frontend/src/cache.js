// Cache mínima en memoria para lecturas GET repetidas al cambiar de pantalla
// (ej. Dashboard y Libros piden la misma lista de libros). No es una
// librería de cache general (tipo React Query): cubre justo el caso real
// que motivó el hallazgo, con invalidación explícita en cada mutación en
// vez de revalidación automática — así no hay riesgo de mostrar datos
// desactualizados por una invalidación que se olvidó de cubrir un caso.
const TTL_MS = 15_000;
const store = new Map();

export function cacheGet(key) {
  const entrada = store.get(key);
  if (!entrada) return undefined;
  if (Date.now() - entrada.ts > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return entrada.valor;
}

export function cacheSet(key, valor) {
  store.set(key, { valor, ts: Date.now() });
}

export function cacheInvalidate(prefijo) {
  for (const key of store.keys()) {
    if (key.startsWith(prefijo)) store.delete(key);
  }
}
