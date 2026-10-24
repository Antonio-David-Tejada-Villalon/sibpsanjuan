// Metadatos para buscadores y vistas previas al compartir (título,
// descripción, canonical, Open Graph y datos estructurados) de las páginas
// públicas del OPAC. Solo usan lo que ya es público: los campos de la ficha
// (ver TIPOS[...].detalle en opac/catalogo.js) y la identidad publicada en
// el CMS. Nunca datos de socios, préstamos ni búsquedas.
//
// Los usa el servidor para escribir el <head> de la página (ver
// seo/rutas.js) y el frontend para actualizarlo al navegar (los recibe en
// la respuesta de la API), así que los dos dicen lo mismo.

const LARGO_DESCRIPCION = 160;

// Dirección pública del sitio, para canonical, sitemap y og:url. Con el
// frontend en otro origen (Vercel + Render) es FRONTEND_URL; SITIO_URL la
// fija a mano (por ejemplo, un dominio propio).
export function origenPublico(req) {
  const fijo = process.env.SITIO_URL || process.env.FRONTEND_URL;
  return (fijo || origenDeLaApi(req)).replace(/\/+$/, "");
}

// Dónde se sirven las imágenes de la API (logos del CMS), que en el
// despliegue separado no es el sitio público.
export function origenDeLaApi(req) {
  return `${req.protocol}://${req.get("host")}`;
}

export function rutaDeFicha(codigo, ficha) {
  return `/opac/${codigo}/${ficha.segmento}/${ficha.slug}-${ficha.id}`;
}

function recortar(texto, largo = LARGO_DESCRIPCION) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (limpio.length <= largo) return limpio;
  const corte = limpio.slice(0, largo - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > largo * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:]+$/, "")}…`;
}

// "Hernández, José" → "José Hernández". Si no tiene esa forma (autor
// corporativo, fechas de la autoridad), queda como está.
export function nombreNatural(autor) {
  const partes = String(autor || "").split(",");
  if (partes.length !== 2) return String(autor || "").trim();
  const [apellido, nombre] = partes.map((p) => p.trim());
  return apellido && nombre && !/\d/.test(nombre) ? `${nombre} ${apellido}` : String(autor).trim();
}

const valorDe = (ficha, etiqueta) => ficha.detalle?.find((d) => d.etiqueta === etiqueta)?.valor || "";

function imagenDeMarca(contenido, origenApi) {
  const logo = contenido?.identidad?.logos?.cuadrado;
  return logo ? { url: `${origenApi}${logo}`, alt: `Logo de ${contenido.identidad.nombre}` } : null;
}

export function metadatosDeInicio(contenido, { codigo, origen, origenApi }) {
  const nombre = contenido.identidad.nombre;
  return {
    titulo: `${nombre} · Catálogo en línea`,
    descripcion: recortar(
      `Catálogo de la biblioteca de ${nombre}: buscá libros y otros materiales, mirá si están disponibles y pedilos en préstamo.`
    ),
    canonical: `${origen}/opac/${codigo}`,
    robots: "index,follow",
    og: { tipo: "website", sitio: nombre, imagen: imagenDeMarca(contenido, origenApi) },
    jsonLd: null,
  };
}

export function metadatosDePagina(pagina, contenido, { codigo, origen, origenApi }) {
  const nombre = contenido.identidad.nombre;
  return {
    titulo: `${pagina.titulo} · ${nombre}`,
    descripcion: recortar(textoPlano(pagina.cuerpo) || `${pagina.titulo} de ${nombre}.`),
    canonical: `${origen}/opac/${codigo}/pagina/${pagina.slug}`,
    robots: "index,follow",
    og: { tipo: "article", sitio: nombre, imagen: imagenDeMarca(contenido, origenApi) },
    jsonLd: null,
  };
}

// Páginas que existen pero no se indexan: ingreso, cuenta y préstamos del
// socio (y cualquier otra que no sea parte del catálogo público).
export function metadatosPrivados(titulo, contenido) {
  const nombre = contenido?.identidad?.nombre;
  return {
    titulo: nombre ? `${titulo} · ${nombre}` : titulo,
    descripcion: "",
    canonical: null,
    robots: "noindex,nofollow",
    og: null,
    jsonLd: null,
  };
}

// El formato del CMS (ver contenido/formato.js) es texto con marcas mínimas:
// para la descripción alcanza con sacarlas.
function textoPlano(cuerpo) {
  return String(cuerpo || "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*+/g, "")
    .replace(/^\s*(-|\d+\.)\s+/gm, "");
}

export function metadatosDeFicha(ficha, contenido, { codigo, origen, origenApi }) {
  const nombre = contenido.identidad.nombre;
  const canonical = `${origen}${rutaDeFicha(codigo, ficha)}`;
  const autores = ficha.autores.map(nombreNatural);
  const titulo = [ficha.titulo, autores.slice(0, 2).join(", "), nombre].filter(Boolean).join(" · ");

  const editorial = valorDe(ficha, "Editorial") || valorDe(ficha, "Editorial/Sello") || valorDe(ficha, "Editorial/Productora");
  const anio = valorDe(ficha, "Año");
  const publicacion = [editorial, anio].filter(Boolean).join(", ");
  const tipo = ficha.etiquetaTipo.toLowerCase();
  const descripcion = recortar(
    [
      `${ficha.titulo}${ficha.subtitulo ? `: ${ficha.subtitulo}` : ""}`,
      autores.length ? ` de ${autores.join(", ")}` : "",
      publicacion ? ` (${publicacion})` : "",
      `. En el catálogo de ${nombre}`,
      ficha.materias.length ? ` · ${ficha.materias.slice(0, 3).join(", ")}` : "",
      ".",
    ].join("")
  );

  const migas = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Catálogo", item: `${origen}/opac/${codigo}` },
      { "@type": "ListItem", position: 2, name: ficha.etiquetaTipo, item: `${origen}/opac/${codigo}?tipo=${ficha.itemTipo}` },
      { "@type": "ListItem", position: 3, name: ficha.titulo },
    ],
  };
  const grafo = [migas];
  if (ficha.itemTipo === "Libro") grafo.unshift(libroSchema(ficha, autores, { canonical, editorial, anio }));

  return {
    titulo,
    descripcion,
    canonical,
    robots: "index,follow",
    // Sin la portada como og:image: las imágenes de Google Books no se
    // pueden guardar más allá de su caché y la licencia de las demás no
    // siempre está clara; las redes las copian al mostrar la vista previa.
    og: { tipo: ficha.itemTipo === "Libro" ? "book" : "website", sitio: nombre, imagen: imagenDeMarca(contenido, origenApi), tipoDetalle: tipo },
    jsonLd: { "@context": "https://schema.org", "@graph": grafo },
  };
}

function libroSchema(ficha, autores, { canonical, editorial, anio }) {
  const libro = { "@type": "Book", "@id": `${canonical}#material`, url: canonical, name: ficha.titulo };
  if (ficha.subtitulo) libro.alternativeHeadline = ficha.subtitulo;
  if (autores.length) libro.author = autores.map((name) => ({ "@type": "Person", name }));
  const corporativo = valorDe(ficha, "Autor corporativo");
  if (corporativo) libro.author = [...(libro.author || []), { "@type": "Organization", name: corporativo }];
  const isbn = valorDe(ficha, "ISBN").replace(/[^0-9Xx]/g, "");
  if (isbn.length === 10 || isbn.length === 13) libro.isbn = isbn.toUpperCase();
  if (/^\d{4}$/.test(anio.trim())) libro.datePublished = anio.trim();
  if (editorial) libro.publisher = { "@type": "Organization", name: editorial };
  const paginas = Number.parseInt(valorDe(ficha, "Páginas"), 10);
  if (paginas > 0) libro.numberOfPages = paginas;
  if (valorDe(ficha, "Edición")) libro.bookEdition = valorDe(ficha, "Edición");
  if (ficha.materias.length) libro.keywords = ficha.materias.join(", ");
  return libro;
}

// --- HTML del <head> ---

export function escaparHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Un título de catálogo con "</script>" no puede cortar el bloque: en JSON
// los caracteres <, > y & se pueden escribir como \u00XX sin cambiar nada.
export function jsonParaScript(valor) {
  return JSON.stringify(valor).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function headDeMetadatos(meta) {
  const e = escaparHtml;
  const lineas = [`<title>${e(meta.titulo)}</title>`];
  if (meta.descripcion) lineas.push(`<meta name="description" content="${e(meta.descripcion)}" />`);
  if (meta.robots) lineas.push(`<meta name="robots" content="${e(meta.robots)}" />`);
  if (meta.canonical) lineas.push(`<link rel="canonical" href="${e(meta.canonical)}" />`);
  if (meta.og) {
    lineas.push(`<meta property="og:type" content="${e(meta.og.tipo)}" />`);
    lineas.push(`<meta property="og:title" content="${e(meta.titulo)}" />`);
    if (meta.descripcion) lineas.push(`<meta property="og:description" content="${e(meta.descripcion)}" />`);
    if (meta.canonical) lineas.push(`<meta property="og:url" content="${e(meta.canonical)}" />`);
    if (meta.og.sitio) lineas.push(`<meta property="og:site_name" content="${e(meta.og.sitio)}" />`);
    lineas.push(`<meta property="og:locale" content="es_AR" />`);
    if (meta.og.imagen) {
      lineas.push(`<meta property="og:image" content="${e(meta.og.imagen.url)}" />`);
      lineas.push(`<meta property="og:image:alt" content="${e(meta.og.imagen.alt)}" />`);
    }
    lineas.push(`<meta name="twitter:card" content="summary" />`);
  }
  if (meta.jsonLd) lineas.push(`<script type="application/ld+json">${jsonParaScript(meta.jsonLd)}</script>`);
  return lineas.join("\n    ");
}
