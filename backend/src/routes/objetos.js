import Objeto from "../models/Objeto.js";
import { crearRutasCatalogoSinCirculacion } from "../utils/rutasCatalogoSinCirculacion.js";

export default crearRutasCatalogoSinCirculacion({
  Modelo: Objeto,
  camposBusqueda: ["titulo", "numeroInventario", "procedencia"],
});
