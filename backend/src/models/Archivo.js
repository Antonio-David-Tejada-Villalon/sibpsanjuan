import { Schema, model } from "mongoose";
import { camposComunes, aplicarTimestampActualizado } from "./camposComunes.js";

// Archivos (manuscritos, cartas, actas, decretos, resoluciones,
// expedientes, documentos históricos). A propósito NO sigue ISAD(G)/EAD
// completo (fondo → serie → subserie → expediente, con relaciones
// jerárquicas entre niveles) — eso es un sistema aparte. Es captura
// simplificada de un solo nivel por registro, con los elementos ISAD(G)
// más esenciales como campos sueltos, igual de honesto que "no es
// catalogación MARC21 completa" para el resto del proyecto.
//
// No circula (ver circulacion/tiposCirculantes.js — este modelo
// deliberadamente no aparece ahí): un documento de archivo es único y no
// tiene sentido "prestarlo" como una copia de un libro — se consulta, no
// se lleva. Tampoco tiene export MARC: MARC21 está pensado para ítems
// bibliográficos individuales, no para este tipo de material.
const archivoSchema = new Schema({
  ...camposComunes(),
  codigoReferencia: { type: String, trim: true }, // ISAD(G) 3.1.1 — ej. "AR-BPSJ-001"
  subtipo: {
    type: String,
    enum: ["manuscrito", "carta", "acta", "decreto", "resolucion", "expediente", "documento_historico"],
    default: "documento_historico",
  },
  nivelDescripcion: {
    type: String,
    enum: ["fondo", "serie", "subserie", "expediente", "unidad_documental"],
    default: "unidad_documental",
  },
  productor: { type: String, trim: true }, // ISAD(G) 3.2.1 — entidad/persona que lo produjo
  fechaInicio: { type: String, trim: true }, // ISAD(G) 3.1.3 (fechas extremas)
  fechaFin: { type: String, trim: true },
  volumenSoporte: { type: String, trim: true }, // ISAD(G) 3.1.5 — ej. "3 cajas, papel"
  alcanceContenido: { type: String, trim: true }, // ISAD(G) 3.3.1 — resumen del contenido
  condicionesAcceso: { type: String, trim: true }, // ISAD(G) 3.4.1 — restricciones, si las hay
  // Campo estructurado opcional al lado del texto libre de arriba (ver
  // ARCHIV-3 en AUDITORIA.md) — sirve para *filtrar* por nivel de acceso,
  // algo que el texto libre no permite sin parsearlo. ISAD(G) 3.4.1 admite
  // texto libre solo, así que esto es aditivo: default null, no reemplaza
  // ni obliga a completar condicionesAcceso.
  nivelAcceso: { type: String, enum: ["libre", "restringido", "confidencial"], default: null },
  // Autoreferencia opcional (ver ARCHIV-2 en AUDITORIA.md): permite expresar
  // UN nivel de jerarquía (ej. un expediente que pertenece a una serie
  // puntual) para la biblioteca que lo necesite, sin obligar a las que no
  // manejan jerarquía a completarlo ni llegar a ISAD(G)/EAD completo.
  padreId: { type: Schema.Types.ObjectId, ref: "Archivo", default: null },
});

aplicarTimestampActualizado(archivoSchema);

export default model("Archivo", archivoSchema);
