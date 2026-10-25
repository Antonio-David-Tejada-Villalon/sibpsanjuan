import {
  librosAMarcXml,
  seriadasAMarcXml,
  recursosElectronicosAMarcXml,
  materialSonoroAMarcXml,
  materialAudiovisualAMarcXml,
  materialCartograficoAMarcXml,
  materialGraficoAMarcXml,
  materialDidacticoAMarcXml,
} from "./marcxml.js";

// La vista "MARC" de un material en el panel (como la de Koha): el mismo
// registro que se exporta a Koha (marcxml.js), campo por campo, con el
// nombre de cada campo y subcampo en castellano. Archivos y Objetos no se
// exportan a MARC, así que no tienen esta vista.

const GENERADORES = {
  Libro: librosAMarcXml,
  Seriada: seriadasAMarcXml,
  RecursoElectronico: recursosElectronicosAMarcXml,
  MaterialSonoro: materialSonoroAMarcXml,
  MaterialAudiovisual: materialAudiovisualAMarcXml,
  MaterialCartografico: materialCartograficoAMarcXml,
  MaterialGrafico: materialGraficoAMarcXml,
  MaterialDidactico: materialDidacticoAMarcXml,
};

// Nombres de MARC21 bibliográfico (los de la hoja de trabajo en castellano
// de Koha) para los campos que genera marcxml.js.
const CAMPOS = {
  "000": ["CABECERA"],
  "001": ["NÚMERO DE CONTROL"],
  "007": ["CAMPO FIJO DE DESCRIPCIÓN FÍSICA"],
  "008": ["ELEMENTOS DE LONGITUD FIJA--INFORMACIÓN GENERAL"],
  "020": ["NÚMERO INTERNACIONAL NORMALIZADO PARA LIBROS (ISBN)", { a: "International Standard Book Number" }],
  "022": ["NÚMERO INTERNACIONAL NORMALIZADO PARA PUBLICACIONES SERIADAS (ISSN)", { a: "International Standard Serial Number" }],
  "080": ["NÚMERO DE LA CLASIFICACIÓN DECIMAL UNIVERSAL", { a: "Número de la Clasificación Decimal Universal" }],
  "082": ["NÚMERO DE CLASIFICACIÓN DECIMAL DEWEY", { a: "Número de clasificación" }],
  100: ["ASIENTO PRINCIPAL--NOMBRE PERSONAL", { a: "Nombre de persona" }],
  110: ["ASIENTO PRINCIPAL--NOMBRE CORPORATIVO", { a: "Nombre corporativo o de jurisdicción", b: "Unidad subordinada" }],
  245: ["MENCIÓN DE TÍTULO", { a: "Título propiamente dicho", b: "Parte restante del título", c: "Mención de responsabilidad, etc." }],
  246: ["FORMA VARIANTE DEL TÍTULO", { a: "Título propiamente dicho" }],
  250: ["MENCIÓN DE EDICIÓN", { a: "Mención de edición" }],
  255: ["DATOS MATEMÁTICOS CARTOGRÁFICOS", { a: "Mención de escala", b: "Mención de proyección", c: "Mención de coordenadas" }],
  256: ["CARACTERÍSTICAS DEL ARCHIVO DE COMPUTADORA", { a: "Características del archivo de computadora" }],
  260: ["PUBLICACIÓN, DISTRIBUCIÓN, ETC. (PIE DE IMPRENTA)", { a: "Lugar de publicación, distribución, etc.", b: "Nombre del editor, distribuidor, etc.", c: "Fecha de publicación, distribución, etc." }],
  300: ["DESCRIPCIÓN FÍSICA", { a: "Extensión", b: "Otros detalles físicos", c: "Dimensiones", e: "Material acompañante" }],
  306: ["TIEMPO DE DURACIÓN", { a: "Tiempo de duración" }],
  310: ["PERIODICIDAD ACTUAL", { a: "Periodicidad actual" }],
  338: ["TIPO DE SOPORTE", { a: "Término del tipo de soporte", b: "Código del tipo de soporte", 2: "Fuente" }],
  340: ["SOPORTE FÍSICO", { a: "Material base y configuración" }],
  362: ["FECHAS DE PUBLICACIÓN Y/O DESIGNACIÓN SECUENCIAL", { a: "Fechas de publicación y/o designación secuencial" }],
  490: ["MENCIÓN DE SERIE", { a: "Mención de serie", v: "Número de volumen o designación secuencial", x: "ISSN" }],
  500: ["NOTA GENERAL", { a: "Nota general" }],
  521: ["NOTA DE AUDIENCIA", { a: "Nota de audiencia" }],
  546: ["NOTA DE IDIOMA", { a: "Nota de idioma" }],
  650: ["PUNTO DE ACCESO ADICIONAL DE MATERIA--TÉRMINO TEMÁTICO", { a: "Término temático o nombre geográfico" }],
  700: ["PUNTO DE ACCESO ADICIONAL--NOMBRE PERSONAL", { a: "Nombre de persona" }],
  710: ["PUNTO DE ACCESO ADICIONAL--NOMBRE CORPORATIVO", { a: "Nombre corporativo o de jurisdicción" }],
  856: ["LOCALIZACIÓN Y ACCESO ELECTRÓNICOS", { i: "Instrucción", u: "Identificador uniforme del recurso (URI)" }],
  952: [
    "EXISTENCIAS (KOHA)",
    {
      0: "Estado de retiro",
      1: "Estado de pérdida",
      4: "Estado de daño",
      5: "Uso restringido",
      7: "No para préstamo",
      c: "Ubicación en estantería",
      d: "Fecha de adquisición",
      e: "Fuente de adquisición",
      g: "Costo, precio de compra",
      i: "Número de inventario",
      o: "Signatura topográfica completa",
      p: "Código de barras",
      t: "Número de copia",
      x: "Nota no pública",
      z: "Nota pública",
    },
  ],
};

const ENTIDADES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const texto = (xml) => xml.replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTIDADES[e]);

// El XML es el que arma marcxml.js (con xmlbuilder2), no uno de afuera:
// alcanza con leer sus tres tipos de elemento.
export function camposDeMarcXml(xml) {
  const campos = [];
  const leader = /<leader>([\s\S]*?)<\/leader>/.exec(xml);
  if (leader) campos.push({ tag: "000", valor: texto(leader[1]) });
  const elemento = /<controlfield tag="(\d{3})">([\s\S]*?)<\/controlfield>|<datafield tag="(\d{3})" ind1="(.)" ind2="(.)">([\s\S]*?)<\/datafield>/g;
  for (const m of xml.matchAll(elemento)) {
    if (m[1]) {
      campos.push({ tag: m[1], valor: texto(m[2]) });
    } else {
      const subcampos = [...m[6].matchAll(/<subfield code="(.)">([\s\S]*?)<\/subfield>/g)].map(([, codigo, valor]) => ({
        codigo,
        valor: texto(valor),
      }));
      campos.push({ tag: m[3], ind1: m[4], ind2: m[5], subcampos });
    }
  }
  return campos;
}

// item: el documento del material con sus ejemplares en .ejemplares.
export function registroMarc(itemTipo, item) {
  const generar = GENERADORES[itemTipo];
  if (!generar) return null;
  return camposDeMarcXml(generar([item])).map((campo) => {
    const [nombre, subnombres = {}] = CAMPOS[campo.tag] || [""];
    const conNombres = { ...campo, nombre };
    if (campo.subcampos) {
      conNombres.subcampos = campo.subcampos.map((s) => ({ ...s, nombre: subnombres[s.codigo] || "" }));
    }
    return conNombres;
  });
}
