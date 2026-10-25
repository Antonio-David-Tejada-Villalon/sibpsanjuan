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
import Categoria from "../src/models/Categoria.js";
import Auditoria from "../src/models/Auditoria.js";
import { migrarColeccion } from "../scripts/migrar-item-polimorfico.js";
import { migrarRolesJerarquia } from "../scripts/migrar-roles-jerarquia.js";
import { migrarCategorias } from "../scripts/migrar-categorias.js";
import { migrarPortadas } from "../scripts/migrar-portadas.js";
import Portada from "../src/models/Portada.js";
import { descargarImagen, esDireccionPublica } from "../src/portadas/descargar.js";
import http from "node:http";
import sharp from "sharp";

process.env.JWT_SECRET = "clave-de-test";
process.env.COOKIE_SECURE = "0";
// Este archivo comparte una única app (y por lo tanto un único limitador de
// login, ver middleware/rateLimit.js) entre todos sus tests — en conjunto
// hacen bastantes más de 20 logins legítimos. Sin esto, tests que no tienen
// nada que ver entre sí empiezan a fallar con 429 simplemente por venir
// "después" de otros en el mismo archivo.
process.env.LOGIN_RATE_LIMIT = "1000";
// Sin búsqueda de portadas en segundo plano al cargar libros con ISBN: iría
// a Open Library de verdad. Los tests de portadas usan fuentes falsas.
process.env.PORTADAS_AUTOMATICAS = "0";
// Sin caché del índice del OPAC: cada test carga material y busca enseguida.
process.env.OPAC_INDICE_TTL_MS = "0";

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
      // Una de las dos categorías con las que nace toda biblioteca (ver
      // CATEGORIAS_BASE) — un código suelto como "ADULTO" ya no se acepta.
      categoria: "docente",
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
  // (con un socio real: uno inexistente ahora corta antes, con 404)
  res = await fetch(`${base}/api/socios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ numeroSocio: "0001", apellido: "Lectora", nombre: "Eva" }),
  });
  const socio = await res.json();
  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: socio._id, itemTipo: "Libro", itemId: ebook._id }),
  });
  assert.equal(res.status, 409);

  res = await fetch(`${base}/api/circulacion/prestamos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({ socioId: new mongoose.Types.ObjectId().toString(), itemTipo: "Libro", itemId: ebook._id }),
  });
  assert.equal(res.status, 404);
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

test("gestión de cuentas: reseteo de contraseña sin la actual, y admin/supervisor gestionando bibliotecarios directamente", async (t) => {
  const server = app.listen(0);
  const puerto = server.address().port;
  const base = `http://127.0.0.1:${puerto}`;
  t.after(() => server.close());

  const cookieAdmin = await login(base, "admin", "adminpass123");

  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: "Biblioteca Gestión", codigo: "bpgestion1" }),
  });
  const biblioteca = await res.json();

  res = await fetch(`${base}/api/supervisores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "gestsuperv", password: "clavesegura1", bibliotecasSupervisadas: [biblioteca._id] }),
  });
  const supervisor = await res.json();
  const cookieSupervisor = await login(base, "gestsuperv", "clavesegura1");

  res = await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "gestsuperbib", password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const superbib = await res.json();

  res = await fetch(`${base}/api/bibliotecarios?bibliotecaId=${biblioteca._id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({
      usuario: "gestbib",
      password: "clavesegura1",
      permisos: { catalogar: true },
    }),
  });
  assert.equal(res.status, 201, "el admin puede crear un bibliotecario directamente, indicando la biblioteca");
  const bib = await res.json();

  // --- admin resetea la contraseña del supervisor, sin conocer la vieja ---
  res = await fetch(`${base}/api/usuarios/${supervisor.id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ passwordNueva: "claveNuevaSup1" }),
  });
  assert.equal(res.status, 200);
  assert.ok(await login(base, "gestsuperv", "claveNuevaSup1"), "el login con la contraseña nueva funciona");
  res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "gestsuperv", password: "clavesegura1" }),
  });
  assert.equal(res.status, 401, "la contraseña vieja deja de servir");

  // --- el supervisor (ahora con claveNuevaSup1) resetea la del superbibliotecario en su alcance ---
  const cookieSupervisorNueva = await login(base, "gestsuperv", "claveNuevaSup1");
  res = await fetch(`${base}/api/usuarios/${superbib.id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisorNueva },
    body: JSON.stringify({ passwordNueva: "claveNuevaSb1" }),
  });
  assert.equal(res.status, 200);
  const cookieSuperbib = await login(base, "gestsuperbib", "claveNuevaSb1");

  // --- el superbibliotecario resetea la de su propio bibliotecario ---
  res = await fetch(`${base}/api/usuarios/${bib.id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieSuperbib },
    body: JSON.stringify({ passwordNueva: "claveNuevaBib1" }),
  });
  assert.equal(res.status, 200);
  await login(base, "gestbib", "claveNuevaBib1");

  // --- rechazado: contraseña nueva demasiado corta ---
  res = await fetch(`${base}/api/usuarios/${bib.id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieSuperbib },
    body: JSON.stringify({ passwordNueva: "corta" }),
  });
  assert.equal(res.status, 400);

  // --- rechazado: nadie por debajo del admin puede resetearle la suya ---
  const cuentaAdmin = await Usuario.findOne({ usuario: "admin" });
  res = await fetch(`${base}/api/usuarios/${cuentaAdmin._id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisorNueva },
    body: JSON.stringify({ passwordNueva: "loQueSeaNuevo1" }),
  });
  assert.equal(res.status, 403);

  // --- rechazado: un bibliotecario no gestiona ninguna cuenta, ni la propia ---
  const cookieBib = await login(base, "gestbib", "claveNuevaBib1");
  res = await fetch(`${base}/api/usuarios/${bib.id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieBib },
    body: JSON.stringify({ passwordNueva: "otraClaveNueva1" }),
  });
  assert.equal(res.status, 403);

  // --- admin/supervisor pueden listar y editar bibliotecarios directamente
  // (antes solo el superbibliotecario podía) ---
  res = await fetch(`${base}/api/bibliotecarios?bibliotecaId=${biblioteca._id}`, { headers: { Cookie: cookieAdmin } });
  assert.equal(res.status, 200);
  let lista = await res.json();
  assert.ok(lista.some((u) => u.usuario === "gestbib"));

  res = await fetch(`${base}/api/bibliotecarios/${bib.id}?bibliotecaId=${biblioteca._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieSupervisorNueva },
    body: JSON.stringify({ permisos: { catalogar: true, prestamos: true } }),
  });
  assert.equal(res.status, 200, "el supervisor edita permisos de un bibliotecario dentro de su alcance");
  const editado = await res.json();
  assert.equal(editado.permisos.prestamos, true);

  // --- pero un supervisor sin esa biblioteca en su alcance no puede ---
  res = await fetch(`${base}/api/supervisores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: "gestsupervajeno", password: "clavesegura1", bibliotecasSupervisadas: [] }),
  });
  const cookieSupervisorAjeno = await login(base, "gestsupervajeno", "clavesegura1");
  res = await fetch(`${base}/api/bibliotecarios?bibliotecaId=${biblioteca._id}`, {
    headers: { Cookie: cookieSupervisorAjeno },
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

test("reserva de ejemplar al solicitar: el catálogo lo muestra no disponible ya desde que queda pendiente; sin ejemplar libre, el pedido queda en espera y se lleva el que se libera", async (t) => {
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

  // --- un segundo socio lo pide mientras el primero está pendiente: queda en espera ---
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
  assert.equal(res.status, 201);
  const enEspera = await res.json();
  assert.equal(enEspera.estado, "en_espera");
  assert.equal(enEspera.ejemplarId ?? null, null, "en espera no aparta ningún ejemplar");
  // Pedirlo de nuevo no suma un segundo lugar en la fila.
  res = await fetch(`${base}/api/opac/bpreserva/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieSocio2 },
    body: JSON.stringify({ tipo: "prestamo", itemTipo: "Libro", itemId: libro._id }),
  });
  assert.equal(res.status, 409);

  // --- el staff rechaza la primera: el ejemplar pasa a la reserva en espera, no al estante ---
  res = await fetch(`${base}/api/circulacion/solicitudes/${solicitud._id}/rechazar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieStaff },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).reservaSiguiente.socio.numeroSocio, "0002", "la respuesta dice para quién apartarlo");

  res = await fetch(`${base}/api/opac/bpreserva/libros`);
  assert.equal((await res.json())[0].ejemplaresDisponibles, 0, "sigue apartado, ahora para la reserva en espera");

  res = await fetch(`${base}/api/opac/bpreserva/mis-solicitudes`, { headers: { Cookie: cookieSocio2 } });
  const solicitud2 = (await res.json()).find((s) => s._id === enEspera._id);
  assert.equal(solicitud2.estado, "pendiente");
  assert.equal(String(solicitud2.ejemplarId), String(solicitud.ejemplarId), "se lleva el mismo ejemplar que se liberó");

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

  // --- el socio ve en su campana que aceptaron el pedido ---
  res = await fetch(`${base}/api/opac/bpreserva/notificaciones`, { headers: { Cookie: cookieSocio2 } });
  const campana = await res.json();
  assert.equal(campana.noLeidas, 1);
  assert.match(campana.notificaciones[0].titulo, /Aceptaron tu pedido de «El Aleph»/);
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
  assert.match(plantilla, /^titulo,subtitulo,mencionResponsabilidad,tituloVariante,edicion,autores/);

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

test("consultas malformadas responden 400 controlado y el servidor sigue de pie (vulnerabilidad del prompt maestro)", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const passwordHash = await bcrypt.hash("adminconsultas1", 10);
  await Usuario.create({ usuario: "admin-consultas", passwordHash, rol: "admin", bibliotecaId: null });
  const cookie = await login(base, "admin-consultas", "adminconsultas1");
  assert.ok(cookie);

  let res = await fetch(`${base}/api/v1/bibliotecas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ nombre: "Biblioteca de consultas", codigo: "consultas" }),
  });
  assert.equal(res.status, 201);
  const { _id: bibliotecaId } = await res.json();

  // Las 13 rutas de listado que leen ?q: antes, ?q[a]=1 hacía fallar .trim()
  // sin que nadie capturara el error, y Node terminaba el proceso.
  const listados = [
    "/libros", "/seriadas", "/recursosElectronicos", "/materialSonoro", "/materialAudiovisual",
    "/materialCartografico", "/materialGrafico", "/materialDidactico", "/archivos", "/objetos",
    "/socios", "/autores", "/materias",
  ];
  for (const ruta of listados) {
    const url = `${base}/api/v1${ruta}?bibliotecaId=${bibliotecaId}`;
    res = await fetch(`${url}&q=a&q=b`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 400, `${ruta}: una lista en q tiene que dar 400`);
    assert.match((await res.json()).error, /tiene que ser un texto/);

    res = await fetch(`${url}&q[a]=1`, { headers: { Cookie: cookie } });
    assert.ok(res.status < 500, `${ruta}: q[a]=1 no puede dar un error interno (dio ${res.status})`);

    res = await fetch(`${url}&q=borges`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200, `${ruta}: una búsqueda normal sigue funcionando`);
  }

  // Filtros por estado: solo valores permitidos; un operador no llega a Mongo.
  const solicitudes = `${base}/api/v1/circulacion/solicitudes?bibliotecaId=${bibliotecaId}`;
  res = await fetch(`${solicitudes}&estado=pendiente`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  res = await fetch(`${solicitudes}&estado=cualquiera`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 400);
  res = await fetch(`${solicitudes}&estado[$ne]=pendiente`, { headers: { Cookie: cookie } });
  assert.ok(res.status < 500);
  res = await fetch(`${base}/api/v1/solicitudes-supervision?estado=cualquiera`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 400);

  // Un cuerpo que no es JSON y una ruta /api inexistente responden JSON, no HTML.
  res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{esto no es json",
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /JSON válido/);
  res = await fetch(`${base}/api/v1/no-existe`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Ruta no encontrada.");

  // Y después de todo eso, el servidor sigue respondiendo.
  res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
});

// --- Categorías de socio (Alumno/Docente) ---

const JSON_CT = { "Content-Type": "application/json" };
const UN_DIA = 86400000;
const diasDePrestamo = (p) => (new Date(p.fechaVencimiento) - new Date(p.fechaEntrega)) / UN_DIA;

// Biblioteca nueva con su superbibliotecario, más atajos para las llamadas
// que se repiten en los tests de categorías.
async function bibliotecaDePrueba(base, codigo) {
  const cookieAdmin = await login(base, "admin", "adminpass123");
  let res = await fetch(`${base}/api/bibliotecas`, {
    method: "POST",
    headers: { ...JSON_CT, Cookie: cookieAdmin },
    body: JSON.stringify({ nombre: `Biblioteca ${codigo}`, codigo }),
  });
  const biblioteca = await res.json();
  await fetch(`${base}/api/superbibliotecarios`, {
    method: "POST",
    headers: { ...JSON_CT, Cookie: cookieAdmin },
    body: JSON.stringify({ usuario: codigo, password: "clavesegura1", bibliotecaId: biblioteca._id }),
  });
  const cookie = await login(base, codigo, "clavesegura1");
  const enviar = (metodo, ruta, cuerpo, cabeceras = {}) =>
    fetch(`${base}/api${ruta}`, {
      method: metodo,
      headers: { ...(cuerpo ? JSON_CT : {}), Cookie: cookie, ...cabeceras },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  return {
    biblioteca,
    cookie,
    enviar,
    categorias: `/bibliotecas/${biblioteca._id}/categorias`,
    async crearSocio(numeroSocio, categoria) {
      const r = await enviar("POST", "/socios", { numeroSocio, apellido: "Prueba", nombre: numeroSocio, categoria });
      assert.equal(r.status, 201);
      return r.json();
    },
    async crearLibro(titulo, codigos) {
      const r = await enviar("POST", "/libros", {
        titulo,
        ejemplares: codigos.map((codigoBarras) => ({ codigoBarras, signatura: "1" })),
      });
      assert.equal(r.status, 201);
      return r.json();
    },
    prestar: (socio, libro) =>
      enviar("POST", "/circulacion/prestamos", { socioId: socio._id, itemTipo: "Libro", itemId: libro._id }),
    async loginOpac(socio, password) {
      await enviar("POST", `/socios/${socio._id}/credenciales`, { password });
      const r = await fetch(`${base}/api/opac/${codigo}/login`, {
        method: "POST",
        headers: JSON_CT,
        body: JSON.stringify({ numeroSocio: socio.numeroSocio, password }),
      });
      assert.equal(r.status, 200);
      const cookieSocio = extraerCookie(r);
      return (metodo, ruta, cuerpo, cabeceras = {}) =>
        fetch(`${base}/api/opac/${codigo}${ruta}`, {
          method: metodo,
          headers: { ...(cuerpo ? JSON_CT : {}), Cookie: cookieSocio, ...cabeceras },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
    },
  };
}

test("categorías de socio: Alumno y Docente con reglas propias en los préstamos del staff y del OPAC", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bpcateg");

  // --- toda biblioteca nueva nace con Alumno y Docente, sin reglas propias ---
  let res = await b.enviar("GET", b.categorias);
  assert.equal(res.status, 200);
  let categorias = await res.json();
  assert.deepEqual(categorias.map((c) => c.codigo), ["ALUMNO", "DOCENTE"]);
  assert.equal(categorias[0].diasPrestamo, null);
  assert.equal(categorias[0].reglas.diasPrestamo, 14, "sin regla propia hereda la de la biblioteca");
  assert.equal(categorias[0].reglas.maxPrestamos, null);
  const alumno = categorias[0];

  // --- Alumno: 7 días, 1 renovación, 1 préstamo a la vez, $50 por día de atraso ---
  res = await b.enviar("PUT", `${b.categorias}/${alumno._id}`, {
    diasPrestamo: 7,
    maxRenovaciones: 1,
    maxPrestamos: 1,
    multaPorDiaVencido: 50,
  });
  assert.equal(res.status, 200);

  // --- valores inválidos: 400 con un mensaje que se entiende ---
  for (const [cuerpo, texto] of [
    [{ diasPrestamo: 0 }, /al menos 1/],
    [{ diasPrestamo: 2.5 }, /número entero/],
    [{ maxPrestamos: "muchos" }, /tiene que ser un número/],
    [{ codigo: "OTRO" }, /no se puede cambiar/],
  ]) {
    res = await b.enviar("PUT", `${b.categorias}/${alumno._id}`, cuerpo);
    assert.equal(res.status, 400, JSON.stringify(cuerpo));
    assert.match((await res.json()).error, texto);
  }
  res = await b.enviar("POST", b.categorias, { codigo: "alumno", nombre: "Repetida" });
  assert.equal(res.status, 409);
  res = await b.enviar("POST", b.categorias, { codigo: "con espacio", nombre: "Mal código" });
  assert.equal(res.status, 400);

  // --- un socio solo puede tener una categoría que exista en su biblioteca ---
  res = await b.enviar("POST", "/socios", { numeroSocio: "X1", apellido: "Prueba", nombre: "X", categoria: "PRECEPTOR" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /ALUMNO, DOCENTE/);

  const socioAlumno = await b.crearSocio("A100", "alumno");
  assert.equal(socioAlumno.categoria, "ALUMNO", "se guarda en mayúsculas");
  const socioDocente = await b.crearSocio("D200", "DOCENTE");
  const socioViejo = await b.crearSocio("V300"); // sin categoría: el "ADULTO" de siempre, sin reglas propias

  // --- editarle otro dato a un socio con un código viejo no obliga a cambiarle la categoría... ---
  res = await b.enviar("PUT", `/socios/${socioViejo._id}`, { categoria: "ADULTO", telefono: "264 400 0000" });
  assert.equal(res.status, 200);
  // --- ...pero pasarlo a un código que no existe, sí falla ---
  res = await b.enviar("PUT", `/socios/${socioViejo._id}`, { categoria: "PRECEPTOR" });
  assert.equal(res.status, 400);

  const libroA = await b.crearLibro("Libro A categorías", ["CAT-A1", "CAT-A2", "CAT-A3"]);
  const libroB = await b.crearLibro("Libro B categorías", ["CAT-B1", "CAT-B2", "CAT-B3"]);

  // --- Alumno: vence a los 7 días y no puede llevarse un segundo libro ---
  res = await b.prestar(socioAlumno, libroA);
  assert.equal(res.status, 201);
  const prestamoAlumno = await res.json();
  assert.equal(diasDePrestamo(prestamoAlumno), 7);
  res = await b.prestar(socioAlumno, libroB);
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /máximo de 1 préstamo a la vez de la categoría Alumno/);
  assert.equal(
    await Ejemplar.countDocuments({ itemId: libroB._id, estado: "disponible" }),
    3,
    "el rechazo no deja ningún ejemplar tomado"
  );

  // --- Docente: hereda los 14 días de la biblioteca y no tiene tope ---
  res = await b.prestar(socioDocente, libroA);
  assert.equal(res.status, 201);
  const prestamoDocente = await res.json();
  assert.equal(diasDePrestamo(prestamoDocente), 14);
  res = await b.prestar(socioDocente, libroB);
  assert.equal(res.status, 201);

  // --- código sin categoría dada de alta: la regla general, como antes ---
  res = await b.prestar(socioViejo, libroB);
  assert.equal(res.status, 201);
  assert.equal(diasDePrestamo(await res.json()), 14);

  // --- renovaciones: Alumno 1, Docente 2 (la de la biblioteca) ---
  const renovar = (p) => b.enviar("POST", `/circulacion/prestamos/${p._id}/renovar`);
  assert.equal((await renovar(prestamoAlumno)).status, 200);
  assert.equal((await renovar(prestamoAlumno)).status, 409);
  assert.equal((await renovar(prestamoDocente)).status, 200);
  assert.equal((await renovar(prestamoDocente)).status, 200);
  assert.equal((await renovar(prestamoDocente)).status, 409);

  // --- OPAC: el alumno ve sus reglas, y el tope también corre para sus pedidos ---
  const opac = await b.loginOpac(socioAlumno, "clavealumno1");
  res = await opac("GET", "/mis-reglas");
  assert.equal(res.status, 200);
  const reglas = await res.json();
  assert.deepEqual(reglas.categoria, { codigo: "ALUMNO", nombre: "Alumno" });
  assert.equal(reglas.diasPrestamo, 7);
  assert.equal(reglas.maxRenovaciones, 1);
  assert.equal(reglas.maxPrestamos, 1);
  assert.equal(reglas.enCurso, 1);

  const pedir = (libro) => opac("POST", "/solicitudes", { tipo: "prestamo", itemTipo: "Libro", itemId: libro._id });
  res = await pedir(libroB);
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Ya tenés 1 préstamo o pedido en curso/);
  res = await opac("POST", "/solicitudes", { tipo: "renovacion", prestamoId: prestamoAlumno._id });
  assert.equal(res.status, 409, "ya usó su única renovación");

  // --- multa con la tarifa de Alumno ($50 por día): 3 días de atraso = $150 ---
  await Prestamo.findByIdAndUpdate(prestamoAlumno._id, { fechaVencimiento: new Date(Date.now() - 3 * UN_DIA - 60000) });
  res = await opac("GET", "/mis-prestamos");
  assert.equal((await res.json())[0].multa, 150);

  // --- devuelve y ahí puede pedir; el pedido pendiente ya cuenta para el tope ---
  res = await b.enviar("POST", `/circulacion/prestamos/${prestamoAlumno._id}/devolucion`);
  assert.equal(res.status, 200);
  res = await pedir(libroB);
  assert.equal(res.status, 201);
  const solicitud = await res.json();
  res = await pedir(libroA);
  assert.equal(res.status, 409);

  // --- aprobarlo no lo cuenta dos veces, y el préstamo sale con los días de Alumno ---
  // (se lo dan en el mostrador, desde su ficha: no hace falta avisarle que pase a buscarlo)
  res = await b.enviar("POST", `/circulacion/solicitudes/${solicitud._id}/aprobar`, { enMostrador: true });
  assert.equal(res.status, 200);
  const prestamoAprobado = await Prestamo.findOne({ socioId: socioAlumno._id, fechaDevolucion: null });
  assert.equal(diasDePrestamo(prestamoAprobado), 7);
  res = await opac("GET", "/notificaciones");
  const avisos = (await res.json()).notificaciones.map((n) => n.titulo);
  assert.ok(!avisos.some((t) => /Aceptaron tu pedido/.test(t)), "entregado en mano: sin «pasá a buscarlo»");

  // --- conteo de socios por categoría, y una categoría en uso no se borra ---
  res = await b.enviar("GET", b.categorias);
  categorias = await res.json();
  assert.equal(categorias.find((c) => c.codigo === "ALUMNO").socios, 1);
  assert.equal(categorias.find((c) => c.codigo === "ALUMNO").reglas.maxPrestamos, 1);
  res = await b.enviar("DELETE", `${b.categorias}/${alumno._id}`);
  assert.equal(res.status, 409);
  res = await b.enviar("POST", b.categorias, { codigo: "invitado", nombre: "Invitado", maxPrestamos: 2 });
  assert.equal(res.status, 201);
  const invitado = await res.json();
  assert.equal(invitado.codigo, "INVITADO");
  res = await b.enviar("DELETE", `${b.categorias}/${invitado._id}`);
  assert.equal(res.status, 200);
  res = await b.enviar("GET", b.categorias);
  assert.deepEqual((await res.json()).map((c) => c.codigo), ["ALUMNO", "DOCENTE"]);

  // --- su bibliotecario las lee (para cargar socios) pero no las cambia ---
  res = await b.enviar("POST", "/bibliotecarios", {
    usuario: "bibcateg",
    password: "clavesegura1",
    permisos: { socios: true, prestamos: true },
  });
  assert.equal(res.status, 201);
  const cookieBib = await login(base, "bibcateg", "clavesegura1");
  res = await fetch(`${base}/api${b.categorias}`, { headers: { Cookie: cookieBib } });
  assert.equal(res.status, 200);
  res = await fetch(`${base}/api${b.categorias}/${alumno._id}`, {
    method: "PUT",
    headers: { ...JSON_CT, Cookie: cookieBib },
    body: JSON.stringify({ maxPrestamos: 5 }),
  });
  assert.equal(res.status, 403);

  // --- otra biblioteca ni las ve, y sus socios no pueden recibir préstamos de esta ---
  const ajena = await bibliotecaDePrueba(base, "bpcategajena");
  res = await ajena.enviar("GET", b.categorias);
  assert.equal(res.status, 403);
  const socioAjeno = await ajena.crearSocio("Z900", "DOCENTE");
  res = await b.prestar(socioAjeno, libroA);
  assert.equal(res.status, 404);
});

test("categorías: dos préstamos o pedidos simultáneos de un alumno con tope 1 dejan pasar uno solo", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bpcarrera");
  const alumno = (await (await b.enviar("GET", b.categorias)).json()).find((c) => c.codigo === "ALUMNO");
  await b.enviar("PUT", `${b.categorias}/${alumno._id}`, { maxPrestamos: 1 });
  const socio = await b.crearSocio("A1", "ALUMNO");
  const libro1 = await b.crearLibro("Carrera 1", ["CAR-1A", "CAR-1B"]);
  const libro2 = await b.crearLibro("Carrera 2", ["CAR-2A", "CAR-2B"]);

  // --- staff: dos préstamos a la vez ---
  const respuestas = await Promise.all([b.prestar(socio, libro1), b.prestar(socio, libro2)]);
  assert.deepEqual(respuestas.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await Prestamo.countDocuments({ socioId: socio._id, fechaDevolucion: null }), 1);
  assert.equal(
    await Ejemplar.countDocuments({ itemId: { $in: [libro1._id, libro2._id] }, estado: "prestado" }),
    1,
    "el préstamo deshecho devolvió su ejemplar"
  );

  // --- OPAC: dos pedidos a la vez, después de devolver ---
  const prestamo = await Prestamo.findOne({ socioId: socio._id, fechaDevolucion: null });
  await b.enviar("POST", `/circulacion/prestamos/${prestamo._id}/devolucion`);
  const opac = await b.loginOpac(socio, "clavealumno1");
  const pedidos = await Promise.all(
    [libro1, libro2].map((l) => opac("POST", "/solicitudes", { tipo: "prestamo", itemTipo: "Libro", itemId: l._id }))
  );
  assert.deepEqual(pedidos.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await Solicitud.countDocuments({ socioId: socio._id, estado: "pendiente" }), 1);
  assert.equal(await Ejemplar.countDocuments({ itemId: { $in: [libro1._id, libro2._id] }, estado: "reservado" }), 1);
});

test("migración de categorías: las bibliotecas viejas reciben Alumno/Docente y los códigos que ya usan", async () => {
  const vieja = await Biblioteca.create({ nombre: "Biblioteca anterior a las categorías", codigo: "bpvieja" });
  await Socio.create([
    { bibliotecaId: vieja._id, numeroSocio: "1", apellido: "Uno", nombre: "Ana", categoria: "ADULTO" },
    { bibliotecaId: vieja._id, numeroSocio: "2", apellido: "Dos", nombre: "Beto", categoria: "infantil" },
    { bibliotecaId: vieja._id, numeroSocio: "3", apellido: "Tres", nombre: "Caro", categoria: "Socio Especial" },
  ]);

  const resultado = await migrarCategorias();
  const codigos = (await Categoria.find({ bibliotecaId: vieja._id, eliminadoEn: null }).distinct("codigo")).sort();
  assert.deepEqual(codigos, ["ADULTO", "ALUMNO", "DOCENTE", "INFANTIL"]);
  assert.ok(
    resultado.sinMigrar.some((s) => s.biblioteca === "bpvieja" && s.codigo === "SOCIO ESPECIAL"),
    "un código con espacios no se puede dar de alta solo: se informa"
  );
  assert.equal(
    (await Socio.findOne({ bibliotecaId: vieja._id, numeroSocio: "2" })).categoria,
    "infantil",
    "no toca a los socios"
  );

  assert.equal((await migrarCategorias()).creadas, 0, "una segunda corrida no crea nada");
});

// --- Circulación robusta: concurrencia e idempotencia ---

test("idempotencia: el mismo préstamo reintentado con la misma Idempotency-Key se registra una sola vez", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bpidem");
  const socio = await b.crearSocio("I1", "DOCENTE");
  const libro = await b.crearLibro("Libro idempotente", ["IDEM-1", "IDEM-2"]);
  const cuerpo = { socioId: socio._id, itemTipo: "Libro", itemId: libro._id };
  const clave = { "Idempotency-Key": "prestamo-reintento-0001" };

  let res = await b.enviar("POST", "/circulacion/prestamos", cuerpo, clave);
  assert.equal(res.status, 201);
  const primero = await res.json();
  // --- el "reintento" (se cortó la conexión antes de ver la respuesta) ---
  res = await b.enviar("POST", "/circulacion/prestamos", cuerpo, clave);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("idempotent-replayed"), "true");
  assert.equal((await res.json())._id, primero._id);
  assert.equal(await Prestamo.countDocuments({ socioId: socio._id }), 1, "un solo préstamo");
  assert.equal(await Ejemplar.countDocuments({ itemId: libro._id, estado: "prestado" }), 1);

  // --- la misma clave para otro pedido es un error, no un reintento ---
  res = await b.enviar("POST", "/circulacion/prestamos", { ...cuerpo, ejemplarId: undefined, itemId: socio._id }, clave);
  assert.equal(res.status, 422);
  // --- una clave con formato inválido se rechaza ---
  res = await b.enviar("POST", "/circulacion/prestamos", cuerpo, { "Idempotency-Key": "corta" });
  assert.equal(res.status, 400);

  // --- un error no se guarda: el reintento vuelve a intentarlo (y ahora puede salir bien) ---
  const otroLibro = await b.crearLibro("Libro sin stock al principio", []);
  const claveSinStock = { "Idempotency-Key": "prestamo-sin-stock-0001" };
  const pedido = { socioId: socio._id, itemTipo: "Libro", itemId: otroLibro._id };
  res = await b.enviar("POST", "/circulacion/prestamos", pedido, claveSinStock);
  assert.equal(res.status, 409);
  await Ejemplar.create({ bibliotecaId: b.biblioteca._id, itemTipo: "Libro", itemId: otroLibro._id, codigoBarras: "IDEM-3" });
  res = await b.enviar("POST", "/circulacion/prestamos", pedido, claveSinStock);
  assert.equal(res.status, 201);

  // --- devolución reintentada: misma respuesta, sin "ya fue devuelto" ---
  const claveDevolucion = { "Idempotency-Key": "devolucion-reintento-01" };
  res = await b.enviar("POST", `/circulacion/prestamos/${primero._id}/devolucion`, undefined, claveDevolucion);
  assert.equal(res.status, 200);
  res = await b.enviar("POST", `/circulacion/prestamos/${primero._id}/devolucion`, undefined, claveDevolucion);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("idempotent-replayed"), "true");

  // --- OPAC: el pedido reintentado con la misma clave crea una sola solicitud ---
  const opac = await b.loginOpac(socio, "clavedocente1");
  const claveOpac = { "Idempotency-Key": "opac-pedido-reintento-1" };
  const pedidoOpac = { tipo: "prestamo", itemTipo: "Libro", itemId: libro._id };
  res = await opac("POST", "/solicitudes", pedidoOpac, claveOpac);
  assert.equal(res.status, 201);
  const solicitud = await res.json();
  res = await opac("POST", "/solicitudes", pedidoOpac, claveOpac);
  assert.equal(res.status, 201);
  assert.equal((await res.json())._id, solicitud._id);
  assert.equal(await Solicitud.countDocuments({ socioId: socio._id, estado: "pendiente" }), 1);
});

test("concurrencia: devoluciones, renovaciones, aprobaciones y pedidos simultáneos no se duplican", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bpconcurr");
  const alumno = (await (await b.enviar("GET", b.categorias)).json()).find((c) => c.codigo === "ALUMNO");
  await b.enviar("PUT", `${b.categorias}/${alumno._id}`, { maxRenovaciones: 1 });
  const socio = await b.crearSocio("C1", "ALUMNO");
  const libro = await b.crearLibro("Libro concurrido", ["CON-1", "CON-2", "CON-3"]);

  // --- dos renovaciones a la vez con tope 1: entra una ---
  let res = await b.prestar(socio, libro);
  const prestamo = await res.json();
  const renovaciones = await Promise.all([
    b.enviar("POST", `/circulacion/prestamos/${prestamo._id}/renovar`),
    b.enviar("POST", `/circulacion/prestamos/${prestamo._id}/renovar`),
  ]);
  assert.deepEqual(renovaciones.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await Prestamo.findById(prestamo._id)).renovaciones, 1);

  // --- dos devoluciones a la vez: una sola registra la devolución ---
  const devoluciones = await Promise.all([
    b.enviar("POST", `/circulacion/prestamos/${prestamo._id}/devolucion`),
    b.enviar("POST", `/circulacion/prestamos/${prestamo._id}/devolucion`),
  ]);
  assert.deepEqual(devoluciones.map((r) => r.status).sort(), [200, 409]);

  // --- dos toques al mismo pedido en el OPAC (sin clave): queda uno y reserva un ejemplar ---
  const opac = await b.loginOpac(socio, "clavealumno1");
  const pedido = { tipo: "prestamo", itemTipo: "Libro", itemId: libro._id };
  const pedidos = await Promise.all([opac("POST", "/solicitudes", pedido), opac("POST", "/solicitudes", pedido)]);
  assert.deepEqual(pedidos.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await Solicitud.countDocuments({ socioId: socio._id, estado: "pendiente" }), 1);
  assert.equal(await Ejemplar.countDocuments({ itemId: libro._id, estado: "reservado" }), 1);
  const solicitud = await Solicitud.findOne({ socioId: socio._id, estado: "pendiente" });

  // --- aprobar y rechazar la misma solicitud a la vez: gana una sola acción ---
  const resoluciones = await Promise.all([
    b.enviar("POST", `/circulacion/solicitudes/${solicitud._id}/aprobar`),
    b.enviar("POST", `/circulacion/solicitudes/${solicitud._id}/aprobar`),
    b.enviar("POST", `/circulacion/solicitudes/${solicitud._id}/rechazar`, { notaStaff: "duplicado" }),
  ]);
  const exitosas = resoluciones.filter((r) => r.status === 200);
  assert.equal(exitosas.length, 1, `estados: ${resoluciones.map((r) => r.status).join(", ")}`);
  for (const r of resoluciones.filter((x) => x.status !== 200)) assert.ok([404, 409].includes(r.status));
  const final = await Solicitud.findById(solicitud._id);
  const prestamosNuevos = await Prestamo.countDocuments({ socioId: socio._id, fechaDevolucion: null });
  if (final.estado === "aprobada") {
    assert.equal(prestamosNuevos, 1);
    assert.equal(await Ejemplar.countDocuments({ itemId: libro._id, estado: "prestado" }), 1);
  } else {
    assert.equal(final.estado, "rechazada");
    assert.equal(prestamosNuevos, 0);
  }
  assert.equal(await Ejemplar.countDocuments({ itemId: libro._id, estado: "reservado" }), 0, "no queda nada trabado");
  assert.equal(final.bloqueadaHasta, null);
});

// --- Privacidad de socios: datos mínimos para alumnos y contacto enmascarado ---

test("socios: la API enmascara el contacto, alumnos con datos mínimos, y ver datos completos queda auditado", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bpprivado");
  const categorias = await (await b.enviar("GET", b.categorias)).json();
  assert.equal(categorias.find((c) => c.codigo === "ALUMNO").datosMinimos, true);
  assert.equal(categorias.find((c) => c.codigo === "DOCENTE").datosMinimos, false);

  // --- alumno: no se cargan DNI, domicilio ni teléfono ---
  let res = await b.enviar("POST", "/socios", {
    numeroSocio: "L-1001", apellido: "Rivas", nombre: "Tomás", categoria: "ALUMNO", dni: "50111222", telefono: "264 400 1111",
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /no se cargan DNI.*sobran: dni, telefono/);
  res = await b.enviar("POST", "/socios", {
    numeroSocio: "L-1001", apellido: "Rivas", nombre: "Tomás", categoria: "ALUMNO", curso: "3° B", emailTutor: "Tutora@Familia.com", dni: "",
  });
  assert.equal(res.status, 201);
  const alumno = await res.json();
  assert.equal(alumno.curso, "3° B");
  assert.equal(alumno.emailTutor, "t•••@familia.com", "la respuesta ya sale enmascarada");

  // --- docente: se cargan, pero la API los devuelve enmascarados ---
  res = await b.enviar("POST", "/socios", {
    numeroSocio: "D-20", apellido: "Herrera", nombre: "Martín", categoria: "DOCENTE",
    dni: "30111222", telefono: "264 400 1234", email: "mherrera@colegio.edu.ar", direccion: "San Martín 123",
  });
  assert.equal(res.status, 201);
  const docente = await res.json();
  assert.deepEqual(
    [docente.dni, docente.telefono, docente.email, docente.direccion],
    ["•••222", "•••234", "m•••@colegio.edu.ar", "•••"]
  );
  res = await b.enviar("GET", "/socios");
  const listado = await res.json();
  const enLista = listado.find((s) => s.numeroSocio === "D-20");
  assert.equal(enLista.dni, "•••222");
  assert.equal("passwordHash" in enLista, false);

  // --- editar sin tocar el contacto: los valores enmascarados que vuelven no pisan los reales ---
  res = await b.enviar("PUT", `/socios/${docente._id}`, { ...enLista, localidad: "Rivadavia" });
  assert.equal(res.status, 200);
  let enBase = await Socio.findById(docente._id);
  assert.equal(enBase.dni, "30111222");
  assert.equal(enBase.email, "mherrera@colegio.edu.ar");
  assert.equal(enBase.localidad, "Rivadavia");
  // --- y un valor nuevo sí se guarda ---
  res = await b.enviar("PUT", `/socios/${docente._id}`, { telefono: "264 500 9876" });
  assert.equal(res.status, 200);
  assert.equal((await Socio.findById(docente._id)).telefono, "264 500 9876");

  // --- alumno: tampoco por edición; vaciar un dato viejo sí se puede ---
  await Socio.updateOne({ _id: alumno._id }, { telefono: "264 999 0000" }); // dato cargado antes de este cambio
  res = await b.enviar("PUT", `/socios/${alumno._id}`, { telefono: "264 111 2222" });
  assert.equal(res.status, 400);
  res = await b.enviar("PUT", `/socios/${alumno._id}`, { telefono: "" });
  assert.equal(res.status, 200);
  assert.equal((await Socio.findById(alumno._id)).telefono, "");

  // --- ver los datos completos: superbibliotecario sí, y queda registrado ---
  res = await b.enviar("POST", `/socios/${docente._id}/datos-contacto`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const completos = await res.json();
  assert.equal(completos.dni, "30111222");
  assert.equal(completos.telefono, "264 500 9876");
  let registros = await Auditoria.find({ entidadId: docente._id, accion: "socio.ver_datos_contacto" });
  assert.equal(registros.length, 1);
  assert.equal(registros[0].resultado, "ok");
  assert.equal(registros[0].actorRol, "superbibliotecario");
  assert.ok(!JSON.stringify(registros[0]).includes("30111222"), "la auditoría no copia el dato");

  // --- bibliotecario con "socios" pero sin "datosSocios": 403, y el intento también queda ---
  res = await b.enviar("POST", "/bibliotecarios", {
    usuario: "bibprivado", password: "clavesegura1", permisos: { socios: true, prestamos: true },
  });
  assert.equal(res.status, 201);
  const bib = await res.json();
  let cookieBib = await login(base, "bibprivado", "clavesegura1");
  const comoBib = (metodo, ruta) => fetch(`${base}/api${ruta}`, { method: metodo, headers: { Cookie: cookieBib } });
  res = await comoBib("POST", `/socios/${docente._id}/datos-contacto`);
  assert.equal(res.status, 403);
  registros = await Auditoria.find({ entidadId: docente._id, resultado: "denegado" });
  assert.equal(registros.length, 1);
  assert.equal(registros[0].actorRol, "bibliotecario");

  // --- con el permiso otorgado, sí ---
  res = await b.enviar("PUT", `/bibliotecarios/${bib.id}`, { permisos: { socios: true, prestamos: true, datosSocios: true } });
  assert.equal(res.status, 200);
  cookieBib = await login(base, "bibprivado", "clavesegura1");
  res = await comoBib("POST", `/socios/${docente._id}/datos-contacto`);
  assert.equal(res.status, 200);

  // --- circulación muestra al socio sin ningún dato de contacto ---
  const libro = await b.crearLibro("Libro privado", ["PRIV-1"]);
  await b.prestar(docente, libro);
  res = await b.enviar("GET", "/circulacion/prestamos");
  const [prestamo] = await res.json();
  assert.equal(prestamo.socio.numeroSocio, "D-20");
  for (const campo of ["dni", "telefono", "email", "direccion", "passwordHash"]) {
    assert.equal(campo in prestamo.socio, false, `circulación no debería traer ${campo}`);
  }

  // --- exportar los socios (con todos sus datos, para Koha) queda registrado ---
  res = await b.enviar("GET", "/export/socios.csv");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /30111222/);
  assert.equal(await Auditoria.countDocuments({ bibliotecaId: b.biblioteca._id, accion: "socios.exportar_csv" }), 1);
});

// --- Portadas: Open Library → Google Books → URL del staff → tapa tipográfica ---

test("portadas: búsqueda por ISBN, URL del staff segura, servido desde el OPAC y migración", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  // "Internet" de mentira: Open Library tiene un ISBN, Google Books otro (uno
  // con caché permitida y otro sin), y una URL suelta para el staff.
  const tapa = await sharp({ create: { width: 500, height: 750, channels: 3, background: "#a34d00" } }).jpeg().toBuffer();
  const externo = http.createServer((req, res) => {
    const conImagen = ["/ol/9788498381498.jpg", "/gb/9789871138012.jpg", "/otra.jpg", "/vieja.jpg"];
    if (conImagen.includes(req.url)) {
      const cache = req.url.startsWith("/gb/") ? { "Cache-Control": "public, max-age=3600" } : {};
      res.writeHead(200, { "Content-Type": "image/jpeg", ...cache });
      return res.end(tapa);
    }
    if (req.url === "/gb/9780306406157.jpg") {
      res.writeHead(200, { "Content-Type": "image/jpeg" }); // sin cabecera de caché
      return res.end(tapa);
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => externo.listen(0, "127.0.0.1", r));
  const puertoExterno = String(externo.address().port);
  const enExterno = (ruta) => `http://portadas.prueba:${puertoExterno}${ruta}`;
  const descargar = (url, opciones) =>
    descargarImagen(url, {
      ...opciones,
      resolver: async (host) =>
        host === "portadas.prueba" ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "10.0.0.9", family: 4 }],
      permitirDireccion: (ip) => ip === "127.0.0.1" || esDireccionPublica(ip),
      puertosPermitidos: ["80", "443", puertoExterno],
    });
  app.locals.portadas = {
    descargar,
    hayCupoOpenLibrary: () => true,
    urlOpenLibrary: (isbn) => enExterno(`/ol/${isbn}.jpg`),
    buscarGoogleBooks: async (isbn) =>
      ["9789871138012", "9780306406157"].includes(isbn) ? enExterno(`/gb/${isbn}.jpg`) : null,
  };
  t.after(() => {
    delete app.locals.portadas;
    externo.closeAllConnections();
    externo.close();
    server.close();
  });

  const b = await bibliotecaDePrueba(base, "bpportadas");
  const crearLibro = async (titulo, isbn) => (await b.enviar("POST", "/libros", { titulo, isbn })).json();
  const conOpenLibrary = await crearLibro("Harry Potter y la piedra filosofal", "978-84-9838-149-8");
  const conGoogle = await crearLibro("Libro en Google", "9789871138012");
  const googleSinCache = await crearLibro("Google sin caché", "9780306406157");
  const sinIsbn = await crearLibro("Apuntes de la cátedra");

  // --- 1. Open Library ---
  let res = await b.enviar("POST", `/portadas/Libro/${conOpenLibrary._id}/buscar`);
  assert.equal(res.status, 200);
  const deOpenLibrary = await res.json();
  assert.equal(deOpenLibrary.fuente, "openlibrary");
  assert.ok(
    deOpenLibrary.url.startsWith(`/api/v1/opac/bpportadas/portadas/${conOpenLibrary._id}/grande.webp?v=`),
    deOpenLibrary.url
  );

  // --- 2. Google Books, con caché permitida: se guarda solo hasta que vence ---
  res = await b.enviar("POST", `/portadas/Libro/${conGoogle._id}/buscar`);
  assert.equal(res.status, 200);
  const deGoogle = await res.json();
  assert.equal(deGoogle.fuente, "googlebooks");
  const minutos = (new Date(deGoogle.expiraEn) - Date.now()) / 60000;
  assert.ok(minutos > 55 && minutos <= 60, `vence en ~1 h, dio ${minutos}`);
  // ...y sin cabecera de caché no se guarda (Términos de las APIs de Google, §5e)
  res = await b.enviar("POST", `/portadas/Libro/${googleSinCache._id}/buscar`);
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /Podés cargarla desde una URL/);
  res = await b.enviar("POST", `/portadas/Libro/${sinIsbn._id}/buscar`);
  assert.equal(res.status, 400);

  // --- 3. El OPAC lista la versión (nunca la URL externa) y sirve el WebP ---
  await Libro.updateOne({ _id: conOpenLibrary._id }, { portadaUrl: "https://sitio-externo.example/tapa.jpg" });
  res = await fetch(`${base}/api/opac/bpportadas/libros`);
  const catalogo = await res.json();
  const enCatalogo = catalogo.find((l) => l._id === conOpenLibrary._id);
  assert.equal(enCatalogo.portada, deOpenLibrary.version);
  assert.equal("portadaUrl" in enCatalogo, false, "la URL externa no llega al navegador");
  assert.equal(catalogo.find((l) => l._id === sinIsbn._id).portada, null);
  res = await fetch(`${base}${deOpenLibrary.url}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
  assert.match(res.headers.get("cache-control"), /max-age=31536000, immutable/);
  assert.equal((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width, 360);
  // CSP: el navegador ya no puede pedir imágenes a terceros
  assert.match(res.headers.get("content-security-policy"), /img-src 'self' data:(;|$)/);
  res = await fetch(`${base}/api/opac/bpportadas/portadas/${conOpenLibrary._id}/miniatura.webp`);
  assert.match(res.headers.get("cache-control"), /max-age=300/, "sin ?v= la caché es corta");
  assert.equal((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width, 120);
  res = await fetch(`${base}${deGoogle.url}`);
  const maxAge = Number(res.headers.get("cache-control").match(/max-age=(\d+)/)[1]);
  assert.ok(maxAge <= 3600, "la caché del navegador tampoco pasa lo que permite Google");

  // --- 4. Vencida, deja de mostrarse ---
  await Portada.updateOne({ itemId: conGoogle._id }, { expiraEn: new Date(Date.now() - 1000) });
  res = await fetch(`${base}/api/opac/bpportadas/libros`);
  assert.equal((await res.json()).find((l) => l._id === conGoogle._id).portada, null);
  res = await fetch(`${base}${deGoogle.url}`);
  assert.equal(res.status, 404);

  // --- 5. URL del staff: segura, y procesada ---
  res = await b.enviar("POST", `/portadas/Libro/${sinIsbn._id}/desde-url`, { url: "http://169.254.169.254/latest/meta-data/" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /red interna/);
  res = await b.enviar("POST", `/portadas/Libro/${sinIsbn._id}/desde-url`, {
    url: `http://interno.prueba:${puertoExterno}/otra.jpg`,
  });
  assert.equal(res.status, 400, "un nombre que resuelve a una IP privada tampoco");
  res = await b.enviar("POST", `/portadas/Libro/${sinIsbn._id}/desde-url`, { url: enExterno("/no-existe.jpg") });
  assert.equal(res.status, 400);
  res = await b.enviar("POST", `/portadas/Libro/${sinIsbn._id}/desde-url`, { url: enExterno("/otra.jpg") });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).fuente, "url");

  // --- 6. Quitarla: vuelve la tapa tipográfica ---
  res = await b.enviar("DELETE", `/portadas/Libro/${sinIsbn._id}`);
  assert.equal(res.status, 200);
  res = await b.enviar("GET", `/portadas/Libro/${sinIsbn._id}`);
  assert.equal(res.status, 404);

  // --- 7. Permisos y alcance ---
  await b.enviar("POST", "/bibliotecarios", { usuario: "bibportadas", password: "clavesegura1", permisos: { socios: true } });
  const cookieBib = await login(base, "bibportadas", "clavesegura1");
  res = await fetch(`${base}/api/portadas/Libro/${sinIsbn._id}/buscar`, { method: "POST", headers: { Cookie: cookieBib } });
  assert.equal(res.status, 403, "sin permiso de catalogar");
  const ajena = await bibliotecaDePrueba(base, "bpportadasajena");
  res = await ajena.enviar("POST", `/portadas/Libro/${conOpenLibrary._id}/buscar`);
  assert.equal(res.status, 404, "un libro de otra biblioteca no existe para ella");
  res = await fetch(`${base}/api/opac/bpportadasajena/portadas/${conOpenLibrary._id}/grande.webp`);
  assert.equal(res.status, 404);

  // --- 8. Migración: las portadaUrl ya cargadas pasan a portadas procesadas ---
  const viejo = await crearLibro("Cargado antes del cambio");
  await Libro.updateOne({ _id: viejo._id }, { portadaUrl: enExterno("/vieja.jpg") });
  const resumen = await migrarPortadas({ deps: { ...app.locals.portadas }, pausaMs: 0 });
  assert.ok(resumen.desdeUrl >= 1, JSON.stringify(resumen));
  assert.equal((await Portada.findOne({ itemId: viejo._id })).fuente, "url");
});

// --- CMS del OPAC: borrador, publicación, historial, logos y permisos ---

test("CMS del OPAC: borrador → publicar → historial → restaurar, con logos, avisos vigentes y páginas legales", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bpcms");
  const publico = (ruta) => fetch(`${base}/api/opac/bpcms${ruta}`);

  // --- sin nada publicado: el OPAC muestra el nombre de la biblioteca y el acento del sistema ---
  let res = await publico("/contenido");
  let contenido = await res.json();
  assert.equal(contenido.identidad.nombre, "Biblioteca bpcms");
  assert.equal(contenido.identidad.colorAcento, "#ff8300");
  assert.equal(contenido.version, null);

  res = await b.enviar("GET", "/contenido/borrador");
  let estado = await res.json();
  assert.equal(estado.borrador, null);
  assert.equal(estado.puedePublicar, true);
  assert.deepEqual(estado.faltaParaPublicar, []);

  // --- un enlace peligroso no se guarda ni como borrador ---
  const datos = structuredClone(estado.datos);
  datos.avisos = [{ titulo: "Ojo", texto: "[clic](javascript:alert(1))" }];
  res = await b.enviar("PUT", "/contenido/borrador", { datos });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /javascript:alert/);

  // --- un color con poco contraste se puede guardar como borrador, pero no publicar ---
  datos.identidad.nombre = "Colegio San Juan Bautista";
  datos.identidad.colorAcento = "#1d4ed8";
  datos.avisos = [];
  res = await b.enviar("PUT", "/contenido/borrador", { datos });
  assert.equal(res.status, 200);
  estado = await res.json();
  assert.equal(estado.borrador.version, 1);
  assert.match(estado.faltaParaPublicar.join(" "), /contraste/);
  res = await b.enviar("POST", "/contenido/borrador/publicar");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /contraste/);

  // --- logo: PNG del dispositivo, se procesa a WebP; SVG, enorme o roto, no ---
  const png = await sharp({ create: { width: 800, height: 300, channels: 4, background: "#ff8300" } }).png().toBuffer();
  const subir = (cuerpo, tipo) =>
    fetch(`${base}/api/contenido/imagenes`, { method: "POST", headers: { Cookie: b.cookie, "Content-Type": tipo }, body: cuerpo });
  res = await subir(png, "image/png");
  assert.equal(res.status, 201);
  const logo = await res.json();
  assert.equal(logo.ancho, 512, "se achica a 512 px como máximo");
  res = await subir(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml");
  assert.equal(res.status, 415);
  res = await subir(Buffer.alloc(1024 * 1024 + 10), "image/png");
  assert.equal(res.status, 413);
  res = await subir(Buffer.from("no es una imagen"), "image/png");
  assert.equal(res.status, 400);

  // --- contenido completo y publicable ---
  datos.identidad.colorAcento = "#ffb703";
  datos.identidad.logos.horizontal = logo.id;
  datos.contacto = { email: "biblioteca@colegio.edu.ar", telefono: "264 400 0000", direccion: "", horario: "Lunes a viernes de 8 a 13", web: "https://colegio.edu.ar" };
  datos.avisos = [
    { titulo: "Inventario", texto: "La biblioteca cierra por **inventario**.", desde: "2026-01-01", hasta: "2099-12-31" },
    { titulo: "Feria futura", texto: "Pronto", desde: "2099-01-01", hasta: null },
    { titulo: "Vencido", texto: "Ya pasó", desde: null, hasta: "2020-01-01" },
  ];
  datos.paginas = [
    { titulo: "Cómo pedir un libro", slug: "como-pedir", cuerpo: "1. Buscá el libro\n2. Pedilo", legal: null },
    {
      titulo: "Reglamento de la biblioteca",
      slug: "reglamento",
      cuerpo: "Texto aprobado por la dirección.",
      legal: { responsable: "Dirección del colegio", version: "1.0", vigenteDesde: "2026-03-01" },
    },
  ];
  res = await b.enviar("PUT", "/contenido/borrador", { datos });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).faltaParaPublicar, []);

  // --- antes de publicar, el público sigue viendo lo anterior; la vista previa ya muestra el borrador ---
  assert.equal((await (await publico("/contenido")).json()).identidad.nombre, "Biblioteca bpcms");
  res = await b.enviar("GET", "/contenido/vista-previa");
  assert.equal((await res.json()).identidad.nombre, "Colegio San Juan Bautista");

  res = await b.enviar("POST", "/contenido/borrador/publicar");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).version, 1);

  contenido = await (await publico("/contenido")).json();
  assert.equal(contenido.version, 1);
  assert.equal(contenido.identidad.nombre, "Colegio San Juan Bautista");
  assert.equal(contenido.identidad.colorAcento, "#ffb703");
  assert.equal(contenido.identidad.logos.horizontal, `/api/v1/opac/bpcms/imagenes/${logo.id}.webp`);
  assert.deepEqual(contenido.avisos.map((a) => a.titulo), ["Inventario"], "solo los avisos vigentes");
  assert.deepEqual(contenido.paginas, [
    { slug: "como-pedir", titulo: "Cómo pedir un libro", legal: false },
    { slug: "reglamento", titulo: "Reglamento de la biblioteca", legal: true },
  ]);
  res = await publico("/paginas/reglamento");
  const reglamento = await res.json();
  assert.equal(reglamento.legal.version, "1.0");
  assert.equal(reglamento.legal.vigenteDesde, "2026-03-01");
  assert.equal((await publico("/paginas/no-existe")).status, 404);
  res = await fetch(`${base}${contenido.identidad.logos.horizontal}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
  assert.match(res.headers.get("cache-control"), /immutable/);

  // --- segunda versión, historial y restaurar la primera ---
  datos.identidad.nombre = "Colegio San Juan Bautista — Nivel Secundario";
  await b.enviar("PUT", "/contenido/borrador", { datos });
  res = await b.enviar("POST", "/contenido/borrador/publicar");
  assert.equal((await res.json()).version, 2);
  res = await b.enviar("GET", "/contenido/versiones");
  const versiones = await res.json();
  assert.deepEqual(versiones.map((v) => [v.version, v.estado]), [[2, "publicada"], [1, "archivada"]]);
  assert.equal(versiones[0].publicadoPor, "bpcms");
  res = await b.enviar("POST", `/contenido/versiones/${versiones[1]._id}/restaurar`);
  estado = await res.json();
  assert.equal(estado.borrador.restauradaDe, 1);
  assert.equal(estado.datos.identidad.nombre, "Colegio San Juan Bautista");
  assert.equal((await (await publico("/contenido")).json()).version, 2, "restaurar no publica solo");
  res = await b.enviar("POST", "/contenido/borrador/publicar");
  assert.equal((await res.json()).version, 3);
  assert.equal((await (await publico("/contenido")).json()).identidad.nombre, "Colegio San Juan Bautista");
  assert.equal(await Auditoria.countDocuments({ bibliotecaId: b.biblioteca._id, accion: "contenido.publicar" }), 3);
  assert.equal(await Auditoria.countDocuments({ bibliotecaId: b.biblioteca._id, accion: "contenido.restaurar" }), 1);

  // --- un logo de otra biblioteca no se puede usar ---
  const ajena = await bibliotecaDePrueba(base, "bpcmsajena");
  res = await fetch(`${base}/api/contenido/imagenes`, {
    method: "POST",
    headers: { Cookie: ajena.cookie, "Content-Type": "image/png" },
    body: png,
  });
  const logoAjeno = await res.json();
  datos.identidad.logos.cuadrado = logoAjeno.id;
  res = await b.enviar("PUT", "/contenido/borrador", { datos });
  assert.equal(res.status, 400);
  assert.equal((await fetch(`${base}/api/opac/bpcms/imagenes/${logoAjeno.id}.webp`)).status, 404);

  // --- bibliotecario: con "contenido" edita el borrador pero no publica; sin el permiso, ni lo ve ---
  await b.enviar("POST", "/bibliotecarios", { usuario: "bibcms", password: "clavesegura1", permisos: { contenido: true } });
  await b.enviar("POST", "/bibliotecarios", { usuario: "bibsincms", password: "clavesegura1", permisos: { socios: true } });
  const conPermiso = await login(base, "bibcms", "clavesegura1");
  const sinPermiso = await login(base, "bibsincms", "clavesegura1");
  const como = (cookie, metodo, ruta, cuerpo) =>
    fetch(`${base}/api${ruta}`, {
      method: metodo,
      headers: cuerpo ? { ...JSON_CT, Cookie: cookie } : { Cookie: cookie },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  datos.identidad.logos.cuadrado = null;
  res = await como(conPermiso, "PUT", "/contenido/borrador", { datos });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).puedePublicar, false);
  res = await como(conPermiso, "POST", "/contenido/borrador/publicar");
  assert.equal(res.status, 403);
  res = await como(conPermiso, "POST", `/contenido/versiones/${versiones[1]._id}/restaurar`);
  assert.equal(res.status, 403);
  res = await como(sinPermiso, "GET", "/contenido/borrador");
  assert.equal(res.status, 403);
});

// --- OPAC: búsqueda en el servidor, facetas, fichas y "Mis pedidos" ---

test("OPAC: búsqueda paginada sin tildes, facetas con autoridades, ficha pública y pedidos con título", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bpbusca");
  await b.enviar("POST", "/autores", { formaAutorizada: "Borges, Jorge Luis", variantes: ["Borges, J. L."] });
  const libro = async (titulo, autores, materias, anio, codigos = []) =>
    (
      await b.enviar("POST", "/libros", {
        titulo,
        autores,
        materias,
        anio,
        ejemplares: codigos.map((codigoBarras, i) => ({ codigoBarras, signatura: `863 ${i}` })),
      })
    ).json();
  const ficciones = await libro("Ficciones", ["Borges, Jorge Luis"], ["Cuentos"], "1944", ["BUS-SECRETO-1"]);
  await libro("El Aleph", ["Borges, J. L."], ["Cuentos"], "1949");
  const fierro = await libro("Martín Fierro", ["Hernández, José"], ["Poesía gauchesca"], "1872", ["BUS-3", "BUS-4"]);
  await b.enviar("POST", "/seriadas", { titulo: "Revista Billiken", periodicidad: "semanal" });
  await b.enviar("POST", "/objetos", { titulo: "Brújula antigua" });
  await b.enviar("POST", "/recursosElectronicos", { titulo: "Biblioteca digital escolar", tipoRecurso: "sitio_web", urlAcceso: "https://biblioteca.example" });

  const buscar = async (consulta) => {
    const res = await fetch(`${base}/api/opac/bpbusca/buscar?${consulta}`);
    return { status: res.status, cuerpo: await res.json() };
  };

  // --- sin tildes ni mayúsculas ---
  let { cuerpo } = await buscar("q=MARTIN");
  assert.deepEqual(cuerpo.resultados.map((r) => r.titulo), ["Martín Fierro"]);
  assert.equal(cuerpo.resultados[0].disponibles, 2);
  assert.equal(cuerpo.resultados[0].segmento, "libro");
  assert.equal(cuerpo.resultados[0].slug, "martin-fierro");

  // --- la variante "Borges, J. L." se agrupa bajo la forma autorizada ---
  ({ cuerpo } = await buscar("q=borges"));
  assert.equal(cuerpo.total, 2);
  assert.deepEqual(cuerpo.facetas.autores, [{ valor: "Borges, Jorge Luis", cantidad: 2 }]);
  ({ cuerpo } = await buscar(`autor=${encodeURIComponent("Borges, Jorge Luis")}`));
  assert.deepEqual(cuerpo.resultados.map((r) => r.titulo).sort(), ["El Aleph", "Ficciones"]);

  // --- facetas disyuntivas: elegir un tipo no borra los conteos de los otros tipos ---
  ({ cuerpo } = await buscar("tipo=Seriada"));
  assert.deepEqual(cuerpo.resultados.map((r) => r.titulo), ["Revista Billiken"]);
  const conteo = Object.fromEntries(cuerpo.facetas.tipos.map((f) => [f.valor, f.cantidad]));
  assert.equal(conteo.Libro, 3);
  assert.equal(conteo.Seriada, 1);
  ({ cuerpo } = await buscar("tipo=Libro&tipo=Objeto&materia=Cuentos"));
  assert.equal(cuerpo.total, 2);

  // --- solo disponibles: afuera "El Aleph" (sin ejemplares) y la revista; adentro lo digital y lo de consulta ---
  ({ cuerpo } = await buscar("disponible=1&orden=titulo"));
  assert.deepEqual(cuerpo.resultados.map((r) => r.titulo), ["Biblioteca digital escolar", "Brújula antigua", "Ficciones", "Martín Fierro"]);

  // --- orden por año, paginación y relevancia ---
  ({ cuerpo } = await buscar("tipo=Libro&orden=anio"));
  assert.deepEqual(cuerpo.resultados.map((r) => r.anio), ["1949", "1944", "1872"]);
  ({ cuerpo } = await buscar("orden=titulo&porPagina=2&pagina=2"));
  assert.equal(cuerpo.total, 6);
  assert.equal(cuerpo.totalPaginas, 3);
  assert.deepEqual(cuerpo.resultados.map((r) => r.titulo), ["El Aleph", "Ficciones"]);
  ({ cuerpo } = await buscar("orden=titulo&porPagina=2&pagina=99"));
  assert.equal(cuerpo.pagina, 3, "una página que no existe muestra la última");
  ({ cuerpo } = await buscar("q=fierro hernandez"));
  assert.equal(cuerpo.resultados[0].titulo, "Martín Fierro");

  // --- parámetros malformados: 400 controlado ---
  assert.equal((await buscar("tipo=Inventado")).status, 400);
  assert.equal((await buscar("q=a&q=b")).status, 400);
  assert.equal((await buscar("orden=raro")).status, 400);
  // Con el parser simple de Express 5, "autor[$ne]" es un nombre de parámetro
  // más, no un objeto: se ignora y no llega ningún operador al filtro.
  ({ cuerpo } = await buscar("autor[$ne]=x"));
  assert.equal(cuerpo.total, 6);

  // --- ficha: solo campos públicos, sin códigos de barras ---
  let res = await fetch(`${base}/api/opac/bpbusca/items/Libro/${ficciones._id}`);
  assert.equal(res.status, 200);
  const texto = await res.text();
  const ficha = JSON.parse(texto);
  assert.equal(ficha.slug, "ficciones");
  assert.deepEqual(ficha.autores, ["Borges, Jorge Luis"]);
  assert.ok(ficha.detalle.some((d) => d.etiqueta === "Año" && d.valor === "1944"));
  assert.deepEqual(ficha.ejemplares, [{ signatura: "863 0", estado: "disponible", ubicacion: "", nota: "" }]);
  assert.equal(ficha.disponibles, 1);
  assert.ok(!texto.includes("BUS-SECRETO-1"), "el código de barras no sale en la ficha pública");
  assert.ok(!texto.includes("bibliotecaId"));
  const ajena = await bibliotecaDePrueba(base, "bpbuscaajena");
  assert.equal((await fetch(`${base}/api/opac/bpbuscaajena/items/Libro/${ficciones._id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/opac/bpbusca/items/Inventado/${ficciones._id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/opac/bpbusca/items/Libro/no-es-un-id`)).status, 404);
  await b.enviar("DELETE", `/libros/${ficciones._id}`);
  assert.equal((await fetch(`${base}/api/opac/bpbusca/items/Libro/${ficciones._id}`)).status, 404);
  assert.equal(ajena.biblioteca.codigo, "bpbuscaajena");

  // --- "Mis pedidos" trae el título y la ficha de cada material ---
  const socio = await b.crearSocio("B1", "DOCENTE");
  const opac = await b.loginOpac(socio, "clavedocente1");
  res = await opac("POST", "/solicitudes", { tipo: "prestamo", itemTipo: "Libro", itemId: fierro._id });
  assert.equal(res.status, 201);
  res = await opac("GET", "/mis-solicitudes");
  const [pedido] = await res.json();
  assert.equal(pedido.estado, "pendiente");
  assert.deepEqual(pedido.material, { itemTipo: "Libro", id: fierro._id, titulo: "Martín Fierro", segmento: "libro", slug: "martin-fierro" });
});

test("SEO: fichas con <head> propio, redirección al título nuevo, sitemaps, robots y nada privado indexable", async (t) => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bpseo");
  const crear = async (ruta, cuerpo) => (await b.enviar("POST", ruta, cuerpo)).json();
  const fierro = await crear("/libros", {
    titulo: "Martín Fierro",
    autores: ["Hernández, José"],
    editorial: "Colihue",
    anio: "1872",
    isbn: "9789505811236",
    materias: ["Poesía gauchesca"],
    ejemplares: [{ codigoBarras: "SEO-SECRETO-1", signatura: "861 HER" }],
  });
  const maligno = await crear("/libros", { titulo: 'Hola"><script>alert(1)</script>' });
  const borrado = await crear("/libros", { titulo: "Libro dado de baja" });
  await b.enviar("DELETE", `/libros/${borrado._id}`);
  const revista = await crear("/seriadas", { titulo: "Revista Billiken", periodicidad: "semanal" });
  const socio = await b.crearSocio("7001", "ALUMNO");

  const pedir = (ruta, opciones) => fetch(`${base}${ruta}`, { redirect: "manual", ...opciones });
  const canonica = `/opac/bpseo/libro/martin-fierro-${fierro._id}`;

  // --- la ficha llega con su <head>: título, canonical, Open Graph y JSON-LD ---
  let res = await pedir(canonica);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-robots-tag"), null);
  let html = await res.text();
  assert.match(html, /<title>Martín Fierro · José Hernández · Biblioteca bpseo<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${base}${canonica}" />`));
  assert.match(html, /<meta property="og:type" content="book" \/>/);
  const jsonLd = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  const libro = jsonLd["@graph"].find((n) => n["@type"] === "Book");
  assert.equal(libro.isbn, "9789505811236");
  assert.equal(libro.author[0].name, "José Hernández");
  assert.doesNotMatch(html, /SEO-SECRETO-1/, "el código de barras no es público");

  // --- título viejo o sin slug: redirección permanente a la dirección actual ---
  res = await pedir(`/opac/bpseo/libro/titulo-viejo-${fierro._id}`);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), canonica);
  res = await pedir(`/opac/bpseo/publicacion-seriada/${revista._id}`);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), `/opac/bpseo/publicacion-seriada/revista-billiken-${revista._id}`);

  // --- el texto del catálogo no puede inyectar HTML ni cerrar el JSON-LD ---
  res = await pedir(`/opac/bpseo/libro/hola-script-alert-1-script-${maligno._id}`);
  html = await res.text();
  assert.equal(res.status, 200);
  assert.doesNotMatch(html, /<script>alert/);

  // --- inexistentes: 404 sin indexar ---
  for (const ruta of [`/opac/bpseo/libro/x-${"0".repeat(24)}`, `/opac/bpseo/libro/${borrado._id}`, "/opac/noexiste", "/opac/bpseo/pagina/nada"]) {
    res = await pedir(ruta);
    assert.equal(res.status, 404, ruta);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow", ruta);
  }

  // --- privado o de resultados: no se indexa ---
  for (const ruta of ["/opac/bpseo/login", "/opac/bpseo/cuenta", "/opac/bpseo/mis-prestamos"]) {
    res = await pedir(ruta);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow", ruta);
    assert.doesNotMatch(await res.text(), /rel="canonical"/, ruta);
  }
  res = await pedir("/opac/bpseo?q=fierro");
  assert.equal(res.headers.get("x-robots-tag"), "noindex, follow");
  res = await pedir("/opac/bpseo");
  assert.equal(res.headers.get("x-robots-tag"), null);
  assert.match(await res.text(), /<title>Biblioteca bpseo · Catálogo en línea<\/title>/);
  res = await fetch(`${base}/api/v1/opac/bpseo/contenido`);
  assert.equal(res.headers.get("x-robots-tag"), "noindex");

  // --- la API devuelve los mismos metadatos para la navegación dentro de la app ---
  res = await fetch(`${base}/api/v1/opac/bpseo/items/Libro/${fierro._id}`);
  const ficha = await res.json();
  assert.equal(ficha.seo.canonical, `${base}${canonica}`);
  process.env.FRONTEND_URL = "https://miapp.vercel.app";
  try {
    res = await fetch(`${base}/api/v1/opac/bpseo/items/Libro/${fierro._id}`);
    assert.equal((await res.json()).seo.canonical, `https://miapp.vercel.app${canonica}`);
    res = await pedir("/robots.txt");
    assert.match(await res.text(), /^Sitemap: https:\/\/miapp\.vercel\.app\/sitemap\.xml$/m);
  } finally {
    delete process.env.FRONTEND_URL;
  }
  res = await fetch(`${base}/api/v1/opac/bpseo/contenido`);
  assert.equal((await res.json()).seo.canonical, `${base}/opac/bpseo`);

  // --- sitemaps: índice por biblioteca, solo material vigente, nada de socios ---
  res = await pedir("/sitemap.xml");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/xml/);
  assert.match(await res.text(), new RegExp(`<loc>${base}/opac/bpseo/sitemap.xml</loc>`));
  res = await pedir("/opac/bpseo/sitemap.xml");
  const sitemap = await res.text();
  assert.match(sitemap, new RegExp(`<loc>${base}/opac/bpseo</loc>`));
  assert.match(sitemap, new RegExp(`<loc>${base}${canonica}</loc><lastmod>\\d{4}-\\d{2}-\\d{2}T`));
  assert.match(sitemap, new RegExp(`revista-billiken-${revista._id}`));
  assert.doesNotMatch(sitemap, new RegExp(String(borrado._id)), "lo dado de baja no está");
  assert.doesNotMatch(sitemap, /login|cuenta|mis-prestamos|socio|7001/);
  assert.doesNotMatch(sitemap, new RegExp(String(socio._id)));
  res = await pedir("/opac/bpseo/sitemap.xml?pagina=2");
  assert.equal(res.status, 404);
});

test("app instalable: manifest de cada catálogo con el nombre y el logo cuadrado de la institución", async (t) => {
  const server = app.listen(0);
  const base = `${"http"}://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bppwa");
  const manifest = async () => {
    const res = await fetch(`${base}/api/v1/opac/bppwa/manifest.webmanifest`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/manifest\+json/);
    return res.json();
  };

  // --- sin nada publicado: el nombre de la biblioteca y los íconos de SIBPSANJUAN ---
  let m = await manifest();
  assert.equal(m.name, "Biblioteca bppwa");
  assert.equal(m.id, "/opac/bppwa/");
  assert.equal(m.start_url, "/opac/bppwa/");
  assert.equal(m.scope, "/opac/bppwa/");
  assert.equal(m.display, "standalone");
  assert.deepEqual(m.icons.map((i) => i.src), ["/icon-192.png", "/icon-512.png", "/icon-192-maskable.png", "/icon-512-maskable.png"]);

  // --- con un logo cuadrado publicado, es el primer ícono; uno apaisado no sirve de ícono ---
  const subir = async (ancho, alto) => {
    const png = await sharp({ create: { width: ancho, height: alto, channels: 4, background: "#ff8300" } }).png().toBuffer();
    const res = await fetch(`${base}/api/contenido/imagenes`, { method: "POST", headers: { Cookie: b.cookie, "Content-Type": "image/png" }, body: png });
    assert.equal(res.status, 201);
    return res.json();
  };
  const publicarConLogo = async (logo) => {
    const { datos } = await (await b.enviar("GET", "/contenido/borrador")).json();
    datos.identidad.nombre = "Colegio San Juan Bautista";
    datos.identidad.logos.cuadrado = logo.id;
    assert.equal((await b.enviar("PUT", "/contenido/borrador", { datos })).status, 200);
    assert.equal((await b.enviar("POST", "/contenido/borrador/publicar")).status, 200);
  };

  const cuadrado = await subir(600, 600);
  await publicarConLogo(cuadrado);
  m = await manifest();
  assert.equal(m.name, "Colegio San Juan Bautista");
  assert.deepEqual(m.icons[0], { src: `/api/v1/opac/bppwa/imagenes/${cuadrado.id}.webp`, sizes: "512x512", type: "image/webp", purpose: "any" });

  const apaisado = await subir(800, 300);
  await publicarConLogo(apaisado);
  m = await manifest();
  assert.equal(m.icons[0].src, "/icon-192.png");

  // --- una biblioteca que no existe no tiene manifest ---
  assert.equal((await fetch(`${base}/api/v1/opac/noexiste/manifest.webmanifest`)).status, 404);
});

test("mostrador estilo Koha: ejemplares con estado, préstamo y devolución por código, reservas en espera, ficha del socio, MARC y notificaciones", async (t) => {
  const server = app.listen(0);
  const base = `${"http"}://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const b = await bibliotecaDePrueba(base, "bpkoha");
  const json = async (r) => ({ status: r.status, cuerpo: await r.json() });
  const libro = await (await b.enviar("POST", "/libros", { titulo: "Rayuela", autores: ["Cortázar, Julio"], isbn: "9789505811236" })).json();
  const objeto = await (await b.enviar("POST", "/objetos", { titulo: "Brújula antigua" })).json();
  const alumna = await b.crearSocio("8001", "ALUMNO");
  const docente = await b.crearSocio("8002", "DOCENTE");

  // --- ítems: varias copias de una vez, con la numeración siguiendo ---
  let r = await json(await b.enviar("POST", "/v1/ejemplares", {
    itemTipo: "Libro", itemId: libro._id, codigoBarras: "KOH-0009", signatura: "863 COR", numeroCopia: "1", ubicacion: "Literatura", cantidad: 3,
  }));
  assert.equal(r.status, 201);
  assert.deepEqual(r.cuerpo.map((e) => [e.codigoBarras, e.numeroCopia]), [["KOH-0009", "1"], ["KOH-0010", "2"], ["KOH-0011", "3"]]);
  const [copia1, copia2, copia3] = r.cuerpo;
  r = await json(await b.enviar("POST", "/v1/ejemplares", { itemTipo: "Libro", itemId: libro._id, codigoBarras: "KOH-0010" }));
  assert.equal(r.status, 409);
  assert.match(r.cuerpo.error, /KOH-0010/);
  r = await json(await b.enviar("POST", "/v1/ejemplares", { itemTipo: "Objeto", itemId: objeto._id, codigoBarras: "X1" }));
  assert.equal(r.status, 400, "lo que no circula no tiene ejemplares");

  // Una copia de referencia y otra en reparación: no cuentan como disponibles.
  await b.enviar("PUT", `/v1/ejemplares/${copia2._id}`, { uso: "no_prestable" });
  await b.enviar("PUT", `/v1/ejemplares/${copia3._id}`, { condicion: "reparacion", notaInterna: "Lomo despegado" });
  r = await json(await fetch(`${base}/api/v1/opac/bpkoha/items/Libro/${libro._id}`));
  assert.equal(r.cuerpo.disponibles, 1);
  assert.deepEqual(r.cuerpo.ejemplares.map((e) => e.estado).sort(), ["disponible", "no_prestable", "reparacion"]);
  assert.ok(!JSON.stringify(r.cuerpo).includes("Lomo despegado"), "la nota interna no es pública");

  // --- préstamo con el lector de códigos ---
  r = await json(await b.enviar("POST", "/v1/circulacion/prestamos", { socioId: alumna._id, codigoBarras: "KOH-0010" }));
  assert.equal(r.status, 409);
  assert.match(r.cuerpo.error, /no se presta/);
  r = await json(await b.enviar("POST", "/v1/circulacion/prestamos", { socioId: alumna._id, codigoBarras: "KOH-9999" }));
  assert.equal(r.status, 404);
  r = await json(await b.enviar("POST", "/v1/circulacion/prestamos", { socioId: alumna._id, codigoBarras: "KOH-0009" }));
  assert.equal(r.status, 201);
  const prestamo = r.cuerpo;

  // La ficha del socio y sus préstamos, con lo que necesita la tabla.
  r = await json(await b.enviar("GET", `/v1/socios/${alumna._id}`));
  assert.equal(r.cuerpo.numeroSocio, "8001");
  assert.equal(r.cuerpo.categoriaInfo.nombre, "Alumno");
  assert.equal(r.cuerpo.reglas.enCurso, 1);
  r = await json(await b.enviar("GET", `/v1/circulacion/prestamos?estado=activo&socioId=${alumna._id}`));
  assert.equal(r.cuerpo.length, 1);
  assert.equal(r.cuerpo[0].ejemplar.codigoBarras, "KOH-0009");
  assert.equal(r.cuerpo[0].item.titulo, "Rayuela");
  assert.equal(typeof r.cuerpo[0].renovacionesRestantes, "number");

  // --- reserva desde el mostrador: no hay copia libre, queda en espera ---
  r = await json(await b.enviar("POST", "/v1/circulacion/reservas", { socioId: docente._id, itemTipo: "Libro", itemId: libro._id }));
  assert.equal(r.status, 201);
  assert.equal(r.cuerpo.estado, "en_espera");
  r = await json(await b.enviar("GET", `/v1/circulacion/solicitudes?estado=abiertas&itemTipo=Libro&itemId=${libro._id}`));
  assert.deepEqual(r.cuerpo.map((s) => [s.socio.numeroSocio, s.estado]), [["8002", "en_espera"]]);

  // Devolución con el lector: el ejemplar pasa a la reserva en espera.
  r = await json(await b.enviar("POST", "/v1/circulacion/devoluciones", { codigoBarras: "KOH-0009" }));
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.reservaSiguiente.socio.numeroSocio, "8002");
  assert.equal(r.cuerpo.item.titulo, "Rayuela");
  r = await json(await b.enviar("POST", "/v1/circulacion/devoluciones", { codigoBarras: "KOH-0009" }));
  assert.equal(r.status, 409, "ya no figura prestado");

  // A otro socio no se le presta lo apartado; al de la reserva, sí, y su reserva queda entregada.
  r = await json(await b.enviar("POST", "/v1/circulacion/prestamos", { socioId: alumna._id, codigoBarras: "KOH-0009" }));
  assert.equal(r.status, 409);
  assert.match(r.cuerpo.error, /apartado para la reserva de otro socio/);
  r = await json(await b.enviar("POST", "/v1/circulacion/prestamos", { socioId: docente._id, codigoBarras: "KOH-0009" }));
  assert.equal(r.status, 201);
  r = await json(await b.enviar("GET", `/v1/circulacion/solicitudes?socioId=${docente._id}`));
  assert.equal(r.cuerpo[0].estado, "aprobada");
  assert.equal(r.cuerpo[0].entregadaEnMostrador, true);

  // --- un ejemplar con historial no se borra: se marca retirado ---
  r = await json(await b.enviar("DELETE", `/v1/ejemplares/${copia1._id}`));
  assert.equal(r.status, 409);
  r = await json(await b.enviar("DELETE", `/v1/ejemplares/${copia3._id}`));
  assert.equal(r.status, 200);

  // --- la ficha del panel y su vista MARC (con los ítems en el 952) ---
  r = await json(await b.enviar("GET", `/v1/catalogo/Libro/${libro._id}`));
  assert.equal(r.cuerpo.item.titulo, "Rayuela");
  assert.equal(r.cuerpo.ejemplares.length, 2);
  r = await json(await b.enviar("GET", `/v1/catalogo/Libro/${libro._id}/marc`));
  const campo = (tag) => r.cuerpo.campos.filter((c) => c.tag === tag);
  assert.equal(campo("245")[0].nombre, "MENCIÓN DE TÍTULO");
  assert.deepEqual(campo("245")[0].subcampos[0], { codigo: "a", valor: "Rayuela", nombre: "Título propiamente dicho" });
  assert.equal(campo("952").length, 2);
  assert.ok(campo("952")[0].subcampos.some((s) => s.codigo === "c" && s.valor === "Literatura"));
  r = await json(await b.enviar("GET", `/v1/catalogo/Objeto/${objeto._id}/marc`));
  assert.equal(r.status, 404);

  // --- cuenta vencida: no se le presta ni reserva ---
  await b.enviar("PUT", `/v1/socios/${alumna._id}`, { vigenteHasta: "2020-12-31" });
  r = await json(await b.enviar("POST", "/v1/circulacion/reservas", { socioId: alumna._id, itemTipo: "Libro", itemId: libro._id }));
  assert.equal(r.status, 409);
  assert.match(r.cuerpo.error, /venció el 31\/12\/2020/);
  r = await json(await b.enviar("PUT", `/v1/socios/${alumna._id}`, { vigenteHasta: "31-12-2030" }));
  assert.equal(r.status, 400, "la fecha va como AAAA-MM-DD");

  // --- notificaciones del staff: vencidos y avisos del sistema, y marcar vistas ---
  await Prestamo.updateOne({ socioId: docente._id, fechaDevolucion: null }, { fechaVencimiento: new Date(Date.now() - 3 * 86400000) });
  await Socio.updateOne({ _id: alumna._id }, { categoria: "VIEJA" });
  r = await json(await b.enviar("GET", "/v1/notificaciones"));
  const tipos = r.cuerpo.notificaciones.map((n) => n.tipo);
  assert.ok(tipos.includes("vencido"));
  assert.ok(tipos.includes("sistema"));
  const vencida = r.cuerpo.notificaciones.find((n) => n.tipo === "vencido");
  assert.match(vencida.titulo, /«Rayuela» de 8002 Prueba está vencido/);
  assert.equal(vencida.enlace, `/socios/${docente._id}`);
  const antes = r.cuerpo.noLeidas;
  await b.enviar("POST", "/v1/notificaciones/vistas", { claves: [vencida.clave] });
  r = await json(await b.enviar("GET", "/v1/notificaciones"));
  assert.equal(r.cuerpo.noLeidas, antes - 1);
  assert.equal(r.cuerpo.notificaciones.find((n) => n.clave === vencida.clave).leida, true);
  void prestamo;
});
