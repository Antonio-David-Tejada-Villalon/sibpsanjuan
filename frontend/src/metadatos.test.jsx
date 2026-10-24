import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useMetadatos } from "./metadatos.js";

function Pagina({ meta }) {
  useMetadatos(meta);
  return null;
}

const FICHA = {
  titulo: "Martín Fierro · José Hernández · Colegio",
  descripcion: "Martín Fierro de José Hernández (Colihue, 1872).",
  canonical: "https://catalogo.example/opac/escolar/libro/martin-fierro-1",
  robots: "index,follow",
  og: { tipo: "book", sitio: "Colegio", imagen: { url: "https://api.example/logo.webp", alt: "Logo de Colegio" } },
  jsonLd: { "@context": "https://schema.org", "@graph": [{ "@type": "Book", name: "</script><script>alert(1)</script>" }] },
};

const PRIVADA = { titulo: "Mi cuenta · Colegio", descripcion: "", canonical: null, robots: "noindex,nofollow", og: null, jsonLd: null };

const $ = (selector) => document.head.querySelector(selector);

describe("useMetadatos", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("escribe título, descripción, canonical, Open Graph y JSON-LD", () => {
    render(<Pagina meta={FICHA} />);
    expect(document.title).toBe(FICHA.titulo);
    expect($('meta[name="description"]').content).toBe(FICHA.descripcion);
    expect($('link[rel="canonical"]').href).toBe(FICHA.canonical);
    expect($('meta[property="og:url"]').content).toBe(FICHA.canonical);
    expect($('meta[property="og:type"]').content).toBe("book");
    expect($('meta[property="og:image"]').content).toBe("https://api.example/logo.webp");
    const scripts = document.head.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    // El título con </script> queda como dato, no como otro elemento.
    expect(JSON.parse(scripts[0].textContent)["@graph"][0].name).toBe("</script><script>alert(1)</script>");
  });

  it("reemplaza lo que escribió el servidor en vez de duplicarlo", () => {
    document.head.innerHTML =
      '<title>Viejo</title><meta name="description" content="vieja"><link rel="canonical" href="https://x/viejo">' +
      '<script type="application/ld+json">{"@type":"Book"}</script>';
    render(<Pagina meta={FICHA} />);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  });

  it("al pasar a una página privada saca canonical, Open Graph y JSON-LD y marca noindex", () => {
    const { rerender, unmount } = render(<Pagina meta={FICHA} />);
    rerender(<Pagina meta={PRIVADA} />);
    expect(document.title).toBe("Mi cuenta · Colegio");
    expect($('meta[name="robots"]').content).toBe("noindex,nofollow");
    expect($('link[rel="canonical"]')).toBeNull();
    expect($('meta[property="og:image"]')).toBeNull();
    expect($('script[type="application/ld+json"]')).toBeNull();
    unmount();
    expect($('meta[name="robots"]')).toBeNull();
  });

  it("mientras carga (sin metadatos) no toca nada", () => {
    document.title = "Antes";
    render(<Pagina meta={null} />);
    expect(document.title).toBe("Antes");
  });
});
