import Libro from "../models/Libro.js";
import Seriada from "../models/Seriada.js";
import MaterialSonoro from "../models/MaterialSonoro.js";
import MaterialAudiovisual from "../models/MaterialAudiovisual.js";
import MaterialCartografico from "../models/MaterialCartografico.js";
import MaterialGrafico from "../models/MaterialGrafico.js";
import MaterialDidactico from "../models/MaterialDidactico.js";

// Tipos de material que circulan (tienen Ejemplar/Prestamo/Solicitud). Ver
// el comentario en models/Ejemplar.js: un tipo nuevo que también circule se
// suma acá (y a los enums "itemTipo" de Ejemplar/Prestamo/Solicitud) — nada
// más en circulacion.js/opac.js necesita cambiar. Recursos electrónicos (y
// cualquier material sin copias físicas) nunca aparece acá: no existe forma
// de crear un Ejemplar/Prestamo para ellos, por ausencia, no por una
// bandera.
export const MODELOS_POR_TIPO = {
  Libro,
  Seriada,
  MaterialSonoro,
  MaterialAudiovisual,
  MaterialCartografico,
  MaterialGrafico,
  MaterialDidactico,
};
