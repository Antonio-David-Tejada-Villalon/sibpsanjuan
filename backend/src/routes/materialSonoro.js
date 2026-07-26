import MaterialSonoro from "../models/MaterialSonoro.js";
import { crearRutasCatalogo } from "../utils/rutasCatalogo.js";

export default crearRutasCatalogo({
  Modelo: MaterialSonoro,
  itemTipo: "MaterialSonoro",
  camposBusqueda: ["titulo", "autores", "editorial"],
});
