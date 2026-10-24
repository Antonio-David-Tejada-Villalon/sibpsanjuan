import { esUrlPermitida, enlacesInvalidos, contrasteDelAcento, CONTRASTE_MINIMO } from "./formato.js";

const MAX_AVISOS = 10;
const MAX_PAGINAS = 20;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_IMAGEN = /^[0-9a-f]{24}$/;
export const ACENTO_PREDETERMINADO = "#ff8300";

// Punto de partida de una biblioteca que todavía no cargó nada: solo su
// nombre (ya lo tiene el sistema) y el acento del sistema de diseño. Nada
// inventado — sin contacto, avisos ni páginas hasta que alguien los cargue.
export function contenidoInicial(biblioteca) {
  return {
    identidad: {
      nombre: biblioteca.nombre,
      nombreLegal: "",
      colorAcento: ACENTO_PREDETERMINADO,
      logos: { cuadrado: null, horizontal: null, oscuro: null },
    },
    contacto: { email: "", telefono: "", direccion: "", horario: "", web: "" },
    avisos: [],
    paginas: [],
  };
}

// Normaliza lo que manda el panel y junta todos los errores de una vez (en
// castellano, para mostrarlos tal cual). Dos niveles:
// - "borrador": lo que impide guardar (tipos, largos, enlaces peligrosos,
//   fechas o identificadores rotos). Un borrador puede estar incompleto.
// - "publicar": además, lo que el público no puede ver a medias (campos
//   obligatorios, contraste del color, datos de las páginas legales).
export function validarContenido(entrada, { modo = "borrador" } = {}) {
  const errores = [];
  const publicar = modo === "publicar";

  function texto(valor, campo, max, { requerido = false } = {}) {
    if (valor !== undefined && valor !== null && typeof valor !== "string") {
      errores.push(`${campo}: tiene que ser texto.`);
      return "";
    }
    const limpio = (valor || "").trim();
    if (limpio.length > max) errores.push(`${campo}: como máximo ${max} caracteres.`);
    if (requerido && !limpio) errores.push(`${campo}: es obligatorio.`);
    return limpio;
  }
  function conFormato(valor, campo, max, opciones) {
    const limpio = texto(valor, campo, max, opciones);
    for (const url of enlacesInvalidos(limpio)) {
      errores.push(`${campo}: el enlace "${url}" no es válido (solo http, https o mailto).`);
    }
    return limpio;
  }
  function fecha(valor, campo, { requerido = false } = {}) {
    if (valor === undefined || valor === null || valor === "") {
      if (requerido) errores.push(`${campo}: es obligatoria.`);
      return null;
    }
    const d = new Date(valor);
    if (typeof valor !== "string" || Number.isNaN(d.getTime())) {
      errores.push(`${campo}: no es una fecha válida.`);
      return null;
    }
    return d.toISOString().slice(0, 10);
  }
  function imagen(valor, campo) {
    if (valor === undefined || valor === null || valor === "") return null;
    if (typeof valor !== "string" || !ID_IMAGEN.test(valor)) {
      errores.push(`${campo}: imagen inválida.`);
      return null;
    }
    return valor;
  }
  function lista(valor, campo, max) {
    if (valor === undefined || valor === null) return [];
    if (!Array.isArray(valor)) {
      errores.push(`${campo}: formato inválido.`);
      return [];
    }
    if (valor.length > max) errores.push(`${campo}: como máximo ${max}.`);
    return valor.slice(0, max).map((v) => (v && typeof v === "object" ? v : {}));
  }

  const e = entrada && typeof entrada === "object" ? entrada : {};
  const id = e.identidad && typeof e.identidad === "object" ? e.identidad : {};
  const logos = id.logos && typeof id.logos === "object" ? id.logos : {};

  let colorAcento = typeof id.colorAcento === "string" ? id.colorAcento.trim().toLowerCase() : "";
  if (!colorAcento) {
    colorAcento = ACENTO_PREDETERMINADO;
  } else if (!/^#[0-9a-f]{6}$/.test(colorAcento)) {
    errores.push("Color de acento: usá el formato #RRGGBB (por ejemplo #ff8300).");
    colorAcento = ACENTO_PREDETERMINADO;
  } else if (publicar && contrasteDelAcento(colorAcento) < CONTRASTE_MINIMO) {
    errores.push(
      `Color de acento: el texto oscuro de los botones queda con un contraste de ${contrasteDelAcento(colorAcento).toFixed(2)}:1 ` +
        `y hace falta al menos ${CONTRASTE_MINIMO}:1. Elegí un color más claro.`
    );
  }

  const identidad = {
    nombre: texto(id.nombre, "Nombre de la institución", 120, { requerido: publicar }),
    nombreLegal: texto(id.nombreLegal, "Nombre legal", 160),
    colorAcento,
    logos: {
      cuadrado: imagen(logos.cuadrado, "Logo cuadrado"),
      horizontal: imagen(logos.horizontal, "Logo horizontal"),
      oscuro: imagen(logos.oscuro, "Logo para fondo oscuro"),
    },
  };

  const c = e.contacto && typeof e.contacto === "object" ? e.contacto : {};
  const contacto = {
    email: texto(c.email, "Correo de contacto", 120),
    telefono: texto(c.telefono, "Teléfono", 40),
    direccion: texto(c.direccion, "Dirección", 200),
    horario: texto(c.horario, "Horario", 200),
    web: texto(c.web, "Sitio web", 200),
  };
  if (contacto.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto.email)) {
    errores.push("Correo de contacto: no parece un correo válido.");
  }
  if (contacto.web && !esUrlPermitida(contacto.web, ["http:", "https:"])) {
    errores.push("Sitio web: tiene que empezar con https:// (o http://).");
  }

  const avisos = lista(e.avisos, "Avisos", MAX_AVISOS).map((a, i) => {
    const n = `Aviso ${i + 1}`;
    const aviso = {
      titulo: texto(a.titulo, `${n} — título`, 120, { requerido: publicar }),
      texto: conFormato(a.texto, `${n} — texto`, 2000),
      desde: fecha(a.desde, `${n} — desde`),
      hasta: fecha(a.hasta, `${n} — hasta`),
    };
    if (aviso.desde && aviso.hasta && aviso.hasta < aviso.desde) {
      errores.push(`${n}: la fecha "hasta" es anterior a "desde".`);
    }
    return aviso;
  });

  const slugs = new Set();
  const paginas = lista(e.paginas, "Páginas", MAX_PAGINAS).map((p, i) => {
    const n = `Página ${i + 1}`;
    const slug = texto(p.slug, `${n} — dirección`, 60, { requerido: publicar }).toLowerCase();
    if (slug && !SLUG.test(slug)) {
      errores.push(`${n} — dirección: solo minúsculas, números y guiones (ej. "reglamento-de-prestamos").`);
    } else if (slug && slugs.has(slug)) {
      errores.push(`${n} — dirección: "${slug}" ya la usa otra página.`);
    }
    slugs.add(slug);
    const pagina = {
      titulo: texto(p.titulo, `${n} — título`, 120, { requerido: publicar }),
      slug,
      cuerpo: conFormato(p.cuerpo, `${n} — texto`, 20000, { requerido: publicar }),
      legal: null,
    };
    // Páginas legales (términos, privacidad, reglamento): llevan quién
    // responde por el texto, número de versión y desde cuándo rige.
    if (p.legal && typeof p.legal === "object") {
      pagina.legal = {
        responsable: texto(p.legal.responsable, `${n} — responsable`, 120, { requerido: publicar }),
        version: texto(p.legal.version, `${n} — versión`, 30, { requerido: publicar }),
        vigenteDesde: fecha(p.legal.vigenteDesde, `${n} — vigente desde`, { requerido: publicar }),
      };
    }
    return pagina;
  });

  return { datos: { identidad, contacto, avisos, paginas }, errores };
}

// Los ids de las imágenes a las que apunta un contenido (para controlar que
// sean de la misma biblioteca).
export function imagenesUsadas(datos) {
  return Object.values(datos.identidad.logos).filter(Boolean);
}
