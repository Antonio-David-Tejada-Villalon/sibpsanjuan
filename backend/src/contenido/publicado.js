import ContenidoOpac from "../models/ContenidoOpac.js";
import { contenidoInicial } from "./validar.js";

// La versión publicada del contenido de una biblioteca. Mientras no publique
// nada: su nombre y el acento del sistema de diseño.
export async function datosPublicados(biblioteca) {
  const publicada = await ContenidoOpac.findOne({ bibliotecaId: biblioteca._id, estado: "publicada" }).select("datos version");
  return { datos: publicada?.datos ?? contenidoInicial(biblioteca), version: publicada?.version ?? null };
}
