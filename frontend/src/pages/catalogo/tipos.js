import { lazy } from "react";
import { Archive, BookOpen, Disc3, Film, Globe, Image, Landmark, Map as Mapa, Newspaper, Puzzle } from "lucide-react";

// Los diez tipos de material del panel: qué formulario los carga, cómo se
// llama su dirección (/catalogar/<segmento>, /catalogo/<itemTipo>/<id>) y
// si tienen ejemplares que circulan. Los segmentos son los mismos del OPAC
// (ver src/opac.js y backend/src/opac/catalogo.js).
export const TIPOS_MATERIAL = [
  {
    itemTipo: "Libro",
    segmento: "libro",
    etiqueta: "Libro",
    plural: "Libros",
    circula: true,
    Icono: BookOpen,
    descripcion: "Impresos, e-books y audiolibros, con el editor MARC por campos.",
    Formulario: lazy(() => import("../Libros.jsx")),
  },
  {
    itemTipo: "Seriada",
    segmento: "publicacion-seriada",
    etiqueta: "Publicación seriada",
    plural: "Publicaciones seriadas",
    circula: true,
    Icono: Newspaper,
    descripcion: "Revistas, diarios y boletines.",
    Formulario: lazy(() => import("../Seriadas.jsx")),
  },
  {
    itemTipo: "RecursoElectronico",
    segmento: "recurso-electronico",
    etiqueta: "Recurso electrónico",
    plural: "Recursos electrónicos",
    circula: false,
    Icono: Globe,
    descripcion: "Sitios, bases de datos y documentos en línea (sin ejemplares).",
    Formulario: lazy(() => import("../RecursosElectronicos.jsx")),
  },
  {
    itemTipo: "MaterialSonoro",
    segmento: "material-sonoro",
    etiqueta: "Material sonoro",
    plural: "Material sonoro",
    circula: true,
    Icono: Disc3,
    descripcion: "CD, vinilos, casetes y audio digital.",
    Formulario: lazy(() => import("../MaterialSonoro.jsx")),
  },
  {
    itemTipo: "MaterialAudiovisual",
    segmento: "material-audiovisual",
    etiqueta: "Material audiovisual",
    plural: "Material audiovisual",
    circula: true,
    Icono: Film,
    descripcion: "DVD, Blu-ray, VHS y video digital.",
    Formulario: lazy(() => import("../MaterialAudiovisual.jsx")),
  },
  {
    itemTipo: "MaterialCartografico",
    segmento: "material-cartografico",
    etiqueta: "Material cartográfico",
    plural: "Material cartográfico",
    circula: true,
    Icono: Mapa,
    descripcion: "Mapas, atlas y globos terráqueos.",
    Formulario: lazy(() => import("../MaterialCartografico.jsx")),
  },
  {
    itemTipo: "MaterialGrafico",
    segmento: "material-grafico",
    etiqueta: "Material gráfico",
    plural: "Material gráfico",
    circula: true,
    Icono: Image,
    descripcion: "Láminas, afiches, fotografías y diapositivas.",
    Formulario: lazy(() => import("../MaterialGrafico.jsx")),
  },
  {
    itemTipo: "MaterialDidactico",
    segmento: "material-didactico",
    etiqueta: "Material didáctico",
    plural: "Material didáctico",
    circula: true,
    Icono: Puzzle,
    descripcion: "Juegos, kits y modelos para el aula.",
    Formulario: lazy(() => import("../MaterialDidactico.jsx")),
  },
  {
    itemTipo: "Archivo",
    segmento: "archivo",
    etiqueta: "Archivo",
    plural: "Archivos",
    circula: false,
    Icono: Archive,
    descripcion: "Documentos de archivo: piezas únicas que se consultan en la biblioteca.",
    Formulario: lazy(() => import("../Archivos.jsx")),
  },
  {
    itemTipo: "Objeto",
    segmento: "objeto",
    etiqueta: "Objeto",
    plural: "Objetos",
    circula: false,
    Icono: Landmark,
    descripcion: "Objetos de colección o exhibición, sin préstamo.",
    Formulario: lazy(() => import("../Objetos.jsx")),
  },
];

export const TIPO_POR_SEGMENTO = Object.fromEntries(TIPOS_MATERIAL.map((t) => [t.segmento, t]));
export const TIPO_POR_ITEM = Object.fromEntries(TIPOS_MATERIAL.map((t) => [t.itemTipo, t]));
