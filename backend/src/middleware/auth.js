import jwt from "jsonwebtoken";
import Usuario from "../models/Usuario.js";
import Biblioteca from "../models/Biblioteca.js";
import { esIdValido } from "../utils/objectId.js";

// Fijado explícito, en vez de confiar en el default de la librería — así un
// cambio futuro de dependencia no puede ampliar en silencio qué algoritmos
// de firma se aceptan al verificar.
const ALGORITMO = "HS256";

// Nombres de cookie DISTINTOS para sesión de staff/admin vs. sesión de
// socio — un mismo navegador puede tener las dos abiertas a la vez (ej.
// una bibliotecaria logueada en el panel, probando el OPAC en otra
// pestaña) sin que una pise a la otra.
const COOKIE_STAFF = "token";
const COOKIE_SOCIO = "token_socio";

function secreto() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error("Falta JWT_SECRET en el entorno.");
  }
  return s;
}

export function firmarToken(usuario) {
  const payload = {
    sub: String(usuario._id),
    rol: usuario.rol,
    bibliotecaId: usuario.bibliotecaId ? String(usuario.bibliotecaId) : null,
    usuario: usuario.usuario,
  };
  // supervisor no tiene una sola bibliotecaId — tiene varias. bibliotecario
  // lleva además sus permisos individuales (ver models/Usuario.js). Ninguno
  // de los otros roles carga estos dos campos, para no inflar el token.
  if (usuario.rol === "supervisor") {
    payload.bibliotecasSupervisadas = (usuario.bibliotecasSupervisadas || []).map(String);
    payload.puedeCrearBibliotecas = !!usuario.puedeCrearBibliotecas;
  }
  if (usuario.rol === "bibliotecario") {
    payload.permisos = usuario.permisos || {};
  }
  return jwt.sign(payload, secreto(), { algorithm: ALGORITMO, expiresIn: "12h" });
}

// Sesión de socio: mismo mecanismo (JWT en cookie httpOnly), pero a
// partir de un documento Socio en vez de Usuario — no tiene campo
// "usuario", así que el identificador que va en el token es numeroSocio.
export function firmarTokenSocio(socio) {
  return jwt.sign(
    {
      sub: String(socio._id),
      rol: "socio",
      bibliotecaId: String(socio.bibliotecaId),
      numeroSocio: socio.numeroSocio,
    },
    secreto(),
    { algorithm: ALGORITMO, expiresIn: "12h" }
  );
}

function opcionesCookie() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE !== "0",
    maxAge: 12 * 60 * 60 * 1000,
  };
}

export function setCookieSesion(res, token) {
  res.cookie(COOKIE_STAFF, token, opcionesCookie());
}

export function limpiarCookieSesion(res) {
  res.clearCookie(COOKIE_STAFF);
}

export function setCookieSesionSocio(res, token) {
  res.cookie(COOKIE_SOCIO, token, opcionesCookie());
}

export function limpiarCookieSesionSocio(res) {
  res.clearCookie(COOKIE_SOCIO);
}

function middlewareLogin(nombreCookie) {
  return async (req, res, next) => {
    const token = req.cookies?.[nombreCookie];
    if (!token) {
      return res.status(401).json({ error: "No autenticado." });
    }
    let payload;
    try {
      payload = jwt.verify(token, secreto(), { algorithms: [ALGORITMO] });
    } catch {
      return res.status(401).json({ error: "Sesión inválida o vencida." });
    }
    req.usuario = {
      id: payload.sub,
      rol: payload.rol,
      bibliotecaId: payload.bibliotecaId,
      usuario: payload.usuario,
      numeroSocio: payload.numeroSocio,
      bibliotecasSupervisadas: payload.bibliotecasSupervisadas,
      puedeCrearBibliotecas: payload.puedeCrearBibliotecas,
      permisos: payload.permisos,
    };
    // bibliotecasSupervisadas/puedeCrearBibliotecas (supervisor) y permisos
    // (bibliotecario) son revocables por quien está por encima en la
    // jerarquía — a diferencia de rol/bibliotecaId, fijos desde que se crea
    // la cuenta. Confiar en el valor horneado en el token dejaría un cambio
    // de alcance o de permiso sin efecto hasta que la sesión de 12h venza
    // (ej. un admin le saca "prestamos" a un bibliotecario y ese
    // bibliotecario seguiría pudiendo prestar el resto del día). Se
    // refrescan desde la base en cada request, solo para estos dos roles
    // (admin/superbibliotecario/socio no tienen ninguno de estos dos campos
    // revocables, así que no pagan el costo de esta consulta extra).
    if (payload.rol === "supervisor" || payload.rol === "bibliotecario") {
      try {
        const cuenta = await Usuario.findById(payload.sub).select(
          "bibliotecasSupervisadas puedeCrearBibliotecas permisos"
        );
        if (!cuenta) {
          return res.status(401).json({ error: "Sesión inválida o vencida." });
        }
        req.usuario.bibliotecasSupervisadas = cuenta.bibliotecasSupervisadas;
        req.usuario.puedeCrearBibliotecas = cuenta.puedeCrearBibliotecas;
        req.usuario.permisos = cuenta.permisos;
      } catch {
        // Un id con forma inválida (no debería pasar con un token propio,
        // pero por las dudas) tira CastError como promesa rechazada — ver
        // CYBER-1 en utils/objectId.js sobre por qué esto no puede quedar
        // sin atrapar acá tampoco.
        return res.status(401).json({ error: "Sesión inválida o vencida." });
      }
    }
    next();
  };
}

export const requiereLogin = middlewareLogin(COOKIE_STAFF);
export const requiereLoginSocio = middlewareLogin(COOKIE_SOCIO);

export function requiereAdmin(req, res, next) {
  if (req.usuario?.rol !== "admin") {
    return res.status(403).json({ error: "Requiere permisos de admin." });
  }
  next();
}

export function requiereSupervisor(req, res, next) {
  if (req.usuario?.rol !== "supervisor") {
    return res.status(403).json({ error: "Requiere permisos de supervisor." });
  }
  next();
}

export function requiereAdminOSupervisor(req, res, next) {
  if (req.usuario?.rol !== "admin" && req.usuario?.rol !== "supervisor") {
    return res.status(403).json({ error: "Requiere permisos de admin o supervisor." });
  }
  next();
}

export function requiereSuperbibliotecario(req, res, next) {
  if (req.usuario?.rol !== "superbibliotecario" || !req.usuario?.bibliotecaId) {
    return res.status(403).json({ error: "Requiere una cuenta de superbibliotecario." });
  }
  next();
}

// Puerta de entrada de todas las rutas de catálogo/circulación/socios/
// export: acepta cualquiera de los dos roles de una sola biblioteca
// (superbibliotecario tiene acceso completo; bibliotecario depende de
// requierePermiso más abajo en cada ruta puntual). Mismo nombre que antes
// —cuando solo existía el rol "biblioteca"— para no tener que tocar los
// ocho archivos que ya lo importan; solo se amplió el chequeo de rol.
//
// admin y supervisor no tienen una bibliotecaId propia (pueden operar sobre
// cualquiera, o sobre las que supervisan) — para ellos, la biblioteca sobre
// la que se opera viene del query param ?bibliotecaId=, y acá se valida el
// alcance (admin: cualquiera; supervisor: solo las de bibliotecasSupervisadas)
// antes de pisar req.usuario.bibliotecaId con ese valor. Así, el resto del
// código de cada ruta (que siempre lee req.usuario.bibliotecaId) no necesita
// enterarse de qué rol hizo el pedido.
export async function requiereBiblioteca(req, res, next) {
  const rol = req.usuario?.rol;
  if (rol === "superbibliotecario" || rol === "bibliotecario") {
    if (!req.usuario?.bibliotecaId) {
      return res.status(403).json({ error: "Requiere una cuenta de biblioteca." });
    }
    return next();
  }
  if (rol === "admin" || rol === "supervisor") {
    const bibliotecaId = req.query?.bibliotecaId;
    if (!bibliotecaId || !esIdValido(bibliotecaId)) {
      return res.status(400).json({ error: "Falta indicar una biblioteca válida (bibliotecaId)." });
    }
    if (rol === "supervisor" && !(req.usuario.bibliotecasSupervisadas || []).map(String).includes(String(bibliotecaId))) {
      return res.status(403).json({ error: "Esa biblioteca no está en tu alcance de supervisión." });
    }
    let existe;
    try {
      existe = await Biblioteca.exists({ _id: bibliotecaId });
    } catch {
      return res.status(400).json({ error: "bibliotecaId inválido." });
    }
    if (!existe) {
      return res.status(404).json({ error: "Biblioteca no encontrada." });
    }
    req.usuario.bibliotecaId = String(bibliotecaId);
    return next();
  }
  return res.status(403).json({ error: "Requiere una cuenta de biblioteca." });
}

// Para un "bibliotecario", exige el permiso puntual (catalogar/prestamos/
// devoluciones/socios/exportar — ver PERMISOS_BIBLIOTECARIO en
// models/Usuario.js). admin/supervisor/superbibliotecario siempre pasan:
// tienen acceso completo dentro de su alcance, sin permisos granulares.
export function requierePermiso(nombre) {
  return (req, res, next) => {
    const rol = req.usuario?.rol;
    if (rol === "admin" || rol === "supervisor" || rol === "superbibliotecario") {
      return next();
    }
    if (rol === "bibliotecario" && req.usuario?.permisos?.[nombre]) {
      return next();
    }
    res.status(403).json({ error: `Requiere el permiso '${nombre}'.` });
  };
}

// Requiere sesión de socio, Y que ese socio pertenezca a la biblioteca
// resuelta en req.biblioteca (ver routes/opac.js) — así un socio de una
// biblioteca no puede usar su sesión en el OPAC de otra, aunque adivine
// el código en la URL.
export function requiereSocio(req, res, next) {
  if (req.usuario?.rol !== "socio" || !req.usuario?.bibliotecaId) {
    return res.status(403).json({ error: "Requiere una cuenta de socio." });
  }
  if (!req.biblioteca || req.usuario.bibliotecaId !== String(req.biblioteca._id)) {
    return res.status(403).json({ error: "Esta sesión no pertenece a esta biblioteca." });
  }
  next();
}
