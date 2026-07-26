import MaterialAudiovisual from "../models/MaterialAudiovisual.js";
import { crearRutasCatalogo } from "../utils/rutasCatalogo.js";

export default crearRutasCatalogo({
  Modelo: MaterialAudiovisual,
  itemTipo: "MaterialAudiovisual",
  camposBusqueda: ["titulo", "autores", "editorial"],
});
