import { Schema, model } from "mongoose";

// Un supervisor puede pedir supervisar una biblioteca que hoy no tiene en
// su alcance (bibliotecasSupervisadas, en Usuario.js), pero no se agrega
// sola: queda "pendiente" hasta que el admin la apruebe o la rechace (ver
// routes/solicitudesSupervision.js). Solo al aprobarla se hace el
// $addToSet real sobre bibliotecasSupervisadas — pedirla no otorga nada
// por sí sola.
const solicitudSupervisionSchema = new Schema({
  supervisorId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
  bibliotecaId: { type: Schema.Types.ObjectId, ref: "Biblioteca", required: true },
  estado: { type: String, enum: ["pendiente", "aprobada", "rechazada"], default: "pendiente" },
  creado: { type: Date, default: Date.now },
  resueltoPor: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
  resueltoEn: { type: Date, default: null },
});

export default model("SolicitudSupervision", solicitudSupervisionSchema);
