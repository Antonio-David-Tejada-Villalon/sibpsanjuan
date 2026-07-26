import { cacheGet, cacheSet, cacheInvalidate } from "./cache.js";
import { obtenerBibliotecaActivaId } from "./bibliotecaActiva.js";

// Base versionada (ver ARQ-5 en la auditoría) — /api/... sin versión sigue
// funcionando en el backend como alias, pero este frontend usa /api/v1 como
// su base canónica de acá en adelante. `VITE_API_URL` es opcional (ver FE-8):
// sin configurar, queda "" y todo sigue siendo same-origin como siempre (el
// despliegue de hoy, un solo servicio Express) — solo hace falta el día que
// el frontend se sirva separado del backend (ej. CDN estático + API aparte).
const BASE = `${import.meta.env.VITE_API_URL || ""}/api/v1`;

// admin/supervisor no tienen una bibliotecaId propia en su sesión — todas
// las rutas de catálogo/circulación/socios/export que la necesitan la leen
// de este query param (ver requiereBiblioteca en el backend). Para el resto
// de los roles (superbibliotecario/bibliotecario/socio) esto no hace nada:
// no hay biblioteca activa guardada, así que la URL queda sin tocar.
function conBibliotecaActiva(url) {
  const id = obtenerBibliotecaActivaId();
  if (!id) return url;
  const separador = url.includes("?") ? "&" : "?";
  return `${url}${separador}bibliotecaId=${encodeURIComponent(id)}`;
}

async function apiFetch(url, opciones = {}) {
  url = conBibliotecaActiva(url);
  const res = await fetch(url, {
    credentials: "include",
    headers: opciones.body ? { "Content-Type": "application/json" } : undefined,
    ...opciones,
  });
  let cuerpo = null;
  const texto = await res.text();
  if (texto) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = texto;
    }
  }
  if (!res.ok) {
    const mensaje = (cuerpo && cuerpo.error) || `Error ${res.status}`;
    throw new Error(mensaje);
  }
  return cuerpo;
}

// Como apiFetch() solo expone el cuerpo ya parseado, un fetch aparte para
// los listados paginados — necesitan leer la cabecera X-Total-Count que
// el backend agrega solo cuando se piden con pagina/porPagina (ver ARQ-3).
async function apiFetchPaginado(url) {
  url = conBibliotecaActiva(url);
  const res = await fetch(url, { credentials: "include" });
  const texto = await res.text();
  const cuerpo = texto ? JSON.parse(texto) : [];
  if (!res.ok) {
    throw new Error((cuerpo && cuerpo.error) || `Error ${res.status}`);
  }
  const total = Number(res.headers.get("X-Total-Count"));
  return { items: cuerpo, total: Number.isFinite(total) ? total : cuerpo.length };
}

// Envoltorios con cache (ver FE-5) — solo para las listas de Libros/Socios,
// que es lo que de verdad se re-pide al cambiar de pantalla (Dashboard,
// Prestamos, Libros y Socios piden más o menos lo mismo). Circulación,
// Préstamos activos y todo lo de sesión quedan sin cachear a propósito:
// ahí una lectura desactualizada de unos segundos sí importa (solicitudes
// pendientes, disponibilidad real de un ejemplar).
async function apiFetchCacheable(url) {
  const cacheado = cacheGet(url);
  if (cacheado !== undefined) return cacheado;
  const datos = await apiFetch(url);
  cacheSet(url, datos);
  return datos;
}

async function apiFetchPaginadoCacheable(url) {
  const cacheado = cacheGet(url);
  if (cacheado !== undefined) return cacheado;
  const datos = await apiFetchPaginado(url);
  cacheSet(url, datos);
  return datos;
}

// Los cinco buckets que se sumaron después de Libros/Seriadas/Recursos
// electrónicos siguen exactamente el mismo esqueleto CRUD que Seriadas
// (listar/listarPaginado/crear/actualizar/eliminar, mismo patrón de
// invalidación de caché) — se generan acá en vez de escribirlos cinco
// veces más a mano.
function metodosCatalogo(nombre, endpoint) {
  return {
    [`listar${nombre}`]: () => apiFetchCacheable(`${BASE}/${endpoint}`),
    [`listar${nombre}Paginado`]: (pagina, porPagina, q = "") =>
      apiFetchPaginadoCacheable(`${BASE}/${endpoint}?pagina=${pagina}&porPagina=${porPagina}&q=${encodeURIComponent(q)}`),
    [`crear${nombre}`]: (datos) =>
      apiFetch(`${BASE}/${endpoint}`, { method: "POST", body: JSON.stringify(datos) }).then((r) => {
        cacheInvalidate(`${BASE}/${endpoint}`);
        return r;
      }),
    [`actualizar${nombre}`]: (id, datos) =>
      apiFetch(`${BASE}/${endpoint}/${id}`, { method: "PUT", body: JSON.stringify(datos) }).then((r) => {
        cacheInvalidate(`${BASE}/${endpoint}`);
        return r;
      }),
    [`eliminar${nombre}`]: (id) =>
      apiFetch(`${BASE}/${endpoint}/${id}`, { method: "DELETE" }).then((r) => {
        cacheInvalidate(`${BASE}/${endpoint}`);
        return r;
      }),
  };
}

// Invalida la caché de todos los tipos circulantes (ver TIPOS_CIRCULANTES,
// exportado al final del archivo) — se usa tras aprobar/crear/devolver un
// préstamo, porque cualquiera de esos tipos puede ser el que cambió de
// disponibilidad. Función declarada (no arrow const) para poder
// referenciar TIPOS_CIRCULANTES antes de que se defina más abajo: para
// cuando esto se ejecuta de verdad (tras un click), el módulo ya terminó
// de cargar y esa constante ya existe.
function invalidarCachesCirculantes() {
  for (const { endpoint } of TIPOS_CIRCULANTES) cacheInvalidate(`${BASE}/${endpoint}`);
}

const api = {
  login: (usuario, password) =>
    apiFetch(`${BASE}/auth/login`, { method: "POST", body: JSON.stringify({ usuario, password }) }),
  logout: () => apiFetch(`${BASE}/auth/logout`, { method: "POST" }),
  yo: () => apiFetch(`${BASE}/auth/yo`),
  cambiarPassword: (passwordActual, passwordNueva) =>
    apiFetch(`${BASE}/auth/password`, { method: "PUT", body: JSON.stringify({ passwordActual, passwordNueva }) }),

  // admin ve/crea todas las bibliotecas; supervisor solo las suyas, y solo
  // puede crear si tiene puedeCrearBibliotecas (el backend lo valida igual,
  // esto es solo para no mostrar un botón que va a fallar).
  listarBibliotecas: () => apiFetch(`${BASE}/bibliotecas`),
  obtenerBiblioteca: (id) => apiFetch(`${BASE}/bibliotecas/${id}`),
  crearBiblioteca: (datos) => apiFetch(`${BASE}/bibliotecas`, { method: "POST", body: JSON.stringify(datos) }),
  eliminarBiblioteca: (id) => apiFetch(`${BASE}/bibliotecas/${id}`, { method: "DELETE" }),
  listarUsuariosDeBiblioteca: (id) => apiFetch(`${BASE}/bibliotecas/${id}/usuarios`),
  // Reglas de circulación (días de préstamo, renovaciones, multa, si
  // sábado/domingo cuentan) — admin, supervisor con esta biblioteca en su
  // alcance, o el superbibliotecario de esta biblioteca en particular.
  actualizarConfiguracionCirculacion: (id, datos) =>
    apiFetch(`${BASE}/bibliotecas/${id}/circulacion`, { method: "PUT", body: JSON.stringify(datos) }),

  // --- Supervisores (solo admin) ---
  listarSupervisores: () => apiFetch(`${BASE}/supervisores`),
  crearSupervisor: (datos) => apiFetch(`${BASE}/supervisores`, { method: "POST", body: JSON.stringify(datos) }),
  actualizarSupervisor: (id, datos) =>
    apiFetch(`${BASE}/supervisores/${id}`, { method: "PUT", body: JSON.stringify(datos) }),

  // --- Solicitudes de supervisión: el supervisor pide, el admin aprueba/rechaza ---
  listarBibliotecasDisponiblesParaSupervisar: () => apiFetch(`${BASE}/bibliotecas/disponibles-para-supervisar`),
  pedirSupervisarBiblioteca: (bibliotecaId) =>
    apiFetch(`${BASE}/solicitudes-supervision`, { method: "POST", body: JSON.stringify({ bibliotecaId }) }),
  listarMisSolicitudesSupervision: () => apiFetch(`${BASE}/solicitudes-supervision/mias`),
  listarSolicitudesSupervision: (estado) =>
    apiFetch(`${BASE}/solicitudes-supervision${estado ? `?estado=${estado}` : ""}`),
  aprobarSolicitudSupervision: (id) =>
    apiFetch(`${BASE}/solicitudes-supervision/${id}/aprobar`, { method: "POST" }),
  rechazarSolicitudSupervision: (id) =>
    apiFetch(`${BASE}/solicitudes-supervision/${id}/rechazar`, { method: "POST" }),

  // --- Superbibliotecarios (admin, o supervisor dentro de su alcance) ---
  listarSuperbibliotecarios: () => apiFetch(`${BASE}/superbibliotecarios`),
  crearSuperbibliotecario: (datos) =>
    apiFetch(`${BASE}/superbibliotecarios`, { method: "POST", body: JSON.stringify(datos) }),

  // --- Bibliotecarios (solo el superbibliotecario de esa biblioteca) ---
  listarBibliotecarios: () => apiFetch(`${BASE}/bibliotecarios`),
  crearBibliotecario: (datos) => apiFetch(`${BASE}/bibliotecarios`, { method: "POST", body: JSON.stringify(datos) }),
  actualizarBibliotecario: (id, datos) =>
    apiFetch(`${BASE}/bibliotecarios/${id}`, { method: "PUT", body: JSON.stringify(datos) }),

  // Borrado de cualquier cuenta de staff (supervisor/superbibliotecario/
  // bibliotecario) — un solo endpoint, el servidor decide con puedeGestionar
  // si a quien lo pide le corresponde.
  eliminarUsuario: (id) => apiFetch(`${BASE}/usuarios/${id}`, { method: "DELETE" }),

  listarLibros: () => apiFetchCacheable(`${BASE}/libros`),
  listarLibrosPaginado: (pagina, porPagina, q = "") =>
    apiFetchPaginadoCacheable(`${BASE}/libros?pagina=${pagina}&porPagina=${porPagina}&q=${encodeURIComponent(q)}`),
  crearLibro: (datos) =>
    apiFetch(`${BASE}/libros`, { method: "POST", body: JSON.stringify(datos) }).then((r) => {
      cacheInvalidate(`${BASE}/libros`);
      return r;
    }),
  actualizarLibro: (id, datos) =>
    apiFetch(`${BASE}/libros/${id}`, { method: "PUT", body: JSON.stringify(datos) }).then((r) => {
      cacheInvalidate(`${BASE}/libros`);
      return r;
    }),
  eliminarLibro: (id) =>
    apiFetch(`${BASE}/libros/${id}`, { method: "DELETE" }).then((r) => {
      cacheInvalidate(`${BASE}/libros`);
      return r;
    }),

  // Carga masiva de libros: la plantilla se descarga como un link normal
  // (por eso una URL, no un fetch — así el navegador la baja como archivo
  // sin que este módulo tenga que armar un Blob a mano), la importación va
  // por POST con el texto del CSV ya leído en el navegador.
  urlPlantillaLibrosCsv: () => conBibliotecaActiva(`${BASE}/libros/plantilla-csv`),
  importarLibrosCsv: (csv) =>
    apiFetch(`${BASE}/libros/importar-csv`, { method: "POST", body: JSON.stringify({ csv }) }).then((r) => {
      cacheInvalidate(`${BASE}/libros`);
      return r;
    }),

  // Gestión de ejemplares de un libro puntual desde su edición (agregar,
  // corregir código de barras/signatura, o dar de baja uno disponible).
  agregarEjemplaresLibro: (libroId, ejemplares) =>
    apiFetch(`${BASE}/libros/${libroId}/ejemplares`, { method: "POST", body: JSON.stringify({ ejemplares }) }).then(
      (r) => {
        cacheInvalidate(`${BASE}/libros`);
        return r;
      }
    ),
  actualizarEjemplarLibro: (libroId, ejemplarId, datos) =>
    apiFetch(`${BASE}/libros/${libroId}/ejemplares/${ejemplarId}`, {
      method: "PUT",
      body: JSON.stringify(datos),
    }).then((r) => {
      cacheInvalidate(`${BASE}/libros`);
      return r;
    }),
  eliminarEjemplarLibro: (libroId, ejemplarId) =>
    apiFetch(`${BASE}/libros/${libroId}/ejemplares/${ejemplarId}`, { method: "DELETE" }).then((r) => {
      cacheInvalidate(`${BASE}/libros`);
      return r;
    }),

  listarSeriadas: () => apiFetchCacheable(`${BASE}/seriadas`),
  listarSeriadasPaginado: (pagina, porPagina, q = "") =>
    apiFetchPaginadoCacheable(`${BASE}/seriadas?pagina=${pagina}&porPagina=${porPagina}&q=${encodeURIComponent(q)}`),
  crearSeriada: (datos) =>
    apiFetch(`${BASE}/seriadas`, { method: "POST", body: JSON.stringify(datos) }).then((r) => {
      cacheInvalidate(`${BASE}/seriadas`);
      return r;
    }),
  actualizarSeriada: (id, datos) =>
    apiFetch(`${BASE}/seriadas/${id}`, { method: "PUT", body: JSON.stringify(datos) }).then((r) => {
      cacheInvalidate(`${BASE}/seriadas`);
      return r;
    }),
  eliminarSeriada: (id) =>
    apiFetch(`${BASE}/seriadas/${id}`, { method: "DELETE" }).then((r) => {
      cacheInvalidate(`${BASE}/seriadas`);
      return r;
    }),

  // --- Recursos electrónicos: sin ejemplares, no hay método de "prestar" ---
  listarRecursosElectronicosPaginado: (pagina, porPagina, q = "") =>
    apiFetchPaginadoCacheable(
      `${BASE}/recursosElectronicos?pagina=${pagina}&porPagina=${porPagina}&q=${encodeURIComponent(q)}`
    ),
  crearRecursoElectronico: (datos) =>
    apiFetch(`${BASE}/recursosElectronicos`, { method: "POST", body: JSON.stringify(datos) }).then((r) => {
      cacheInvalidate(`${BASE}/recursosElectronicos`);
      return r;
    }),
  actualizarRecursoElectronico: (id, datos) =>
    apiFetch(`${BASE}/recursosElectronicos/${id}`, { method: "PUT", body: JSON.stringify(datos) }).then((r) => {
      cacheInvalidate(`${BASE}/recursosElectronicos`);
      return r;
    }),
  eliminarRecursoElectronico: (id) =>
    apiFetch(`${BASE}/recursosElectronicos/${id}`, { method: "DELETE" }).then((r) => {
      cacheInvalidate(`${BASE}/recursosElectronicos`);
      return r;
    }),

  ...metodosCatalogo("MaterialSonoro", "materialSonoro"),
  ...metodosCatalogo("MaterialAudiovisual", "materialAudiovisual"),
  ...metodosCatalogo("MaterialCartografico", "materialCartografico"),
  ...metodosCatalogo("MaterialGrafico", "materialGrafico"),
  ...metodosCatalogo("MaterialDidactico", "materialDidactico"),
  ...metodosCatalogo("Archivo", "archivos"),
  ...metodosCatalogo("Objeto", "objetos"),
  ...metodosCatalogo("Autor", "autores"),
  ...metodosCatalogo("Materia", "materias"),

  listarSocios: () => apiFetchCacheable(`${BASE}/socios`),
  listarSociosPaginado: (pagina, porPagina, q = "") =>
    apiFetchPaginadoCacheable(`${BASE}/socios?pagina=${pagina}&porPagina=${porPagina}&q=${encodeURIComponent(q)}`),
  crearSocio: (datos) =>
    apiFetch(`${BASE}/socios`, { method: "POST", body: JSON.stringify(datos) }).then((r) => {
      cacheInvalidate(`${BASE}/socios`);
      return r;
    }),
  actualizarSocio: (id, datos) =>
    apiFetch(`${BASE}/socios/${id}`, { method: "PUT", body: JSON.stringify(datos) }).then((r) => {
      cacheInvalidate(`${BASE}/socios`);
      return r;
    }),
  eliminarSocio: (id) =>
    apiFetch(`${BASE}/socios/${id}`, { method: "DELETE" }).then((r) => {
      cacheInvalidate(`${BASE}/socios`);
      return r;
    }),
  crearCredencialesSocio: (id, password) =>
    apiFetch(`${BASE}/socios/${id}/credenciales`, { method: "POST", body: JSON.stringify({ password }) }).then(
      (r) => {
        cacheInvalidate(`${BASE}/socios`);
        return r;
      }
    ),

  // --- Circulación (staff) ---
  listarSolicitudes: (estado) => apiFetch(`${BASE}/circulacion/solicitudes${estado ? `?estado=${estado}` : ""}`),
  aprobarSolicitud: (id, ejemplarId) =>
    apiFetch(`${BASE}/circulacion/solicitudes/${id}/aprobar`, {
      method: "POST",
      body: JSON.stringify(ejemplarId ? { ejemplarId } : {}),
    }).then((r) => {
      // Aprobar reserva un ejemplar (cambia su estado a "prestado"), lo que
      // afecta el conteo de "disponibles" que muestra Prestamos.jsx para
      // cualquier tipo circulante — sin esto, ese desplegable quedaría
      // mostrando disponibilidad vieja.
      invalidarCachesCirculantes();
      return r;
    }),
  rechazarSolicitud: (id, notaStaff) =>
    apiFetch(`${BASE}/circulacion/solicitudes/${id}/rechazar`, {
      method: "POST",
      body: JSON.stringify({ notaStaff }),
    }),
  listarPrestamos: (estado) => apiFetch(`${BASE}/circulacion/prestamos${estado ? `?estado=${estado}` : ""}`),
  crearPrestamoDirecto: (datos) =>
    apiFetch(`${BASE}/circulacion/prestamos`, { method: "POST", body: JSON.stringify(datos) }).then((r) => {
      invalidarCachesCirculantes();
      return r;
    }),
  procesarDevolucion: (id) =>
    apiFetch(`${BASE}/circulacion/prestamos/${id}/devolucion`, { method: "POST" }).then((r) => {
      invalidarCachesCirculantes();
      return r;
    }),
  // Renovación directa del staff (a diferencia de aprobarSolicitud con tipo
  // "renovacion", no hace falta que el socio la haya pedido primero).
  renovarPrestamo: (id) => apiFetch(`${BASE}/circulacion/prestamos/${id}/renovar`, { method: "POST" }),

  // --- OPAC (público / socio), todo scoped al código de biblioteca ---
  opacCatalogo: (codigo) => apiFetch(`${BASE}/opac/${codigo}/libros`),
  opacCatalogoSeriadas: (codigo) => apiFetch(`${BASE}/opac/${codigo}/seriadas`),
  opacCatalogoRecursos: (codigo) => apiFetch(`${BASE}/opac/${codigo}/recursosElectronicos`),
  opacCatalogoMaterialSonoro: (codigo) => apiFetch(`${BASE}/opac/${codigo}/materialSonoro`),
  opacCatalogoMaterialAudiovisual: (codigo) => apiFetch(`${BASE}/opac/${codigo}/materialAudiovisual`),
  opacCatalogoMaterialCartografico: (codigo) => apiFetch(`${BASE}/opac/${codigo}/materialCartografico`),
  opacCatalogoMaterialGrafico: (codigo) => apiFetch(`${BASE}/opac/${codigo}/materialGrafico`),
  opacCatalogoMaterialDidactico: (codigo) => apiFetch(`${BASE}/opac/${codigo}/materialDidactico`),
  opacCatalogoArchivos: (codigo) => apiFetch(`${BASE}/opac/${codigo}/archivos`),
  opacCatalogoObjetos: (codigo) => apiFetch(`${BASE}/opac/${codigo}/objetos`),
  // Catálogo de autoridades de autor (ver BIBL-1) — para resolver, en el
  // facetado del OPAC, variantes de nombre a una sola forma autorizada.
  opacAutores: (codigo) => apiFetch(`${BASE}/opac/${codigo}/autores`),
  opacMaterias: (codigo) => apiFetch(`${BASE}/opac/${codigo}/materias`),
  opacLoginSocio: (codigo, numeroSocio, password) =>
    apiFetch(`${BASE}/opac/${codigo}/login`, { method: "POST", body: JSON.stringify({ numeroSocio, password }) }),
  opacLogoutSocio: (codigo) => apiFetch(`${BASE}/opac/${codigo}/logout`, { method: "POST" }),
  opacYo: (codigo) => apiFetch(`${BASE}/opac/${codigo}/yo`),
  opacMisPrestamos: (codigo) => apiFetch(`${BASE}/opac/${codigo}/mis-prestamos`),
  opacMisSolicitudes: (codigo) => apiFetch(`${BASE}/opac/${codigo}/mis-solicitudes`),
  opacSolicitarPrestamo: (codigo, itemTipo, itemId) =>
    apiFetch(`${BASE}/opac/${codigo}/solicitudes`, {
      method: "POST",
      body: JSON.stringify({ tipo: "prestamo", itemTipo, itemId }),
    }),
  opacSolicitarRenovacion: (codigo, prestamoId) =>
    apiFetch(`${BASE}/opac/${codigo}/solicitudes`, {
      method: "POST",
      body: JSON.stringify({ tipo: "renovacion", prestamoId }),
    }),
};

export default api;

// Tipos que circulan (tienen Ejemplar/Prestamo) — mismo listado que
// backend/src/circulacion/tiposCirculantes.js, del lado del frontend. Lo
// usa Prestamos.jsx para armar el selector combinado de "qué se presta" en
// vez de tener un useState/useEffect/<option> por cada tipo.
export const TIPOS_CIRCULANTES = [
  { itemTipo: "Libro", etiqueta: "Libro", endpoint: "libros", listar: () => api.listarLibros() },
  { itemTipo: "Seriada", etiqueta: "Seriada", endpoint: "seriadas", listar: () => api.listarSeriadas() },
  {
    itemTipo: "MaterialSonoro",
    etiqueta: "Material sonoro",
    endpoint: "materialSonoro",
    listar: () => api.listarMaterialSonoro(),
  },
  {
    itemTipo: "MaterialAudiovisual",
    etiqueta: "Material audiovisual",
    endpoint: "materialAudiovisual",
    listar: () => api.listarMaterialAudiovisual(),
  },
  {
    itemTipo: "MaterialCartografico",
    etiqueta: "Material cartográfico",
    endpoint: "materialCartografico",
    listar: () => api.listarMaterialCartografico(),
  },
  {
    itemTipo: "MaterialGrafico",
    etiqueta: "Material gráfico",
    endpoint: "materialGrafico",
    listar: () => api.listarMaterialGrafico(),
  },
  {
    itemTipo: "MaterialDidactico",
    etiqueta: "Material didáctico",
    endpoint: "materialDidactico",
    listar: () => api.listarMaterialDidactico(),
  },
];
