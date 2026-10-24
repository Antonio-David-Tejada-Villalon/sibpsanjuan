import { useEffect } from "react";
import { useContenidoOpac } from "./ContenidoOpacContext.jsx";

// Título, descripción, canonical, Open Graph y datos estructurados de la
// página del OPAC que se está viendo. Al entrar directo, el servidor ya los
// escribe en el <head> (ver backend/src/seo/); al navegar dentro de la app,
// este hook los reemplaza con los de la página nueva, que llegan armados
// desde la API ("seo" en la ficha, el contenido y las páginas). Así Google,
// que ejecuta JavaScript, y WhatsApp, que no, ven lo mismo.

function ponerMeta(atributo, clave, valor) {
  let el = document.head.querySelector(`meta[${atributo}="${clave}"]`);
  if (!valor) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(atributo, clave);
    document.head.appendChild(el);
  }
  el.setAttribute("content", valor);
}

function ponerCanonical(url) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!url) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

function ponerJsonLd(datos) {
  for (const el of document.head.querySelectorAll('script[type="application/ld+json"]')) el.remove();
  if (!datos) return;
  const el = document.createElement("script");
  el.type = "application/ld+json";
  // textContent, no innerHTML: el texto del catálogo nunca se interpreta.
  el.textContent = JSON.stringify(datos);
  document.head.appendChild(el);
}

export function aplicarMetadatos(meta) {
  document.title = meta.titulo;
  ponerMeta("name", "description", meta.descripcion);
  ponerMeta("name", "robots", meta.robots);
  ponerCanonical(meta.canonical);
  const og = meta.og;
  ponerMeta("property", "og:type", og?.tipo);
  ponerMeta("property", "og:title", og && meta.titulo);
  ponerMeta("property", "og:description", og && meta.descripcion);
  ponerMeta("property", "og:url", og && meta.canonical);
  ponerMeta("property", "og:site_name", og?.sitio);
  ponerMeta("property", "og:locale", og && "es_AR");
  ponerMeta("property", "og:image", og?.imagen?.url);
  ponerMeta("property", "og:image:alt", og?.imagen?.alt);
  ponerMeta("name", "twitter:card", og && "summary");
  ponerJsonLd(meta.jsonLd);
}

// Al salir de la página no quedan canonical ni datos estructurados de otra.
function limpiarMetadatos() {
  ponerMeta("name", "robots", null);
  ponerCanonical(null);
  ponerMeta("property", "og:url", null);
  ponerJsonLd(null);
}

// meta: lo que vino de la API (o null mientras carga, y no se toca nada).
export function useMetadatos(meta) {
  const clave = meta ? JSON.stringify(meta) : null;
  useEffect(() => {
    if (!clave) return undefined;
    aplicarMetadatos(JSON.parse(clave));
    return limpiarMetadatos;
  }, [clave]);
}

// Páginas del socio (ingreso, cuenta, préstamos): con nombre en la pestaña,
// sin indexar.
export function useMetadatosPrivados(titulo) {
  const { contenido } = useContenidoOpac();
  const nombre = contenido?.identidad?.nombre;
  useMetadatos({ titulo: nombre ? `${titulo} · ${nombre}` : titulo, descripcion: "", canonical: null, robots: "noindex,nofollow", og: null, jsonLd: null });
}
