import Libro from "../models/Libro.js";
import Seriada from "../models/Seriada.js";
import RecursoElectronico from "../models/RecursoElectronico.js";
import MaterialSonoro from "../models/MaterialSonoro.js";
import MaterialAudiovisual from "../models/MaterialAudiovisual.js";
import MaterialCartografico from "../models/MaterialCartografico.js";
import MaterialGrafico from "../models/MaterialGrafico.js";
import MaterialDidactico from "../models/MaterialDidactico.js";
import Archivo from "../models/Archivo.js";
import Objeto from "../models/Objeto.js";
import Ejemplar from "../models/Ejemplar.js";
import Autor from "../models/Autor.js";
import Materia from "../models/Materia.js";
import Portada from "../models/Portada.js";
import { filtroVigente } from "../portadas/servicio.js";
import { estadoVisible } from "../circulacion/ejemplares.js";

// Búsqueda del OPAC en el servidor: antes el navegador descargaba los 10
// catálogos completos y filtraba ahí — pesado con mala conexión e
// imposible de compartir o indexar. Ahora el navegador pide una página de
// resultados con sus facetas, y cada material tiene su ficha propia.

const lista = (valor) => (Array.isArray(valor) ? valor.filter(Boolean).join(", ") : valor);
const notas = (d) => ["Notas", d.notas];

// Por tipo: qué se muestra en público y dónde vive su ficha
// (/opac/<código>/<segmento>/<título>-<id>). "detalle" es la lista blanca
// de campos públicos — lo que no está acá no sale del servidor.
// circula: tiene ejemplares que se piden en préstamo; soloLectura: piezas
// únicas que se consultan en la biblioteca (Archivo, Objeto).
export const TIPOS = {
  Libro: {
    Modelo: Libro,
    etiqueta: "Libros",
    segmento: "libro",
    circula: true,
    extra: (d) => lista(d.autores),
    detalle: (d) => [
      ["Autor(es)", lista(d.autores)],
      ["Autor corporativo", d.autorCorporativo],
      ["Mención de responsabilidad", d.mencionResponsabilidad],
      ["Edición", d.edicion],
      ["Editorial", d.editorial],
      ["Lugar de publicación", d.lugarPublicacion],
      ["Año", d.anio],
      ["Páginas", d.paginas],
      ["Serie", [d.serie, d.serieVolumen].filter(Boolean).join(" ; ")],
      ["ISBN", d.isbn],
      ["Clasificación (CDU)", d.cdu],
      ["Clasificación (Dewey)", d.dewey],
      ["Público", d.notaAudiencia],
      ["Idioma", d.notaIdioma],
      notas(d),
    ],
  },
  Seriada: {
    Modelo: Seriada,
    etiqueta: "Publicaciones seriadas",
    segmento: "publicacion-seriada",
    circula: true,
    extra: (d) => d.periodicidad,
    detalle: (d) => [
      ["Autor(es)/Editor(es)", lista(d.autores)],
      ["Editorial", d.editorial],
      ["Periodicidad", d.periodicidad],
      ["ISSN", d.issn],
      notas(d),
    ],
  },
  RecursoElectronico: {
    Modelo: RecursoElectronico,
    etiqueta: "Recursos electrónicos",
    segmento: "recurso-electronico",
    circula: false,
    extra: (d) => d.tipoRecurso,
    detalle: (d) => [
      ["Autor(es)", lista(d.autores)],
      ["Editorial", d.editorial],
      ["Año", d.anio],
      ["Tipo de recurso", d.tipoRecurso],
      notas(d),
    ],
  },
  MaterialSonoro: {
    Modelo: MaterialSonoro,
    etiqueta: "Material sonoro",
    segmento: "material-sonoro",
    circula: true,
    extra: (d) => d.subtipo,
    detalle: (d) => [
      ["Autor(es)/Intérprete(s)", lista(d.autores)],
      ["Editorial/Sello", d.editorial],
      ["Año", d.anio],
      ["Formato", d.subtipo],
      notas(d),
    ],
  },
  MaterialAudiovisual: {
    Modelo: MaterialAudiovisual,
    etiqueta: "Material audiovisual",
    segmento: "material-audiovisual",
    circula: true,
    extra: (d) => d.subtipo,
    detalle: (d) => [
      ["Autor(es)/Director(es)", lista(d.autores)],
      ["Editorial/Productora", d.editorial],
      ["Año", d.anio],
      ["Formato", d.subtipo],
      notas(d),
    ],
  },
  MaterialCartografico: {
    Modelo: MaterialCartografico,
    etiqueta: "Material cartográfico",
    segmento: "material-cartografico",
    circula: true,
    extra: (d) => d.subtipo,
    detalle: (d) => [["Autor(es)", lista(d.autores)], ["Formato", d.subtipo], ["Escala", d.escala], notas(d)],
  },
  MaterialGrafico: {
    Modelo: MaterialGrafico,
    etiqueta: "Material gráfico",
    segmento: "material-grafico",
    circula: true,
    extra: (d) => d.subtipo,
    detalle: (d) => [["Autor(es)", lista(d.autores)], ["Formato", d.subtipo], notas(d)],
  },
  MaterialDidactico: {
    Modelo: MaterialDidactico,
    etiqueta: "Material didáctico",
    segmento: "material-didactico",
    circula: true,
    extra: (d) => d.subtipo,
    detalle: (d) => [["Formato", d.subtipo], ["Edad recomendada", d.edadRecomendada], notas(d)],
  },
  Archivo: {
    Modelo: Archivo,
    etiqueta: "Archivos",
    segmento: "archivo",
    soloLectura: true,
    extra: (d) => d.nivelDescripcion,
    detalle: (d) => [
      ["Tipo", d.subtipo],
      ["Nivel de descripción", d.nivelDescripcion],
      ["Fecha de inicio", d.fechaInicio],
      ["Fecha de fin", d.fechaFin],
      notas(d),
    ],
  },
  Objeto: {
    Modelo: Objeto,
    etiqueta: "Objetos",
    segmento: "objeto",
    soloLectura: true,
    extra: (d) => d.subtipo,
    detalle: (d) => [["Tipo", d.subtipo], ["Período", d.periodo], ["Ubicación", d.ubicacion], notas(d)],
  },
};

export const ORDENES = ["relevancia", "titulo", "anio", "disponibilidad"];

// Minúsculas y sin tildes: "martin" encuentra "Martín Fierro".
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function slugDe(texto) {
  return normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "material";
}

// Autoridades (ver BIBL-1/BIBL-3): cada variante de un autor o materia se
// resuelve a su forma autorizada, para facetar y filtrar como un solo valor.
async function mapasDeAutoridad(bibliotecaId) {
  const [autores, materias] = await Promise.all([
    Autor.find({ bibliotecaId, eliminadoEn: null }).select("formaAutorizada variantes").lean(),
    Materia.find({ bibliotecaId, eliminadoEn: null }).select("formaAutorizada variantes").lean(),
  ]);
  const armar = (autoridades) => {
    const mapa = new Map();
    for (const a of autoridades) {
      for (const forma of [a.formaAutorizada, ...(a.variantes || [])]) mapa.set(normalizar(forma), a.formaAutorizada);
    }
    return (valor) => mapa.get(normalizar(valor)) || valor;
  };
  return { autor: armar(autores), materia: armar(materias) };
}

const unicos = (valores) => [...new Set(valores.filter(Boolean))];

// Índice del catálogo de una biblioteca, ya normalizado para buscar. Se
// guarda en memoria unos segundos (OPAC_INDICE_TTL_MS, 30 s por defecto):
// un material recién catalogado tarda eso en aparecer en el OPAC. La
// disponibilidad no entra acá: se calcula en cada búsqueda.
const indices = new Map();

async function construirIndice(bibliotecaId) {
  const resolver = await mapasDeAutoridad(bibliotecaId);
  const campos =
    "titulo subtitulo autores materias anio isbn issn editorial subtipo urlAcceso periodicidad tipoRecurso nivelDescripcion";
  const porTipo = await Promise.all(
    Object.entries(TIPOS).map(async ([itemTipo, tipo]) => {
      const docs = await tipo.Modelo.find({ bibliotecaId, eliminadoEn: null }).select(campos).lean();
      return docs.map((d) => {
        const autores = unicos((d.autores || []).map(resolver.autor));
        const materias = unicos((d.materias || []).map(resolver.materia));
        return {
          id: String(d._id),
          itemTipo,
          titulo: d.titulo,
          subtitulo: d.subtitulo || "",
          autores,
          materias,
          anio: d.anio || "",
          anioNumero: Number.parseInt(d.anio, 10),
          extra: tipo.extra(d) || "",
          urlAcceso: d.urlAcceso || "",
          tituloNormalizado: normalizar(d.titulo),
          autoresNormalizados: normalizar(autores.join(" ")),
          texto: normalizar(
            [d.titulo, d.subtitulo, ...(d.autores || []), ...autores, ...(d.materias || []), ...materias, d.isbn, d.issn, d.editorial].join(" ")
          ),
        };
      });
    })
  );
  return porTipo.flat();
}

async function indice(bibliotecaId) {
  const ttl = Number(process.env.OPAC_INDICE_TTL_MS ?? 30_000);
  const clave = String(bibliotecaId);
  const guardado = indices.get(clave);
  if (guardado && guardado.vence > Date.now()) return guardado.entradas;
  const entradas = await construirIndice(bibliotecaId);
  if (ttl > 0) indices.set(clave, { entradas, vence: Date.now() + ttl });
  return entradas;
}

async function disponibilidadPorItem(bibliotecaId, itemIds) {
  // Lo retirado no se muestra. Disponible = libre, de préstamo y sano (ver
  // circulacion/ejemplares.js); "prestables" son las copias que circulan
  // aunque ahora estén prestadas: con alguna, se puede reservar y esperar.
  const filtro = { bibliotecaId, condicion: { $ne: "retirado" }, ...(itemIds ? { itemId: { $in: itemIds } } : {}) };
  const circula = {
    $and: [{ $eq: [{ $ifNull: ["$uso", "prestamo"] }, "prestamo"] }, { $eq: [{ $ifNull: ["$condicion", ""] }, ""] }],
  };
  const filas = await Ejemplar.aggregate([
    { $match: filtro },
    {
      $group: {
        _id: "$itemId",
        total: { $sum: 1 },
        prestables: { $sum: { $cond: [circula, 1, 0] } },
        disponibles: { $sum: { $cond: [{ $and: [{ $eq: ["$estado", "disponible"] }, circula] }, 1, 0] } },
      },
    },
  ]);
  return new Map(filas.map((f) => [String(f._id), { disponibles: f.disponibles, total: f.total, prestables: f.prestables }]));
}

async function portadasDe(ids) {
  const portadas = await Portada.find({ itemId: { $in: ids }, ...filtroVigente() }).select("itemId version fuente").lean();
  return new Map(portadas.map((p) => [String(p.itemId), p]));
}

// Más puntos si lo buscado está en el título (y más si el título empieza
// así), después autores, después cualquier otro campo.
function puntaje(entrada, tokens, consulta) {
  let puntos = 0;
  if (entrada.tituloNormalizado === consulta) puntos += 100;
  else if (entrada.tituloNormalizado.startsWith(consulta)) puntos += 50;
  for (const t of tokens) {
    if (entrada.tituloNormalizado.includes(t)) puntos += 10;
    else if (entrada.autoresNormalizados.includes(t)) puntos += 5;
    else puntos += 1;
  }
  return puntos;
}

const porTitulo = (a, b) => a.titulo.localeCompare(b.titulo, "es");

function contar(entradas, valores) {
  const conteo = new Map();
  for (const e of entradas) for (const v of valores(e)) conteo.set(v, (conteo.get(v) || 0) + 1);
  return conteo;
}

// Facetas de autor/materia: las más frecuentes (hasta 100), y siempre las
// elegidas aunque ya no tengan resultados, para poder quitarlas.
function faceta(conteo, elegidas) {
  for (const v of elegidas) if (!conteo.has(v)) conteo.set(v, 0);
  return [...conteo.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, Math.max(100, elegidas.length))
    .map(([valor, cantidad]) => ({ valor, cantidad }));
}

export async function buscarEnCatalogo(biblioteca, { q = "", tipos = [], autores = [], materias = [], soloDisponibles = false, orden = "relevancia", pagina = 1, porPagina = 24 }) {
  const entradas = await indice(biblioteca._id);
  const disponibilidad = await disponibilidadPorItem(biblioteca._id);
  const consulta = normalizar(q).trim();
  const tokens = consulta.split(/\s+/).filter(Boolean);
  const dispo = (e) => disponibilidad.get(e.id) || { disponibles: 0, total: 0, prestables: 0 };
  const estaDisponible = (e) => TIPOS[e.itemTipo].soloLectura || Boolean(e.urlAcceso) || dispo(e).disponibles > 0;

  const base = entradas.filter((e) => tokens.every((t) => e.texto.includes(t)) && (!soloDisponibles || estaDisponible(e)));
  // Facetas "disyuntivas": cada grupo cuenta aplicando los filtros de los
  // otros grupos pero no el propio, así elegir un autor no hace desaparecer
  // a los demás autores de la lista.
  const filtros = {
    tipo: (e) => !tipos.length || tipos.includes(e.itemTipo),
    autor: (e) => !autores.length || e.autores.some((a) => autores.includes(a)),
    materia: (e) => !materias.length || e.materias.some((m) => materias.includes(m)),
  };
  const pasa = (e, excepto) => Object.entries(filtros).every(([grupo, f]) => grupo === excepto || f(e));

  let resultados = base.filter((e) => pasa(e));
  if (orden === "titulo" || (orden === "relevancia" && !tokens.length)) {
    resultados.sort(porTitulo);
  } else if (orden === "anio") {
    resultados.sort((a, b) => (Number.isNaN(a.anioNumero) ? 1 : 0) - (Number.isNaN(b.anioNumero) ? 1 : 0) || (b.anioNumero || 0) - (a.anioNumero || 0) || porTitulo(a, b));
  } else if (orden === "disponibilidad") {
    resultados.sort((a, b) => dispo(b).disponibles - dispo(a).disponibles || porTitulo(a, b));
  } else {
    const puntos = new Map(resultados.map((e) => [e.id, puntaje(e, tokens, consulta)]));
    resultados.sort((a, b) => puntos.get(b.id) - puntos.get(a.id) || porTitulo(a, b));
  }

  const total = resultados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaReal = Math.min(pagina, totalPaginas);
  const enPagina = resultados.slice((paginaReal - 1) * porPagina, paginaReal * porPagina);
  const portadas = await portadasDe(enPagina.map((e) => e.id));

  const porTipoConteo = contar(base.filter((e) => pasa(e, "tipo")), (e) => [e.itemTipo]);
  return {
    total,
    pagina: paginaReal,
    porPagina,
    totalPaginas,
    resultados: enPagina.map((e) => {
      const tipo = TIPOS[e.itemTipo];
      const portada = portadas.get(e.id);
      return {
        id: e.id,
        itemTipo: e.itemTipo,
        etiquetaTipo: tipo.etiqueta,
        segmento: tipo.segmento,
        slug: slugDe(e.titulo),
        titulo: e.titulo,
        subtitulo: e.subtitulo,
        autores: e.autores,
        extra: e.extra,
        anio: e.anio,
        urlAcceso: e.urlAcceso,
        soloLectura: Boolean(tipo.soloLectura),
        circula: Boolean(tipo.circula),
        ...dispo(e),
        portada: portada?.version ?? null,
        portadaFuente: portada?.fuente ?? null,
      };
    }),
    facetas: {
      tipos: Object.entries(TIPOS).map(([valor, t]) => ({ valor, etiqueta: t.etiqueta, cantidad: porTipoConteo.get(valor) || 0 })),
      autores: faceta(contar(base.filter((e) => pasa(e, "autor")), (e) => e.autores), autores),
      materias: faceta(contar(base.filter((e) => pasa(e, "materia")), (e) => e.materias), materias),
    },
  };
}

// Ficha pública de un material: solo los campos de TIPOS[...].detalle, la
// disponibilidad y la signatura y el estado de cada ejemplar (nunca su
// código de barras ni quién lo tiene).
export async function fichaDeMaterial(biblioteca, itemTipo, id) {
  const tipo = TIPOS[itemTipo];
  if (!tipo) return null;
  const doc = await tipo.Modelo.findOne({ _id: id, bibliotecaId: biblioteca._id, eliminadoEn: null }).lean();
  if (!doc) return null;
  const [resolver, ejemplares, portadas, disponibilidad] = await Promise.all([
    mapasDeAutoridad(biblioteca._id),
    tipo.circula
      ? Ejemplar.find({ bibliotecaId: biblioteca._id, itemTipo, itemId: doc._id, condicion: { $ne: "retirado" } })
          .select("signatura estado uso condicion ubicacion notaPublica")
          .sort({ signatura: 1 })
          .lean()
      : [],
    portadasDe([doc._id]),
    disponibilidadPorItem(biblioteca._id, [doc._id]),
  ]);
  const portada = portadas.get(String(doc._id));
  return {
    id: String(doc._id),
    itemTipo,
    etiquetaTipo: tipo.etiqueta,
    segmento: tipo.segmento,
    slug: slugDe(doc.titulo),
    titulo: doc.titulo,
    subtitulo: doc.subtitulo || "",
    autores: unicos((doc.autores || []).map(resolver.autor)),
    materias: unicos((doc.materias || []).map(resolver.materia)),
    detalle: tipo
      .detalle(doc)
      .filter(([, valor]) => valor)
      .map(([etiqueta, valor]) => ({ etiqueta, valor: String(valor) })),
    urlAcceso: doc.urlAcceso || "",
    urlInstruccion: doc.urlInstruccion || "",
    soloLectura: Boolean(tipo.soloLectura),
    circula: Boolean(tipo.circula),
    ...(disponibilidad.get(String(doc._id)) || { disponibles: 0, total: 0, prestables: 0 }),
    // Del ejemplar, solo lo que sirve para ir a buscarlo: nunca el código de
    // barras, la nota interna ni a quién está prestado.
    ejemplares: ejemplares.map((e) => ({
      signatura: e.signatura || "",
      estado: estadoVisible(e),
      ubicacion: e.ubicacion || "",
      nota: e.notaPublica || "",
    })),
    portada: portada?.version ?? null,
    portadaFuente: portada?.fuente ?? null,
  };
}

// Título y ficha de varios materiales a la vez (para "Mis pedidos").
export async function titulosDe(pares) {
  const porTipo = new Map();
  for (const { itemTipo, itemId } of pares) {
    if (!TIPOS[itemTipo] || !itemId) continue;
    if (!porTipo.has(itemTipo)) porTipo.set(itemTipo, []);
    porTipo.get(itemTipo).push(itemId);
  }
  const resultado = new Map();
  for (const [itemTipo, ids] of porTipo) {
    const docs = await TIPOS[itemTipo].Modelo.find({ _id: { $in: ids } }).select("titulo").lean();
    for (const d of docs) {
      resultado.set(String(d._id), { titulo: d.titulo, segmento: TIPOS[itemTipo].segmento, slug: slugDe(d.titulo) });
    }
  }
  return resultado;
}
