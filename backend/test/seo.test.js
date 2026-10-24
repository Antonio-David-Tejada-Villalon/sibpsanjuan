import { test } from "node:test";
import assert from "node:assert/strict";
import {
  headDeMetadatos,
  jsonParaScript,
  metadatosDeFicha,
  metadatosDeInicio,
  metadatosDePagina,
  metadatosPrivados,
  nombreNatural,
  origenPublico,
} from "../src/seo/metadatos.js";

const CONTENIDO = {
  identidad: { nombre: "Colegio San Juan Bautista", logos: { cuadrado: "/api/v1/opac/escolar/imagenes/abc.webp" } },
};
const OPCIONES = { codigo: "escolar", origen: "https://catalogo.example", origenApi: "https://api.example" };
const ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

function ficha(cambios = {}) {
  return {
    id: ID,
    itemTipo: "Libro",
    etiquetaTipo: "Libros",
    segmento: "libro",
    slug: "martin-fierro",
    titulo: "Martín Fierro",
    subtitulo: "",
    autores: ["Hernández, José"],
    materias: ["Poesía gauchesca", "Literatura argentina"],
    detalle: [
      { etiqueta: "Autor(es)", valor: "Hernández, José" },
      { etiqueta: "Editorial", valor: "Colihue" },
      { etiqueta: "Año", valor: "1872" },
      { etiqueta: "Páginas", valor: "320 p." },
      { etiqueta: "ISBN", valor: "978-950-581-123-6" },
      { etiqueta: "Notas", valor: "Ejemplar dedicado por la cooperadora" },
    ],
    portadaFuente: "googlebooks",
    ...cambios,
  };
}

test("ficha de un libro: título, descripción sin notas, canonical, Book y BreadcrumbList", () => {
  const meta = metadatosDeFicha(ficha(), CONTENIDO, OPCIONES);
  assert.equal(meta.titulo, "Martín Fierro · José Hernández · Colegio San Juan Bautista");
  assert.equal(meta.canonical, `https://catalogo.example/opac/escolar/libro/martin-fierro-${ID}`);
  assert.equal(meta.robots, "index,follow");
  assert.match(meta.descripcion, /^Martín Fierro de José Hernández \(Colihue, 1872\)\. En el catálogo de Colegio San Juan Bautista/);
  assert.ok(meta.descripcion.length <= 160);
  assert.doesNotMatch(meta.descripcion, /cooperadora/, "las notas libres no van a la descripción");
  assert.equal(meta.og.tipo, "book");
  // La imagen para compartir es el logo, nunca la portada (licencias).
  assert.equal(meta.og.imagen.url, "https://api.example/api/v1/opac/escolar/imagenes/abc.webp");

  const [libro, migas] = meta.jsonLd["@graph"];
  assert.equal(libro["@type"], "Book");
  assert.equal(libro.name, "Martín Fierro");
  assert.deepEqual(libro.author, [{ "@type": "Person", name: "José Hernández" }]);
  assert.equal(libro.isbn, "9789505811236");
  assert.equal(libro.datePublished, "1872");
  assert.deepEqual(libro.publisher, { "@type": "Organization", name: "Colihue" });
  assert.equal(libro.numberOfPages, 320);
  assert.equal(libro.url, meta.canonical);
  assert.equal(libro.image, undefined);
  assert.deepEqual(
    migas.itemListElement.map((m) => [m.name, m.item]),
    [
      ["Catálogo", "https://catalogo.example/opac/escolar"],
      ["Libros", "https://catalogo.example/opac/escolar?tipo=Libro"],
      ["Martín Fierro", undefined],
    ]
  );
});

test("solo datos válidos en Book: ISBN y año raros se omiten; otros tipos no son Book", () => {
  const meta = metadatosDeFicha(
    ficha({ detalle: [{ etiqueta: "ISBN", valor: "s/n" }, { etiqueta: "Año", valor: "ca. 1900" }] }),
    CONTENIDO,
    OPCIONES
  );
  const [libro] = meta.jsonLd["@graph"];
  assert.equal(libro.isbn, undefined);
  assert.equal(libro.datePublished, undefined);

  const revista = metadatosDeFicha(
    ficha({ itemTipo: "Seriada", etiquetaTipo: "Publicaciones seriadas", segmento: "publicacion-seriada", autores: [] }),
    CONTENIDO,
    OPCIONES
  );
  assert.deepEqual(revista.jsonLd["@graph"].map((n) => n["@type"]), ["BreadcrumbList"]);
  assert.equal(revista.og.tipo, "website");
});

test("nombres de autor: 'Apellido, Nombre' se da vuelta; corporativos y con fechas quedan igual", () => {
  assert.equal(nombreNatural("Borges, Jorge Luis"), "Jorge Luis Borges");
  assert.equal(nombreNatural("Borges, Jorge Luis, 1899-1986"), "Borges, Jorge Luis, 1899-1986");
  assert.equal(nombreNatural("Universidad Nacional de San Juan"), "Universidad Nacional de San Juan");
});

test("el <head> escapa el texto del catálogo y el JSON-LD no se puede cerrar desde un título", () => {
  const maligno = 'Hola"><script>alert(1)</script></title>';
  const meta = metadatosDeFicha(ficha({ titulo: maligno, slug: "hola" }), CONTENIDO, OPCIONES);
  const head = headDeMetadatos(meta);
  assert.doesNotMatch(head, /<script>alert/);
  assert.doesNotMatch(head, /<\/title>[^\n]*<\/title>/);
  assert.match(head, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  // Un solo cierre de </script>: el del bloque de datos estructurados.
  assert.equal(head.match(/<\/script>/g).length, 1);
  assert.equal(JSON.parse(jsonParaScript({ t: "</script>" })).t, "</script>");
});

test("inicio, páginas del CMS y páginas privadas", () => {
  const inicio = metadatosDeInicio(CONTENIDO, OPCIONES);
  assert.equal(inicio.titulo, "Colegio San Juan Bautista · Catálogo en línea");
  assert.equal(inicio.canonical, "https://catalogo.example/opac/escolar");

  const pagina = metadatosDePagina(
    { titulo: "Reglamento", slug: "reglamento", cuerpo: "**Préstamos:** hasta [7 días](https://x.example).\n\n- Uno\n- Dos" },
    CONTENIDO,
    OPCIONES
  );
  assert.equal(pagina.canonical, "https://catalogo.example/opac/escolar/pagina/reglamento");
  assert.equal(pagina.descripcion, "Préstamos: hasta 7 días. Uno Dos");

  const privada = metadatosPrivados("Mi cuenta", CONTENIDO);
  assert.equal(privada.robots, "noindex,nofollow");
  assert.equal(privada.canonical, null);
  assert.doesNotMatch(headDeMetadatos(privada), /og:|canonical|ld\+json/);
});

test("origen público: SITIO_URL, si no FRONTEND_URL, si no el propio servidor", () => {
  const req = { protocol: "https", get: () => "mi-api.onrender.com" };
  const antes = { SITIO_URL: process.env.SITIO_URL, FRONTEND_URL: process.env.FRONTEND_URL };
  try {
    delete process.env.SITIO_URL;
    delete process.env.FRONTEND_URL;
    assert.equal(origenPublico(req), "https://mi-api.onrender.com");
    process.env.FRONTEND_URL = "https://miapp.vercel.app/";
    assert.equal(origenPublico(req), "https://miapp.vercel.app");
    process.env.SITIO_URL = "https://biblioteca.colegio.edu.ar";
    assert.equal(origenPublico(req), "https://biblioteca.colegio.edu.ar");
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
