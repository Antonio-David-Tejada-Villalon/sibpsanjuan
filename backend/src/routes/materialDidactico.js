import MaterialDidactico from "../models/MaterialDidactico.js";
import { crearRutasCatalogo } from "../utils/rutasCatalogo.js";

export default crearRutasCatalogo({
  Modelo: MaterialDidactico,
  itemTipo: "MaterialDidactico",
  camposBusqueda: ["titulo"],
});
