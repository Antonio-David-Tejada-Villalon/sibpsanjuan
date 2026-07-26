import mongoose from "mongoose";

// Un id que no tiene forma de ObjectId de Mongo hace que Mongoose tire un
// CastError como promesa rechazada al ejecutar la consulta. Ningún handler
// async de este proyecto atrapa esas rechazadas (Express 4 no lo hace
// automáticamente), así que ese error termina el proceso completo — ver
// CYBER-1 en la auditoría. Validar antes de consultar evita llegar a eso.
// Acepta tanto un string (params/body) como un ObjectId ya instanciado (ej.
// un campo leído de otro documento) — mongoose.isValidObjectId() ya rechaza
// por su cuenta objetos con forma de operador de consulta (ej. {"$ne": null}).
export function esIdValido(id) {
  return mongoose.isValidObjectId(id);
}

// Middleware para rutas con :id (o cualquier otro nombre de param) en la URL.
export function requiereIdValido(nombreParam = "id") {
  return (req, res, next) => {
    if (!esIdValido(req.params[nombreParam])) {
      return res.status(400).json({ error: "Identificador inválido." });
    }
    next();
  };
}
