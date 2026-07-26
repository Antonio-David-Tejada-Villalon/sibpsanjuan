import MaterialGrafico from "../models/MaterialGrafico.js";
import { crearRutasCatalogo } from "../utils/rutasCatalogo.js";

export default crearRutasCatalogo({
  Modelo: MaterialGrafico,
  itemTipo: "MaterialGrafico",
  camposBusqueda: ["titulo", "autores"],
});
