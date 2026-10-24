import { Router } from "express";
import bcrypt from "bcryptjs";
import Socio from "../models/Socio.js";
import Categoria from "../models/Categoria.js";
import Auditoria from "../models/Auditoria.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";
import { textoDeConsulta } from "../utils/consulta.js";
import { buscarCategoria, normalizarCodigoCategoria } from "../circulacion/categorias.js";
import { CAMPOS_CONTACTO, CAMPOS_NO_MINIMOS, enmascarar, socioParaPanel } from "../utils/datosSocio.js";

const router = Router();

router.use(requiereLogin, requiereBiblioteca);

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// La categoría decide las reglas de préstamo del socio (ver
// circulacion/categorias.js), así que tiene que ser una de las dadas de
// alta en esta biblioteca. Excepción: dejar la que el socio ya tenía, aunque
// sea un código viejo sin categoría (ej. "ADULTO") — si no, editarle el
// teléfono a un socio cargado antes de las categorías fallaría. Normaliza
// datos.categoria a mayúsculas. Devuelve el mensaje de error, o null.
async function validarCategoria(req, datos, categoriaActual) {
  if (datos.categoria === undefined) return null;
  const codigo = normalizarCodigoCategoria(datos.categoria);
  if (!codigo) return "Elegí una categoría para el socio.";
  datos.categoria = codigo;
  if (categoriaActual !== undefined && normalizarCodigoCategoria(categoriaActual) === codigo) return null;
  if (await buscarCategoria(req.usuario.bibliotecaId, codigo)) return null;
  const disponibles = await Categoria.find({ bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null }).distinct("codigo");
  return disponibles.length
    ? `La categoría '${codigo}' no existe en esta biblioteca. Las disponibles son: ${disponibles.join(", ")}.`
    : `La categoría '${codigo}' no existe en esta biblioteca, y todavía no hay ninguna dada de alta.`;
}

// Categoría de datos mínimos (Alumno, ver Categoria.datosMinimos): no se
// cargan DNI, domicilio, teléfono ni fecha de nacimiento. Un valor vacío
// pasa (sirve para borrar lo que hubiera de antes), y al editar también el
// mismo valor que ya tenía (un dato viejo que nadie tocó); uno nuevo, no.
async function validarDatosMinimos(req, datos, codigoCategoria, actual = {}) {
  const categoria = await buscarCategoria(req.usuario.bibliotecaId, codigoCategoria);
  if (!categoria?.datosMinimos) return null;
  const sobrantes = CAMPOS_NO_MINIMOS.filter(
    (campo) => typeof datos[campo] === "string" && datos[campo].trim() !== "" && datos[campo] !== actual[campo]
  );
  return sobrantes.length
    ? `Para la categoría ${categoria.nombre} no se cargan DNI, domicilio, localidad, teléfono ni fecha de nacimiento (sobran: ${sobrantes.join(", ")}).`
    : null;
}

// El formulario de edición recibe los datos de contacto enmascarados (ver
// utils/datosSocio.js) y los manda de vuelta tal cual si nadie los tocó:
// esos valores se ignoran, para no pisar el dato real con "•••123".
function sinValoresEnmascarados(datos, actual) {
  for (const campo of CAMPOS_CONTACTO) {
    if (datos[campo] !== undefined && actual[campo] && datos[campo] === enmascarar(campo, actual[campo])) {
      delete datos[campo];
    }
  }
}

router.get("/", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null };
  const q = textoDeConsulta(req.query.q);
  if (q) {
    const rx = new RegExp(escaparRegex(q), "i");
    filtro.$or = [{ numeroSocio: rx }, { apellido: rx }, { nombre: rx }, { dni: rx }];
  }
  const pagina = Number(req.query.pagina);
  const porPagina = Number(req.query.porPagina);

  // socioParaPanel: sin el hash (solo tieneLoginOpac, para distinguir
  // "contraseña incorrecta" de "nunca se le asignó ninguna" — ver UX-1 en
  // AUDITORIA.md) y con los datos de contacto enmascarados.

  // Ver la misma nota en libros.js: paginado opt-in vía query params, para
  // no romper a quien ya espera el array completo (Dashboard, el selector
  // de socio en Préstamos).
  if (pagina > 0 && porPagina > 0) {
    const total = await Socio.countDocuments(filtro);
    const socios = await Socio.find(filtro)
      .sort({ apellido: 1 })
      .skip((pagina - 1) * porPagina)
      .limit(porPagina);
    res.set("X-Total-Count", String(total));
    return res.json(socios.map(socioParaPanel));
  }

  const socios = await Socio.find(filtro).sort({ apellido: 1 });
  res.json(socios.map(socioParaPanel));
});

router.post("/", requierePermiso("socios"), async (req, res) => {
  const datos = { ...req.body, bibliotecaId: req.usuario.bibliotecaId };
  delete datos._id;
  // La contraseña SOLO se fija por /credenciales (con bcrypt) — nunca
  // aceptamos un passwordHash que venga del cliente en el body.
  delete datos.passwordHash;
  const errorCategoria =
    (await validarCategoria(req, datos)) || (await validarDatosMinimos(req, datos, datos.categoria));
  if (errorCategoria) return res.status(400).json({ error: errorCategoria });
  try {
    const socio = await Socio.create(datos);
    res.status(201).json(socioParaPanel(socio));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `Ya existe un socio con número '${datos.numeroSocio}'.` });
    }
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", requierePermiso("socios"), requiereIdValido(), async (req, res) => {
  const datos = { ...req.body };
  delete datos._id;
  delete datos.bibliotecaId;
  delete datos.passwordHash;
  const actual = await Socio.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!actual) {
    return res.status(404).json({ error: "No encontrado." });
  }
  sinValoresEnmascarados(datos, actual);
  const errorCategoria =
    (await validarCategoria(req, datos, actual.categoria)) ||
    (await validarDatosMinimos(req, datos, datos.categoria ?? actual.categoria, actual));
  if (errorCategoria) return res.status(400).json({ error: errorCategoria });
  try {
    const socio = await Socio.findOneAndUpdate(
      { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
      datos,
      { new: true, runValidators: true }
    );
    if (!socio) {
      return res.status(404).json({ error: "No encontrado." });
    }
    res.json(socioParaPanel(socio));
  } catch (err) {
    // Ver ARQ-12 en AUDITORIA.md — sin este try/catch, un error de
    // validación quedaba como promesa rechazada sin capturar.
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requierePermiso("socios"), requiereIdValido(), async (req, res) => {
  // Borrado lógico (ver GOB-2) — el índice único de numeroSocio es
  // parcial (solo entre activos), así que un numeroSocio "liberado" acá
  // se puede volver a usar sin chocar contra este registro.
  const eliminado = await Socio.findOneAndUpdate(
    { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
    { eliminadoEn: new Date(), eliminadoPor: req.usuario.id }
  );
  if (!eliminado) {
    return res.status(404).json({ error: "No encontrado." });
  }
  res.json({ ok: true });
});

// Datos de contacto completos de un socio, para cuando hace falta llamar o
// escribir (o corregir uno). Solo con permiso "datosSocios" (admin,
// supervisor y superbibliotecario lo tienen siempre), y cada pedido
// —concedido o no— queda en Auditoria. POST y no GET: es una acción que se
// registra, no una lectura que el navegador o un proxy puedan repetir o
// guardar en caché.
router.post("/:id/datos-contacto", requiereIdValido(), async (req, res) => {
  const socio = await Socio.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!socio) {
    return res.status(404).json({ error: "No encontrado." });
  }
  const { rol, permisos } = req.usuario;
  const autorizado = rol !== "bibliotecario" || Boolean(permisos?.datosSocios);
  // Primero el registro: si no se puede guardar, el dato no sale.
  await Auditoria.create({
    bibliotecaId: req.usuario.bibliotecaId,
    actorId: req.usuario.id,
    actorRol: rol,
    accion: "socio.ver_datos_contacto",
    entidadTipo: "Socio",
    entidadId: socio._id,
    resultado: autorizado ? "ok" : "denegado",
  });
  if (!autorizado) {
    return res.status(403).json({ error: "Requiere el permiso 'datosSocios'." });
  }
  res.set("Cache-Control", "no-store");
  const datos = {};
  for (const campo of CAMPOS_CONTACTO) datos[campo] = socio[campo] ?? "";
  res.json(datos);
});

// Da de alta (o resetea) el login de OPAC del socio. Lo hace el staff,
// nunca el socio por autoregistro — mismo patrón que usan admin/panel
// para dar de alta logins de biblioteca.
router.post("/:id/credenciales", requierePermiso("socios"), requiereIdValido(), async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "La contraseña tiene que tener al menos 8 caracteres." });
  }
  const socio = await Socio.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
  if (!socio) {
    return res.status(404).json({ error: "No encontrado." });
  }
  socio.passwordHash = await bcrypt.hash(password, 10);
  await socio.save();
  res.json({ ok: true });
});

export default router;
