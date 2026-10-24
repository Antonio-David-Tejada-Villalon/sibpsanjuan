// Forma pública del contenido del OPAC: la que ve cualquiera en
// GET /opac/:codigo/contenido, y la que usa la vista previa del panel con el
// borrador. Los logos pasan de ids a URLs y solo van los avisos vigentes.

// "Hoy" en San Juan, no en el huso del servidor: un aviso "hasta el 30"
// tiene que verse todo el 30 en el colegio aunque el servidor esté en UTC.
export function hoyEnSanJuan(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/San_Juan" }).format(ahora);
}

export function avisoVigente(aviso, hoy) {
  return (!aviso.desde || aviso.desde <= hoy) && (!aviso.hasta || aviso.hasta >= hoy);
}

export function urlImagenCms(codigo, id) {
  return id ? `/api/v1/opac/${codigo}/imagenes/${id}.webp` : null;
}

export function contenidoPublico(datos, codigo, { hoy = hoyEnSanJuan() } = {}) {
  const { logos, ...identidad } = datos.identidad;
  return {
    identidad: {
      ...identidad,
      logos: {
        cuadrado: urlImagenCms(codigo, logos.cuadrado),
        horizontal: urlImagenCms(codigo, logos.horizontal),
        oscuro: urlImagenCms(codigo, logos.oscuro),
      },
    },
    contacto: datos.contacto,
    avisos: datos.avisos.filter((a) => avisoVigente(a, hoy)).map(({ titulo, texto }) => ({ titulo, texto })),
    // Solo el índice; el texto de cada página se pide aparte.
    paginas: datos.paginas.filter((p) => p.slug).map((p) => ({ slug: p.slug, titulo: p.titulo, legal: Boolean(p.legal) })),
  };
}
