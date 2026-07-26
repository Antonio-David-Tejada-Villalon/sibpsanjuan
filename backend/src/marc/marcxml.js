import { create } from "xmlbuilder2";

// Este archivo genera MARCXML para tres buckets (Libro, Seriada,
// RecursoElectronico), cada uno con su propio Leader/06 y su propio layout
// de 008/18-34 — son cosas distintas por norma MARC21 (Books vs Continuing
// Resources vs Computer Files comparten solo las posiciones 00-17 y 35-39).
// El diseño acá es un builder compartido (construirLeader/construirCampo008/
// agregarDatafield) + una función de mapeo por bucket, en vez de tres
// copias completas — para no duplicar la lógica de padding/longitud del
// 008, que ya está resuelta y probada una sola vez.
//
// Igual que antes: se usa "|" (relleno MARC21 para "no se intentó
// codificar esta posición") en todo lo que no se puede derivar de los datos
// capturados, nunca un valor inventado; las posiciones genuinamente
// "indefinido" del formato llevan blanco (" "), no "|" — son dos cosas
// distintas. Referencia: MARC 21 Format for Bibliographic Data — Leader,
// 006, 007, 008 (Books / Continuing Resources / Computer Files).
//
// BIBL-2 (ver AUDITORIA.md): los tres layouts de arriba (Books, Continuing
// Resources, Computer Files) ya se verificaron posición por posición contra
// la documentación oficial de LC — se encontró y corrigió un error real en
// Computer Files, que rellenaba sus posiciones indefinidas con "|" en vez
// de blanco. Los cinco buckets con camposNoCodificados1834 (Music, Maps,
// Visual Materials x2, Mixed Materials) siguen sin ese layout fino
// verificado — ver la nota puntual más abajo — y de forma consciente se
// codifican como "no codificado" en vez de arriesgar una posición corrida.

const FRECUENCIA_MARC = {
  diaria: "d",
  semanal: "w",
  quincenal: "s",
  mensual: "m",
  bimestral: "b",
  trimestral: "q",
  cuatrimestral: "t",
  semestral: "f",
  anual: "a",
  irregular: "|",
};

const TIPO_ARCHIVO_MARC = {
  pdf: "d",
  epub: "d",
  mobi: "d",
  html: "d",
  sitio_web: "j",
  base_de_datos: "e",
  software: "b",
};

// ---- Leader (24 caracteres) ----
// Posiciones 00-04 (longitud del registro) y 12-16 (dirección base de
// datos) quedan en "0" — se recalculan al importar, no las computamos acá,
// igual que antes. Lo único que cambia por bucket es 06 (tipo de registro)
// y 07 (nivel bibliográfico: m=monografía, s=serie).
function construirLeader(tipoRegistro, nivelBibliografico) {
  return `00000n${tipoRegistro}${nivelBibliografico} a2200000 a 4500`;
}

// ---- 008: posiciones 00-17 y 35-39, comunes a los tres buckets ----
function camposFechaYLugar(item) {
  const hoy = new Date();
  const yy = String(hoy.getFullYear()).slice(2);
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  const fechaEntrada = `${yy}${mm}${dd}`; // 00-05 (6)

  const anio = (item.anio || item.anioInicio || "").trim();
  const tieneAnio = /^\d{4}$/.test(anio);
  const tipoFecha = tieneAnio ? "s" : "n"; // 06 (1)
  const fecha1 = tieneAnio ? anio : "||||"; // 07-10 (4)
  const fecha2 = "    "; // 11-14 (4, blanco: una sola fecha conocida)
  const lugarPublicacion = "|||"; // 15-17 (3), no codificado

  return fechaEntrada + tipoFecha + fecha1 + fecha2 + lugarPublicacion; // 18 chars (posiciones 00-17)
}

const IDIOMA_Y_FUENTE = "spa" + "|" + "|"; // 35-37 idioma (default de este proyecto), 38 modificado, 39 fuente — 5 chars

// ---- 18-34 (17 caracteres): un layout por bucket, según Leader/06 ----
function camposBooks1834() {
  // Books: ilustraciones(4) / público destinatario(1) / forma del ítem(1) /
  // naturaleza del contenido(4) / gubernamental(1) / conferencia(1) /
  // festschrift(1) / índice(1) / indefinido(1) / forma literaria(1) / biografía(1)
  return "||||" + "|" + "|" + "||||" + "|" + "|" + "|" + "|" + " " + "|" + "|";
}

function camposContinuingResources1834(seriada) {
  // Continuing Resources: frecuencia(1) / regularidad(1) / indefinido(1) /
  // tipo de publicación seriada(1) / forma del original(1) / forma del ítem(1) /
  // naturaleza de la obra completa(1) / naturaleza del contenido(3) /
  // gubernamental(1) / conferencia(1) / indefinido(3) / alfabeto original(1) /
  // convención de entrada(1)
  const frecuencia = FRECUENCIA_MARC[seriada.periodicidad] || "|";
  const regularidad = seriada.periodicidad === "irregular" ? "x" : "r";
  return frecuencia + regularidad + " " + "|" + "|" + "|" + "|" + "|||" + "|" + "|" + "   " + "|" + "|";
}

function camposComputerFiles1834(recurso) {
  // Computer Files: indefinido(4) / público destinatario(1) / forma del ítem(1) /
  // indefinido(2) / tipo de archivo de computadora(1) / indefinido(1) /
  // gubernamental(1) / indefinido(6)
  //
  // Verificado contra la documentación oficial de LC (ver BIBL-2 en
  // AUDITORIA.md): las posiciones "indefinido" de un 008 llevan blanco
  // (" "), no "|" — "|" es solo para una posición SÍ definida por el
  // formato que este proyecto no puede derivar de los datos capturados
  // ("no se intentó codificar"). Las otras dos funciones de este archivo
  // (camposBooks1834, camposContinuingResources1834) ya seguían bien esa
  // distinción; acá se habían mezclado ambos rellenos.
  const formaItem = "o"; // "o" = en línea — todos los recursos de este bucket son de acceso remoto vía URL
  const tipoArchivo = TIPO_ARCHIVO_MARC[recurso.tipoRecurso] || "|";
  return "    " + "|" + formaItem + "  " + tipoArchivo + " " + "|" + "      ";
}

// Music (Sonoro), Maps (Cartográfico), Visual Materials (Audiovisual y
// Gráfico) y Mixed Materials (Didáctico) tienen layouts de 008/18-34
// bastante más intrincados que los tres de arriba (varias sub-posiciones
// de pocos bits cada una) y no pudimos verificar los límites exactos de
// cada sub-campo contra la documentación oficial de LC (bloquea scraping
// automatizado). En vez de adivinar límites de byte y arriesgar un 008
// que "parece" preciso pero está corrido de posición, se codifica motivo
// no codificado ("|" x 17) para estos cinco buckets — Leader/06 y 007 sí
// están cross-chequeados con confianza (son un solo carácter cada uno) y
// se codifican normalmente. Verificar el layout fino de 18-34 contra LC
// antes de depender de esas posiciones específicas para estos buckets.
function camposNoCodificados1834() {
  return "|".repeat(17);
}

function construirCampo008(item, campos1834Fn) {
  const campo = camposFechaYLugar(item) + campos1834Fn(item) + IDIOMA_Y_FUENTE;
  if (campo.length !== 40) {
    throw new Error(`campo 008 mal formado: longitud ${campo.length}, esperada 40`);
  }
  return campo;
}

function agregarDatafield(record, tag, ind1, ind2, subcampos) {
  const datafield = record.ele("datafield", { tag, ind1, ind2 });
  for (const [code, valor] of subcampos) {
    if (valor === undefined || valor === null || String(valor).trim() === "") continue;
    datafield.ele("subfield", { code }).txt(String(valor)).up();
  }
  datafield.up();
}

// ---- Libro ----
function libroARecord(collection, libro) {
  const record = collection.ele("record");
  record.ele("leader").txt(construirLeader("a", "m")).up();
  record.ele("controlfield", { tag: "001" }).txt(String(libro._id)).up();
  record.ele("controlfield", { tag: "008" }).txt(construirCampo008(libro, camposBooks1834)).up();

  if (libro.isbn) {
    agregarDatafield(record, "020", " ", " ", [["a", libro.isbn]]);
  }

  const [primerAutor, ...otrosAutores] = libro.autores || [];
  if (primerAutor) {
    agregarDatafield(record, "100", "1", " ", [["a", primerAutor]]);
  }

  agregarDatafield(record, "245", primerAutor ? "1" : "0", "0", [
    ["a", libro.titulo],
    ["b", libro.subtitulo],
  ]);

  if (libro.lugarPublicacion || libro.editorial || libro.anio) {
    agregarDatafield(record, "260", " ", " ", [
      ["a", libro.lugarPublicacion],
      ["b", libro.editorial],
      ["c", libro.anio],
    ]);
  }

  if (libro.paginas) {
    agregarDatafield(record, "300", " ", " ", [["a", `${libro.paginas} p.`]]);
  }

  for (const materia of libro.materias || []) {
    agregarDatafield(record, "650", " ", "4", [["a", materia]]);
  }

  for (const autor of otrosAutores) {
    agregarDatafield(record, "700", "1", " ", [["a", autor]]);
  }

  if (libro.notas) {
    agregarDatafield(record, "500", " ", " ", [["a", libro.notas]]);
  }

  // 856: solo si hay urlAcceso (subtipo digital/ebook) — mismo campo que
  // usa recursoElectronicoARecord, el punto de acceso directo.
  if (libro.urlAcceso) {
    agregarDatafield(record, "856", "4", "0", [["u", libro.urlAcceso]]);
  }

  // 952: uno por ejemplar. Es lo que hace que Koha, al importar, cree
  // también los ítems (con código de barras y signatura) y no solo el
  // registro bibliográfico vacío.
  for (const ejemplar of libro.ejemplares || []) {
    agregarDatafield(record, "952", " ", " ", [
      ["p", ejemplar.codigoBarras],
      ["o", ejemplar.signatura],
    ]);
  }

  record.up();
}

// ---- Seriada ----
function numeracionYAnios(seriada) {
  if (!seriada.numeracionInicial && !seriada.anioInicio) return null;
  const numeracion = seriada.numeracionInicial ? `${seriada.numeracionInicial}, ` : "";
  const anios = seriada.anioFin ? `${seriada.anioInicio}-${seriada.anioFin}` : `${seriada.anioInicio}-`;
  return `${numeracion}${anios}`.trim();
}

function seriadaARecord(collection, seriada) {
  const record = collection.ele("record");
  record.ele("leader").txt(construirLeader("a", "s")).up();
  record.ele("controlfield", { tag: "001" }).txt(String(seriada._id)).up();
  record.ele("controlfield", { tag: "008" }).txt(construirCampo008(seriada, camposContinuingResources1834)).up();

  if (seriada.issn) {
    agregarDatafield(record, "022", " ", " ", [["a", seriada.issn]]);
  }

  // Sin 100/personal main entry a propósito: la responsabilidad de una
  // seriada suele ser institucional, no de una persona — va como 710
  // (asiento secundario, entidad corporativa), no como asiento principal.
  agregarDatafield(record, "245", "0", "0", [
    ["a", seriada.titulo],
    ["b", seriada.subtitulo],
  ]);

  if (seriada.lugarPublicacion || seriada.editorial) {
    agregarDatafield(record, "260", " ", " ", [
      ["a", seriada.lugarPublicacion],
      ["b", seriada.editorial],
    ]);
  }

  if (seriada.periodicidad) {
    agregarDatafield(record, "310", " ", " ", [["a", seriada.periodicidad]]);
  }

  const numeracion = numeracionYAnios(seriada);
  if (numeracion) {
    agregarDatafield(record, "362", "0", " ", [["a", numeracion]]);
  }

  for (const materia of seriada.materias || []) {
    agregarDatafield(record, "650", " ", "4", [["a", materia]]);
  }

  for (const autor of seriada.autores || []) {
    agregarDatafield(record, "710", "2", " ", [["a", autor]]);
  }

  if (seriada.notas) {
    agregarDatafield(record, "500", " ", " ", [["a", seriada.notas]]);
  }

  for (const ejemplar of seriada.ejemplares || []) {
    agregarDatafield(record, "952", " ", " ", [
      ["p", ejemplar.codigoBarras],
      ["o", ejemplar.signatura],
    ]);
  }

  record.up();
}

// ---- Recurso electrónico ----
function recursoElectronicoARecord(collection, recurso) {
  const record = collection.ele("record");
  record.ele("leader").txt(construirLeader("m", "m")).up();
  record.ele("controlfield", { tag: "001" }).txt(String(recurso._id)).up();
  record.ele("controlfield", { tag: "008" }).txt(construirCampo008(recurso, camposComputerFiles1834)).up();
  // 007: categoría "c" (recurso electrónico) + "r" (designación específica:
  // remoto — todo este bucket es de acceso vía URL) + relleno "|" para el
  // resto de posiciones (color, dimensiones, sonido, etc., no capturadas).
  record.ele("controlfield", { tag: "007" }).txt("cr" + "|".repeat(12)).up();

  const [primerAutor, ...otrosAutores] = recurso.autores || [];
  if (primerAutor) {
    agregarDatafield(record, "100", "1", " ", [["a", primerAutor]]);
  }

  agregarDatafield(record, "245", primerAutor ? "1" : "0", "0", [
    ["a", recurso.titulo],
    ["b", recurso.subtitulo],
  ]);

  if (recurso.editorial || recurso.anio) {
    agregarDatafield(record, "260", " ", " ", [
      ["b", recurso.editorial],
      ["c", recurso.anio],
    ]);
  }

  agregarDatafield(record, "256", " ", " ", [["a", `Recurso electrónico (${recurso.tipoRecurso})`]]);
  agregarDatafield(record, "338", " ", " ", [
    ["a", "recurso en línea"],
    ["b", "cr"],
    ["2", "rdacarrier"],
  ]);

  for (const materia of recurso.materias || []) {
    agregarDatafield(record, "650", " ", "4", [["a", materia]]);
  }

  for (const autor of otrosAutores) {
    agregarDatafield(record, "700", "1", " ", [["a", autor]]);
  }

  if (recurso.notas) {
    agregarDatafield(record, "500", " ", " ", [["a", recurso.notas]]);
  }

  // 856: el punto de acceso — siempre presente (urlAcceso es obligatorio en
  // este modelo). No hay 952: sin ítem físico, no hay nada que Koha deba
  // crear como ejemplar.
  agregarDatafield(record, "856", "4", "0", [["u", recurso.urlAcceso]]);

  record.up();
}

// ---- Material sonoro ----
function materialSonoroARecord(collection, item) {
  const record = collection.ele("record");
  record.ele("leader").txt(construirLeader("i", "m")).up();
  record.ele("controlfield", { tag: "001" }).txt(String(item._id)).up();
  record.ele("controlfield", { tag: "008" }).txt(construirCampo008(item, camposNoCodificados1834)).up();
  // 007 cat. "s" (sonido) + relleno — sin codificar velocidad/surco/ancho de
  // cinta, ver nota sobre camposNoCodificados1834.
  record.ele("controlfield", { tag: "007" }).txt("s" + "|".repeat(12)).up();

  const [primerAutor, ...otrosAutores] = item.autores || [];
  if (primerAutor) {
    agregarDatafield(record, "100", "1", " ", [["a", primerAutor]]);
  }

  agregarDatafield(record, "245", primerAutor ? "1" : "0", "0", [
    ["a", item.titulo],
    ["b", item.subtitulo],
  ]);

  if (item.editorial || item.anio) {
    agregarDatafield(record, "260", " ", " ", [
      ["b", item.editorial],
      ["c", item.anio],
    ]);
  }

  if (item.duracion) {
    agregarDatafield(record, "306", " ", " ", [["a", item.duracion]]);
  }

  for (const materia of item.materias || []) {
    agregarDatafield(record, "650", " ", "4", [["a", materia]]);
  }

  for (const autor of otrosAutores) {
    agregarDatafield(record, "700", "1", " ", [["a", autor]]);
  }

  if (item.notas) {
    agregarDatafield(record, "500", " ", " ", [["a", item.notas]]);
  }

  // 856: solo si hay urlAcceso (subtipo podcast/mp3/musica_digital).
  if (item.urlAcceso) {
    agregarDatafield(record, "856", "4", "0", [["u", item.urlAcceso]]);
  }

  for (const ejemplar of item.ejemplares || []) {
    agregarDatafield(record, "952", " ", " ", [
      ["p", ejemplar.codigoBarras],
      ["o", ejemplar.signatura],
    ]);
  }

  record.up();
}

// ---- Material audiovisual ----
function materialAudiovisualARecord(collection, item) {
  const record = collection.ele("record");
  record.ele("leader").txt(construirLeader("g", "m")).up();
  record.ele("controlfield", { tag: "001" }).txt(String(item._id)).up();
  record.ele("controlfield", { tag: "008" }).txt(construirCampo008(item, camposNoCodificados1834)).up();
  // 007 cat. "v" (videograbación) + relleno — sin codificar color/sonido/
  // formato de cinta, ver nota sobre camposNoCodificados1834.
  record.ele("controlfield", { tag: "007" }).txt("v" + "|".repeat(7)).up();

  const [primerAutor, ...otrosAutores] = item.autores || [];
  if (primerAutor) {
    agregarDatafield(record, "100", "1", " ", [["a", primerAutor]]);
  }

  agregarDatafield(record, "245", primerAutor ? "1" : "0", "0", [
    ["a", item.titulo],
    ["b", item.subtitulo],
  ]);

  if (item.editorial || item.anio) {
    agregarDatafield(record, "260", " ", " ", [
      ["b", item.editorial],
      ["c", item.anio],
    ]);
  }

  if (item.duracion) {
    agregarDatafield(record, "306", " ", " ", [["a", item.duracion]]);
  }

  for (const materia of item.materias || []) {
    agregarDatafield(record, "650", " ", "4", [["a", materia]]);
  }

  for (const autor of otrosAutores) {
    agregarDatafield(record, "700", "1", " ", [["a", autor]]);
  }

  if (item.notas) {
    agregarDatafield(record, "500", " ", " ", [["a", item.notas]]);
  }

  // 856: solo si hay urlAcceso (subtipo streaming).
  if (item.urlAcceso) {
    agregarDatafield(record, "856", "4", "0", [["u", item.urlAcceso]]);
  }

  for (const ejemplar of item.ejemplares || []) {
    agregarDatafield(record, "952", " ", " ", [
      ["p", ejemplar.codigoBarras],
      ["o", ejemplar.signatura],
    ]);
  }

  record.up();
}

// ---- Material cartográfico ----
function materialCartograficoARecord(collection, item) {
  const record = collection.ele("record");
  record.ele("leader").txt(construirLeader("e", "m")).up();
  record.ele("controlfield", { tag: "001" }).txt(String(item._id)).up();
  record.ele("controlfield", { tag: "008" }).txt(construirCampo008(item, camposNoCodificados1834)).up();
  // 007 cat. "a" (mapa) o "d" (globo, si el subtipo es globo_terráqueo) +
  // relleno — sin codificar color/material/tipo de reproducción.
  const categoria007 = item.subtipo === "globo_terraqueo" ? "d" : "a";
  record.ele("controlfield", { tag: "007" }).txt(categoria007 + "|".repeat(6)).up();

  const [primerAutor, ...otrosAutores] = item.autores || [];
  if (primerAutor) {
    agregarDatafield(record, "100", "1", " ", [["a", primerAutor]]);
  }

  agregarDatafield(record, "245", primerAutor ? "1" : "0", "0", [
    ["a", item.titulo],
    ["b", item.subtitulo],
  ]);

  if (item.editorial || item.anio) {
    agregarDatafield(record, "260", " ", " ", [
      ["b", item.editorial],
      ["c", item.anio],
    ]);
  }

  if (item.escala || item.proyeccion || item.coordenadas) {
    agregarDatafield(record, "255", " ", " ", [
      ["a", item.escala],
      ["b", item.proyeccion],
      ["c", item.coordenadas],
    ]);
  }

  for (const materia of item.materias || []) {
    agregarDatafield(record, "650", " ", "4", [["a", materia]]);
  }

  for (const autor of otrosAutores) {
    agregarDatafield(record, "700", "1", " ", [["a", autor]]);
  }

  if (item.notas) {
    agregarDatafield(record, "500", " ", " ", [["a", item.notas]]);
  }

  for (const ejemplar of item.ejemplares || []) {
    agregarDatafield(record, "952", " ", " ", [
      ["p", ejemplar.codigoBarras],
      ["o", ejemplar.signatura],
    ]);
  }

  record.up();
}

// ---- Material gráfico ----
function materialGraficoARecord(collection, item) {
  const record = collection.ele("record");
  record.ele("leader").txt(construirLeader("k", "m")).up();
  record.ele("controlfield", { tag: "001" }).txt(String(item._id)).up();
  record.ele("controlfield", { tag: "008" }).txt(construirCampo008(item, camposNoCodificados1834)).up();
  // 007 cat. "k" (gráfico no proyectable) + relleno.
  record.ele("controlfield", { tag: "007" }).txt("k" + "|".repeat(4)).up();

  const [primerAutor, ...otrosAutores] = item.autores || [];
  if (primerAutor) {
    agregarDatafield(record, "100", "1", " ", [["a", primerAutor]]);
  }

  agregarDatafield(record, "245", primerAutor ? "1" : "0", "0", [
    ["a", item.titulo],
    ["b", item.subtitulo],
  ]);

  if (item.anio) {
    agregarDatafield(record, "260", " ", " ", [["c", item.anio]]);
  }

  if (item.tecnica) {
    agregarDatafield(record, "340", " ", " ", [["a", item.tecnica]]);
  }

  for (const materia of item.materias || []) {
    agregarDatafield(record, "650", " ", "4", [["a", materia]]);
  }

  for (const autor of otrosAutores) {
    agregarDatafield(record, "700", "1", " ", [["a", autor]]);
  }

  if (item.notas) {
    agregarDatafield(record, "500", " ", " ", [["a", item.notas]]);
  }

  for (const ejemplar of item.ejemplares || []) {
    agregarDatafield(record, "952", " ", " ", [
      ["p", ejemplar.codigoBarras],
      ["o", ejemplar.signatura],
    ]);
  }

  record.up();
}

// ---- Material didáctico ----
function materialDidacticoARecord(collection, item) {
  const record = collection.ele("record");
  record.ele("leader").txt(construirLeader("o", "m")).up();
  record.ele("controlfield", { tag: "001" }).txt(String(item._id)).up();
  record.ele("controlfield", { tag: "008" }).txt(construirCampo008(item, camposNoCodificados1834)).up();
  // 007: los kits no tienen posiciones adicionales definidas por LC más
  // allá de la categoría — "o" solo, sin relleno.
  record.ele("controlfield", { tag: "007" }).txt("o").up();

  agregarDatafield(record, "245", "0", "0", [["a", item.titulo], ["b", item.subtitulo]]);

  if (item.componentes) {
    agregarDatafield(record, "300", " ", " ", [["e", item.componentes]]);
  }

  if (item.edadRecomendada) {
    agregarDatafield(record, "521", " ", " ", [["a", item.edadRecomendada]]);
  }

  for (const materia of item.materias || []) {
    agregarDatafield(record, "650", " ", "4", [["a", materia]]);
  }

  if (item.notas) {
    agregarDatafield(record, "500", " ", " ", [["a", item.notas]]);
  }

  for (const ejemplar of item.ejemplares || []) {
    agregarDatafield(record, "952", " ", " ", [
      ["p", ejemplar.codigoBarras],
      ["o", ejemplar.signatura],
    ]);
  }

  record.up();
}

function coleccionAMarcXml(items, itemARecord) {
  const collection = create({ version: "1.0", encoding: "UTF-8" }).ele("collection", {
    xmlns: "http://www.loc.gov/MARC21/slim",
  });
  for (const item of items) {
    itemARecord(collection, item);
  }
  return collection.end({ prettyPrint: true });
}

/**
 * Genera un documento MARCXML (colección) a partir de una lista de libros.
 * Devuelve el XML como string, listo para descargar o para
 * "Preparar registros MARC para importar" en Koha.
 */
export function librosAMarcXml(libros) {
  return coleccionAMarcXml(libros, libroARecord);
}

/** Igual que librosAMarcXml, para el bucket Seriada. */
export function seriadasAMarcXml(seriadas) {
  return coleccionAMarcXml(seriadas, seriadaARecord);
}

/** Igual que librosAMarcXml, para el bucket RecursoElectronico (sin 952). */
export function recursosElectronicosAMarcXml(recursos) {
  return coleccionAMarcXml(recursos, recursoElectronicoARecord);
}

/** Igual que librosAMarcXml, para el bucket MaterialSonoro. */
export function materialSonoroAMarcXml(items) {
  return coleccionAMarcXml(items, materialSonoroARecord);
}

/** Igual que librosAMarcXml, para el bucket MaterialAudiovisual. */
export function materialAudiovisualAMarcXml(items) {
  return coleccionAMarcXml(items, materialAudiovisualARecord);
}

/** Igual que librosAMarcXml, para el bucket MaterialCartografico. */
export function materialCartograficoAMarcXml(items) {
  return coleccionAMarcXml(items, materialCartograficoARecord);
}

/** Igual que librosAMarcXml, para el bucket MaterialGrafico. */
export function materialGraficoAMarcXml(items) {
  return coleccionAMarcXml(items, materialGraficoARecord);
}

/** Igual que librosAMarcXml, para el bucket MaterialDidactico (sin autores). */
export function materialDidacticoAMarcXml(items) {
  return coleccionAMarcXml(items, materialDidacticoARecord);
}
