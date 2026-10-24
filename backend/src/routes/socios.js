import { Router } from "express";
import bcrypt from "bcryptjs";
import Socio from "../models/Socio.js";
import Categoria from "../models/Categoria.js";
import { requiereLogin, requiereBiblioteca, requierePermiso } from "../middleware/auth.js";
import { requiereIdValido } from "../utils/objectId.js";
import { textoDeConsulta } from "../utils/consulta.js";
import { buscarCategoria, normalizarCodigoCategoria } from "../circulacion/categorias.js";

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

router.get("/", async (req, res) => {
  const filtro = { bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null };
  const q = textoDeConsulta(req.query.q);
  if (q) {
    const rx = new RegExp(escaparRegex(q), "i");
    filtro.$or = [{ numeroSocio: rx }, { apellido: rx }, { nombre: rx }, { dni: rx }];
  }
  const pagina = Number(req.query.pagina);
  const porPagina = Number(req.query.porPagina);

  // tieneLoginOpac: booleano derivado, no el hash — el staff necesita ver
  // de un vistazo si un socio ya tiene login del OPAC configurado (ver
  // UX-1 en AUDITORIA.md: sin esto, un reclamo de "no puedo entrar" es
  // indistinguible entre "contraseña incorrecta" y "nunca se le asignó
  // ninguna"). Por eso acá SÍ se trae passwordHash de la base (a
  // diferencia de antes, que lo excluía con .select("-passwordHash")) —
  // pero se lo saca a mano de cada objeto antes de mandarlo, igual que ya
  // hacen POST/PUT más abajo.
  function sinHash(socio) {
    const { passwordHash, ...resto } = socio.toObject();
    return { ...resto, tieneLoginOpac: Boolean(passwordHash) };
  }

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
    return res.json(socios.map(sinHash));
  }

  const socios = await Socio.find(filtro).sort({ apellido: 1 });
  res.json(socios.map(sinHash));
});

router.post("/", requierePermiso("socios"), async (req, res) => {
  const datos = { ...req.body, bibliotecaId: req.usuario.bibliotecaId };
  delete datos._id;
  // La contraseña SOLO se fija por /credenciales (con bcrypt) — nunca
  // aceptamos un passwordHash que venga del cliente en el body.
  delete datos.passwordHash;
  const errorCategoria = await validarCategoria(req, datos);
  if (errorCategoria) return res.status(400).json({ error: errorCategoria });
  try {
    const socio = await Socio.create(datos);
    const { passwordHash, ...sinPassword } = socio.toObject();
    res.status(201).json(sinPassword);
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
  if (datos.categoria !== undefined) {
    const actual = await Socio.findOne({ _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null });
    if (!actual) {
      return res.status(404).json({ error: "No encontrado." });
    }
    const errorCategoria = await validarCategoria(req, datos, actual.categoria);
    if (errorCategoria) return res.status(400).json({ error: errorCategoria });
  }
  try {
    const socio = await Socio.findOneAndUpdate(
      { _id: req.params.id, bibliotecaId: req.usuario.bibliotecaId, eliminadoEn: null },
      datos,
      { new: true, runValidators: true }
    ).select("-passwordHash");
    if (!socio) {
      return res.status(404).json({ error: "No encontrado." });
    }
    res.json(socio);
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
