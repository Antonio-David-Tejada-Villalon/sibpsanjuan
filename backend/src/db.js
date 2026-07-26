import mongoose from "mongoose";

export async function conectarDB(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  return mongoose.connection;
}

export async function desconectarDB() {
  await mongoose.disconnect();
}
