// Todas las pruebas de integración (contra un Mongo real, vía
// mongodb-memory-server) viven en UN SOLO archivo a propósito: cada
// archivo de test que levanta su propio mongod, corriendo en paralelo
// con otro, generaba contención severa en algunos entornos (Windows en
// particular) — un solo mongod compartido para todo el archivo evita el
// problema de raíz, además de ser más rápido.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import bcrypt from "bcryptjs";
import { conectarDB, desconectarDB } from "../src/db.js";
import { crearApp } from "../src/server.js";
import Usuario from "../src/models/Usuario.js";
import Biblioteca from "../src/models/Biblioteca.js";
import Libro from "../src/models/Libro.js";
import Socio from "../src/models/Socio.js";
import Ejemplar from "../src/models/Ejemplar.js";
import Prestamo from "../src/models/Prestamo.js";
import Solicitud from "../src/models/Solicitud.js";
import { migrarColeccion } from "../scripts/migrar-item-polimorfico.js";
import { migrarRolesJerarquia } from "../scripts/migrar-roles-jerarquia.js";

process.env.JWT_SECRET = "clave-de-test";
process.env.COOKIE_SECURE = "0";
// Este archivo comparte una única app (y por lo tanto un único limitador de
// login, ver middleware/rateLimit.js) entre todos sus tests — en conjunto
// hacen bastantes más de 20 logins legítimos. Sin esto, tests que no tienen
// nada que ver entre sí empiezan a fallar con 429 simplemente por venir
// "después" de otros en el mismo archivo.
process.env.LOGIN_RATE_LIMIT = "1000";

let mongod;
let app;

function extraerCookie(res) {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  return raw.split(";")[0];
}

async function login(base, usuario, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, password }),
  });
  return extraerCookie(res);
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await conectarDB(mongod.getUri());
  app = crearApp();
});

after(async () => {
  await desconectarDB();
  await mongod.stop();
});

test("flujo completo: admin crea biblioteca+usuario, biblioteca carga libros/socios y exporta", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  // --- bootstrap admin directo en DB (igual que scripts/crear-admin.js) ---
  const passwordHash = await bcrypt.hash("adminpass123", 10);
  await Usuario.create({ usuario: "admin", passwordHash, rol: "admin", bibliotecaId: null });

  // --- login admin ---
  let res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "admin", password: "adminpass123" }),
  });
  assert.equal(res.status, 200);
  const cookieAdmin = extraerCookie(res);
  assert.ok(cookieAdmin, "debe setear cookie de sesión");

  // --- login con password incorrecta falla ---
  res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "admin", password: "mala" }),
  });
  assert.equal(res.status, 401);

  // --- admin crea biblioteca ---
  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca San Juan", codigo: "bpsanjuan" }),
  });
  assert.equal(res.status, 201);
  const biblioteca = await res.json();
  assert.ok(biblioteca._id);

  // --- crear biblioteca duplicada falla (código único) ---
  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Otra", codigo: "bpsanjuan" }),
  });
  assert.equal(res.status, 409);

  // --- admin crea usuario de esa biblioteca ---
  res = await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpsanjuan", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  assert.equal(res.status, 201);

  // --- login como la biblioteca ---
  res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "bpsanjuan", password: "clavesegura1" }),
  });
  assert.equal(res.status, 200);
  const cookieBiblio = extraerCookie(res);

  // --- la biblioteca NO puede crear otras bibliotecas (no es admin) ---
  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ nombre: "Intento", codigo: "intento1" }),
  });
  assert.equal(res.status, 403);

  // --- cargar 2 libros (con tildes/ñ, y uno con varios ejemplares) ---
  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({
      isbn: "978-950-07-0001-6",
      titulo: "Ficciones",
      autores: ["Borges, Jorge Luis"],
      editorial: "Emecé",
      lugarPublicacion: "Buenos Aires",
      anio: "1944",
      paginas: "203",
      materias: ["Literatura argentina", "Cuentos"],
      ejemplares: [
        { codigoBarras: "BPSJ-000001", signatura: "863 BOR" },
        { codigoBarras: "BPSJ-000002", signatura: "863 BOR" },
      ],
    }),
  });
  assert.equal(res.status, 201);

  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({
      titulo: "Rayuela",
      autores: ["Cortázar, Julio"],
      anio: "1963",
      ejemplares: [],
    }),
  });
  assert.equal(res.status, 201);

  // --- cargar 2 socios ---
  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({
      numeroSocio: "0001",
      apellido: "Pérez",
      nombre: "María José",
      dni: "30111222",
      direccion: "San Martín 123",
      localidad: "San Juan",
      categoria: "ADULTO",
      email: "mjperez@example.com",
    }),
  });
  assert.equal(res.status, 201);
  const socioPerez = await res.json();
  assert.equal("passwordHash" in socioPerez, false, "la respuesta nunca debe exponer passwordHash");

  // --- intentar fijar passwordHash directo por PUT (bypaseando bcrypt) se ignora ---
  res = await fetch(`${base}/api/socios/${socioPerez._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ localidad: "San Juan Capital", passwordHash: "hash-inventado-por-el-cliente" }),
  });
  assert.equal(res.status, 200);
  const socioActualizado = await res.json();
  assert.equal("passwordHash" in socioActualizado, false);
  assert.equal(socioActualizado.localidad, "San Juan Capital");
  const socioEnDB = await Socio.findById(socioPerez._id);
  assert.notEqual(
    socioEnDB.passwordHash,
    "hash-inventado-por-el-cliente",
    "el PUT no debe poder fijar passwordHash directamente"
  );

  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ numeroSocio: "0002", apellido: "Gómez", nombre: "Ñico" }),
  });
  assert.equal(res.status, 201);

  // --- socio duplicado (mismo numeroSocio) falla ---
  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ numeroSocio: "0001", apellido: "Otro", nombre: "Duplicado" }),
  });
  assert.equal(res.status, 409);

  // --- exportar MARCXML ---
  res = await fetch(`${base}/api/export/marcxml`, { headers: { Cookie: cookieBiblio } });
  assert.equal(res.status, 200);
  const xml = await res.text();
  assert.match(xml, /<collection xmlns="http:\/\/www\.loc\.gov\/MARC21\/slim">/);
  assert.match(xml, /Ficciones/);
  assert.match(xml, /Borges, Jorge Luis/);
  assert.match(xml, /Rayuela/);
  assert.match(xml, /BPSJ-000001/);
  const { DOMParser } = await import("@xmldom/xmldom").catch(() => ({ DOMParser: null }));
  if (DOMParser) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const errores = doc.getElementsByTagName("parsererror");
    assert.equal(errores.length, 0, "el XML debe ser well-formed");
  }
  const cantidadRecords = (xml.match(/<record>/g) || []).length;
  assert.equal(cantidadRecords, 2);
  const cantidad008 = (xml.match(/tag="008"/g) || []).length;
  assert.equal(cantidad008, 2);

  // --- exportar CSV de socios ---
  res = await fetch(`${base}/api/export/socios.csv`, { headers: { Cookie: cookieBiblio } });
  assert.equal(res.status, 200);
  const csv = await res.text();
  assert.match(csv, /cardnumber,surname,firstname/);
  assert.match(csv, /Pérez/);
  assert.match(csv, /Ñico/);
  assert.match(csv, /DNI: 30111222/);
  const filasCsv = csv.trim().split("\n");
  assert.equal(filasCsv.length, 3); // encabezado + 2 socios

  // --- otra biblioteca no debería ver los datos de bpsanjuan (aislamiento) ---
  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Belgrano", codigo: "bpbelgrano" }),
  });
  const biblioteca2 = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpbelgrano", password: "clavesegura2", bibliotecaId: biblioteca2._id }),
  });
  res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "bpbelgrano", password: "clavesegura2" }),
  });
  const cookieBiblio2 = extraerCookie(res);

  res = await fetch(`${base}/api/libros`, { headers: { Cookie: cookieBiblio2 } });
  const librosDeOtra = await res.json();
  assert.equal(librosDeOtra.length, 0, "bpbelgrano no debe ver los libros de bpsanjuan");

  res = await fetch(`${base}/api/export/marcxml`, { headers: { Cookie: cookieBiblio2 } });
  assert.equal(res.status, 404, "sin libros propios, exportar debe avisar 404, no exportar vacío silencioso");

  // --- sin sesión, todo lo protegido rechaza ---
  res = await fetch(`${base}/api/libros`);
  assert.equal(res.status, 401);
});

test("flujo completo de circulación: socio solicita, staff aprueba, devuelve, renueva", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  // Reusa el admin creado en el test anterior (mismo Mongo compartido).
  const cookieAdmin = await login(base, "admin", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Circulación", codigo: "bpcirc" }),
  });
  const biblioteca = await res.json();

  // maxRenovaciones=1 para poder probar el tope fácil
  await Biblioteca.findByIdAndUpdate(biblioteca._id, { maxRenovaciones: 1, diasPrestamo: 14 });

  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpcirc", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });

  const cookieStaff = await login(base, "bpcirc", "clavesegura1");

  // --- staff carga un libro con 1 ejemplar ---
  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      titulo: "Rayuela",
      autores: ["Cortázar, Julio"],
      ejemplares: [{ codigoBarras: "BPC-0001", signatura: "863 COR" }],
    }),
  });
  const libro = await res.json();
  assert.equal(libro.ejemplares.length, 1);

  // --- staff carga un socio y le crea login de OPAC ---
  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ numeroSocio: "0001", apellido: "Pérez", nombre: "Ana" }),
  });
  const socio = await res.json();

  res = await fetch(`${base}/api/socios/${socio._id}/credenciales`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ password: "clavesociosegura" }),
  });
  assert.equal(res.status, 200);

  // --- catálogo público del OPAC, sin login ---
  res = await fetch(`${base}/api/opac/bpcirc/libros`);
  assert.equal(res.status, 200);
  const catalogo = await res.json();
  assert.equal(catalogo.length, 1);
  assert.equal(catalogo[0].ejemplaresDisponibles, 1);
  assert.equal(catalogo[0].titulo, "Rayuela");

  // --- código de biblioteca inexistente da 404 ---
  res = await fetch(`${base}/api/opac/noexiste/libros`);
  assert.equal(res.status, 404);

  // --- login de socio con password incorrecta falla ---
  res = await fetch(`${base}/api/opac/bpcirc/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeroSocio: "0001", password: "mala" }),
  });
  assert.equal(res.status, 401);

  // --- login de socio correcto ---
  res = await fetch(`${base}/api/opac/bpcirc/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeroSocio: "0001", password: "clavesociosegura" }),
  });
  assert.equal(res.status, 200);
  const cookieSocio = extraerCookie(res);

  // --- un espacio de más al tipear el número de socio no rompe el login
  // (numeroSocio se guarda "trim", el login tiene que buscarlo igual) ---
  res = await fetch(`${base}/api/opac/bpcirc/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeroSocio: "  0001  ", password: "clavesociosegura" }),
  });
  assert.equal(res.status, 200, "un número de socio con espacios de más igual debería loguear");

  // --- sesión de socio no puede tocar rutas de staff: la cookie de socio
  // usa un nombre distinto ("token_socio") al de staff ("token"), así que
  // la ruta de staff ni siquiera la reconoce como sesión propia (401),
  // en vez de autenticar y recién ahí rechazar por rol (403) ---
  res = await fetch(`${base}/api/libros`, { headers: { Cookie: cookieSocio } });
  assert.equal(res.status, 401);

  // --- y al revés: la cookie de staff tampoco sirve en rutas de socio ---
  res = await fetch(`${base}/api/opac/bpcirc/mis-prestamos`, { headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 401);

  // --- socio solicita préstamo ---
  res = await fetch(`${base}/api/opac/bpcirc/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio },
    body: JSON.stringify({ tipo: "prestamo", itemTipo: "Libro", itemId: libro._id }),
  });
  assert.equal(res.status, 201);
  const solicitud = await res.json();
  assert.equal(solicitud.estado, "pendiente");

  // --- pedir la misma solicitud de nuevo (duplicada, pendiente) falla ---
  res = await fetch(`${base}/api/opac/bpcirc/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio },
    body: JSON.stringify({ tipo: "prestamo", itemTipo: "Libro", itemId: libro._id }),
  });
  assert.equal(res.status, 409);

  // --- staff ve la solicitud pendiente ---
  res = await fetch(`${base}/api/circulacion/solicitudes?estado=pendiente`, {
    headers: { Cookie: cookieStaff },
  });
  const pendientes = await res.json();
  assert.equal(pendientes.length, 1);
  assert.equal(pendientes[0].socio.numeroSocio, "0001");
  assert.equal(pendientes[0].item.titulo, "Rayuela");
  assert.equal(
    "passwordHash" in pendientes[0].socio,
    false,
    "la cola de solicitudes del staff no debe exponer el hash de contraseña del socio"
  );

  // --- staff aprueba: se crea el préstamo, el ejemplar pasa a "prestado" ---
  res = await fetch(`${base}/api/circulacion/solicitudes/${solicitud._id}/aprobar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
  });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/api/opac/bpcirc/libros`);
  assert.equal((await res.json())[0].ejemplaresDisponibles, 0, "el ejemplar ya no debería estar disponible");

  // --- socio ve su préstamo activo ---
  res = await fetch(`${base}/api/opac/bpcirc/mis-prestamos`, { headers: { Cookie: cookieSocio } });
  const misPrestamos = await res.json();
  assert.equal(misPrestamos.length, 1);
  assert.equal(misPrestamos[0].item.titulo, "Rayuela");
  assert.equal(misPrestamos[0].fechaDevolucion, null);
  const prestamoId = misPrestamos[0]._id;

  // --- no hay más ejemplares: una segunda solicitud de préstamo del mismo libro falla ---
  res = await fetch(`${base}/api/opac/bpcirc/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio },
    body: JSON.stringify({ tipo: "prestamo", itemTipo: "Libro", itemId: libro._id }),
  });
  assert.equal(res.status, 409);

  // --- socio pide renovación ---
  res = await fetch(`${base}/api/opac/bpcirc/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio },
    body: JSON.stringify({ tipo: "renovacion", prestamoId }),
  });
  assert.equal(res.status, 201);
  const solicitudRenovacion = await res.json();

  // --- staff aprueba la renovación: renovaciones sube a 1, vencimiento se corre ---
  const vencimientoAntes = misPrestamos[0].fechaVencimiento;
  res = await fetch(`${base}/api/circulacion/solicitudes/${solicitudRenovacion._id}/aprobar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
  });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/api/opac/bpcirc/mis-prestamos`, { headers: { Cookie: cookieSocio } });
  const prestamosTrasRenovar = await res.json();
  assert.equal(prestamosTrasRenovar[0].renovaciones, 1);
  assert.notEqual(prestamosTrasRenovar[0].fechaVencimiento, vencimientoAntes);

  // --- tope de renovaciones (maxRenovaciones=1): pedir otra renovación se rechaza directo ---
  res = await fetch(`${base}/api/opac/bpcirc/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio },
    body: JSON.stringify({ tipo: "renovacion", prestamoId }),
  });
  assert.equal(res.status, 409);

  // --- staff procesa la devolución: el ejemplar vuelve a estar disponible ---
  res = await fetch(`${base}/api/circulacion/prestamos/${prestamoId}/devolucion`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 200);
  const devuelto = await res.json();
  assert.ok(devuelto.fechaDevolucion);

  res = await fetch(`${base}/api/opac/bpcirc/libros`);
  assert.equal((await res.json())[0].ejemplaresDisponibles, 1, "el ejemplar debería volver a estar disponible");

  // --- devolver de nuevo el mismo préstamo falla (ya estaba devuelto) ---
  res = await fetch(`${base}/api/circulacion/prestamos/${prestamoId}/devolucion`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 409);

  // --- préstamo directo del staff (socio que llega sin pasar por el OPAC) ---
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: socio._id, itemTipo: "Libro", itemId: libro._id }),
  });
  assert.equal(res.status, 201);

  res = await fetch(`${base}/api/circulacion/prestamos?estado=activo`, { headers: { Cookie: cookieStaff } });
  const activos = await res.json();
  assert.equal(activos.length, 1);
  assert.equal(activos[0].vencido, false);
  assert.equal(
    "passwordHash" in activos[0].socio,
    false,
    "la vista de préstamos del staff no debe exponer el hash de contraseña del socio"
  );

  // --- rechazar una solicitud inexistente/ya resuelta da 404 ---
  res = await fetch(`${base}/api/circulacion/solicitudes/${solicitud._id}/rechazar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 404);

  // --- logout de socio y volver a pedir rutas protegidas falla ---
  await fetch(`${base}/api/opac/bpcirc/logout`, { method: "POST", headers: { Cookie: cookieSocio } });
});

test("una biblioteca no ve ni puede tocar solicitudes/préstamos de otra", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  const crearBibliotecaConDatos = async (codigo) => {
    let res = await fetch(`${base}/api/bibliotecas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
      body: JSON.stringify({ nombre: codigo, codigo }),
    });
    const biblioteca = await res.json();
    await fetch(`${base}/api/superbibliotecarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
      body: JSON.stringify({ usuario: codigo, password: "clavesegura1", bibliotecaId: biblioteca._id }),
    });
    const cookieStaff = await login(base, codigo, "clavesegura1");
    res = await fetch(`${base}/api/libros`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieStaff },
      body: JSON.stringify({ titulo: `Libro de ${codigo}`, ejemplares: [{ codigoBarras: `${codigo}-1` }] }),
    });
    const libro = await res.json();
    return { biblioteca, cookieStaff, libro };
  };

  const a = await crearBibliotecaConDatos("bpuno");
  const b = await crearBibliotecaConDatos("bpdos");

  // El staff de "bpdos" no ve el libro de "bpuno" en su propia API de libros
  let res = await fetch(`${base}/api/libros`, { headers: { Cookie: b.cookieStaff } });
  const librosDeB = await res.json();
  assert.ok(!librosDeB.some((l) => l._id === a.libro._id));

  // El catálogo público de "bpuno" no expone el libro de "bpdos"
  res = await fetch(`${base}/api/opac/bpuno/libros`);
  const catalogoA = await res.json();
  assert.ok(!catalogoA.some((l) => l.titulo === b.libro.titulo));

  // El staff de "bpdos" no puede aprobar/ver solicitudes de "bpuno" (ni existen desde su vista)
  res = await fetch(`${base}/api/circulacion/solicitudes`, { headers: { Cookie: b.cookieStaff } });
  const solicitudesDeB = await res.json();
  assert.equal(solicitudesDeB.length, 0);
});

test("/api/v1/... es un alias real de /api/... (ver ARQ-5) — mismo login, mismos datos", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  // Login por la ruta versionada.
  const resLogin = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "admin", password: "adminpass123" }),
  });
  assert.equal(resLogin.status, 200);
  const cookieAdmin = extraerCookie(resLogin);

  // Crear una biblioteca por /api/v1 y confirmar que aparece leyendo por /api sin versión.
  const resCrear = await fetch(`${base}/api/v1/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca v1", codigo: "bpv1" }),
  });
  assert.equal(resCrear.status, 201);
  const biblioteca = await resCrear.json();

  const resListaSinVersion = await fetch(`${base}/api/bibliotecas`, { headers: { Cookie: cookieAdmin } });
  const bibliotecas = await resListaSinVersion.json();
  assert.ok(bibliotecas.some((b) => b._id === biblioteca._id));

  // /api/health no lleva versión (convención: los health checks de monitoreo quedan estables).
  const resHealth = await fetch(`${base}/api/health`);
  assert.equal(resHealth.status, 200);
});

test("borrar una biblioteca marca eliminados (no huérfanos) sus libros y socios (ver ARQ-6)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca a borrar", codigo: "bpborrar" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpborrar", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bpborrar", "clavesegura1");

  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Libro que va a quedar huérfano", ejemplares: [] }),
  });
  const libro = await res.json();

  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ numeroSocio: "1", apellido: "Huerfano", nombre: "Socio" }),
  });
  const socio = await res.json();

  // --- se borra la biblioteca ---
  res = await fetch(`${base}/api/bibliotecas/${biblioteca._id}`, {
    method: "DELETE",
    headers: { Cookie: cookieAdmin },
  });
  assert.equal(res.status, 200);

  // El login de staff no sobrevive: no se puede volver a entrar.
  res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "bpborrar", password: "clavesegura1" }),
  });
  assert.equal(res.status, 401);

  // El libro y el socio NO se borraron de la base: siguen ahí, marcados eliminados.
  const libroEnBase = await Libro.findById(libro._id);
  assert.ok(libroEnBase, "el libro debería seguir existiendo en la base, no huérfano-borrado");
  assert.ok(libroEnBase.eliminadoEn, "el libro debería estar marcado como eliminado");

  const socioEnBase = await Socio.findById(socio._id);
  assert.ok(socioEnBase, "el socio debería seguir existiendo en la base, no huérfano-borrado");
  assert.ok(socioEnBase.eliminadoEn, "el socio debería estar marcado como eliminado");
});

test("biblioteca carga un libro con subtipo ebook y urlAcceso, sin ejemplares", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");
  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca ebooks", codigo: "bpebooks" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpebooks", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bpebooks", "clavesegura1");

  // --- sin especificar subtipo, default a "impreso" (compatibilidad con el flujo existente) ---
  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Libro sin subtipo explícito" }),
  });
  assert.equal(res.status, 201);
  const libroImpreso = await res.json();
  assert.equal(libroImpreso.subtipo, "impreso");

  // --- ebook con urlAcceso, sin ejemplares ---
  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      titulo: "Libro electrónico",
      subtipo: "ebook",
      urlAcceso: "https://ejemplo.org/libro.pdf",
    }),
  });
  assert.equal(res.status, 201);
  const ebook = await res.json();
  assert.equal(ebook.subtipo, "ebook");
  assert.equal(ebook.urlAcceso, "https://ejemplo.org/libro.pdf");
  assert.equal((ebook.ejemplares || []).length, 0);

  // --- el catálogo público expone subtipo/urlAcceso, para que el OPAC ofrezca "Acceder" ---
  res = await fetch(`${base}/api/opac/bpebooks/libros`);
  const catalogo = await res.json();
  const entradaEbook = catalogo.find((l) => l._id === ebook._id);
  assert.equal(entradaEbook.subtipo, "ebook");
  assert.equal(entradaEbook.urlAcceso, "https://ejemplo.org/libro.pdf");

  // --- sin ejemplares, pedir préstamo del ebook sigue el mismo 409 ya existente ---
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: new mongoose.Types.ObjectId().toString(), itemTipo: "Libro", itemId: ebook._id }),
  });
  assert.equal(res.status, 409);
});

test("Seriada: circula igual que Libro (ejemplares, préstamo directo, devolución, y 409 sin stock)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");
  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca seriadas", codigo: "bpseriadas" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpseriadas", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bpseriadas", "clavesegura1");

  // --- crear una seriada con un ejemplar ---
  res = await fetch(`${base}/api/seriadas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      titulo: "Revista de Pruebas",
      issn: "0378-5955",
      periodicidad: "mensual",
      ejemplares: [{ codigoBarras: "BPSER-000001", signatura: "2026 n.1" }],
    }),
  });
  assert.equal(res.status, 201);
  const seriada = await res.json();
  assert.equal(seriada.ejemplares.length, 1);

  // --- aparece en el catálogo público del OPAC, con disponibilidad ---
  res = await fetch(`${base}/api/opac/bpseriadas/seriadas`);
  const catalogo = await res.json();
  assert.equal(catalogo.length, 1);
  assert.equal(catalogo[0].ejemplaresDisponibles, 1);

  // --- socio ---
  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ numeroSocio: "0001", apellido: "Lectora", nombre: "Ana" }),
  });
  const socio = await res.json();

  // --- préstamo directo del staff (mismo circuito que un Libro) ---
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: socio._id, itemTipo: "Seriada", itemId: seriada._id }),
  });
  assert.equal(res.status, 201);
  const prestamo = await res.json();
  assert.equal(prestamo.itemTipo, "Seriada");

  // --- la vista de circulación del staff resuelve el ítem (join por itemTipo) ---
  res = await fetch(`${base}/api/circulacion/prestamos?estado=activo`, { headers: { Cookie: cookieStaff } });
  const activos = await res.json();
  assert.equal(activos.length, 1);
  assert.equal(activos[0].item.titulo, "Revista de Pruebas");

  // --- sin más ejemplares disponibles: un segundo préstamo directo da 409 (mismo comportamiento que Libro) ---
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: socio._id, itemTipo: "Seriada", itemId: seriada._id }),
  });
  assert.equal(res.status, 409);

  // --- devolución: el ejemplar vuelve a estar disponible ---
  res = await fetch(`${base}/api/circulacion/prestamos/${prestamo._id}/devolucion`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/api/opac/bpseriadas/seriadas`);
  assert.equal((await res.json())[0].ejemplaresDisponibles, 1);

  // --- no se puede borrar una seriada con ejemplar prestado; sin préstamos activos, sí ---
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: socio._id, itemTipo: "Seriada", itemId: seriada._id }),
  });
  const prestamo2 = await res.json();
  res = await fetch(`${base}/api/seriadas/${seriada._id}`, { method: "DELETE", headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 409);
  await fetch(`${base}/api/circulacion/prestamos/${prestamo2._id}/devolucion`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  res = await fetch(`${base}/api/seriadas/${seriada._id}`, { method: "DELETE", headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 200);
});

// Los 5 tipos que se sumaron después de Seriada (Sonoro, Audiovisual,
// Cartográfico, Gráfico, Didáctico) circulan todos con el mismo mecanismo
// genérico (itemTipo/itemId) — en vez de repetir el bloque de arriba cinco
// veces más, se genera un test por bucket a partir de esta configuración.
const NUEVOS_TIPOS_CIRCULANTES = [
  {
    itemTipo: "MaterialSonoro",
    endpoint: "materialSonoro",
    codigo: "bpsonoro",
    payload: {
      titulo: "Concierto de Aranjuez",
      subtipo: "cd",
      ejemplares: [{ codigoBarras: "BPSON-000001", signatura: "780 CD" }],
    },
  },
  {
    itemTipo: "MaterialAudiovisual",
    endpoint: "materialAudiovisual",
    codigo: "bpav",
    payload: {
      titulo: "Nueve Reinas",
      subtipo: "dvd",
      ejemplares: [{ codigoBarras: "BPAV-000001", signatura: "791 DVD" }],
    },
  },
  {
    itemTipo: "MaterialCartografico",
    endpoint: "materialCartografico",
    codigo: "bpcart",
    payload: {
      titulo: "Mapa vial de San Juan",
      subtipo: "mapa",
      ejemplares: [{ codigoBarras: "BPCART-000001", signatura: "912 MAP" }],
    },
  },
  {
    itemTipo: "MaterialGrafico",
    endpoint: "materialGrafico",
    codigo: "bpgraf",
    payload: {
      titulo: "Plaza 25 de Mayo, 1950",
      subtipo: "fotografia",
      ejemplares: [{ codigoBarras: "BPGRAF-000001", signatura: "770 FOT" }],
    },
  },
  {
    itemTipo: "MaterialDidactico",
    endpoint: "materialDidactico",
    codigo: "bpdid",
    payload: {
      titulo: "Rompecabezas mapa de Argentina",
      subtipo: "rompecabezas",
      ejemplares: [{ codigoBarras: "BPDID-000001", signatura: "JUE 001" }],
    },
  },
];

for (const cfg of NUEVOS_TIPOS_CIRCULANTES) {
  test(`${cfg.itemTipo}: circula igual que Libro/Seriada (ejemplares, préstamo directo, devolución, 409 sin stock, export MARC)`, async (t) => {
    const server = app.listen(0);
    const puerto = server.address().port;
    const base = `http://127.0.0.1:${puerto}`;
    t.after(() => server.close());

    const cookieAdmin = await login(base, "admin", "adminpass123");
    let res = await fetch(`${base}/api/bibliotecas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
      body: JSON.stringify({ nombre: `Biblioteca ${cfg.itemTipo}`, codigo: cfg.codigo }),
    });
    const biblioteca = await res.json();
    await fetch(`${base}/api/superbibliotecarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
      body: JSON.stringify({ usuario: cfg.codigo, password: "clavesegura1", bibliotecaId: biblioteca._id }),
    });
    const cookieStaff = await login(base, cfg.codigo, "clavesegura1");

    // --- crear el ítem con un ejemplar ---
    res = await fetch(`${base}/api/${cfg.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieStaff },
      body: JSON.stringify(cfg.payload),
    });
    assert.equal(res.status, 201);
    const item = await res.json();
    assert.equal(item.ejemplares.length, 1);

    // --- aparece en el catálogo público del OPAC, con disponibilidad ---
    res = await fetch(`${base}/api/opac/${cfg.codigo}/${cfg.endpoint}`);
    const catalogo = await res.json();
    assert.equal(catalogo.length, 1);
    assert.equal(catalogo[0].ejemplaresDisponibles, 1);

    res = await fetch(`${base}/api/socios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieStaff },
      body: JSON.stringify({ numeroSocio: "0001", apellido: "Lectora", nombre: "Ana" }),
    });
    const socio = await res.json();

    // --- préstamo directo del staff (mismo circuito genérico que Libro/Seriada) ---
    res = await fetch(`${base}/api/circulacion/prestamos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieStaff },
      body: JSON.stringify({ socioId: socio._id, itemTipo: cfg.itemTipo, itemId: item._id }),
    });
    assert.equal(res.status, 201);
    const prestamo = await res.json();
    assert.equal(prestamo.itemTipo, cfg.itemTipo);

    // --- la vista de circulación del staff resuelve el ítem (join por itemTipo) ---
    res = await fetch(`${base}/api/circulacion/prestamos?estado=activo`, { headers: { Cookie: cookieStaff } });
    const activos = await res.json();
    assert.equal(activos.length, 1);
    assert.equal(activos[0].item.titulo, cfg.payload.titulo);

    // --- sin más ejemplares disponibles: un segundo préstamo directo da 409 ---
    res = await fetch(`${base}/api/circulacion/prestamos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieStaff },
      body: JSON.stringify({ socioId: socio._id, itemTipo: cfg.itemTipo, itemId: item._id }),
    });
    assert.equal(res.status, 409);

    // --- devolución: el ejemplar vuelve a estar disponible ---
    res = await fetch(`${base}/api/circulacion/prestamos/${prestamo._id}/devolucion`, {
      method: "POST",
      headers: { Cookie: cookieStaff },
    });
    assert.equal(res.status, 200);

    res = await fetch(`${base}/api/opac/${cfg.codigo}/${cfg.endpoint}`);
    assert.equal((await res.json())[0].ejemplaresDisponibles, 1);

    // --- export MARC del bucket incluye el título cargado ---
    res = await fetch(`${base}/api/export/marcxml/${cfg.endpoint}`, { headers: { Cookie: cookieStaff } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/marcxml+xml; charset=utf-8");
    const xml = await res.text();
    assert.match(xml, new RegExp(cfg.payload.titulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
}

test("Recursos electrónicos: no hay ninguna forma de crear un préstamo/solicitud para este tipo (409/400 según corresponda)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");
  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca recursos", codigo: "bprecursos" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bprecursos", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bprecursos", "clavesegura1");

  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ numeroSocio: "0001", apellido: "Lectora", nombre: "Ana" }),
  });
  const socio = await res.json();

  // --- crear un recurso electrónico ---
  res = await fetch(`${base}/api/recursosElectronicos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      titulo: "Manual de Koha",
      tipoRecurso: "pdf",
      urlAcceso: "https://ejemplo.org/manual.pdf",
    }),
  });
  assert.equal(res.status, 201);
  const recurso = await res.json();

  // --- staff no puede crear un préstamo directo de un RecursoElectronico: itemTipo inválido ---
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: socio._id, itemTipo: "RecursoElectronico", itemId: recurso._id }),
  });
  assert.equal(res.status, 400);

  // --- ni el OPAC deja pedir un préstamo de un RecursoElectronico (mismo enum inválido) ---
  res = await fetch(`${base}/api/socios/${socio._id}/credenciales`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ password: "clavesociosegura" }),
  });
  assert.equal(res.status, 200);
  res = await fetch(`${base}/api/opac/bprecursos/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeroSocio: "0001", password: "clavesociosegura" }),
  });
  const cookieSocio = res.headers.get("set-cookie").split(";")[0];
  res = await fetch(`${base}/api/opac/bprecursos/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio },
    body: JSON.stringify({ tipo: "prestamo", itemTipo: "RecursoElectronico", itemId: recurso._id }),
  });
  assert.equal(res.status, 400);

  // --- no existe ninguna ruta de ejemplares para RecursoElectronico ---
  res = await fetch(`${base}/api/recursosElectronicos/${recurso._id}/ejemplares`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ ejemplares: [{ codigoBarras: "X" }] }),
  });
  assert.equal(res.status, 404);
});

// Archivo y Objeto son igual de "no circulantes" que RecursoElectronico
// (sin Ejemplar, sin solicitud de préstamo posible), pero además no tienen
// ningún export MARC — se generaliza en un test por bucket.
const BUCKETS_SIN_CIRCULACION_NI_MARC = [
  {
    itemTipo: "Archivo",
    endpoint: "archivos",
    codigo: "bparchivo",
    payload: {
      titulo: "Acta fundacional de la biblioteca",
      subtipo: "acta",
      nivelDescripcion: "unidad_documental",
      productor: "Comisión Directiva",
      fechaInicio: "1950",
      columnaOpac: "nivelDescripcion",
    },
  },
  {
    itemTipo: "Objeto",
    endpoint: "objetos",
    codigo: "bpobjeto",
    payload: {
      titulo: "Medalla conmemorativa del centenario",
      subtipo: "medalla",
      numeroInventario: "OBJ-0001",
      estadoConservacion: "bueno",
      columnaOpac: "subtipo",
    },
  },
];

for (const cfg of BUCKETS_SIN_CIRCULACION_NI_MARC) {
  test(`${cfg.itemTipo}: CRUD básico, sin circulación posible y sin export MARC`, async (t) => {
    const server = app.listen(0);
    const puerto = server.address().port;
    const base = `http://127.0.0.1:${puerto}`;
    t.after(() => server.close());

    const cookieAdmin = await login(base, "admin", "adminpass123");
    let res = await fetch(`${base}/api/bibliotecas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
      body: JSON.stringify({ nombre: `Biblioteca ${cfg.itemTipo}`, codigo: cfg.codigo }),
    });
    const biblioteca = await res.json();
    await fetch(`${base}/api/superbibliotecarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
      body: JSON.stringify({ usuario: cfg.codigo, password: "clavesegura1", bibliotecaId: biblioteca._id }),
    });
    const cookieStaff = await login(base, cfg.codigo, "clavesegura1");

    // --- crear ---
    const { columnaOpac, ...payload } = cfg.payload;
    res = await fetch(`${base}/api/${cfg.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieStaff },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const item = await res.json();
    assert.equal(item.titulo, payload.titulo);

    // --- aparece en el catálogo de solo lectura del OPAC ---
    res = await fetch(`${base}/api/opac/${cfg.codigo}/${cfg.endpoint}`);
    const catalogo = await res.json();
    assert.equal(catalogo.length, 1);
    assert.equal(catalogo[0][columnaOpac], payload[columnaOpac]);

    // --- editar ---
    res = await fetch(`${base}/api/${cfg.endpoint}/${item._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieStaff },
      body: JSON.stringify({ ...payload, notas: "Actualizado" }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).notas, "Actualizado");

    // --- sin ninguna forma de circular: no hay ruta de ejemplares, ni de solicitud ---
    res = await fetch(`${base}/api/${cfg.endpoint}/${item._id}/ejemplares`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieStaff },
      body: JSON.stringify({ ejemplares: [{ codigoBarras: "X" }] }),
    });
    assert.equal(res.status, 404);

    res = await fetch(`${base}/api/circulacion/prestamos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieStaff },
      body: JSON.stringify({ socioId: biblioteca._id, itemTipo: cfg.itemTipo, itemId: item._id }),
    });
    assert.equal(res.status, 400); // itemTipo inválido: no está en MODELOS_POR_TIPO

    // --- sin export MARC para este bucket ---
    res = await fetch(`${base}/api/export/marcxml/${cfg.endpoint}`, { headers: { Cookie: cookieStaff } });
    assert.equal(res.status, 404);

    // --- borrado lógico ---
    res = await fetch(`${base}/api/${cfg.endpoint}/${item._id}`, { method: "DELETE", headers: { Cookie: cookieStaff } });
    assert.equal(res.status, 200);
    res = await fetch(`${base}/api/opac/${cfg.codigo}/${cfg.endpoint}`);
    assert.equal((await res.json()).length, 0);
  });
}

test("Archivo: jerarquía opcional de un nivel vía padreId (ver ARCHIV-2), y nivelAcceso estructurado (ver ARCHIV-3)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");
  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Archivo Jerarquía", codigo: "bparchivjer" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bparchivjer", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bparchivjer", "clavesegura1");

  // --- sin padreId: sigue funcionando exactamente igual que antes ---
  res = await fetch(`${base}/api/archivos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Serie Actas Municipales", nivelDescripcion: "serie" }),
  });
  assert.equal(res.status, 201);
  const serie = await res.json();
  assert.equal(serie.padreId, null);

  // --- con padreId: un expediente que pertenece a esa serie ---
  res = await fetch(`${base}/api/archivos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Expediente 1950", nivelDescripcion: "expediente", padreId: serie._id }),
  });
  assert.equal(res.status, 201);
  const expediente = await res.json();
  assert.equal(expediente.padreId, serie._id);

  // --- se puede editar para quitarle el padre (vuelve a null) ---
  res = await fetch(`${base}/api/archivos/${expediente._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Expediente 1950", nivelDescripcion: "expediente", padreId: null }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).padreId, null);

  // --- nivelAcceso: opcional, default null, valores fuera del enum se rechazan ---
  res = await fetch(`${base}/api/archivos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Carta sin nivel de acceso" }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).nivelAcceso, null);

  res = await fetch(`${base}/api/archivos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Carta confidencial", nivelAcceso: "confidencial" }),
  });
  assert.equal(res.status, 201);
  const cartaConfidencial = await res.json();
  assert.equal(cartaConfidencial.nivelAcceso, "confidencial");

  res = await fetch(`${base}/api/archivos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Carta con nivel inventado", nivelAcceso: "no-existe" }),
  });
  assert.equal(res.status, 400);
});

test("ISBN/ISSN: validación de dígito verificador al crear y editar (ver BIBL-4 y ARQ-12)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");
  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Checksum", codigo: "bpchecksum" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpchecksum", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bpchecksum", "clavesegura1");

  // --- crear un libro con ISBN inválido: 400 claro, no 201 ---
  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Libro con ISBN inventado", isbn: "123-456" }),
  });
  assert.equal(res.status, 400);

  // --- crear con ISBN válido: sigue funcionando como siempre ---
  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Ficciones", isbn: "978-950-07-0001-6" }),
  });
  assert.equal(res.status, 201);
  const libro = await res.json();
  assert.equal(libro.isbn, "978-950-07-0001-6");

  // --- editar con un ISBN inválido: 400 claro, la request NO se cuelga ni
  // tira abajo el servidor (ver ARQ-12 — antes de ese arreglo, este mismo
  // caso quedaba como una promesa de validación rechazada sin capturar) ---
  res = await fetch(`${base}/api/libros/${libro._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Ficciones", isbn: "978-950-07-0001-9" }),
  });
  assert.equal(res.status, 400);

  // --- el servidor sigue respondiendo con normalidad después ---
  res = await fetch(`${base}/api/libros`, { headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 200);

  // --- misma validación para ISSN en Seriadas ---
  res = await fetch(`${base}/api/seriadas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Revista Inválida", issn: "1234-5678", periodicidad: "mensual" }),
  });
  assert.equal(res.status, 400);
});

test("exportar /marcxml/seriadas y /marcxml/recursosElectronicos generan XML descargable, sin tocar /marcxml (Libro)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");
  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca export nuevo", codigo: "bpexportnuevo" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpexportnuevo", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bpexportnuevo", "clavesegura1");

  // --- sin datos cargados, cada endpoint nuevo da 404 con su propio mensaje (igual que /marcxml) ---
  res = await fetch(`${base}/api/export/marcxml/seriadas`, { headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 404);
  res = await fetch(`${base}/api/export/marcxml/recursosElectronicos`, { headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 404);

  await fetch(`${base}/api/seriadas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Revista Export", issn: "0025-5629", periodicidad: "mensual" }),
  });
  await fetch(`${base}/api/recursosElectronicos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Recurso Export", tipoRecurso: "pdf", urlAcceso: "https://ejemplo.org/x.pdf" }),
  });

  res = await fetch(`${base}/api/export/marcxml/seriadas`, { headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/marcxml+xml; charset=utf-8");
  const xmlSeriadas = await res.text();
  assert.match(xmlSeriadas, /Revista Export/);
  assert.match(xmlSeriadas, /0025-5629/);

  res = await fetch(`${base}/api/export/marcxml/recursosElectronicos`, { headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 200);
  const xmlRecursos = await res.text();
  assert.match(xmlRecursos, /Recurso Export/);
  assert.match(xmlRecursos, /https:\/\/ejemplo\.org\/x\.pdf/);

  // --- /marcxml (Libro) sigue con su propio mensaje 404 sin datos, sin interferencia de los endpoints nuevos ---
  res = await fetch(`${base}/api/export/marcxml`, { headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "No hay libros cargados todavía.");
});

test("migración item polimórfico: Ejemplar/Prestamo/Solicitud con la forma vieja (solo libroId) quedan consultables por itemTipo/itemId", async () => {
  const bibliotecaId = new mongoose.Types.ObjectId();
  const libroId = new mongoose.Types.ObjectId();
  const socioId = new mongoose.Types.ObjectId();

  // Documentos insertados directo por el driver (no vía Mongoose): el
  // schema actual ya no acepta guardar sin itemTipo/itemId, así que esta es
  // la única forma de simular datos reales creados antes de esta migración.
  const { insertedId: ejemplarId } = await Ejemplar.collection.insertOne({
    bibliotecaId,
    libroId,
    codigoBarras: "MIGR-000001",
    signatura: "000 MIG",
    estado: "disponible",
  });
  const { insertedId: prestamoId } = await Prestamo.collection.insertOne({
    bibliotecaId,
    socioId,
    libroId,
    ejemplarId,
    fechaEntrega: new Date(),
    fechaVencimiento: new Date(),
    fechaDevolucion: null,
    renovaciones: 0,
  });
  const { insertedId: solicitudId } = await Solicitud.collection.insertOne({
    bibliotecaId,
    socioId,
    tipo: "prestamo",
    libroId,
    estado: "pendiente",
    fechaSolicitud: new Date(),
  });
  // "Contaminante" a propósito: una solicitud de renovación real, que nunca
  // tuvo libroId ni itemId (no le corresponde — ver Solicitud.js). Si el
  // filtro de migración alguna vez vuelve a quedar mal (ver el comentario
  // sobre strictQuery en migrar-item-polimorfico.js), esta migraría también
  // por error, quedando con un itemTipo inventado.
  const { insertedId: solicitudRenovacionId } = await Solicitud.collection.insertOne({
    bibliotecaId,
    socioId,
    tipo: "renovacion",
    prestamoId,
    estado: "pendiente",
    fechaSolicitud: new Date(),
  });

  await migrarColeccion(Ejemplar, "Ejemplar");
  await migrarColeccion(Prestamo, "Prestamo");
  await migrarColeccion(Solicitud, "Solicitud");

  const ejemplarMigrado = await Ejemplar.findById(ejemplarId);
  assert.equal(ejemplarMigrado.itemTipo, "Libro");
  assert.equal(String(ejemplarMigrado.itemId), String(libroId));

  const prestamoMigrado = await Prestamo.findById(prestamoId);
  assert.equal(prestamoMigrado.itemTipo, "Libro");
  assert.equal(String(prestamoMigrado.itemId), String(libroId));

  const solicitudMigrada = await Solicitud.findById(solicitudId);
  assert.equal(solicitudMigrada.itemTipo, "Libro");
  assert.equal(String(solicitudMigrada.itemId), String(libroId));

  // La solicitud de renovación (nunca tuvo libroId) no debe verse tocada
  // por la migración — ni itemTipo ni itemId deberían aparecer en ella.
  const solicitudRenovacionSinTocar = await Solicitud.findById(solicitudRenovacionId);
  assert.equal(solicitudRenovacionSinTocar.itemTipo, undefined);
  assert.equal(solicitudRenovacionSinTocar.itemId, undefined);

  // Idempotente: correrla de nuevo no debería migrar nada más (ya no quedan
  // documentos con libroId pero sin itemId).
  const segundaCorrida = await migrarColeccion(Ejemplar, "Ejemplar");
  assert.equal(segundaCorrida.migrados, 0);
});

test("migración de roles: una cuenta vieja con rol 'biblioteca' se renombra a 'superbibliotecario'", async () => {
  // Documento insertado directo por el driver: el schema actual ya no
  // acepta "biblioteca" como rol válido, así que esta es la única forma de
  // simular una cuenta real creada antes de esta migración.
  const { insertedId: cuentaId } = await Usuario.collection.insertOne({
    usuario: `cuentavieja${Date.now()}`,
    passwordHash: "hash-de-prueba",
    rol: "biblioteca",
    bibliotecaId: new mongoose.Types.ObjectId(),
    creado: new Date(),
  });

  const resultado = await migrarRolesJerarquia(Usuario);
  assert.ok(resultado.migrados >= 1);

  const cuentaMigrada = await Usuario.findById(cuentaId);
  assert.equal(cuentaMigrada.rol, "superbibliotecario");

  // Idempotente: correrla de nuevo no debería tocar nada más.
  const segundaCorrida = await migrarRolesJerarquia(Usuario);
  assert.equal(segundaCorrida.migrados, 0);
});

test("jerarquía de roles: admin→supervisor→biblioteca+superbibliotecario→bibliotecario con permisos parciales, y las violaciones se rechazan en ambos sentidos", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  // --- admin crea un supervisor con puedeCrearBibliotecas ---
  let res = await fetch(`${base}/api/supervisores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "superv1", password: "clavesegura1", puedeCrearBibliotecas: true }),
  });
  assert.equal(res.status, 201);
  const supervisor = await res.json();
  assert.equal(supervisor.puedeCrearBibliotecas, true);

  const cookieSupervisor = await login(base, "superv1", "clavesegura1");

  // --- supervisor crea una biblioteca (permitido: tiene puedeCrearBibliotecas) ---
  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisor },
    body: JSON.stringify({ nombre: "Biblioteca del Supervisor", codigo: "bpsuperv1" }),
  });
  assert.equal(res.status, 201);
  const biblioteca = await res.json();

  // --- queda automáticamente en su alcance: puede crearle un superbibliotecario ---
  res = await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisor },
    body: JSON.stringify({ usuario: "superbib1", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  assert.equal(res.status, 201);

  const cookieSuperbib = await login(base, "superbib1", "clavesegura1");

  // --- superbibliotecario crea un bibliotecario con permisos parciales ---
  res = await fetch(`${base}/api/bibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSuperbib },
    body: JSON.stringify({
      usuario: "bib1",
      password: "clavesegura1",
      permisos: { catalogar: true, prestamos: false, devoluciones: false, socios: false, exportar: false },
    }),
  });
  assert.equal(res.status, 201);

  const cookieBib = await login(base, "bib1", "clavesegura1");

  // --- bibliotecario puede catalogar (tiene el permiso) ---
  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBib },
    body: JSON.stringify({ titulo: "Libro de bib1" }),
  });
  assert.equal(res.status, 201);

  // --- bibliotecario NO puede registrar un préstamo directo (no tiene "prestamos") ---
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBib },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 403);

  // --- bibliotecario NO puede exportar (no tiene "exportar") ---
  res = await fetch(`${base}/api/export/marcxml`, { headers: { Cookie: cookieBib } });
  assert.equal(res.status, 403);

  // --- violaciones de jerarquía, ambos sentidos ---

  const cuentaAdmin = await Usuario.findOne({ usuario: "admin" });
  res = await fetch(`${base}/api/usuarios/${cuentaAdmin._id}`, {
    method: "DELETE",
    headers: { Cookie: cookieSupervisor },
  });
  assert.equal(res.status, 403); // supervisor no puede tocar al admin

  res = await fetch(`${base}/api/usuarios/${supervisor.id}`, {
    method: "DELETE",
    headers: { Cookie: cookieSuperbib },
  });
  assert.equal(res.status, 403); // superbibliotecario no puede tocar a un supervisor

  const cuentaBib = await Usuario.findOne({ usuario: "bib1" });
  res = await fetch(`${base}/api/usuarios/${cuentaBib._id}`, {
    method: "DELETE",
    headers: { Cookie: cookieBib },
  });
  assert.equal(res.status, 403); // bibliotecario no gestiona ninguna cuenta, ni la propia

  // --- pero sí puede el admin, que está por encima de todos ---
  res = await fetch(`${base}/api/usuarios/${cuentaBib._id}`, { method: "DELETE", headers: { Cookie: cookieAdmin } });
  assert.equal(res.status, 200);

  // --- un supervisor no puede crear un superbibliotecario fuera de su alcance ---
  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca ajena", codigo: "bpajenaj1" }),
  });
  const bibliotecaAjena = await res.json();
  res = await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisor },
    body: JSON.stringify({ usuario: "intento-ajeno", password: "clavesegura1", bibliotecaId: bibliotecaAjena._id }),
  });
  assert.equal(res.status, 403);

  // --- un supervisor SIN puedeCrearBibliotecas no puede crear una biblioteca ---
  res = await fetch(`${base}/api/supervisores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "superv2", password: "clavesegura1", puedeCrearBibliotecas: false }),
  });
  assert.equal(res.status, 201);
  const cookieSupervisor2 = await login(base, "superv2", "clavesegura1");
  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisor2 },
    body: JSON.stringify({ nombre: "No debería poder", codigo: "bpnodeberia" }),
  });
  assert.equal(res.status, 403);
});

test("solicitudes de supervisión: un supervisor pide acceso a una biblioteca ajena y el admin la aprueba o la rechaza", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  // --- admin crea dos bibliotecas y un supervisor sin ninguna asignada ---
  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca A", codigo: "bpsolica" }),
  });
  const bibliotecaA = await res.json();

  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca B", codigo: "bpsolicb" }),
  });
  const bibliotecaB = await res.json();

  res = await fetch(`${base}/api/supervisores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "solicitante1", password: "clavesegura1" }),
  });
  assert.equal(res.status, 201);
  const cookieSolicitante = await login(base, "solicitante1", "clavesegura1");

  // --- todavía no supervisa nada: las dos aparecen entre las disponibles
  // (no se compara la cantidad total: este archivo comparte un solo Mongo
  // entre todos los tests, así que ya existen bibliotecas de tests previos) ---
  res = await fetch(`${base}/api/bibliotecas/disponibles-para-supervisar`, {
    headers: { Cookie: cookieSolicitante },
  });
  assert.equal(res.status, 200);
  let disponibles = await res.json();
  const idsDisponibles = disponibles.map((b) => b._id);
  assert.ok(idsDisponibles.includes(bibliotecaA._id));
  assert.ok(idsDisponibles.includes(bibliotecaB._id));

  // --- pide supervisar la biblioteca A: queda pendiente, no se le otorga sola ---
  res = await fetch(`${base}/api/solicitudes-supervision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSolicitante },
    body: JSON.stringify({ bibliotecaId: bibliotecaA._id }),
  });
  assert.equal(res.status, 201);
  const solicitud = await res.json();
  assert.equal(solicitud.estado, "pendiente");

  res = await fetch(`${base}/api/bibliotecas`, { headers: { Cookie: cookieSolicitante } });
  assert.deepEqual(await res.json(), []); // todavía no tiene ninguna en su alcance

  // --- pedir la misma de nuevo mientras está pendiente: rechazado ---
  res = await fetch(`${base}/api/solicitudes-supervision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSolicitante },
    body: JSON.stringify({ bibliotecaId: bibliotecaA._id }),
  });
  assert.equal(res.status, 409);

  // --- el propio supervisor ve el estado de su solicitud ---
  res = await fetch(`${base}/api/solicitudes-supervision/mias`, { headers: { Cookie: cookieSolicitante } });
  let mias = await res.json();
  assert.equal(mias.length, 1);
  assert.equal(mias[0].estado, "pendiente");
  assert.equal(mias[0].bibliotecaId.nombre, "Biblioteca A");

  // --- un rol que no es supervisor no puede pedir nada ---
  res = await fetch(`${base}/api/solicitudes-supervision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ bibliotecaId: bibliotecaB._id }),
  });
  assert.equal(res.status, 403);

  // --- el admin ve la pendiente y la aprueba ---
  res = await fetch(`${base}/api/solicitudes-supervision?estado=pendiente`, { headers: { Cookie: cookieAdmin } });
  const pendientes = await res.json();
  assert.equal(pendientes.length, 1);

  res = await fetch(`${base}/api/solicitudes-supervision/${solicitud._id}/aprobar`, {
    method: "POST",
    headers: { Cookie: cookieAdmin },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).estado, "aprobada");

  // --- recién ahora la tiene en su alcance de verdad ---
  res = await fetch(`${base}/api/bibliotecas`, { headers: { Cookie: cookieSolicitante } });
  const propias = await res.json();
  assert.equal(propias.length, 1);
  assert.equal(propias[0]._id, bibliotecaA._id);

  // --- pedir supervisar una que ya supervisa: rechazado ---
  res = await fetch(`${base}/api/solicitudes-supervision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSolicitante },
    body: JSON.stringify({ bibliotecaId: bibliotecaA._id }),
  });
  assert.equal(res.status, 409);

  // --- pide la B y el admin la rechaza: no se le otorga ---
  res = await fetch(`${base}/api/solicitudes-supervision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSolicitante },
    body: JSON.stringify({ bibliotecaId: bibliotecaB._id }),
  });
  const solicitudB = await res.json();

  res = await fetch(`${base}/api/solicitudes-supervision/${solicitudB._id}/rechazar`, {
    method: "POST",
    headers: { Cookie: cookieAdmin },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).estado, "rechazada");

  res = await fetch(`${base}/api/bibliotecas`, { headers: { Cookie: cookieSolicitante } });
  assert.equal((await res.json()).length, 1); // sigue siendo solo la A

  // --- un supervisor no puede aprobar/rechazar (ni siquiera la propia) ---
  res = await fetch(`${base}/api/solicitudes-supervision/${solicitudB._id}/aprobar`, {
    method: "POST",
    headers: { Cookie: cookieSolicitante },
  });
  assert.equal(res.status, 403);
});

test("renovación directa del staff: POST /circulacion/prestamos/:id/renovar (sin pasar por una solicitud del socio)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");
  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca renovar", codigo: "bprenovar" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bprenovar", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bprenovar", "clavesegura1");

  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Libro a renovar", ejemplares: [{ codigoBarras: "BPREN-1", signatura: "1" }] }),
  });
  const libro = await res.json();

  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ numeroSocio: "0001", apellido: "Renovadora", nombre: "Rita" }),
  });
  const socio = await res.json();

  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: socio._id, itemTipo: "Libro", itemId: libro._id }),
  });
  const prestamo = await res.json();
  assert.equal(prestamo.renovaciones, 0);
  const vencimientoOriginal = new Date(prestamo.fechaVencimiento).getTime();

  // --- renovar directo: sube renovaciones y corre el vencimiento, sin que el socio haya pedido nada ---
  res = await fetch(`${base}/api/circulacion/prestamos/${prestamo._id}/renovar`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 200);
  const renovado = await res.json();
  assert.equal(renovado.renovaciones, 1);
  assert.ok(new Date(renovado.fechaVencimiento).getTime() >= vencimientoOriginal);

  // --- default de la biblioteca es maxRenovaciones=2: una segunda renovación entra, la tercera no ---
  res = await fetch(`${base}/api/circulacion/prestamos/${prestamo._id}/renovar`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).renovaciones, 2);

  res = await fetch(`${base}/api/circulacion/prestamos/${prestamo._id}/renovar`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 409);

  // --- una vez devuelto, ya no se puede renovar ---
  res = await fetch(`${base}/api/circulacion/prestamos/${prestamo._id}/devolucion`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/api/circulacion/prestamos/${prestamo._id}/renovar`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 409);
});

test("configuración de circulación por biblioteca: PUT /bibliotecas/:id/circulacion respeta rango/alcance y afecta préstamos nuevos", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca config", codigo: "bpconfig" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpconfig", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bpconfig", "clavesegura1");

  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca ajena a config", codigo: "bpconfigajena" }),
  });
  const bibliotecaAjena = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpconfigajena", password: "clavesegura1", bibliotecaId: bibliotecaAjena._id }),
  });

  // --- el superbibliotecario de OTRA biblioteca no puede ni ver ni configurar esta ---
  const cookieAjena = await login(base, "bpconfigajena", "clavesegura1");
  res = await fetch(`${base}/api/bibliotecas/${biblioteca._id}`, { headers: { Cookie: cookieAjena } });
  assert.equal(res.status, 403);
  res = await fetch(`${base}/api/bibliotecas/${biblioteca._id}/circulacion`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieAjena },
    body: JSON.stringify({ diasPrestamo: 3 }),
  });
  assert.equal(res.status, 403);

  // --- el propio superbibliotecario sí puede ver los valores por defecto ---
  res = await fetch(`${base}/api/bibliotecas/${biblioteca._id}`, { headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 200);
  const original = await res.json();
  assert.equal(original.diasPrestamo, 14);
  assert.equal(original.maxRenovaciones, 2);

  // --- y configurarla ---
  res = await fetch(`${base}/api/bibliotecas/${biblioteca._id}/circulacion`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      diasPrestamo: 3,
      maxRenovaciones: 0,
      multaPorDiaVencido: 10,
      contarSabados: false,
      contarDomingos: false,
    }),
  });
  assert.equal(res.status, 200);
  const actualizada = await res.json();
  assert.equal(actualizada.diasPrestamo, 3);
  assert.equal(actualizada.maxRenovaciones, 0);
  assert.equal(actualizada.contarSabados, false);
  assert.equal(actualizada.contarDomingos, false);

  // --- un préstamo nuevo ya usa diasPrestamo=3 y respeta días hábiles ---
  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ titulo: "Libro con config nueva", ejemplares: [{ codigoBarras: "BPCFG-1", signatura: "1" }] }),
  });
  const libro = await res.json();
  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ numeroSocio: "0001", apellido: "Config", nombre: "Cora" }),
  });
  const socio = await res.json();
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: socio._id, itemTipo: "Libro", itemId: libro._id }),
  });
  const prestamo = await res.json();
  const dias = (new Date(prestamo.fechaVencimiento).getTime() - new Date(prestamo.fechaEntrega).getTime()) / 86400000;
  assert.ok(dias >= 3, `esperaba al menos 3 días de vencimiento (posiblemente más si cruza fin de semana), dio ${dias}`);

  // --- maxRenovaciones=0: ni siquiera la primera renovación entra ---
  res = await fetch(`${base}/api/circulacion/prestamos/${prestamo._id}/renovar`, {
    method: "POST",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 409);

  // --- admin también puede configurar cualquier biblioteca ---
  res = await fetch(`${base}/api/bibliotecas/${biblioteca._id}/circulacion`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ diasPrestamo: 21 }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).diasPrestamo, 21);

  // --- un bibliotecario (permisos individuales) no puede tocar la configuración ---
  res = await fetch(`${base}/api/bibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      usuario: "bibconfig",
      password: "clavesegura1",
      permisos: { catalogar: true, prestamos: true, devoluciones: true, socios: true, exportar: true },
    }),
  });
  assert.equal(res.status, 201);
  const cookieBib = await login(base, "bibconfig", "clavesegura1");
  res = await fetch(`${base}/api/bibliotecas/${biblioteca._id}/circulacion`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieBib },
    body: JSON.stringify({ diasPrestamo: 1 }),
  });
  assert.equal(res.status, 403);
});

test("reserva de ejemplar al solicitar: el catálogo lo muestra no disponible ya desde que queda pendiente, y se libera si se rechaza", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Reserva", codigo: "bpreserva" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpreserva", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bpreserva", "clavesegura1");

  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      titulo: "El Aleph",
      autores: ["Borges, Jorge Luis"],
      ejemplares: [{ codigoBarras: "BPR-0001", signatura: "863 BOR" }],
    }),
  });
  const libro = await res.json();

  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ numeroSocio: "0001", apellido: "Gómez", nombre: "Lucía" }),
  });
  const socio = await res.json();
  await fetch(`${base}/api/socios/${socio._id}/credenciales`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ password: "clavesociosegura" }),
  });
  const cookieSocio = extraerCookie(
    await fetch(`${base}/api/opac/bpreserva/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numeroSocio: "0001", password: "clavesociosegura" }),
    })
  );

  // --- antes de solicitar, el catálogo muestra el ejemplar disponible ---
  res = await fetch(`${base}/api/opac/bpreserva/libros`);
  assert.equal((await res.json())[0].ejemplaresDisponibles, 1);

  // --- socio solicita: el ejemplar queda "reservado" ya mismo, no recién al aprobar ---
  res = await fetch(`${base}/api/opac/bpreserva/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio },
    body: JSON.stringify({ tipo: "prestamo", itemTipo: "Libro", itemId: libro._id }),
  });
  assert.equal(res.status, 201);
  const solicitud = await res.json();
  assert.ok(solicitud.ejemplarId, "la solicitud debe guardar qué ejemplar puntual reservó");

  res = await fetch(`${base}/api/opac/bpreserva/libros`);
  assert.equal(
    (await res.json())[0].ejemplaresDisponibles,
    0,
    "mientras la solicitud está pendiente, el catálogo ya no debería ofrecerlo"
  );

  // --- un segundo socio no puede pedirlo mientras el primero está pendiente ---
  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ numeroSocio: "0002", apellido: "Díaz", nombre: "Martín" }),
  });
  const socio2 = await res.json();
  await fetch(`${base}/api/socios/${socio2._id}/credenciales`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ password: "clavesociosegura2" }),
  });
  const cookieSocio2 = extraerCookie(
    await fetch(`${base}/api/opac/bpreserva/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numeroSocio: "0002", password: "clavesociosegura2" }),
    })
  );
  res = await fetch(`${base}/api/opac/bpreserva/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio2 },
    body: JSON.stringify({ tipo: "prestamo", itemTipo: "Libro", itemId: libro._id }),
  });
  assert.equal(res.status, 409);

  // --- el staff rechaza la primera: el ejemplar vuelve a estar disponible ---
  res = await fetch(`${base}/api/circulacion/solicitudes/${solicitud._id}/rechazar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/api/opac/bpreserva/libros`);
  assert.equal(
    (await res.json())[0].ejemplaresDisponibles,
    1,
    "rechazar la solicitud debe liberar el ejemplar reservado"
  );

  // --- ahora el segundo socio sí puede pedirlo, y el staff lo aprueba con ese mismo ejemplar ---
  res = await fetch(`${base}/api/opac/bpreserva/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio2 },
    body: JSON.stringify({ tipo: "prestamo", itemTipo: "Libro", itemId: libro._id }),
  });
  assert.equal(res.status, 201);
  const solicitud2 = await res.json();

  res = await fetch(`${base}/api/circulacion/solicitudes/${solicitud2._id}/aprobar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
  });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/api/opac/bpreserva/mis-prestamos`, { headers: { Cookie: cookieSocio2 } });
  const misPrestamos = await res.json();
  assert.equal(misPrestamos.length, 1);
  assert.equal(misPrestamos[0].item.titulo, "El Aleph");

  res = await fetch(`${base}/api/opac/bpreserva/libros`);
  assert.equal((await res.json())[0].ejemplaresDisponibles, 0, "ahora sí está prestado de verdad");
});

test("admin y supervisor pueden operar el catálogo/socios/préstamos de cualquier biblioteca en su alcance vía ?bibliotecaId=", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Cruzada", codigo: "bpcruzada" }),
  });
  const biblioteca = await res.json();

  // --- sin bibliotecaId, admin no puede usar estas rutas (no tiene una propia) ---
  res = await fetch(`${base}/api/libros`, { headers: { Cookie: cookieAdmin } });
  assert.equal(res.status, 400);

  // --- con bibliotecaId, el admin puede catalogar directamente en esa biblioteca ---
  res = await fetch(`${base}/api/libros?bibliotecaId=${biblioteca._id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ titulo: "Libro cargado por el admin" }),
  });
  assert.equal(res.status, 201);

  res = await fetch(`${base}/api/libros?bibliotecaId=${biblioteca._id}`, { headers: { Cookie: cookieAdmin } });
  const libros = await res.json();
  assert.equal(libros.length, 1);
  assert.equal(libros[0].titulo, "Libro cargado por el admin");

  // --- un supervisor SIN esta biblioteca en su alcance recibe 403 ---
  await fetch(`${base}/api/supervisores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "supcruzada", password: "clavesegura1", bibliotecasSupervisadas: [] }),
  });
  const cookieSupervisor = await login(base, "supcruzada", "clavesegura1");

  res = await fetch(`${base}/api/libros?bibliotecaId=${biblioteca._id}`, { headers: { Cookie: cookieSupervisor } });
  assert.equal(res.status, 403);

  // --- el admin le otorga el alcance sobre esta biblioteca ---
  res = await fetch(`${base}/api/supervisores`, { headers: { Cookie: cookieAdmin } });
  const supervisorId = (await res.json()).find((s) => s.usuario === "supcruzada")._id;
  await fetch(`${base}/api/supervisores/${supervisorId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ bibliotecasSupervisadas: [biblioteca._id] }),
  });

  // --- ahora sí puede ver/catalogar, y también registrar un préstamo y ver socios ---
  res = await fetch(`${base}/api/libros?bibliotecaId=${biblioteca._id}`, { headers: { Cookie: cookieSupervisor } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).length, 1);

  res = await fetch(`${base}/api/socios?bibliotecaId=${biblioteca._id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisor },
    body: JSON.stringify({ numeroSocio: "0001", apellido: "Ríos", nombre: "Pablo" }),
  });
  assert.equal(res.status, 201);
  const socio = await res.json();

  res = await fetch(`${base}/api/libros?bibliotecaId=${biblioteca._id}`, { headers: { Cookie: cookieSupervisor } });
  const libroId = (await res.json())[0]._id;
  await fetch(`${base}/api/libros/${libroId}/ejemplares?bibliotecaId=${biblioteca._id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisor },
    body: JSON.stringify({ ejemplares: [{ codigoBarras: "BPX-0001", signatura: "863 XXX" }] }),
  });

  res = await fetch(`${base}/api/circulacion/prestamos?bibliotecaId=${biblioteca._id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisor },
    body: JSON.stringify({ socioId: socio._id, itemTipo: "Libro", itemId: libroId }),
  });
  assert.equal(res.status, 201, "el supervisor con esta biblioteca en su alcance debería poder registrar el préstamo");

  // --- otra biblioteca ajena sigue fuera de su alcance ---
  res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Ajena", codigo: "bpajena2" }),
  });
  const bibliotecaAjena = await res.json();
  res = await fetch(`${base}/api/libros?bibliotecaId=${bibliotecaAjena._id}`, { headers: { Cookie: cookieSupervisor } });
  assert.equal(res.status, 403);

  // --- bibliotecaId con forma inválida da 400, no un 500 ---
  res = await fetch(`${base}/api/libros?bibliotecaId=no-es-un-id`, { headers: { Cookie: cookieAdmin } });
  assert.equal(res.status, 400);
});

test("carga masiva de Libros por CSV: /api/libros/plantilla-csv y /api/libros/importar-csv", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca CSV", codigo: "bpcsv" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpcsv", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bpcsv", "clavesegura1");

  // --- la plantilla se descarga como CSV con encabezado ---
  res = await fetch(`${base}/api/libros/plantilla-csv`, { headers: { Cookie: cookieStaff } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/csv/);
  const plantilla = await res.text();
  assert.match(plantilla, /^titulo,subtitulo,isbn,autores/);

  // --- importar dos filas válidas (una con ejemplares) y una inválida (sin título) ---
  const csv = [
    "titulo,autores,materias,subtipo,notas,ejemplares",
    '"Ficciones","Borges, Jorge Luis",Literatura;Cuentos,impreso,Primera edición,"BPCSV-0001,863 BOR;BPCSV-0002,863 BOR"',
    '"Rayuela","Cortázar, Julio",Literatura,impreso,,',
    ",,,,Falta título en esta fila,",
  ].join("\n");

  res = await fetch(`${base}/api/libros/importar-csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ csv }),
  });
  assert.equal(res.status, 201);
  const resultado = await res.json();
  assert.equal(resultado.creados, 2);
  assert.equal(resultado.errores.length, 1);
  assert.equal(resultado.errores[0].fila, 4);

  res = await fetch(`${base}/api/libros`, { headers: { Cookie: cookieStaff } });
  const libros = await res.json();
  assert.equal(libros.length, 2);
  const ficciones = libros.find((l) => l.titulo === "Ficciones");
  assert.deepEqual(ficciones.autores, ["Borges, Jorge Luis"]);
  assert.deepEqual(ficciones.materias, ["Literatura", "Cuentos"]);
  assert.equal(ficciones.ejemplares.length, 2, "la fila con ejemplares debe crear sus 2 copias");
  assert.deepEqual(
    ficciones.ejemplares.map((e) => e.codigoBarras).sort(),
    ["BPCSV-0001", "BPCSV-0002"]
  );
  const rayuela = libros.find((l) => l.titulo === "Rayuela");
  assert.equal(rayuela.ejemplares.length, 0, "sin columna de ejemplares completada, no crea ninguno");

  // --- código de barras ya usado en la biblioteca: la fila entera se
  // deshace (no queda un libro sin sus ejemplares) y se reporta como error ---
  res = await fetch(`${base}/api/libros/importar-csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ csv: 'titulo,ejemplares\n"Otro libro","BPCSV-0001,863 XXX"' }),
  });
  assert.equal(res.status, 200);
  const resultadoDuplicado = await res.json();
  assert.equal(resultadoDuplicado.creados, 0);
  assert.equal(resultadoDuplicado.errores.length, 1);
  res = await fetch(`${base}/api/libros`, { headers: { Cookie: cookieStaff } });
  assert.equal((await res.json()).length, 2, "el libro con código de barras duplicado no debe quedar creado");

  // --- un subtipo no reconocido no hace fallar la fila: se crea igual con
  // el default del schema ("impreso") y queda un aviso, no un error ---
  res = await fetch(`${base}/api/libros/importar-csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ csv: "titulo,subtipo\nTítulo con subtipo inexistente,Novela" }),
  });
  assert.equal(res.status, 201);
  const resultadoSubtipoRaro = await res.json();
  assert.equal(resultadoSubtipoRaro.creados, 1);
  assert.equal(resultadoSubtipoRaro.errores.length, 0);
  assert.equal(resultadoSubtipoRaro.avisos.length, 1);
  assert.match(resultadoSubtipoRaro.avisos[0].mensaje, /Novela/);
  res = await fetch(`${base}/api/libros?q=subtipo inexistente`, { headers: { Cookie: cookieStaff } });
  const libroSubtipoRaro = (await res.json())[0];
  assert.equal(libroSubtipoRaro.subtipo, "impreso");

  // --- si TODAS las filas fallan de verdad (ej. a todas les falta el
  // título), sigue siendo 200 (no 400): la importación se procesó igual, y
  // el cliente necesita el cuerpo con los errores por fila para mostrarlos
  // (un 400 sin campo "error" hacía que el frontend los descartara y
  // mostrara solo "Error 400") ---
  res = await fetch(`${base}/api/libros/importar-csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ csv: "titulo,subtipo\n,impreso" }),
  });
  assert.equal(res.status, 200);
  const resultadoTodoInvalido = await res.json();
  assert.equal(resultadoTodoInvalido.creados, 0);
  assert.equal(resultadoTodoInvalido.errores.length, 1);
  assert.match(resultadoTodoInvalido.errores[0].mensaje, /título/);

  // --- un bibliotecario sin permiso "catalogar" no puede importar ---
  res = await fetch(`${base}/api/bibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      usuario: "bibcsv",
      password: "clavesegura1",
      permisos: { catalogar: false, prestamos: true, devoluciones: true, socios: true, exportar: true },
    }),
  });
  assert.equal(res.status, 201);
  const cookieBib = await login(base, "bibcsv", "clavesegura1");
  res = await fetch(`${base}/api/libros/importar-csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBib },
    body: JSON.stringify({ csv }),
  });
  assert.equal(res.status, 403);
});

test("gestión individual de ejemplares desde la edición de un libro: PUT/DELETE /libros/:id/ejemplares/:ejemplarId", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Ejemplares", codigo: "bpejem" }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpejem", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieStaff = await login(base, "bpejem", "clavesegura1");

  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      titulo: "Rayuela",
      ejemplares: [
        { codigoBarras: "BPEJ-0001", signatura: "863 COR" },
        { codigoBarras: "BPEJ-0002", signatura: "863 COR" },
      ],
    }),
  });
  const libro = await res.json();
  assert.equal(libro.ejemplares.length, 2);
  const [ejemplar1, ejemplar2] = libro.ejemplares;

  // --- editar código de barras y signatura ---
  res = await fetch(`${base}/api/libros/${libro._id}/ejemplares/${ejemplar1._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ codigoBarras: "BPEJ-0001-B", signatura: "863 COR ej.1" }),
  });
  assert.equal(res.status, 200);
  const editado = await res.json();
  assert.equal(editado.codigoBarras, "BPEJ-0001-B");
  assert.equal(editado.signatura, "863 COR ej.1");

  // --- código de barras duplicado (ya usado por el otro ejemplar) da 409 ---
  res = await fetch(`${base}/api/libros/${libro._id}/ejemplares/${ejemplar2._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ codigoBarras: "BPEJ-0001-B" }),
  });
  assert.equal(res.status, 409);

  // --- agregar un ejemplar nuevo desde la edición ---
  res = await fetch(`${base}/api/libros/${libro._id}/ejemplares`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ ejemplares: [{ codigoBarras: "BPEJ-0003", signatura: "863 COR ej.3" }] }),
  });
  assert.equal(res.status, 201);
  const [ejemplar3] = await res.json();

  // --- eliminar un ejemplar disponible funciona ---
  res = await fetch(`${base}/api/libros/${libro._id}/ejemplares/${ejemplar3._id}`, {
    method: "DELETE",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 200);

  // --- un ejemplar prestado no se puede eliminar ---
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      socioId: (
        await (
          await fetch(`${base}/api/socios`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookieStaff },
            body: JSON.stringify({ numeroSocio: "0001", apellido: "Pérez", nombre: "Ana" }),
          })
        ).json()
      )._id,
      itemTipo: "Libro",
      itemId: libro._id,
      ejemplarId: ejemplar2._id,
    }),
  });
  assert.equal(res.status, 201);
  res = await fetch(`${base}/api/libros/${libro._id}/ejemplares/${ejemplar2._id}`, {
    method: "DELETE",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 409);

  // --- ejemplar/libro inexistente o de otra biblioteca da 404 ---
  res = await fetch(`${base}/api/libros/${libro._id}/ejemplares/507f1f77bcf86cd799439011`, {
    method: "DELETE",
    headers: { Cookie: cookieStaff },
  });
  assert.equal(res.status, 404);

  // --- un bibliotecario sin permiso "catalogar" no puede editar ni eliminar ejemplares ---
  res = await fetch(`${base}/api/bibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({
      usuario: "bibejem",
      password: "clavesegura1",
      permisos: { catalogar: false, prestamos: true, devoluciones: true, socios: true, exportar: true },
    }),
  });
  const cookieBibEjem = await login(base, "bibejem", "clavesegura1");
  res = await fetch(`${base}/api/libros/${libro._id}/ejemplares/${ejemplar1._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieBibEjem },
    body: JSON.stringify({ signatura: "otra" }),
  });
  assert.equal(res.status, 403);
});

test("cambiar la propia contraseña: PUT /auth/password (ver CYBER-4)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const passwordHash = await bcrypt.hash("claveOriginal1", 10);
  await Usuario.create({ usuario: "cambiapass", passwordHash, rol: "admin", bibliotecaId: null });
  const cookie = await login(base, "cambiapass", "claveOriginal1");

  // --- sin sesión, 401 ---
  let res = await fetch(`${base}/api/auth/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passwordActual: "claveOriginal1", passwordNueva: "claveNueva1" }),
  });
  assert.equal(res.status, 401);

  // --- contraseña actual incorrecta ---
  res = await fetch(`${base}/api/auth/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ passwordActual: "noEsEsta", passwordNueva: "claveNueva1" }),
  });
  assert.equal(res.status, 401);

  // --- contraseña nueva demasiado corta ---
  res = await fetch(`${base}/api/auth/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ passwordActual: "claveOriginal1", passwordNueva: "corta" }),
  });
  assert.equal(res.status, 400);

  // --- cambio correcto ---
  res = await fetch(`${base}/api/auth/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ passwordActual: "claveOriginal1", passwordNueva: "claveNueva1" }),
  });
  assert.equal(res.status, 200);

  // --- la vieja ya no sirve, la nueva sí ---
  res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "cambiapass", password: "claveOriginal1" }),
  });
  assert.equal(res.status, 401);
  res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "cambiapass", password: "claveNueva1" }),
  });
  assert.equal(res.status, 200);
});

test("el borrado (individual y en cascada) deja registro de quién lo hizo: eliminadoPor (ver CYBER-4bis)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const passwordHash = await bcrypt.hash("adminpass123", 10);
  const admin = await Usuario.create({ usuario: "adminep", passwordHash, rol: "admin", bibliotecaId: null });
  const cookieAdmin = await login(base, "adminep", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca EliminadoPor", codigo: "bpep" }),
  });
  const biblioteca = await res.json();

  res = await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpep", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const superbibliotecario = await res.json();
  const cookieBiblio = await login(base, "bpep", "clavesegura1");

  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ titulo: "Libro a borrar", autores: ["Autor"], ejemplares: [] }),
  });
  const libro = await res.json();

  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ numeroSocio: "9001", apellido: "Borrada", nombre: "Socia" }),
  });
  const socio = await res.json();

  // --- borrado individual: el superbibliotecario que lo hizo queda registrado ---
  res = await fetch(`${base}/api/libros/${libro._id}`, { method: "DELETE", headers: { Cookie: cookieBiblio } });
  assert.equal(res.status, 200);
  let libroEnDB = await Libro.findById(libro._id);
  assert.equal(String(libroEnDB.eliminadoPor), String(superbibliotecario.id));

  res = await fetch(`${base}/api/socios/${socio._id}`, { method: "DELETE", headers: { Cookie: cookieBiblio } });
  assert.equal(res.status, 200);
  let socioEnDB = await Socio.findById(socio._id);
  assert.equal(String(socioEnDB.eliminadoPor), String(superbibliotecario.id));

  // --- borrado en cascada (al eliminar la biblioteca): el admin que lo hizo queda registrado ---
  res = await fetch(`${base}/api/libros`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ titulo: "Libro huérfano", autores: ["Autor"], ejemplares: [] }),
  });
  const libro2 = await res.json();

  res = await fetch(`${base}/api/bibliotecas/${biblioteca._id}`, { method: "DELETE", headers: { Cookie: cookieAdmin } });
  assert.equal(res.status, 200);
  const libro2EnDB = await Libro.findById(libro2._id);
  assert.equal(String(libro2EnDB.eliminadoPor), String(admin._id));
});

test("catálogo de autoridades de autor: CRUD (staff) + lectura pública desde el OPAC (ver BIBL-1)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const passwordHash = await bcrypt.hash("adminpass123", 10);
  await Usuario.create({ usuario: "adminaut", passwordHash, rol: "admin", bibliotecaId: null });
  const cookieAdmin = await login(base, "adminaut", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Autores", codigo: "bpaut" }),
  });
  const biblioteca = await res.json();

  res = await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpaut", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieBiblio = await login(base, "bpaut", "clavesegura1");

  // --- sin forma autorizada, 400 ---
  res = await fetch(`${base}/api/autores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ variantes: ["algo"] }),
  });
  assert.equal(res.status, 400);

  // --- alta correcta ---
  res = await fetch(`${base}/api/autores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ formaAutorizada: "Borges, Jorge Luis", variantes: ["Borges, J.L.", "Jorge Luis Borges"] }),
  });
  assert.equal(res.status, 201);
  const autor = await res.json();
  assert.equal(autor.formaAutorizada, "Borges, Jorge Luis");
  assert.deepEqual(autor.variantes, ["Borges, J.L.", "Jorge Luis Borges"]);

  // --- forma autorizada duplicada, 409 ---
  res = await fetch(`${base}/api/autores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ formaAutorizada: "Borges, Jorge Luis" }),
  });
  assert.equal(res.status, 409);

  // --- listar ---
  res = await fetch(`${base}/api/autores`, { headers: { Cookie: cookieBiblio } });
  assert.equal(res.status, 200);
  const lista = await res.json();
  assert.equal(lista.length, 1);

  // --- editar variantes ---
  res = await fetch(`${base}/api/autores/${autor._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ variantes: ["Borges, J.L.", "Jorge Luis Borges", "J.L. Borges"] }),
  });
  assert.equal(res.status, 200);
  const autorEditado = await res.json();
  assert.equal(autorEditado.variantes.length, 3);

  // --- un bibliotecario sin permiso "catalogar" no puede crear ---
  res = await fetch(`${base}/api/bibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({
      usuario: "bibsinaut",
      password: "clavesegura1",
      permisos: { catalogar: false, prestamos: true, devoluciones: true, socios: true, exportar: true },
    }),
  });
  const cookieBibSinAut = await login(base, "bibsinaut", "clavesegura1");
  res = await fetch(`${base}/api/autores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBibSinAut },
    body: JSON.stringify({ formaAutorizada: "Otro Autor" }),
  });
  assert.equal(res.status, 403);

  // --- lectura pública desde el OPAC, sin login ---
  res = await fetch(`${base}/api/opac/${biblioteca.codigo}/autores`);
  assert.equal(res.status, 200);
  const autoresOpac = await res.json();
  assert.equal(autoresOpac.length, 1);
  assert.equal(autoresOpac[0].formaAutorizada, "Borges, Jorge Luis");
  assert.equal("_id" in autoresOpac[0], false, "el OPAC no necesita exponer el _id interno");

  // --- borrado (lógico) ---
  res = await fetch(`${base}/api/autores/${autor._id}`, { method: "DELETE", headers: { Cookie: cookieBiblio } });
  assert.equal(res.status, 200);
  res = await fetch(`${base}/api/autores`, { headers: { Cookie: cookieBiblio } });
  assert.equal((await res.json()).length, 0);
  // ...y ya no aparece en la lectura pública tampoco.
  res = await fetch(`${base}/api/opac/${biblioteca.codigo}/autores`);
  assert.equal((await res.json()).length, 0);
});

test("catálogo de autoridades de materia: CRUD (staff) + lectura pública desde el OPAC (ver BIBL-3)", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const passwordHash = await bcrypt.hash("adminpass123", 10);
  await Usuario.create({ usuario: "adminmat", passwordHash, rol: "admin", bibliotecaId: null });
  const cookieAdmin = await login(base, "adminmat", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Materias", codigo: "bpmat" }),
  });
  const biblioteca = await res.json();

  res = await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "bpmat", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookieBiblio = await login(base, "bpmat", "clavesegura1");

  // --- sin forma autorizada, 400 ---
  res = await fetch(`${base}/api/materias`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ variantes: ["algo"] }),
  });
  assert.equal(res.status, 400);

  // --- alta correcta ---
  res = await fetch(`${base}/api/materias`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({
      formaAutorizada: "Historia argentina",
      variantes: ["Historia de la Argentina", "Argentina - Historia"],
    }),
  });
  assert.equal(res.status, 201);
  const materia = await res.json();
  assert.equal(materia.formaAutorizada, "Historia argentina");
  assert.deepEqual(materia.variantes, ["Historia de la Argentina", "Argentina - Historia"]);

  // --- forma autorizada duplicada, 409 ---
  res = await fetch(`${base}/api/materias`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ formaAutorizada: "Historia argentina" }),
  });
  assert.equal(res.status, 409);

  // --- listar ---
  res = await fetch(`${base}/api/materias`, { headers: { Cookie: cookieBiblio } });
  assert.equal(res.status, 200);
  const lista = await res.json();
  assert.equal(lista.length, 1);

  // --- editar variantes ---
  res = await fetch(`${base}/api/materias/${materia._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({ variantes: ["Historia de la Argentina"] }),
  });
  assert.equal(res.status, 200);
  const materiaEditada = await res.json();
  assert.equal(materiaEditada.variantes.length, 1);

  // --- un bibliotecario sin permiso "catalogar" no puede crear ---
  res = await fetch(`${base}/api/bibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBiblio },
    body: JSON.stringify({
      usuario: "bibsinmat",
      password: "clavesegura1",
      permisos: { catalogar: false, prestamos: true, devoluciones: true, socios: true, exportar: true },
    }),
  });
  const cookieBibSinMat = await login(base, "bibsinmat", "clavesegura1");
  res = await fetch(`${base}/api/materias`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieBibSinMat },
    body: JSON.stringify({ formaAutorizada: "Otra materia" }),
  });
  assert.equal(res.status, 403);

  // --- lectura pública desde el OPAC, sin login ---
  res = await fetch(`${base}/api/opac/${biblioteca.codigo}/materias`);
  assert.equal(res.status, 200);
  const materiasOpac = await res.json();
  assert.equal(materiasOpac.length, 1);
  assert.equal(materiasOpac[0].formaAutorizada, "Historia argentina");
  assert.equal("_id" in materiasOpac[0], false, "el OPAC no necesita exponer el _id interno");

  // --- borrado (lógico) ---
  res = await fetch(`${base}/api/materias/${materia._id}`, { method: "DELETE", headers: { Cookie: cookieBiblio } });
  assert.equal(res.status, 200);
  res = await fetch(`${base}/api/materias`, { headers: { Cookie: cookieBiblio } });
  assert.equal((await res.json()).length, 0);
  // ...y ya no aparece en la lectura pública tampoco.
  res = await fetch(`${base}/api/opac/${biblioteca.codigo}/materias`);
  assert.equal((await res.json()).length, 0);
});
