# Auditoría integral — SIBPSANJUAN

Auditoría de todo el sistema (backend + frontend + OPAC) desde 9 perspectivas
distintas, a pedido del equipo de producto. No es la primera pasada: el
código ya tiene marcas `ARQ-N`, `CYBER-N`, `GOB-N`, `MOT-N`, `A11Y-N`, `FE-N`
de una revisión anterior (arquitectura/seguridad/gobierno/motion/
accesibilidad/frontend, parcial) — esta auditoría **continúa esa
numeración** donde ya había hallazgos previos, y agrega dos líneas
completamente nuevas que nunca se habían auditado: catalogación
bibliotecaria (`BIBL-N`) y archivística (`ARCHIV-N`), además de un análisis
de UI (`UI-N`) y UX (`UX-N`) puros que tampoco existían todavía. `README.md`
ya admitía esto explícitamente: *"No es una auditoría WCAG completa"*.

Método: lectura directa de modelos, rutas, middleware y componentes;
verificación en vivo contra una instancia aislada (Mongo en memoria, puerto
3099, nunca contra el entorno del usuario) para los hallazgos que lo
ameritaban; cálculo de contraste WCAG con la fórmula oficial en vez de
"a ojo"; `npm audit` sobre las dependencias reales. Cada hallazgo cita
archivo y línea. Los hallazgos de dominio bibliotecario/archivístico se
apoyan en MARC21, RCAA2/RDA, ISBD e ISAD(G) — estándares internacionales de
uso general en Argentina (vía Biblioteca Nacional Mariano Moreno y AGN);
donde exista una norma o ley argentina puntual que convenga verificar con
un especialista, se lo marca explícitamente en vez de asumir.

Severidad: 🔴 Crítico (bug activo/vulnerabilidad real) · 🟠 Alto (impacto
amplio) · 🟡 Medio (mejora acotada) · 🟢 Bajo (pulido/sugerencia).

---

## Resumen ejecutivo — lo más importante primero

**Actualización 26/07/2026 (undécima pasada):** 42 hallazgos ya se
corrigieron y se verificaron en vivo (tests + Playwright contra una
instancia aislada), en once lotes — **ya no queda ningún hallazgo
abierto en toda la auditoría.** Los últimos tres (UX-5, UX-6, BIBL-6) no
salieron de esta auditoría en sí: aparecieron al investigar un reporte
del usuario después de desplegar a producción (Vercel + Render + Atlas,
ver `DEPLOY.md`), al armar la página de Documentación, y al llevar el
formulario de Libros a un editor MARC completo por solapas (a pedido
explícito del usuario, con el editor de Koha como referencia) — igual
que BIBL-5/ARQ-12 aparecieron al construir otra cosa — mismo criterio de
"lo que se encuentra en el camino se corrige y se documenta acá". GOB-3 y
A11Y-7 se consultaron con el usuario antes de tocarlos, porque no eran
decisiones puramente técnicas:
A11Y-7 quedó resuelto (el foco corregido con `--brand-texto`; los botones
quedan con el naranja vivo, por decisión de diseño consciente — no una
tarea pendiente). GOB-3 pasó por dos pasos: primero un borrador
(`AVISO_PRIVACIDAD_BORRADOR.md`), después conectarlo al OPAC. BIBL-1 se
implementó completo — catálogo de autoridades de autor — y al hacerlo
apareció BIBL-5, un bug real y previo en el campo "Autores" del alta
individual de material, resuelto en el mismo día en los 7 archivos
afectados. En el séptimo lote se resolvieron los 8 hallazgos Medio con
esfuerzo/riesgo acotado (ARQ-8, FE-6, FE-7, A11Y-5, GOB-4, BIBL-2,
ARCHIV-2, y el cierre formal de A11Y-7); al verificar BIBL-2 contra la
documentación oficial de LC apareció un bug real de formato en el 008 de
`RecursoElectronico`, corregido en el mismo momento. En el octavo lote se
cerraron los 15 hallazgos Bajo, incluido BIBL-3 (catálogo de autoridades
de materia, del mismo tamaño que BIBL-1 — el usuario decidió incluirlo en
vez de dejarlo aparte); al implementar BIBL-4 (validación de ISBN/ISSN)
apareció un bug sistémico real — **ARQ-12** — en 9 rutas `PUT` que podían
tirar abajo el proceso ante un error de validación no capturado, corregido
en el mismo momento. En el noveno lote (26/07/2026, a pedido explícito
del usuario, fuera del orden por impacto/esfuerzo porque bloqueaba una
duda puntual sobre el deploy en Vercel) se cerró **ARQ-9/CYBER-5** —
migración de `react-router-dom` de v6 a v7 — el cambio mayor que se
había dejado deliberadamente afuera de los lotes anteriores.

1. ✅ **Resuelto** — ~~`portadaUrl` está roto en producción para cualquier
   imagen externa~~ (ARQ-7/CYBER-3) — Helmet ya permite `https:` en
   `img-src`; confirmado en vivo (`naturalWidth` > 0, sin violaciones CSP).
2. ✅ **Resuelto** — ~~el login del socio "100" era indistinguible entre
   "sin contraseña" y "contraseña incorrecta", sin indicador para el
   staff~~ (UX-1) — la tabla de Socios ahora muestra un badge "OPAC: sí/no"
   por socio.
3. ✅ **Resuelto** — ~~ningún rol podía cambiar su propia contraseña~~
   (CYBER-4) — `PUT /auth/password` + página "Cambiar contraseña" en el
   encabezado. El reset por email para quien la olvida sigue sin existir
   (necesitaría un servicio de correo que este proyecto no tiene).
4. ✅ **Resuelto** — ~~los links de todo el sistema tenían 2.47:1 de
   contraste en tema claro~~ (A11Y-3) — nueva variable `--brand-texto`
   (`#a34d00`, ~6:1 sobre blanco) para texto/links en superficie clara; en
   tema oscuro se sigue usando el naranja original, que ya pasaba.
5. ✅ **Resuelto** — ~~lo que armamos como "Autores" en el sidebar del OPAC
   era un facetado de texto libre, no control de autoridades~~ (BIBL-1) —
   catálogo nuevo de formas normalizadas (`Autor`, página "Autores" en
   Catalogar), resuelto en el OPAC al leer, sin tocar ningún libro ya
   cargado. Al implementarlo apareció un bug real y no relacionado —
   ✅ **también resuelto**: el campo "Autores" del alta individual
   rompía cualquier nombre "Apellido, Nombre" con más de un autor
   (ver BIBL-5).
6. ✅ **Resuelto** — ~~`react-router-dom` tenía 2 CVEs moderados sin parche
   menor disponible~~ (ARQ-9/CYBER-5) — migrado a v7.18.1 (fuera del rango
   vulnerable); 27 tests de frontend en verde y navegación verificada en
   vivo con Playwright, incluida la ruta anidada bajo `/opac/:codigo/*`.
7. ✅ **Resuelto** — ~~el borrado masivo no dejaba registro de *quién*
   borró *qué*~~ (CYBER-4bis) — nuevo campo `eliminadoPor` en los 10
   modelos catalogables + Socio, completado en los 7 puntos donde se borra
   algo (incluido el borrado en cascada al eliminar una biblioteca).

El resto del documento desarrolla estos y otros ~30 hallazgos más, con la
misma evidencia concreta.

---

## 1. Chief Architect — `ARQ-N`

**Ya resuelto en la pasada anterior** (confirmado leyendo el código, no solo
el comentario): versionado `/api/v1` con alias (ARQ-5), paginación opt-in
con `X-Total-Count` (ARQ-3), borrado lógico extendido a los 9 buckets al
eliminar una biblioteca (ARQ-6). Sigue en pie.

- **ARQ-7 ✅ Resuelto (25/07/2026) — `portadaUrl` inutilizable en producción.** Los 8+ modelos
  catalogables exponen un campo `portadaUrl` de texto libre (`camposComunes.js:16`)
  para que el catalogador pegue **cualquier URL externa** de imagen — no hay
  subida de archivos en este proyecto, es la única forma de tener portada.
  `server.js:42` monta `helmet()` sin configurar `contentSecurityPolicy`, y
  el default de Helmet es `img-src 'self' data:` — **ninguna imagen fuera
  del propio dominio carga**. Verificado en vivo: creé un libro con
  `portadaUrl` apuntando a un host real, la tarjeta del OPAC mostró
  `naturalWidth: 0` y la consola tiró
  `Refused to load the image '...' because it violates ... "img-src 'self' data:"`.
  Esto no es un caso borde: es *el* mecanismo de portada del sistema,
  roto para el 100% de los casos reales desde que se agregó `helmet()`.
  Arreglo aplicado tal cual: `helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), "img-src": ["'self'", "data:", "https:"] } } })`
  en `server.js`. Se dejó `https:` abierto (cualquier host) en vez de una
  lista cerrada — no hay PII en juego en una URL de portada, y restringir
  a hosts puntuales habría bloqueado el caso de uso real (cada catalogador
  puede pegar la URL de cualquier biblioteca/editorial). Verificado en vivo
  contra una instancia aislada: la misma portada externa que antes daba
  `naturalWidth: 0` y una violación de CSP en consola ahora carga
  (`naturalWidth: 135`) sin ninguna violación.

- **ARQ-8 ✅ Resuelto (25/07/2026) — Sin CI.** No existía `.github/workflows`
  ni ningún pipeline: los tests de backend y frontend solo corrían si
  alguien se acordaba de correrlos a mano antes de pushear. Con Render
  desplegando directo desde el repo, un commit roto podía llegar a
  producción sin que nada lo frenara. **Arreglo aplicado:** workflow nuevo
  `.github/workflows/ci.yml`, dos jobs independientes (`backend`/
  `frontend`) que corren en cada push/PR a `main` — `npm ci` + `npm test`
  en ambos paquetes, más `npm run build` en frontend para que un build roto
  también bloquee. No toca el deploy en sí (Render sigue desplegando como
  siempre); solo bloquea el merge si algo falla. El repo local todavía no
  tiene remoto de git configurado en este entorno — el workflow queda listo
  para activarse en cuanto el repo se conecte a GitHub.

- **ARQ-9 ✅ Resuelto (26/07/2026) — `react-router-dom` con 2 CVEs
  moderados sin parche menor.** `npm audit` (frontend) reportaba *"Open
  redirect via backslash in `<Link>` y `useNavigate`"* y *"Arbitrary
  Constructor Injection en SSR Hydration"* para el rango
  `6.0.0-alpha.0 - 7.17.0`. La última versión de la línea 6.x (`6.30.4`)
  seguía dentro del rango vulnerable — no había parche menor, hacía falta
  saltar a v7.

  **Antes de tocar nada, se revisó qué tan invasivo era el cambio real**
  (el motivo original por el que este hallazgo se dejó afuera de los
  lotes 1-8): toda la app usa el modo *declarativo* de react-router
  (`BrowserRouter`/`Routes`/`Route`/`Link`/`NavLink`/`useNavigate`/
  `useLocation`/`useParams`/`MemoryRouter` en los tests) — sin data
  routers, sin `loader`/`action`, sin `<Form>`, y sin un solo `Link`/
  `navigate()` que use un path relativo (todos son absolutos, `to="/..."`)
  — que es justo el área donde v6→v7 cambia comportamiento por default
  (`v7_relativeSplatPath` y el resto de los *future flags* de v6, todos
  del mundo de data routers). Con eso confirmado, el upgrade era
  mecánico, no un rediseño de rutas.

  **Arreglo aplicado:** `react-router-dom` `^6.26.0` → `^7.18.1` (la
  última versión de ese paquete — a partir de v8 el proyecto pasa a
  llamarse `react-router` a secas y **exige React 19.2.7+ y Node
  22.22+**, un salto mayor no relacionado con este CVE y fuera de alcance
  de este arreglo; v7.18.1 corre sobre el React 18.3.1 y Node 22.15 que
  ya usa este proyecto, sin tocar nada más).

  Verificado en tres niveles: los 27 tests de frontend existentes
  (`vitest`, incluidos los que montan `MemoryRouter`) siguen en verde sin
  modificar ninguno; el build de producción compila igual (58.82KB →
  64.66KB gzip en el bundle principal, diferencia esperada por el peso
  propio de v7, cada página sigue en su chunk lazy); y en vivo con
  Playwright contra una instancia aislada — login → navegación cliente
  entre rutas del panel, y el caso que más podía romper con el cambio de
  reglas de resolución de v7: una ruta anidada bajo la ruta con comodín
  `/opac/:codigo/*` (`/opac/<código>/privacidad`) renderizó el componente
  correcto (`<h1>Aviso de privacidad</h1>`) sin errores de consola.

  **Nota:** `npm audit` sigue mostrando 1 hallazgo alto nuevo
  (`GHSA-qwww-vcr4-c8h2`, "RSC Mode CSRF Bypass", parcheado recién en
  `react-router@8.3.0` — un paquete que ya no tiene build de
  `react-router-dom`) — la propia advisory aclara que **solo afecta a
  quien use las APIs `unstable_*` de RSC** (React Server Components),
  que este proyecto no usa ni va a usar (es una SPA con Vite, sin SSR ni
  RSC). Mismo criterio de riesgo práctico que ya se aplicaba al hallazgo
  original: queda anotado, no bloquea nada, y saltar a v8 traería consigo
  la migración a React 19 — un cambio de otro orden, no pedido acá.

- **ARQ-10 ✅ Resuelto (26/07/2026) — Referencia rota en la documentación.**
  `README.md:301` apuntaba a `../ARQUITECTURA.md` ("de Koha Puente") — ese
  archivo no existe ni en este repo ni en el directorio padre (`f:/PGBP/`).
  **Consultado con el usuario:** el proyecto ya es independiente — no hay
  ningún repo hermano "Koha Puente" del que colgar esa referencia.
  **Arreglo aplicado:** se sacó la línea del README; el párrafo sobre
  despliegue queda apuntando solo a `DEPLOY.md`, que sí existe.

- **ARQ-11 ✅ Resuelto (26/07/2026) — Borrado masivo sin endpoint de lote.**
  El "Eliminar seleccionados" (`useListaCrud.js`, `onEliminarSeleccionados`)
  hace un `DELETE` por id, secuencial. **Decisión consciente, no un
  arreglo de código:** correcto para los volúmenes de una biblioteca chica
  (decenas por página, no miles) — sumar un endpoint de borrado en lote
  ahora sería resolver un problema de escala que todavía no existe. Se
  deja documentado tal cual para cuando la escala lo justifique, mismo
  criterio que ARQ-9 (migración de router).

- **ARQ-12 ✅ Resuelto (26/07/2026) — Descubierto al implementar BIBL-4: 9
  rutas `PUT /:id` con `runValidators: true` sin try/catch podían tirar
  abajo el proceso ante un error de validación.** `findOneAndUpdate`/
  `findByIdAndUpdate` con `{ runValidators: true }` rechaza la promesa si
  falla una validación del schema — pero `rutasCatalogo.js`,
  `rutasCatalogoSinCirculacion.js`, y las rutas `PUT /:id` de `libros.js`,
  `seriadas.js`, `recursosElectronicos.js`, `socios.js`, `bibliotecas.js`,
  `bibliotecarios.js` y `supervisores.js` llamaban a estos métodos **sin
  ningún `try/catch`** alrededor. En un handler de Express `async` sin
  capturar, eso queda como una promesa rechazada sin manejar — y desde
  Node 15, el comportamiento por default ante eso es terminar el proceso
  completo (no solo la request), sin ningún `process.on("unhandledRejection")`
  en este proyecto que lo evite. Antes de BIBL-4 esto ya era alcanzable
  (ej. mandar un campo que viole un `enum` existente al editar), pero
  BIBL-4 lo hacía trivialmente disparable desde el formulario de edición
  de cualquier Libro/Seriada con un ISBN/ISSN mal tipeado.

  **Arreglo aplicado:** se envolvió cada una de las 9 llamadas en
  `try/catch`, devolviendo `400` con el mensaje de validación en vez de
  dejar la promesa sin capturar — mismo patrón que ya usaban los `POST` de
  esos mismos archivos. `routes/autores.js` ya lo hacía bien (se armó con
  cuidado en el lote de BIBL-1) y no necesitó cambios. Verificado con un
  test de integración nuevo: editar un Libro con un ISBN inválido devuelve
  `400` y el servidor sigue respondiendo con normalidad después — antes de
  este arreglo, ese mismo caso habría colgado la request o terminado el
  proceso.

## 2. Senior Cybersecurity — `CYBER-N`

**Ya resuelto:** algoritmo JWT fijado explícitamente a HS256 (CYBER-1,
`middleware/auth.js:9`), rate limit de 20 intentos/15min en *ambos* logins
(staff y OPAC — CYBER-2), cookies `httpOnly`+`sameSite=lax`+`secure`
condicionado a `COOKIE_SECURE`, permisos revocables (`bibliotecasSupervisadas`/
`permisos`) releídos de la base en cada request en vez de confiar en el JWT
horneado, bcrypt con costo 10, cero vulnerabilidades en dependencias de
backend (`npm audit` limpio).

- **CYBER-3 ✅ Resuelto (25/07/2026) — Ver ARQ-7.** Mismo hallazgo, ángulo de
  seguridad: no era solo que la imagen no cargara — era una directiva CSP
  sin adaptar al caso de uso real del sistema. Se tomó la decisión
  explícita de dejar `img-src` en `https:` (cualquier host) en vez de una
  lista cerrada de dominios — ver el razonamiento completo en ARQ-7.

- **CYBER-4 ✅ Resuelto (25/07/2026) — Ninguna cuenta puede cambiar ni
  recuperar su propia contraseña.** Revisé `routes/auth.js`,
  `bibliotecarios.js`, `superbibliotecarios.js`, `supervisores.js`,
  `usuarios.js`: había rutas para *crear* una cuenta con contraseña y para
  que el staff le *asigne* una contraseña nueva a un socio
  (`socios.js:94`), pero ninguna para que un usuario de staff logueado
  cambiara la suya, y ningún flujo de "olvidé mi contraseña" para nadie.
  **Arreglo aplicado:** `PUT /auth/password` (`requiereLogin`, body
  `{ passwordActual, passwordNueva }`, verifica la actual con
  `bcrypt.compare` antes de aceptar el cambio, exige mínimo 8 caracteres
  en la nueva) + página nueva `CambiarPassword.jsx` con link "Cambiar
  contraseña" en el encabezado, junto a "Salir". El "olvidé mi contraseña"
  (reset por email) queda **fuera de este cambio a propósito**: este
  proyecto no tiene ningún servicio de correo configurado, agregarlo sería
  una dependencia nueva que no se pidió acá. Verificado en vivo: contraseña
  actual incorrecta rechazada, cambio correcto aplicado, la vieja deja de
  servir y la nueva funciona en el siguiente login. 4 tests nuevos
  (backend).

- **CYBER-4bis ✅ Resuelto (25/07/2026) — Sin autoría en el borrado
  (individual o masivo).** El soft-delete (`eliminadoEn`, ver GOB-2)
  registraba *cuándo* se borró un registro, pero no *quién* lo hizo.
  **Arreglo aplicado:** campo `eliminadoPor: ObjectId` (ref `Usuario`) en
  `camposComunes()` (cubre los 9 buckets que ya lo usan) + agregado a mano
  en `Libro.js` y `Socio.js`, que **no** usan `camposComunes()` (tienen su
  propio schema escrito a mano) — de hecho el primer intento de este
  arreglo pasó los tests para 9 de los 10 tipos y falló silenciosamente
  para `Libro` exactamente por este motivo: Mongoose en modo estricto
  descarta en silencio un campo que no está declarado en el schema, así
  que `libro.eliminadoPor = req.usuario.id` no tiraba ningún error, el
  `.save()` "funcionaba", y el campo simplemente no quedaba grabado — el
  test nuevo lo atrapó al verificar el valor guardado en la base, no solo
  el status code de la respuesta. Se completó en los 7 puntos donde se
  hace un borrado (`libros.js`, `seriadas.js`, `recursosElectronicos.js`,
  `socios.js`, el factory compartido `rutasCatalogo.js` —Material
  Sonoro/Audiovisual/Cartográfico/Gráfico/Didáctico—, el factory
  `rutasCatalogoSinCirculacion.js` —Archivos/Objetos— y el borrado en
  cascada de `bibliotecas.js`). 2 tests nuevos (backend) verifican el
  campo tanto en un borrado individual como en el cascada.

- **CYBER-5 ✅ Resuelto (26/07/2026) — Ver ARQ-9.** Mismo CVE de
  `react-router-dom`, ángulo de seguridad: el *open redirect* requería que
  un `<Link>`/`navigate()` recibiera un path controlado por el atacante
  para ser explotable — no había un vector directo hoy (todas las rutas
  son fijas o vienen de `codigo`/`id` ya validados server-side), pero
  "hoy no hay vector" no era lo mismo que "está parcheado". Con el
  upgrade a v7.18.1 (ver ARQ-9 para el detalle completo de la migración y
  su verificación) el paquete queda fuera del rango vulnerable — deja de
  depender de que ninguna ruta futura reabra el riesgo sin querer.

- **CYBER-6 ✅ Resuelto (26/07/2026) — `express.json()` sin límite explícito.**
  Corría con el default de `body-parser` (100kb) — razonable, pero sin
  documentar por qué alcanza. **Arreglo aplicado:**
  `express.json({ limit: "2mb" })` en `server.js`, con margen explícito
  para el body más grande de esta API (`POST /libros/importar-csv`, que
  manda el CSV entero como string en el body) sin dejar de acotar el
  tamaño máximo aceptado.

## 3. Senior Frontend Architect — `FE-N`

**Ya resuelto:** cache con invalidación selectiva para listados de alta
frecuencia (FE-5, `api.js:59`), hook compartido `useListaCrud` que evitó
triplicar la lógica de listar/crear/editar/eliminar en 12 páginas.

- **FE-6 ✅ Resuelto (25/07/2026) — Sin lazy-loading de rutas.** `App.jsx`
  importaba las ~20 páginas del panel de forma estática — con
  `react-router-dom` ya en el proyecto, cada página nueva agrandaba el
  bundle inicial aunque una biblioteca solo use unos pocos buckets.
  **Arreglo aplicado:** cada página (panel + OPAC) pasó a `React.lazy(() =>
  import(...))`, con un único `<Suspense fallback={<CargandoInicial />}>`
  envolviendo cada árbol de rutas (`Rutas` y `OpacApp`). `Layout.jsx` y
  `OpacLayout.jsx` quedan eager a propósito — son el marco que se monta
  siempre, no una pantalla puntual. Verificado con el build de producción:
  el bundle principal bajó de 184KB (antes ~300KB citado acá) a 58.82KB
  gzip, con cada página en su propio chunk (`Libros-*.js`,
  `CatalogoPublico-*.js`, etc.); confirmado en vivo que la navegación entre
  páginas lazy sigue funcionando con normalidad.

- **FE-7 ✅ Resuelto (25/07/2026) — Ningún test cubre `CatalogoPublico.jsx`.**
  Es la pantalla más compleja del OPAC (filtros multi-select, paginación,
  dos fetches en cascada) y no tenía `.test.jsx`, a diferencia de
  `Libros.jsx`/`Login.jsx`/`Pager.jsx`. **Arreglo aplicado:**
  `CatalogoPublico.test.jsx` nuevo, originalmente 5 tests (ahora 6, ver
  BIBL-3 más abajo): combinación de los dos fetches en cascada (catálogo +
  autoridades de autor) con el total correcto, el filtro multi-select de
  tipo de ítem excluyendo resultados, la paginación (24 por página)
  avanzando con "Siguiente", el agrupado de variantes de autor bajo la
  forma autorizada (BIBL-1, como test de regresión), y el modal de detalle
  abriendo/cerrando con Escape.

- **FE-8 ✅ Resuelto (26/07/2026) — Sin variable de entorno para la URL de
  API.** `api.js` asumía same-origin (`fetch("/api/v1/...")`) sin forma de
  configurarlo distinto. **Arreglo aplicado:** `BASE` ahora lee
  `import.meta.env.VITE_API_URL` con fallback a `""` — sin configurar,
  el comportamiento es idéntico al de siempre (same-origin); el día que el
  frontend se despliegue separado del backend, alcanza con definir esa
  variable. `frontend/.env.example` nuevo documenta la variable (antes no
  existía ningún `.env.example` de frontend).

## 4. Principal UI Designer — `UI-N`

- **UI-1 ✅ Resuelto (25/07/2026) — El acento naranja de marca funcionaba
  como color de texto en demasiados lugares para su propio contraste**
  (desarrollado en detalle en A11Y-3) — usar el mismo `--brand` para
  links, badges de tipo, "Ver detalle →" y el foco hacía que nada de eso
  se distinguiera entre sí jerárquicamente, además de fallar contraste.
  El arreglo de A11Y-3/A11Y-7 (`--brand-texto` para texto y foco,
  `--brand` reservado para acciones primarias) resolvió las dos cosas con
  el mismo cambio, tal como se sugería acá.

- **UI-2 ✅ Resuelto (26/07/2026) — Iconografía inconsistente: emoji vs
  texto vs símbolo.** El sistema mezcla emoji reales (🌙/☀️ en
  `ThemeToggle`), símbolos Unicode (☰/✕ en el botón hamburguesa, ▾ en los
  desplegables, → en "Ver detalle") y texto plano para el resto de las
  acciones. **Decisión consciente, no un arreglo de código:** se mantiene
  tal cual — es una elección válida y liviana (sin dependencia de una
  librería de íconos) que hoy funciona porque el inventario de símbolos es
  chico; sumar un set de SVG consistente sería un cambio visual amplio y
  no pedido, para reconsiderar si el inventario de símbolos crece mucho
  más.

- **UI-3 ✅ Resuelto (26/07/2026) — Estados vacíos son solo texto.**
  "Todavía no cargaste ningún libro." era una fila de tabla con una
  oración — correcto y honesto, pero una oportunidad perdida de guiar al
  usuario nuevo. **Arreglo aplicado:** en `Libros.jsx` (el único bucket con
  carga masiva por CSV), el estado vacío ahora incluye un link "carga
  masiva desde CSV/Excel" que abre el `<details>` correspondiente y hace
  scroll hasta él. Los otros 9 buckets no tienen carga masiva por CSV, así
  que no aplica el mismo link — su estado vacío queda como estaba.

## 5. Senior UX Designer — `UX-N`

- **UX-1 ✅ Resuelto (25/07/2026) — Esto es, con altísima probabilidad, la causa real del bug de
  login del socio "100" que reportaste antes.** `routes/opac.js:286-287`
  devuelve el mismo mensaje genérico ("Número de socio o contraseña
  incorrectos") tanto si la contraseña es incorrecta como si el socio
  **nunca tuvo una contraseña asignada** (`passwordHash: null` es el
  default de todo socio nuevo — `models/Socio.js:16`). Es la decisión de
  seguridad correcta (no confirmar si una cuenta existe), pero deja una
  laguna de soporte real: no hay forma de saber, sin adivinar, si el socio
  100 alguna vez tuvo el paso "Socios -> Login OPAC -> Guardar contraseña"
  hecho, o si directamente escribió mal la contraseña. `LoginSocio.jsx:53`
  ya tiene un mensaje ("¿No tenés contraseña todavía? Pedila en la
  biblioteca.") que ayuda un poco del lado del socio, pero del lado del
  staff (`Socios.jsx`, tabla de socios) **no hay ningún indicador visual**
  de qué socios ya tienen login configurado y cuáles no — hay que abrir el
  panel "Login OPAC" de cada uno para enterarse, y ni siquiera ahí dice
  "ya tiene una" vs. "nunca tuvo". Se implementó la parte (1): la tabla de
  Socios ahora muestra un badge `OPAC: sí`/`OPAC: no` por fila —
  `GET /socios` computa `tieneLoginOpac: Boolean(passwordHash)` en el
  servidor y nunca manda el hash en sí (verificado: los tests que ya
  comprobaban que `passwordHash` nunca viaja en la respuesta siguen en
  verde). La parte (2) —distinguir los tres motivos en el log interno del
  backend— queda pendiente, es un cambio más chico que se puede sumar
  después si hace falta. Verificado en vivo: el badge pasa de "OPAC: NO" a
  "OPAC: SÍ" apenas se le guarda una contraseña al socio, sin recargar
  manualmente el listado.

- **UX-2 ✅ Resuelto (25/07/2026) — El borrado masivo no muestra *qué* se va
  a borrar antes de confirmar.** El `confirm()` nativo decía "¿Eliminar
  los libros seleccionados? (3)" — un número, no los títulos.
  **Arreglo aplicado:** el mensaje ahora lista hasta 10 títulos (con
  "…y N más" si hay más) de los elementos realmente seleccionados, en
  `useListaCrud.js`. Se mantuvo el `confirm()` nativo del navegador en vez
  de un modal propio — es lo que ya usaba todo el resto del sistema para
  confirmaciones, y no había necesidad de introducir un patrón nuevo solo
  para esto.

- **UX-3 ✅ Resuelto (25/07/2026) — Ninguna pantalla explica qué significa
  "borrado lógico" al usuario.** Los 9 modelos catalogables + Socio
  implementan soft-delete (GOB-2) — un acierto de diseño — pero "Eliminar"
  se veía y se sentía exactamente igual que un borrado permanente.
  **Arreglo aplicado:** tanto el borrado individual como el masivo
  agregan ahora la misma línea al final de la confirmación: "Queda
  guardado y se puede restaurar desde la base de datos si hace falta." —
  no se construyó una pantalla de "Elementos eliminados" para restaurar
  desde la UI (eso seguiría siendo intervención directa sobre la base,
  como ya lo era) porque no fue lo que se pidió; esto resuelve la parte
  de "avisar que no es realmente permanente", que era el hallazgo
  concreto. Verificado en vivo: el texto del `confirm()` real, capturado
  con Playwright, incluye los títulos y esta frase.

- **UX-4 ✅ Resuelto (26/07/2026) — Los formularios de alta de material no
  mostraban progreso ni guardaban borrador.** Un libro con 12+ campos
  (`Libros.jsx`) se perdía entero si se cerraba la pestaña o se recargaba
  sin guardar. **Arreglo aplicado:** `useListaCrud.js` (el hook compartido
  por los 11 buckets con formulario) ahora registra un `beforeunload`
  nativo que avisa si el formulario tiene cambios sin enviar, comparando
  contra `vacio` o contra la entidad cargada al editar. Cubre cerrar la
  pestaña, recargar o navegar a otra URL — **no** cubre navegar a otra
  pantalla *dentro* de esta SPA (eso necesitaría un router de datos con
  bloqueo de navegación, que este proyecto no usa — ver ARQ-9). 1 test
  nuevo en `Libros.test.jsx` confirma que el aviso aparece con cambios sin
  guardar y desaparece después de guardar o cancelar.

- **UX-5 ✅ Resuelto (26/07/2026) — Descubierto fuera de esta auditoría, a
  partir de un reporte del usuario ("un socio que crea el superbibliotecario
  no puede entrar al OPAC, pero uno creado por admin/supervisor sí").**
  Investigado en vivo de punta a punta (API directa y UI real, biblioteca
  nueva, supervisor, superbibliotecario, socio) sin lograr reproducirlo — la
  causa resultó no tener nada que ver con quién crea al socio. Al revisar
  `POST /opac/:codigo/login` (`routes/opac.js`) para descartar hipótesis, se
  encontró un bug real y distinto: `numeroSocio` se guarda con `trim` al
  crear el socio (`models/Socio.js`), pero el login lo buscaba tal cual
  llegaba en el body, sin recortar — un espacio de más al tipearlo o
  pegarlo (fácil que pase sin darse cuenta) hacía que el `findOne` no
  encontrara el socio y devolviera el mismo mensaje genérico que una
  contraseña incorrecta (mismo mecanismo de UX-1: error indistinguible por
  diseño, por seguridad, pero acá ocultaba una causa evitable). El caso
  puntual reportado por el usuario nunca se reprodujo — verificado que
  admin/supervisor sí ven correctamente los socios que crea un
  superbibliotecario, y que el login del OPAC funciona igual sin importar
  quién haya creado la cuenta — así que probablemente haya sido justamente
  esto: un espacio de más en algún intento de prueba.

  **Arreglo aplicado:** `numeroSocio` se recorta (`trim()`) antes de
  buscarlo en el login del OPAC, igual que ya se guarda. La contraseña
  **no** se toca — un espacio ahí podría ser parte real de ella. Test de
  integración nuevo: un login con `"  0001  "` (espacios de más) contra la
  contraseña correcta ahora entra igual.

- **UX-6 ✅ Resuelto (26/07/2026) — Descubierto al armar capturas de
  pantalla reales para la página de Documentación: el badge "OPAC: sí/no"
  de la tabla de Socios no se actualizaba solo después de guardar una
  contraseña con "Login OPAC".** `onGuardarCredenciales`
  (`Socios.jsx`) llamaba a `api.crearCredencialesSocio` — que sí invalida
  la caché del lado del cliente (`cacheInvalidate`, ver FE-5) — pero nunca
  volvía a pedir la lista, así que la fila seguía mostrando "OPAC: no"
  hasta recargar la página a mano o navegar afuera y volver. Contradice
  directamente el propósito del indicador (UX-1: que el staff sepa de un
  vistazo si un socio ya tiene login sin tener que adivinar).
  **Arreglo aplicado:** se agregó `await recargar()` (ya expuesto por
  `useListaCrud`, el mismo mecanismo que ya usan crear/editar/eliminar en
  esta y todas las demás pantallas de listado) después de guardar la
  contraseña. Verificado en vivo: el badge pasa de "OPAC: NO" a
  "OPAC: SÍ" apenas se guarda, sin recargar manualmente — capturado en la
  imagen de ejemplo de la sección "Socios" de `/documentacion`.

## 6. Senior Accessibility Engineer — `A11Y-N`

**Ya resuelto:** el foco se mueve al contenido en cada cambio de ruta
(A11Y-2, `useFocoEnRuta.js`) — bien pensado para usuarios de teclado/lector
de pantalla en una SPA. `skip-link`, `role="alert"`/`role="status"` en
mensajes, `aria-label` en botones de solo-ícono, `sr-only` en encabezados de
columna de acciones: todo esto ya estaba bien implementado y sigue
funcionando con los cambios de esta sesión.

- **A11Y-3 ✅ Resuelto (25/07/2026) — Contraste de los links falla WCAG AA en tema claro.**
  Calculé el contraste real (fórmula WCAG, no estimado) de
  `a { color: var(--brand) }` (`estilos.css`, `--brand: #ff8300`) contra
  `--bg-elevado: #ffffff`: **2.47:1**. El mínimo AA para texto normal es
  4.5:1 (3:1 para texto grande) — esto **falla** con margen amplio, para
  *todos* los enlaces del sistema (nav, "Ver detalle", tags de tipo,
  cualquier `<a>`). El mismo color contra el fondo oscuro (`--bg-elevado`
  dark `#1e2126`) da **6.54:1** — pasa cómodo. Es decir: es un defecto
  exclusivo del tema claro, que además es el que ve cualquier visitante
  sin preferencia de SO guardada (el default declarado en `:root`). Nota
  aparte: `--texto-mudo` (`#888888`, usado en placeholders y etiquetas
  chicas) da 3.54:1 sobre blanco — pasa para texto grande, falla para
  texto normal; **no se tocó en esta pasada** (--texto-mudo se usa en más
  lugares y ameritaba su propia revisión — queda pendiente, ver más abajo).
  Arreglo aplicado a los links: nueva variable `--brand-texto` (`#a34d00`,
  ~6:1 sobre blanco en tema claro; en tema oscuro es simplemente
  `var(--brand)`, que ya pasaba a 6.5:1) usada en `a`, el hover/activo del
  menú desplegable, `.catalogo-filtros__materias button:hover`,
  `.tarjeta-catalogo__tipo` y `.tarjeta-catalogo__vermas`. Deliberadamente
  **no** se tocó `--brand` como fondo de botones primarios (texto blanco
  sobre naranja) ni el anillo de foco — eso también falla el mismo cálculo
  de contraste (2.47:1) pero es un cambio visualmente mucho más amplio
  (todos los botones del sistema) que no estaba pedido en este lote; queda
  anotado como hallazgo nuevo para una próxima pasada. Verificado en vivo:
  el color computado de `.tarjeta-catalogo__vermas` da `rgb(163, 77, 0)`
  en tema claro y `rgb(255, 131, 0)` en tema oscuro, como se esperaba.

- **A11Y-4 ✅ Resuelto (25/07/2026) — Transiciones/hover que no respetan `prefers-reduced-motion`.**
  Ya existen 3 bloques `@media (prefers-reduced-motion: reduce)` puntuales
  (menú desplegable, fila que se desvanece al eliminar — MOT-3 — y
  `.flash`), pero no cubrían las animaciones del catálogo del OPAC:
  `.tarjeta-catalogo:hover { transform: translateY(-2px) }`, el
  `transition` de esa misma regla, y `.tarjeta-catalogo__portada img`
  escalando al hacer hover. Se agregó un cuarto bloque que anula esos
  `transform`/`transition` (deja el cambio de color/sombra del hover, que
  no es movimiento) sin tocar el resto del comportamiento. Verificado en
  vivo con un contexto Playwright `reducedMotion: "reduce"`:
  `transitionProperty` de `.tarjeta-catalogo` pasa a ser solo
  `box-shadow, border-color` (sin `transform`).

- **A11Y-5 ✅ Resuelto (25/07/2026) — El toggle de tema no anunciaba el
  cambio a lectores de pantalla.** `ThemeToggle.jsx` cambiaba
  `aria-label`/`title` del botón (bien), pero el cambio de tema en sí (toda
  la paleta de color de la página) no tenía ningún `aria-live` que lo
  anunciara. **Arreglo aplicado:** un `<span className="sr-only"
  role="status">` nuevo junto al botón, con el texto "Tema oscuro
  activado"/"Tema claro activado" según corresponda — mismo patrón
  `role="status"` que ya usa el resto del sistema para otros cambios de
  estado. Verificado en vivo: tras togglear el tema, el texto del `span`
  pasa a "Tema oscuro activado".

- **A11Y-7 ✅ Resuelto (25/07/2026) — Descubierto al implementar
  A11Y-3: los botones primarios y el anillo de foco tenían el mismo
  problema de contraste, sin corregir.** `button { background: var(--brand);
  color: white; }` (botón "Guardar" de todo formulario, chips activos de
  materia/autor, skip-link) es texto blanco sobre `#ff8300` — el mismo
  cálculo de A11Y-3 da 2.47:1, falla AA, **en ambos temas** (a diferencia
  de los links, acá no ayuda que el tema oscuro use superficies oscuras: es
  un par de colores fijo, blanco sobre naranja, sin relación con el fondo
  de la página). El foco (`:focus-visible { outline: 2px solid var(--brand) }`)
  tenía el mismo naranja como contorno, que técnicamente necesita 3:1
  (criterio no-texto) en vez de 4.5:1, pero por el mismo motivo tampoco
  llegaba en algunas combinaciones.

  **Consultado con el usuario:** arreglar el foco sí, los botones no —
  cambiar el fondo de todos los botones primarios del sistema es un
  cambio visual mucho más amplio que "los links son más oscuros", y se
  prefirió no tocarlo. **Arreglo aplicado:** el foco ahora usa
  `var(--brand-texto)` en vez de `var(--brand)` — mismo mecanismo ya
  verificado en A11Y-3, sin variable nueva. Verificado en vivo: el
  `outline-color` computado de un input enfocado da `rgb(163, 77, 0)` en
  tema claro. Queda una excepción conocida y aceptada, documentada en el
  propio CSS: un foco sobre un botón que *ya* tiene fondo `--brand` sigue
  con contraste bajo entre sí (naranja oscuro sobre naranja vivo) — eso
  necesitaría tocar el fondo del botón, que quedó explícitamente fuera de
  este arreglo. Los botones primarios siguen con `--brand` sin cambios,
  a propósito, como decisión de diseño consciente (no pendiente). **Cierre
  formal (25/07/2026):** no queda ninguna acción técnica pendiente en este
  hallazgo — lo único que faltaba (el foco) está corregido, y lo demás es
  una decisión de diseño ya tomada, no una tarea abierta.

- **A11Y-6 ✅ Resuelto (26/07/2026) — Checkboxes de selección masiva sin
  agrupación semántica.** Los checkboxes de "seleccionar todos"/por fila
  (`Libros.jsx` y las 10 páginas equivalentes, incluidas `Autores.jsx` y
  `Materias.jsx` de este mismo lote) tenían `aria-label` individual
  correcto, pero nada que explique a un lector de pantalla que forman
  parte de una selección múltiple con una acción en lote asociada.
  **Arreglo aplicado:** un `<caption className="sr-only">` en cada una de
  las 11 tablas ("Podés tildar más de una fila para actuar sobre varias a
  la vez con 'Eliminar seleccionados'.") — `<caption>` es el elemento
  semánticamente correcto para describir una tabla, sin necesitar
  `aria-describedby`/IDs nuevos, y se anuncia automáticamente al entrar a
  la tabla con un lector de pantalla.

## 7. Senior Motion Designer — `MOT-N`

**Ya resuelto:** fade-out de 150ms antes de sacar una fila de la lista en
vez de que desaparezca de un salto (MOT-3).

- **MOT-4 ✅ Resuelto (25/07/2026) — Ver A11Y-4** — mismas transiciones del
  catálogo del OPAC, ángulo de motion: el hover de `.tarjeta-catalogo`
  (translateY -2px + sombra, 120ms) y el zoom de portada (150ms) siguen
  ahí como feedback (comunican "esto es clickeable") para quien no pidió
  reducir el movimiento; para quien sí lo pidió, ya no se disparan — ver
  el detalle del arreglo en A11Y-4.

- **MOT-5 ✅ Resuelto (26/07/2026) — El panel del menú hamburguesa
  aparecía sin transición.** Era instantáneo, sin curva de easing,
  inconsistente con `.menu-desplegable__panel`, que sí tiene una animación
  de entrada de 100ms (`aparecer`). **Arreglo aplicado:** el mismo
  `animation: aparecer 100ms ease-out` se agregó a
  `header.app.menu-abierto .brand-nav nav` y `.header-derecha` (el
  `display: none → flex` del breakpoint mobile deja que la animación se
  dispare igual al aparecer), sumado al bloque
  `@media (prefers-reduced-motion: reduce)` ya existente.

## 8. Senior Government Platform Designer — `GOB-N`

**Ya resuelto:** borrado lógico en vez de destructivo en todo dato con
valor institucional (GOB-2) — exactamente el criterio que un sistema de
gestión pública debería tener por defecto.

- **GOB-3 ✅ Resuelto (25/07/2026) — Sin aviso de privacidad ni base legal
  para los datos de socios.** El modelo `Socio` guarda DNI, dirección,
  teléfono, email, fecha de nacimiento (`models/Socio.js:8-14`) — datos
  personales en el sentido de la Ley 25.326 (Protección de Datos
  Personales, Argentina). No había, en ningún punto de la UI, un texto
  que informe qué datos se recolectan, con qué fin, ni cómo ejercer los
  derechos de acceso/rectificación que esa ley reconoce.

  **Consultado con el usuario en dos pasos:** primero pidió un borrador
  para revisar (`AVISO_PRIVACIDAD_BORRADOR.md`, raíz del repo — sigue
  existiendo como referencia con las notas de qué verificar antes de
  confiar en el texto tal cual), después pidió conectarlo al OPAC.
  **Arreglo aplicado:** página nueva `AvisoPrivacidad.jsx` en
  `/opac/:codigo/privacidad` (pública, sin necesitar sesión de socio —
  un aviso de privacidad tiene que poder leerse *antes* de decidir si
  confiar los datos), con un link "Aviso de privacidad" en un pie de
  página nuevo (`OpacLayout.jsx`, discreto, visible en toda pantalla del
  OPAC). El contacto usa "acercate al mostrador de la biblioteca" en vez
  de un dato inventado — este sistema no tiene ningún campo de contacto
  de biblioteca configurado. Verificado en vivo: el link del pie lleva a
  la página, que renderiza el contenido completo. El texto **sigue sin
  ser asesoría legal verificada** — es contenido honesto y razonable,
  no una garantía de cumplimiento normativo puntual para cada
  jurisdicción.

- **GOB-4 ✅ Resuelto (25/07/2026) — El free tier de Render/Atlas ya está
  documentado como riesgo (`DEPLOY.md`), pero no había un aviso *en la
  aplicación* para el socio.** El "duerme tras 15 min" solo se explicaba al
  staff (`CargandoInicial` en `App.jsx`, y solo en el panel de staff) — el
  OPAC público, que es justamente donde un socio anónimo puede toparse con
  la demora inicial sin contexto ninguno, no tenía el mismo aviso.
  **Arreglo aplicado:** se extrajo la lógica del timer a un hook compartido
  (`useAvisoCargaLenta.js`, umbral de 2.5s) usado tanto por
  `CargandoInicial` (staff) como por el "Cargando catálogo..." de
  `CatalogoPublico.jsx` (OPAC) — mismo texto, mismo umbral, un solo lugar
  que sabe la regla. Verificado en vivo con las respuestas de `/api/v1/opac/`
  demoradas artificialmente 3s: el mensaje aparece primero sin la nota de
  demora, y pasado el umbral se agrega "Puede tardar unos segundos si el
  servidor estaba inactivo — es normal, no hace falta recargar."

- **GOB-5 ✅ Resuelto (26/07/2026) — Lenguaje claro: en general muy bien,
  con una excepción.** El resto del sistema usa español rioplatense simple
  y directo ("Guardando…", "Todavía no cargaste ningún libro"), coherente
  con los lineamientos de lenguaje claro que suelen pedir las guías de
  estilo de sitios de gobierno. La excepción: `err.message` crudo de
  Mongoose podía filtrarse en `opac.js:424` ante un fallo de
  `Solicitud.create` — en inglés técnico, incomprensible para un socio
  común. **Arreglo aplicado:** ese catch ahora devuelve un mensaje fijo en
  español ("No se pudo registrar el pedido. Probá de nuevo en un
  momento."), y loguea el error real server-side (`console.error`) para
  no perder la información de diagnóstico. **Alcance deliberado:** se
  revisó solo `opac.js` (la única superficie que un socio ve directamente)
  — las rutas de staff (catalogación, admin) siguen devolviendo
  `err.message` tal cual, que es información de validación razonable para
  un cataloger, no una filtración hacia el público.

## 9. Senior Argentine National Librarian — `BIBL-N`

- **BIBL-1 ✅ Resuelto (25/07/2026) — "Autores" en el sidebar del OPAC era
  texto libre, no control de autoridades.** El facet "Autores" agrupaba
  por el string exacto tal como lo tipeó el catalogador — sin eso,
  "Borges, Jorge Luis", "Borges, J.L." y "Jorge Luis Borges" quedaban
  como tres facetas distintas en vez de una sola.

  **Arreglo aplicado**, tal como se sugería acá — un catálogo simple de
  formas normalizadas, sin llegar a un módulo de autoridades MARC21
  completo:
  - Modelo nuevo `Autor` (`formaAutorizada` + `variantes: [String]`,
    soft-delete, único por biblioteca) y rutas CRUD
    (`routes/autores.js`, permiso `catalogar`), sin usar ninguna de las
    dos fábricas compartidas —esas asumen un campo `titulo` que acá no
    existe.
  - Página nueva `Autores.jsx` (menú Catalogar → "Autores (autoridades)"),
    con selección/borrado masivo igual que el resto de Catalogar.
  - Endpoint público `GET /opac/:codigo/autores` (sin login, mismo
    criterio que el resto del catálogo) para que el OPAC pueda resolver
    variantes sin exponer nada además de la forma autorizada y sus
    variantes.
  - `CatalogoPublico.jsx` arma un mapa (variante o forma autorizada, en
    minúsculas) → forma autorizada, y lo usa tanto al calcular el
    facetado de autores como al filtrar — **sin tocar ningún registro
    bibliográfico existente**: `Libro.autores`/`Seriada.autores`/etc.
    siguen siendo texto libre, la resolución pasa solo al leer. Si una
    biblioteca no carga ningún autor de autoridad, el comportamiento
    queda exactamente igual que antes (cada string es su propia faceta).

  Verificado en vivo de punta a punta: cargué "Ficciones" con autor
  "Borges, Jorge Luis" y "El Aleph" con "Borges, J.L." — el facetado
  del OPAC mostraba dos entradas separadas; después de crear un autor
  de autoridad ("Borges, Jorge Luis" con esa variante), pasaron a
  mostrarse como una sola entrada "Borges, Jorge Luis (2)", y filtrar
  por ella trajo los dos libros juntos. 2 tests nuevos (backend).

  **Bug real encontrado al implementarlo, no relacionado con esta
  feature en sí — ver BIBL-5.**

- **BIBL-2 ✅ Resuelto (25/07/2026) — El 008 de Koha Puente estaba marcado
  como "no codificado" a propósito en cinco buckets, y decía "conviene
  verificarlo contra la documentación oficial de LC antes de un lote
  grande" para los otros tres (Books/Continuing Resources/Computer
  Files).** Se hizo esa verificación, posición por posición, contra la
  documentación oficial de LC (MARC 21 Format for Bibliographic Data,
  008/18-34 de Books, Continuing Resources y Computer Files).

  **Resultado:** Books y Continuing Resources estaban correctos — orden y
  longitud de cada sub-posición coinciden con la norma. **Computer Files
  (`RecursoElectronico`) tenía un bug real:** rellenaba sus posiciones
  genuinamente "indefinido" (18-21, 24-25, 27, 29-34) con `"|"` (el
  relleno MARC21 para "posición definida pero no codificada"), cuando LC
  especifica que una posición *indefinida por el formato en sí* lleva
  blanco (`" "`) — son dos convenciones distintas, y este archivo ya las
  aplicaba bien en Books/Continuing Resources, pero se habían mezclado acá.
  **Arreglo aplicado:** `camposComputerFiles1834()` ahora usa `" "` en las
  posiciones indefinidas, sin tocar el orden ni el contenido de las
  posiciones sí capturadas (forma del ítem, tipo de archivo). El test ya
  existente (`el 008 de un RecursoElectronico usa el layout de Computer
  Files...`) sigue en verde sin modificarlo, porque solo fija las
  posiciones con dato real (23 y 26). Los cinco buckets con
  `camposNoCodificados1834` (Music, Maps, Visual Materials x2, Mixed
  Materials) siguen deliberadamente sin ese nivel de detalle verificado —
  no se tocaron en este lote, se documentó la razón en el propio archivo.

- **BIBL-3 ✅ Resuelto (26/07/2026) — Sin control de materias (vocabulario
  controlado).** Igual que BIBL-1 pero para `materias`: campo de texto
  libre por ítem, sin normalización contra un tesauro (LEMB u otro) ni una
  lista propia de materias válidas por biblioteca.

  **Consultado con el usuario:** este hallazgo es del mismo tamaño que
  BIBL-1 (un catálogo de autoridades completo, no un retoque chico) —
  el usuario decidió incluirlo en este lote en vez de dejarlo aparte.
  **Arreglo aplicado**, mismo esqueleto letra por letra que BIBL-1
  (modelo `Autor` → `Materia`, `routes/autores.js` → `routes/materias.js`,
  `Autores.jsx` → `Materias.jsx`):
  - Modelo nuevo `Materia` (`formaAutorizada` + `variantes: [String]`,
    soft-delete, único por biblioteca) y rutas CRUD propias
    (`routes/materias.js`, permiso `catalogar`).
  - Página nueva `Materias.jsx` (menú Catalogar → "Materias (autoridades)"),
    con selección/borrado masivo igual que el resto de Catalogar.
  - Endpoint público `GET /opac/:codigo/materias` (sin login).
  - `CatalogoPublico.jsx` arma un segundo mapa (`mapaMaterias`/
    `resolverMateria`), usado tanto en `materiasDisponibles` (el facetado)
    como en el filtro de `resultados` — mismo patrón que `mapaAutores`,
    sin tocar ningún registro bibliográfico existente: si una biblioteca
    no carga ninguna materia de autoridad, el comportamiento queda
    exactamente igual que antes (cada string es su propia faceta).

  Verificado en vivo de punta a punta: cargué "Libro Historia A" con
  materia "Historia argentina" y "Libro Historia B" con "Historia de la
  Argentina" — el facetado del OPAC mostraba dos entradas separadas;
  después de crear una materia de autoridad ("Historia argentina" con esa
  variante), pasaron a mostrarse como una sola entrada "Historia argentina
  (2)", y filtrar por ella trajo los dos libros juntos. 2 tests nuevos
  (backend) + 1 test nuevo (frontend, `CatalogoPublico.test.jsx`, como
  regresión del mecanismo de agrupado).

- **BIBL-4 ✅ Resuelto (26/07/2026) — ISBN/ISSN sin validación de dígito
  verificador.** `Libro.isbn` y `Seriada.issn` eran `String` libre — un
  ISBN mal tipeado (dígito de control incorrecto) se guardaba igual y se
  exportaba igual al MARCXML. **Arreglo aplicado:** `utils/validacionChecksums.js`
  nuevo (funciones puras `esIsbnValido`/`esIssnValido` — ISBN-10, ISBN-13
  con checksum EAN-13, e ISSN, todos tolerando guiones/espacios; vacío
  sigue siendo válido, es un campo opcional) usado como `validate` custom
  en los schemas de `Libro`/`Seriada`. 10 tests unitarios puros
  (`validacionChecksums.test.js`) contra valores reales conocidos (ej. el
  ISBN-10 de ejemplo de la norma `0-306-40615-2`, un ISBN-13 real
  `978-0-306-40615-7`, el ISSN real de *Discrete Mathematics*
  `0378-5955`).

  **Encontrado al implementarlo — ver ARQ-12** (más arriba, en Chief
  Architect): activar esta validación expuso un bug sistémico real de
  manejo de errores en 9 rutas `PUT`, corregido en el mismo momento.
  También se corrigieron 3 valores de ISBN/ISSN ficticios en
  `integracion.test.js` que no pasaban el checksum real (eran solo
  placeholders de test, nunca se habían validado antes) por otros igual
  de ficticios pero matemáticamente válidos.

  Verificado en vivo: crear un libro con ISBN `123-456` muestra el error
  "... no es un ISBN válido (el dígito verificador no coincide)." en la
  UI real; con el ISBN válido `978-950-07-0001-6` se guarda sin problema;
  editar un libro ya cargado con un ISBN inválido nuevo devuelve el mismo
  error sin colgar el servidor (la parte que prueba ARQ-12).

- **BIBL-5 ✅ Resuelto (25/07/2026) — Descubierto al implementar BIBL-1: el
  campo "Autores (separados por coma)" del alta individual de material
  rompía cualquier nombre en formato "Apellido, Nombre" con más de un
  autor.** Si un catalogador cargaba **dos** autores de la forma estándar
  bibliotecaria en el mismo campo (ej. `"Borges, Jorge Luis, Cortázar,
  Julio"`), `aLista()` partía por coma simple — el resultado guardado
  era `["Borges", "Jorge Luis", "Cortázar", "Julio"]`: cuatro "autores"
  donde debía haber dos. Esto ya estaba así antes de esta sesión — se
  encontró al construir `Autores.jsx` y notar que el campo "Variantes"
  tenía el mismo defecto (corregido ahí en el mismo momento, ver BIBL-1).
  La carga masiva por CSV ya usaba el delimitador correcto (`;`); la
  inconsistencia era específicamente con el formulario individual.

  **Arreglo aplicado** en los 7 archivos con campo de autores
  (`Libros.jsx`, `Seriadas.jsx`, `RecursosElectronicos.jsx`,
  `MaterialSonoro.jsx`, `MaterialAudiovisual.jsx`,
  `MaterialCartografico.jsx`, `MaterialGrafico.jsx`): nueva función
  `aListaAutores()` (parte por `;`, no por `,`) usada solo para el campo
  de autores — `aLista()` sigue intacta y se sigue usando para
  `materiasTexto`, que no tiene este problema (una materia rara vez trae
  una coma adentro), así que no se tocó. Cada label pasó de "separados
  por coma" a "separados por punto y coma", con una nota debajo
  explicando por qué. `mapEntidadAForm` ahora reconstruye el campo con
  `.join("; ")` al editar, para que el valor mostrado use el mismo
  delimitador que se espera al guardar.

  Verificado en vivo: un libro cargado con
  `"Borges, Jorge Luis; Cortázar, Julio"` queda guardado como
  `["Borges, Jorge Luis", "Cortázar, Julio"]` — dos autores completos,
  no cuatro fragmentos —, y reabrirlo para editar muestra el campo con
  el mismo formato (`;`). Confirmado también en `MaterialGrafico.jsx`
  como muestra representativa del resto.

- **BIBL-6 ✅ Resuelto (26/07/2026) — El alta/edición individual de Libros
  solo exponía un subconjunto chico de MARC21 (isbn/título/subtítulo/
  autores/editorial/lugar/año/páginas/materias/notas/url), como un único
  formulario plano sin agrupar — nada de clasificación (CDU/Dewey), autor
  corporativo, mención de edición, título variante, mención de
  responsabilidad, descripción física completa (300 $b/$c/$e), serie/ISSN
  (490), notas de audiencia/idioma (521/546), ni instrucción del enlace
  (856 $i). El usuario pidió explícitamente llevarlo a la altura de un
  editor MARC profesional (Koha "Add MARC record" como referencia), con
  campos organizados por solapas numeradas y soporte real para campos
  repetibles.

  **Arreglo aplicado:**
  - `models/Libro.js` suma 15 campos opcionales nuevos (`edicion`, `cdu`,
    `dewey`, `autorCorporativo`, `mencionResponsabilidad`,
    `tituloVariante`, `detallesFisicos`, `dimensiones`,
    `materialComplementario`, `serie`, `serieVolumen`, `issn`,
    `notaAudiencia`, `notaIdioma`, `urlInstruccion`) — puro aditivo, sin
    migración, sin volver obligatorio nada que no lo era.
  - `Libros.jsx` se reorganizó en un editor de 9 solapas numeradas (0-8),
    calcadas del layout de Koha: 0 Clasificación (000/020/080/082/900),
    1 Autores (100/110/700), 2 Título y publicación (245/246/250/260),
    3 Descripción física (300), 4 Serie (490), 5 Notas (500/521/546),
    6 Materias (650), 7 Acceso electrónico (856), 8 Ejemplares (952,
    campo local de Koha). Los datos que no son MARC (subtipo interno,
    portada) quedaron aparte, marcados explícitamente como "no forman
    parte del estándar".
  - Autores y materias pasaron de un textarea delimitado por separador a
    una lista de filas repetibles de verdad (componente `GrupoRepetible`),
    con un ícono "◨ Repetir" (agrega una fila) y "✕ Quitar" (solo visible
    si hay más de una fila) por cada campo — mismo mecanismo que Koha, sin
    tener que tipear un delimitador a mano. El primer autor sigue siendo
    el asiento principal (100) y el resto asientos secundarios (700),
    igual que ya hacía `marcxml.js` — no cambió el modelo de datos
    (sigue siendo `autores: [String]`), solo la forma de editarlo.
  - `marc/marcxml.js` (`libroARecord`) ahora emite también 080, 082, 110,
    245 $c, 246, 250, 300 $b/$c/$e, 490 y 521/546, y agrega 856 $i junto
    al $u existente — todos opcionales (`if` guardado, igual que el resto
    del archivo), así que un libro mínimo sigue exportando exactamente lo
    mismo que antes.
  - Deliberadamente **no** se sumaron 111 (nombre de reunión), 240/243
    (títulos uniformes), 522/526 (cobertura geográfica/programa de
    estudio) ni los asientos de materia 600/610/630/651 con subdivisiones
    $x/$y/$z/$v — son campos de uso excepcional para una biblioteca chica
    y hubieran significado inflar el modelo de datos sin un beneficio real
    para este proyecto; si hicieran falta más adelante, se pueden agregar
    con el mismo patrón aditivo.

  Verificado en vivo (Playwright contra `dev:local`): se cargó un libro
  completo llenando las 9 solapas (dos autores repetidos, dos materias
  repetidas, clasificación, serie, descripción física, notas, acceso
  electrónico y ejemplares), se guardó, y se volvió a abrir en edición —
  los datos de todas las solapas, incluidos los campos repetidos,
  coincidían exactamente con lo cargado. 124 tests de backend + 27 de
  frontend en verde, build de producción sin errores.

- **ARCHIV-1 ✅ Confirmado (26/07/2026), no requería acción — El modelo
  `Archivo` ya es honesto y está bien resuelto para lo que se propone.**
  `models/Archivo.js` mapea explícitamente varios elementos ISAD(G) (3.1.1
  código de referencia, 3.1.3 fechas extremas, 3.1.5 volumen y soporte,
  3.2.1 productor, 3.3.1 alcance y contenido, 3.4.1 condiciones de acceso)
  y **declara a propósito** que no implementa la jerarquía completa
  fondo→serie→subserie→expediente con relaciones entre niveles
  (`Archivo.js:4-10`) — decisión correcta para el alcance de este
  proyecto. Se re-revisó el archivo en esta pasada para confirmar que
  sigue siendo así: no había ningún hallazgo que corregir, solo una buena
  práctica para reconocer.

- **ARCHIV-2 ✅ Resuelto (25/07/2026) — Con todo, un solo campo opcional de
  jerarquía era barato y de alto valor.** El modelo ya tenía
  `nivelDescripcion` (fondo/serie/subserie/expediente/unidad_documental)
  pero ningún registro podía vincularse a su padre (ej. un `expediente`
  que pertenece a una `serie` puntual). **Arreglo aplicado:** campo
  `padreId: ObjectId` opcional (autoreferencia a `Archivo`, `default:
  null`) en el modelo — puro aditivo, sin migración, sin obligar a ninguna
  biblioteca a completarlo. En `Archivos.jsx` se agregó un select "Pertenece
  a (opcional)" que lista los demás archivos de la biblioteca (título +
  código de referencia si tiene), excluyendo el propio registro al editar
  para no permitir auto-referencia. La ruta ya era la fábrica genérica
  `rutasCatalogoSinCirculacion.js`, que pasa el body entero al modelo — no
  hizo falta tocar ninguna ruta. Verificado en vivo: se creó una "Serie
  Actas Municipales" y un "Expediente 1950" con esa serie como padre; el
  `padreId` guardado coincide con el `_id` de la serie, y al reabrir el
  expediente para editar el select trae la serie ya seleccionada. Un test
  nuevo (backend) cubre crear sin padre (queda `null`), crear con padre, y
  editar para quitarlo.

- **ARCHIV-3 ✅ Resuelto (26/07/2026) — `condicionesAcceso` era solo texto
  libre, sin un nivel estructurado.** ISAD(G) 3.4.1 admite texto libre, así
  que esto no era incorrecto — pero no se podía *filtrar* por nivel de
  acceso sin parsear la descripción. **Arreglo aplicado:** campo nuevo
  `nivelAcceso` (enum `libre`/`restringido`/`confidencial`, `default:
  null`) al lado del texto libre existente, que no se tocó — puro
  aditivo, no reemplaza nada. En `Archivos.jsx` se agregó un select
  "Nivel de acceso (opcional)" con una opción "(sin especificar)" para no
  obligar a completarlo. Verificado en vivo: una "Carta reservada" creada
  con nivel "Confidencial" queda guardada con `nivelAcceso: "confidencial"`.
  Test nuevo (backend) cubre el default `null`, un valor válido, y el
  rechazo (400) de un valor fuera del enum.

- **ARCHIV-4 ✅ Confirmado (26/07/2026), ya estaba resuelto — Objetos: sin
  comentario ISAD(G)/museológico explícito.** Al revisar `models/Objeto.js`
  para este lote, se encontró que el archivo **ya tiene** la nota
  aclaratoria que este hallazgo pedía (líneas 4-13): nombra explícitamente
  Spectrum/Object ID como la referencia más cercana y declara a propósito
  que no lo sigue completo, "igual de honesto que el resto del proyecto
  sobre lo que no cubre" — el mismo criterio que ya tiene `Archivo.js`. No
  hizo falta ningún cambio de código; se documenta acá que el hallazgo ya
  estaba cerrado.

---

## Plan de acción sugerido (por impacto/esfuerzo)

**✅ Hecho — lote 1 (25/07/2026), bajo esfuerzo:**
1. ~~ARQ-7/CYBER-3 — arreglar `img-src` en la config de Helmet.~~
2. ~~A11Y-3 — corregir el contraste de `--brand` como color de texto en
   tema claro.~~
3. ~~UX-1 — agregar indicador "OPAC: sí/no" en la tabla de Socios.~~
4. ~~A11Y-4/MOT-4 — sumar las transiciones del catálogo al bloque
   `prefers-reduced-motion` ya existente.~~

**✅ Hecho — lote 2 (25/07/2026), esfuerzo medio:**
5. ~~CYBER-4 — "Cambiar mi contraseña" para cuentas de staff logueadas.~~
6. ~~CYBER-4bis — `eliminadoPor` en el soft-delete.~~
7. ~~UX-2/UX-3 — mostrar los títulos en la confirmación de borrado masivo
   y aclarar que "Eliminar" es recuperable.~~

**✅ Hecho — lote 3 (25/07/2026), tras consultar alcance con el usuario:**
8. ~~A11Y-7 — foco corregido (`--brand-texto`); los botones primarios
   quedan con `--brand` sin cambios, por decisión explícita.~~
9. ~~GOB-3 (paso 1) — borrador de aviso de privacidad escrito
   (`AVISO_PRIVACIDAD_BORRADOR.md`).~~

**✅ Hecho — lote 4 (25/07/2026):**
10. ~~GOB-3 (paso 2) — conectado al OPAC: página
    `/opac/:codigo/privacidad` (`AvisoPrivacidad.jsx`) + link en un pie de
    página nuevo, visible en todo el OPAC.~~

**✅ Hecho — lote 5 (25/07/2026):**
11. ~~BIBL-1 — catálogo de formas normalizadas de autor completo: modelo
    `Autor`, rutas CRUD, página de gestión, endpoint público en el OPAC,
    y resolución de facetas/filtro en `CatalogoPublico.jsx`. Verificado
    en vivo de punta a punta.~~

**✅ Hecho — lote 6 (25/07/2026):**
12. ~~BIBL-5 — delimitador de `autoresTexto` corregido de coma a punto y
    coma en los 7 archivos afectados (`Libros.jsx`, `Seriadas.jsx`,
    `RecursosElectronicos.jsx`, `MaterialSonoro.jsx`,
    `MaterialAudiovisual.jsx`, `MaterialCartografico.jsx`,
    `MaterialGrafico.jsx`), alineado con lo que la carga por CSV ya
    hacía bien. Verificado en vivo.~~

**✅ Hecho — lote 7 (25/07/2026), los 10 hallazgos Medio menos la
migración de router (ver más abajo):**
13. ~~A11Y-5 — `aria-live` en `ThemeToggle` para anunciar el cambio de
    tema.~~
14. ~~GOB-4 — aviso de "puede tardar, el servidor estaba inactivo" también
    en el catálogo del OPAC, no solo en el panel de staff.~~
15. ~~FE-6 — lazy-loading de rutas (`React.lazy`/`Suspense`) en panel y
    OPAC.~~
16. ~~ARCHIV-2 — campo `padreId` opcional en `Archivo`, con su select en
    `Archivos.jsx`.~~
17. ~~BIBL-2 — verificado el 008 de Books/Continuing Resources/Computer
    Files contra la documentación oficial de LC; se encontró y corrigió
    un bug real de relleno en Computer Files (`RecursoElectronico`).~~
18. ~~FE-7 — 5 tests nuevos para `CatalogoPublico.jsx`.~~
19. ~~ARQ-8 — workflow mínimo de CI (`.github/workflows/ci.yml`).~~
20. ~~A11Y-7 — cierre formal: no quedaba ninguna acción técnica pendiente,
    solo una decisión de diseño ya tomada.~~

**✅ Hecho — lote 8 (26/07/2026), los 15 hallazgos Bajo:**
21. ~~ARQ-10 — referencia rota a `../ARQUITECTURA.md` sacada del README
    (el proyecto ya es independiente).~~
22. ~~ARQ-11 — decisión consciente de no sumar un endpoint de borrado en
    lote todavía; documentado, mismo criterio que ARQ-9.~~
23. ~~ARQ-12 (descubierto al implementar BIBL-4) — try/catch agregado en
    9 rutas `PUT` que podían tirar abajo el proceso ante un error de
    validación no capturado.~~
24. ~~CYBER-6 — `express.json({ limit: "2mb" })` explícito.~~
25. ~~FE-8 — soporte opcional `VITE_API_URL` en `api.js`, con
    `frontend/.env.example` nuevo.~~
26. ~~UI-2 — decisión consciente de mantener la iconografía actual
    (emoji/Unicode/texto), documentada.~~
27. ~~UI-3 — link a "carga masiva desde CSV/Excel" en el estado vacío de
    `Libros.jsx`.~~
28. ~~UX-4 — aviso nativo `beforeunload` si hay cambios sin guardar, en
    `useListaCrud.js` (los 11 buckets con formulario).~~
29. ~~A11Y-6 — `<caption>` semántico en las 11 tablas con selección
    masiva, explicando la acción en lote.~~
30. ~~MOT-5 — misma animación `aparecer` del menú desplegable, sumada al
    panel del menú hamburguesa.~~
31. ~~GOB-5 — mensaje de error crudo de Mongoose reemplazado por uno claro
    en español, en la única ruta que un socio ve (`opac.js`).~~
32. ~~BIBL-3 — catálogo de autoridades de materia completo (modelo
    `Materia`, rutas CRUD, página de gestión, endpoint público, y
    resolución de facetas/filtro en `CatalogoPublico.jsx`), mismo patrón
    que BIBL-1 — incluido en este lote a pedido explícito del usuario.~~
33. ~~BIBL-4 — validación de dígito verificador para ISBN/ISSN
    (`utils/validacionChecksums.js`), con sus 10 tests unitarios.~~
34. ~~ARCHIV-1 — confirmado que no requería ninguna acción.~~
35. ~~ARCHIV-3 — campo estructurado opcional `nivelAcceso` en `Archivo`.~~
36. ~~ARCHIV-4 — confirmado que `Objeto.js` ya tenía la nota aclaratoria
    pedida.~~

**✅ Hecho — lote 9 (26/07/2026), a pedido explícito del usuario:**
37. ~~ARQ-9/CYBER-5 — migración de `react-router-dom` v6→v7. Se había
    mantenido deliberadamente afuera de los lotes 7 y 8 por su
    riesgo/esfuerzo de otro orden que el resto; resultó ser un cambio
    mecánico de una línea (la app no usa ningún API de v6 que v7 cambie
    de comportamiento) — verificado con los 27 tests de frontend, el
    build de producción, y navegación en vivo con Playwright, incluida la
    ruta anidada bajo `/opac/:codigo/*`.~~

**✅ Hecho — lote 10 (26/07/2026), aparecidos al investigar un reporte del
usuario y al armar la página de Documentación, ambos con el sistema ya en
producción:**
38. ~~UX-5 — el login del OPAC no recortaba espacios de más en el número
    de socio, a diferencia de cómo se guarda. No era la causa del caso
    puntual reportado (nunca se logró reproducir que admin/supervisor no
    vean un socio creado por el superbibliotecario, ni que su login
    falle distinto según quién lo haya creado — se verificó extensamente
    que ambas cosas funcionan bien), pero es un bug real encontrado en el
    camino y se corrigió igual. Test de integración nuevo.~~
39. ~~UX-6 — el badge "OPAC: sí/no" de la tabla de Socios no se
    actualizaba solo después de guardar una contraseña con "Login OPAC"
    — faltaba un `recargar()` que el resto de las mutaciones de la
    página ya tenía. Encontrado al sacar la captura de ejemplo para
    Documentación y notar que el badge seguía en "NO" después de
    guardar. Verificado en vivo.~~

**✅ Hecho — lote 11 (26/07/2026), a pedido explícito del usuario:**
40. ~~BIBL-6 — el formulario de Libros solo cubría un subconjunto chico de
    MARC21, como un único bloque sin agrupar. Se llevó a un editor de 9
    solapas numeradas calcado del layout de Koha, con 15 campos MARC
    nuevos (edición, CDU/Dewey, autor corporativo, título variante,
    mención de responsabilidad, descripción física completa, serie/ISSN,
    notas de audiencia/idioma, instrucción de acceso) y campos repetibles
    de verdad (autores/materias) con íconos "Repetir"/"Quitar". Verificado
    en vivo con Playwright: carga completa de las 9 solapas, guardado, y
    reapertura en edición con todos los datos intactos.~~

No queda ningún hallazgo abierto en toda la auditoría.
