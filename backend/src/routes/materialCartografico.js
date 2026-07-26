import MaterialCartografico from "../models/MaterialCartografico.js";
import { crearRutasCatalogo } from "../utils/rutasCatalogo.js";

export default crearRutasCatalogo({
  Modelo: MaterialCartografico,
  itemTipo: "MaterialCartografico",
  camposBusqueda: ["titulo", "autores", "editorial"],
});
