import Archivo from "../models/Archivo.js";
import { crearRutasCatalogoSinCirculacion } from "../utils/rutasCatalogoSinCirculacion.js";

export default crearRutasCatalogoSinCirculacion({
  Modelo: Archivo,
  camposBusqueda: ["titulo", "codigoReferencia", "productor"],
});
