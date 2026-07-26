import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import {
  librosAMarcXml,
  seriadasAMarcXml,
  recursosElectronicosAMarcXml,
  materialSonoroAMarcXml,
  materialAudiovisualAMarcXml,
  materialCartograficoAMarcXml,
  materialGraficoAMarcXml,
  materialDidacticoAMarcXml,
} from "../src/marc/marcxml.js";

const LIBRO_COMPLETO = {
  _id: "aaa111",
  isbn: "978-950-07-0001-1",
  titulo: "Ficciones",
  subtitulo: "Cuentos",
  autores: ["Borges, Jorge Luis", "Editor, Un"],
  editorial: "Emecé",
  lugarPublicacion: "Buenos Aires",
  anio: "1944",
  paginas: "203",
  materias: ["Literatura argentina", "Cuentos fantásticos"],
  notas: "Edición conmemorativa",
  ejemplares: [
    { codigoBarras: "BPSJ-000001", signatura: "863 BOR" },
    { codigoBarras: "BPSJ-000002", signatura: "863 BOR" },
  ],
};

const LIBRO_MINIMO = {
  _id: "bbb222",
  titulo: "Sin datos extra",
  autores: [],
  materias: [],
  ejemplares: [],
};

function parsear(xml) {
  const doc = new DOMParser({
    onError: (level, msg) => {
      if (level === "error" || level === "fatalError") {
        throw new Error(`XML ${level}: ${msg}`);
      }
    },
  }).parseFromString(xml, "text/xml");
  return doc;
}

test("genera MARCXML well-formed para un libro completo", () => {
  const xml = librosAMarcXml([LIBRO_COMPLETO]);
  const doc = parsear(xml);
  const records = doc.getElementsByTagName("record");
  assert.equal(records.length, 1);
});

test("el campo 008 tiene exactamente 40 caracteres", () => {
  const xml = librosAMarcXml([LIBRO_COMPLETO, LIBRO_MINIMO]);
  const doc = parsear(xml);
  const campos008 = doc.getElementsByTagName("controlfield");
  let encontrados = 0;
  for (let i = 0; i < campos008.length; i++) {
    if (campos008[i].getAttribute("tag") === "008") {
      encontrados++;
      assert.equal(campos008[i].textContent.length, 40);
    }
  }
  assert.equal(encontrados, 2);
});

test("mapea ISBN, título, autor principal y autor adicional a los tags correctos", () => {
  const xml = librosAMarcXml([LIBRO_COMPLETO]);
  const doc = parsear(xml);

  function subcampo(tag, code) {
    const datafields = doc.getElementsByTagName("datafield");
    for (let i = 0; i < datafields.length; i++) {
      if (datafields[i].getAttribute("tag") === tag) {
        const subfields = datafields[i].getElementsByTagName("subfield");
        for (let j = 0; j < subfields.length; j++) {
          if (subfields[j].getAttribute("code") === code) return subfields[j].textContent;
        }
      }
    }
    return null;
  }

  assert.equal(subcampo("020", "a"), "978-950-07-0001-1");
  assert.equal(subcampo("100", "a"), "Borges, Jorge Luis");
  assert.equal(subcampo("700", "a"), "Editor, Un");
  assert.equal(subcampo("245", "a"), "Ficciones");
  assert.equal(subcampo("245", "b"), "Cuentos");
  assert.equal(subcampo("260", "b"), "Emecé");
});

test("genera un datafield 952 por cada ejemplar, con código de barras y signatura", () => {
  const xml = librosAMarcXml([LIBRO_COMPLETO]);
  const doc = parsear(xml);
  const datafields = doc.getElementsByTagName("datafield");
  const items952 = [];
  for (let i = 0; i < datafields.length; i++) {
    if (datafields[i].getAttribute("tag") === "952") items952.push(datafields[i]);
  }
  assert.equal(items952.length, 2);
  const codigos = items952.map((df) => {
    const subfields = df.getElementsByTagName("subfield");
    for (let j = 0; j < subfields.length; j++) {
      if (subfields[j].getAttribute("code") === "p") return subfields[j].textContent;
    }
    return null;
  });
  assert.deepEqual(codigos.sort(), ["BPSJ-000001", "BPSJ-000002"]);
});

test("un libro mínimo (sin isbn/autores/materias/ejemplares) no rompe y no genera datafields vacíos", () => {
  const xml = librosAMarcXml([LIBRO_MINIMO]);
  const doc = parsear(xml);
  assert.equal(doc.getElementsByTagName("record").length, 1);
  const datafields = doc.getElementsByTagName("datafield");
  const tags = [];
  for (let i = 0; i < datafields.length; i++) tags.push(datafields[i].getAttribute("tag"));
  // Sin ISBN/autor/editorial/materias/ejemplares, solo debería quedar el 245 (título)
  assert.deepEqual(tags, ["245"]);
});

test("escapa correctamente tildes, ñ y caracteres especiales de XML", () => {
  const libro = {
    _id: "ccc333",
    titulo: 'Título con "comillas", <ángulos> & ñoño',
    autores: ["Muñoz, José María"],
    materias: [],
    ejemplares: [],
  };
  const xml = librosAMarcXml([libro]);
  const doc = parsear(xml); // si no lanza, el XML es well-formed pese a los caracteres especiales
  assert.match(xml, /ñoño/);
  assert.match(xml, /Muñoz/);
});

test("una colección vacía produce un <collection> sin records, sin errores", () => {
  const xml = librosAMarcXml([]);
  const doc = parsear(xml);
  assert.equal(doc.getElementsByTagName("record").length, 0);
  assert.equal(doc.getElementsByTagName("collection").length, 1);
});

// ---- Helpers reusables para los tests de Seriada/RecursoElectronico ----

function subcampoDe(doc, tag, code) {
  const datafields = doc.getElementsByTagName("datafield");
  for (let i = 0; i < datafields.length; i++) {
    if (datafields[i].getAttribute("tag") === tag) {
      const subfields = datafields[i].getElementsByTagName("subfield");
      for (let j = 0; j < subfields.length; j++) {
        if (subfields[j].getAttribute("code") === code) return subfields[j].textContent;
      }
    }
  }
  return null;
}

function tagsDe(doc) {
  const datafields = doc.getElementsByTagName("datafield");
  const tags = [];
  for (let i = 0; i < datafields.length; i++) tags.push(datafields[i].getAttribute("tag"));
  return tags;
}

function leaderDe(doc) {
  return doc.getElementsByTagName("leader")[0].textContent;
}

function campo008De(doc) {
  const campos = doc.getElementsByTagName("controlfield");
  for (let i = 0; i < campos.length; i++) {
    if (campos[i].getAttribute("tag") === "008") return campos[i].textContent;
  }
  return null;
}

const SERIADA_COMPLETA = {
  _id: "sss111",
  issn: "1234-5678",
  titulo: "Revista de Pruebas",
  subtitulo: "Boletín trimestral",
  autores: ["Instituto de Pruebas"],
  editorial: "Instituto de Pruebas",
  lugarPublicacion: "Buenos Aires",
  periodicidad: "trimestral",
  numeracionInicial: "Vol. 1, no. 1",
  anioInicio: "2020",
  anioFin: "",
  materias: ["Bibliotecología"],
  notas: "Continúa a Boletín Antiguo",
  ejemplares: [{ codigoBarras: "BPSER-000001", signatura: "2020 v.1" }],
};

const SERIADA_MINIMA = { _id: "sss222", titulo: "Sin datos extra", autores: [], materias: [], ejemplares: [] };

const RECURSO_COMPLETO = {
  _id: "rrr111",
  titulo: "Manual de Koha",
  subtitulo: "Guía rápida",
  autores: ["Pérez, Ana"],
  editorial: "DigiBepé",
  anio: "2024",
  tipoRecurso: "pdf",
  urlAcceso: "https://ejemplo.org/manual.pdf",
  materias: ["Bibliotecología"],
  notas: "Versión 2",
};

const RECURSO_MINIMO = {
  _id: "rrr222",
  titulo: "Sitio sin datos extra",
  autores: [],
  materias: [],
  tipoRecurso: "sitio_web",
  urlAcceso: "https://ejemplo.org",
};

test("Leader/06 es 'a' para Libro y Seriada, 'm' para RecursoElectronico; Leader/07 distingue monografía de serie", () => {
  const leaderLibro = leaderDe(parsear(librosAMarcXml([LIBRO_MINIMO])));
  const leaderSeriada = leaderDe(parsear(seriadasAMarcXml([SERIADA_MINIMA])));
  const leaderRecurso = leaderDe(parsear(recursosElectronicosAMarcXml([RECURSO_MINIMO])));

  assert.equal(leaderLibro[6], "a");
  assert.equal(leaderLibro[7], "m");
  assert.equal(leaderSeriada[6], "a");
  assert.equal(leaderSeriada[7], "s");
  assert.equal(leaderRecurso[6], "m");
  assert.equal(leaderRecurso[7], "m");
});

test("el 008 de una Seriada usa el layout de Continuing Resources y sigue midiendo 40 caracteres", () => {
  const doc = parsear(seriadasAMarcXml([SERIADA_COMPLETA]));
  const campo = campo008De(doc);
  assert.equal(campo.length, 40);
  // posición 18 = frecuencia (trimestral -> "q"), 19 = regularidad ("r", no es irregular)
  assert.equal(campo[18], "q");
  assert.equal(campo[19], "r");
});

test("el 008 de una Seriada irregular usa regularidad 'x' y frecuencia sin codificar", () => {
  const irregular = { ...SERIADA_MINIMA, periodicidad: "irregular" };
  const campo = campo008De(parsear(seriadasAMarcXml([irregular])));
  assert.equal(campo[18], "|");
  assert.equal(campo[19], "x");
});

test("el 008 de un RecursoElectronico usa el layout de Computer Files y sigue midiendo 40 caracteres", () => {
  const doc = parsear(recursosElectronicosAMarcXml([RECURSO_COMPLETO]));
  const campo = campo008De(doc);
  assert.equal(campo.length, 40);
  // posición 23 = forma del ítem ("o", en línea), 26 = tipo de archivo (pdf -> "d")
  assert.equal(campo[23], "o");
  assert.equal(campo[26], "d");
});

test("Seriada emite 022 (ISSN) en vez de 020, y 310/362 con periodicidad y numeración", () => {
  const doc = parsear(seriadasAMarcXml([SERIADA_COMPLETA]));
  assert.equal(subcampoDe(doc, "022", "a"), "1234-5678");
  assert.equal(subcampoDe(doc, "020", "a"), null);
  assert.equal(subcampoDe(doc, "310", "a"), "trimestral");
  assert.equal(subcampoDe(doc, "362", "a"), "Vol. 1, no. 1, 2020-");
  assert.equal(subcampoDe(doc, "710", "a"), "Instituto de Pruebas");
  assert.equal(subcampoDe(doc, "100", "a"), null, "Seriada no debería tener asiento principal personal (100)");
});

test("Seriada con anioFin cierra el rango de numeración en el 362", () => {
  const cerrada = { ...SERIADA_COMPLETA, anioFin: "2023" };
  const doc = parsear(seriadasAMarcXml([cerrada]));
  assert.equal(subcampoDe(doc, "362", "a"), "Vol. 1, no. 1, 2020-2023");
});

test("Seriada emite un 952 por ejemplar, igual que Libro", () => {
  const doc = parsear(seriadasAMarcXml([SERIADA_COMPLETA]));
  assert.equal(subcampoDe(doc, "952", "p"), "BPSER-000001");
});

test("una Seriada mínima no genera datafields vacíos (solo 245)", () => {
  const doc = parsear(seriadasAMarcXml([SERIADA_MINIMA]));
  assert.deepEqual(tagsDe(doc), ["245"]);
});

test("RecursoElectronico emite 007, 338 y 856 $u con la urlAcceso, y NO emite ningún 952", () => {
  const doc = parsear(recursosElectronicosAMarcXml([RECURSO_COMPLETO]));

  const campos007 = doc.getElementsByTagName("controlfield");
  let campo007 = null;
  for (let i = 0; i < campos007.length; i++) {
    if (campos007[i].getAttribute("tag") === "007") campo007 = campos007[i].textContent;
  }
  assert.equal(campo007[0], "c", "posición 00 del 007 = categoría 'c' (recurso electrónico)");

  assert.equal(subcampoDe(doc, "338", "a"), "recurso en línea");
  assert.equal(subcampoDe(doc, "856", "u"), "https://ejemplo.org/manual.pdf");
  assert.equal(tagsDe(doc).includes("952"), false, "RecursoElectronico no tiene ejemplares — nunca debería emitir 952");
});

test("RecursoElectronico mapea autor principal (100) y adicional (700), igual que Libro", () => {
  const conDosAutores = { ...RECURSO_COMPLETO, autores: ["Pérez, Ana", "Gómez, Luis"] };
  const doc = parsear(recursosElectronicosAMarcXml([conDosAutores]));
  assert.equal(subcampoDe(doc, "100", "a"), "Pérez, Ana");
  assert.equal(subcampoDe(doc, "700", "a"), "Gómez, Luis");
});

test("un RecursoElectronico mínimo no genera datafields vacíos más allá de los inherentes al bucket (245, 256, 338 y 856 — este último porque urlAcceso es obligatorio)", () => {
  const doc = parsear(recursosElectronicosAMarcXml([RECURSO_MINIMO]));
  assert.deepEqual(tagsDe(doc), ["245", "256", "338", "856"]);
});

test("Libro con urlAcceso (subtipo ebook) emite 856 $u; un libro sin urlAcceso no emite 856", () => {
  const ebook = { ...LIBRO_MINIMO, urlAcceso: "https://ejemplo.org/libro.pdf" };
  const docConAcceso = parsear(librosAMarcXml([ebook]));
  assert.equal(subcampoDe(docConAcceso, "856", "u"), "https://ejemplo.org/libro.pdf");

  const docSinAcceso = parsear(librosAMarcXml([LIBRO_MINIMO]));
  assert.equal(tagsDe(docSinAcceso).includes("856"), false);
});

// ---- Material sonoro ----

const SONORO_COMPLETO = {
  _id: "son111",
  titulo: "Concierto de Aranjuez",
  subtitulo: "Grabación en vivo",
  autores: ["Yo-Yo Ma", "Orquesta de Cámara"],
  editorial: "Sony Classical",
  anio: "1985",
  subtipo: "cd",
  duracion: "00:42:00",
  materias: ["Música clásica"],
  notas: "Remasterizado 2020",
  ejemplares: [{ codigoBarras: "BPSON-000001", signatura: "780 CD" }],
};
const SONORO_MINIMO = { _id: "son222", titulo: "Sin datos extra", autores: [], materias: [], ejemplares: [] };

test("Material sonoro: Leader/06 'i', 007 categoría 's', 008 de 40 caracteres", () => {
  const doc = parsear(materialSonoroAMarcXml([SONORO_COMPLETO]));
  assert.equal(leaderDe(doc)[6], "i");
  const campos007 = doc.getElementsByTagName("controlfield");
  let campo007 = null;
  for (let i = 0; i < campos007.length; i++) {
    if (campos007[i].getAttribute("tag") === "007") campo007 = campos007[i].textContent;
  }
  assert.equal(campo007[0], "s");
  assert.equal(campo008De(doc).length, 40);
});

test("Material sonoro: mapea intérprete/compositor, editorial y duración (306)", () => {
  const doc = parsear(materialSonoroAMarcXml([SONORO_COMPLETO]));
  assert.equal(subcampoDe(doc, "100", "a"), "Yo-Yo Ma");
  assert.equal(subcampoDe(doc, "700", "a"), "Orquesta de Cámara");
  assert.equal(subcampoDe(doc, "260", "b"), "Sony Classical");
  assert.equal(subcampoDe(doc, "306", "a"), "00:42:00");
});

test("Material sonoro con subtipo podcast y urlAcceso emite 856; sin urlAcceso no lo emite", () => {
  const podcast = { ...SONORO_MINIMO, subtipo: "podcast", urlAcceso: "https://ejemplo.org/episodio1.mp3" };
  assert.equal(subcampoDe(parsear(materialSonoroAMarcXml([podcast])), "856", "u"), "https://ejemplo.org/episodio1.mp3");
  assert.equal(tagsDe(parsear(materialSonoroAMarcXml([SONORO_MINIMO]))).includes("856"), false);
});

test("un Material sonoro mínimo no genera datafields vacíos (solo 245)", () => {
  assert.deepEqual(tagsDe(parsear(materialSonoroAMarcXml([SONORO_MINIMO]))), ["245"]);
});

test("Material sonoro emite un 952 por ejemplar", () => {
  assert.equal(subcampoDe(parsear(materialSonoroAMarcXml([SONORO_COMPLETO])), "952", "p"), "BPSON-000001");
});

// ---- Material audiovisual ----

const AV_COMPLETO = {
  _id: "av111",
  titulo: "Nueve Reinas",
  autores: ["Fabián Bielinsky"],
  editorial: "Patagonik Film Group",
  anio: "2000",
  subtipo: "dvd",
  duracion: "01:54:00",
  materias: ["Cine argentino"],
  notas: "Edición especial",
  ejemplares: [{ codigoBarras: "BPAV-000001", signatura: "791 DVD" }],
};
const AV_MINIMO = { _id: "av222", titulo: "Sin datos extra", autores: [], materias: [], ejemplares: [] };

test("Material audiovisual: Leader/06 'g', 007 categoría 'v', 008 de 40 caracteres", () => {
  const doc = parsear(materialAudiovisualAMarcXml([AV_COMPLETO]));
  assert.equal(leaderDe(doc)[6], "g");
  const campos007 = doc.getElementsByTagName("controlfield");
  let campo007 = null;
  for (let i = 0; i < campos007.length; i++) {
    if (campos007[i].getAttribute("tag") === "007") campo007 = campos007[i].textContent;
  }
  assert.equal(campo007[0], "v");
  assert.equal(campo008De(doc).length, 40);
});

test("Material audiovisual: mapea director, productora y duración (306)", () => {
  const doc = parsear(materialAudiovisualAMarcXml([AV_COMPLETO]));
  assert.equal(subcampoDe(doc, "100", "a"), "Fabián Bielinsky");
  assert.equal(subcampoDe(doc, "260", "b"), "Patagonik Film Group");
  assert.equal(subcampoDe(doc, "306", "a"), "01:54:00");
});

test("Material audiovisual con subtipo streaming y urlAcceso emite 856; sin urlAcceso no lo emite", () => {
  const streaming = { ...AV_MINIMO, subtipo: "streaming", urlAcceso: "https://ejemplo.org/pelicula" };
  assert.equal(subcampoDe(parsear(materialAudiovisualAMarcXml([streaming])), "856", "u"), "https://ejemplo.org/pelicula");
  assert.equal(tagsDe(parsear(materialAudiovisualAMarcXml([AV_MINIMO]))).includes("856"), false);
});

test("un Material audiovisual mínimo no genera datafields vacíos (solo 245)", () => {
  assert.deepEqual(tagsDe(parsear(materialAudiovisualAMarcXml([AV_MINIMO]))), ["245"]);
});

// ---- Material cartográfico ----

const CART_COMPLETO = {
  _id: "cart111",
  titulo: "Mapa vial de San Juan",
  autores: ["Instituto Geográfico Nacional"],
  anio: "2022",
  subtipo: "mapa",
  escala: "1:50.000",
  proyeccion: "Gauss-Krüger",
  coordenadas: "W68°--W68°30' / S31°30'--S32°",
  materias: ["Cartografía"],
  ejemplares: [{ codigoBarras: "BPCART-000001", signatura: "912 MAP" }],
};
const CART_MINIMO = { _id: "cart222", titulo: "Sin datos extra", autores: [], materias: [], ejemplares: [] };

test("Material cartográfico: Leader/06 'e', 007 categoría 'a' (o 'd' si es globo), 008 de 40 caracteres", () => {
  const doc = parsear(materialCartograficoAMarcXml([CART_COMPLETO]));
  assert.equal(leaderDe(doc)[6], "e");
  assert.equal(campo008De(doc).length, 40);

  const campos007 = doc.getElementsByTagName("controlfield");
  let campo007 = null;
  for (let i = 0; i < campos007.length; i++) {
    if (campos007[i].getAttribute("tag") === "007") campo007 = campos007[i].textContent;
  }
  assert.equal(campo007[0], "a");

  const globo = { ...CART_MINIMO, subtipo: "globo_terraqueo" };
  const camposGlobo = parsear(materialCartograficoAMarcXml([globo])).getElementsByTagName("controlfield");
  let campo007Globo = null;
  for (let i = 0; i < camposGlobo.length; i++) {
    if (camposGlobo[i].getAttribute("tag") === "007") campo007Globo = camposGlobo[i].textContent;
  }
  assert.equal(campo007Globo[0], "d");
});

test("Material cartográfico mapea escala/proyección/coordenadas al 255", () => {
  const doc = parsear(materialCartograficoAMarcXml([CART_COMPLETO]));
  assert.equal(subcampoDe(doc, "255", "a"), "1:50.000");
  assert.equal(subcampoDe(doc, "255", "b"), "Gauss-Krüger");
});

test("un Material cartográfico mínimo no genera datafields vacíos (solo 245)", () => {
  assert.deepEqual(tagsDe(parsear(materialCartograficoAMarcXml([CART_MINIMO]))), ["245"]);
});

// ---- Material gráfico ----

const GRAFICO_COMPLETO = {
  _id: "graf111",
  titulo: "Plaza 25 de Mayo, 1950",
  autores: ["Estudio Fotográfico Ríos"],
  anio: "1950",
  subtipo: "fotografia",
  tecnica: "blanco y negro",
  materias: ["Fotografía histórica"],
  ejemplares: [{ codigoBarras: "BPGRAF-000001", signatura: "770 FOT" }],
};
const GRAFICO_MINIMO = { _id: "graf222", titulo: "Sin datos extra", autores: [], materias: [], ejemplares: [] };

test("Material gráfico: Leader/06 'k', 007 categoría 'k', 008 de 40 caracteres, y 340 con la técnica", () => {
  const doc = parsear(materialGraficoAMarcXml([GRAFICO_COMPLETO]));
  assert.equal(leaderDe(doc)[6], "k");
  assert.equal(campo008De(doc).length, 40);
  assert.equal(subcampoDe(doc, "340", "a"), "blanco y negro");

  const campos007 = doc.getElementsByTagName("controlfield");
  let campo007 = null;
  for (let i = 0; i < campos007.length; i++) {
    if (campos007[i].getAttribute("tag") === "007") campo007 = campos007[i].textContent;
  }
  assert.equal(campo007[0], "k");
});

test("un Material gráfico mínimo no genera datafields vacíos (solo 245)", () => {
  assert.deepEqual(tagsDe(parsear(materialGraficoAMarcXml([GRAFICO_MINIMO]))), ["245"]);
});

// ---- Material didáctico ----

const DID_COMPLETO = {
  _id: "did111",
  titulo: "Rompecabezas mapa de Argentina",
  subtipo: "rompecabezas",
  componentes: "48 piezas de madera",
  edadRecomendada: "6-9 años",
  materias: ["Geografía"],
  notas: "Falta una pieza",
  ejemplares: [{ codigoBarras: "BPDID-000001", signatura: "JUE 001" }],
};
const DID_MINIMO = { _id: "did222", titulo: "Sin datos extra", materias: [], ejemplares: [] };

test("Material didáctico: Leader/06 'o', 007 es solo 'o' (sin relleno), 008 de 40 caracteres", () => {
  const doc = parsear(materialDidacticoAMarcXml([DID_COMPLETO]));
  assert.equal(leaderDe(doc)[6], "o");
  assert.equal(campo008De(doc).length, 40);

  const campos007 = doc.getElementsByTagName("controlfield");
  let campo007 = null;
  for (let i = 0; i < campos007.length; i++) {
    if (campos007[i].getAttribute("tag") === "007") campo007 = campos007[i].textContent;
  }
  assert.equal(campo007, "o");
});

test("Material didáctico mapea componentes (300 $e) y edad recomendada (521)", () => {
  const doc = parsear(materialDidacticoAMarcXml([DID_COMPLETO]));
  assert.equal(subcampoDe(doc, "300", "e"), "48 piezas de madera");
  assert.equal(subcampoDe(doc, "521", "a"), "6-9 años");
});

test("un Material didáctico mínimo no genera datafields vacíos (solo 245)", () => {
  assert.deepEqual(tagsDe(parsear(materialDidacticoAMarcXml([DID_MINIMO]))), ["245"]);
});

test("Material didáctico emite un 952 por ejemplar, igual que los demás buckets circulantes", () => {
  assert.equal(subcampoDe(parsear(materialDidacticoAMarcXml([DID_COMPLETO])), "952", "p"), "BPDID-000001");
});
