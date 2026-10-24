import sharp from "sharp";

// Formatos de mapa de bits que se aceptan como portada. SVG no: puede traer
// scripts o referencias externas, y no hace falta para una tapa.
const FORMATOS = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff"]);

// Medidas de referencia del prompt maestro: una versión de ~360 px de ancho
// para la ficha y una miniatura de 120 px para los listados, en proporción
// de tapa (2:3) como máximo — se achica sin recortar ni agrandar.
const GRANDE = { width: 360, height: 540 };
const MINIATURA = { width: 120, height: 180 };

export class ErrorImagen extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorImagen";
  }
}

// Decodifica de verdad la imagen (no confía en la extensión ni en el
// Content-Type), la endereza según su EXIF y la vuelve a codificar como
// WebP. sharp no copia ningún metadato a la salida salvo que se le pida,
// así que el EXIF (ubicación GPS, cámara, etc.) se pierde en el camino.
export async function procesarPortada(buffer) {
  const opciones = { limitInputPixels: 40_000_000, failOn: "error" };
  let meta;
  try {
    meta = await sharp(buffer, opciones).metadata();
  } catch {
    throw new ErrorImagen("El archivo no es una imagen válida.");
  }
  if (!FORMATOS.has(meta.format)) {
    throw new ErrorImagen("Ese formato de imagen no se acepta (usá JPG, PNG o WebP).");
  }
  if (!meta.width || !meta.height || meta.width < 40 || meta.height < 40) {
    throw new ErrorImagen("La imagen es demasiado chica para usarse como portada.");
  }
  try {
    const base = sharp(buffer, opciones).rotate();
    const grande = await base
      .clone()
      .resize({ ...GRANDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const miniatura = await base
      .clone()
      .resize({ ...MINIATURA, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return { grande: grande.data, miniatura, ancho: grande.info.width, alto: grande.info.height };
  } catch {
    throw new ErrorImagen("No se pudo procesar la imagen.");
  }
}
