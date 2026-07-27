# Despliegue gratuito — SIBPSANJUAN

Sin VPS, sin dominio pagado. Dos cuentas gratuitas: MongoDB Atlas (base
de datos) y Render (donde corre la app). Los pasos de las interfaces de
estos servicios pueden cambiar con el tiempo — esta guía describe el
flujo general, no capturas de pantalla exactas.

Hay dos caminos: **Opción A** (dashboard web) u **Opción B** (terminal,
con el `render.yaml` que ya está en esta carpeta y el CLI de Atlas). Los
dos terminan en el mismo lugar — elegí el que te resulte más cómodo. Los
pasos de "Primer admin" y "Antes de importar..." al final aplican para
cualquiera de las dos.

## Opción B — Todo por terminal

Requiere crear cuenta en Atlas y en Render primero (eso sí es por
navegador, una sola vez — ningún servicio en la nube lo evita). De ahí
en más, todo es CLI.

### Instalar los CLI

```bash
# Atlas CLI (ver alternativas de instalación en la doc oficial si no
# usás Homebrew/apt/choco)
brew install mongodb-atlas-cli   # macOS
# o: sudo apt-get install -y mongodb-atlas-cli   # Debian/Ubuntu

# Render CLI
brew install render-oss/render/render   # macOS/Linux
```

### Base de datos (Atlas)

```bash
atlas auth login   # abre el navegador una vez, para el login

# Crea org/proyecto + cluster M0 gratis + usuario + acceso de red, todo
# en un solo comando no interactivo:
atlas setup \
  --clusterName sibpsanjuan \
  --provider AWS --region US_EAST_1 \
  --username appuser --password "unaClaveLargaYAlAzar" \
  --accessListIp 0.0.0.0/0 \
  --skipSampleData --force
```

`--accessListIp 0.0.0.0/0` abre el acceso a cualquier IP — hace falta
porque Render no tiene una IP fija en el free tier. Al terminar, el
comando muestra el connection string; guardalo, es tu `MONGODB_URI`.

Si algún flag cambió de nombre en tu versión del CLI, `atlas setup --help`
te muestra las opciones vigentes.

### App (Render)

```bash
render login   # abre el navegador una vez, para el login

# Con el render.yaml de esta carpeta ya en tu repo (commiteado y pusheado):
render blueprints launch
```

Te va a pedir, una sola vez, los valores de `MONGODB_URI` y `JWT_SECRET`
(son los que quedaron como `sync: false` en `render.yaml`, justamente
para no commitear secretos). Generá el `JWT_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Ver el estado, logs y volver a desplegar

```bash
render services            # lista tus servicios (y sus IDs)
render deploys create <SERVICE_ID> --wait    # dispara un deploy y espera a que termine
render services logs <SERVICE_ID>            # logs en vivo
```

## Opción A — Dashboard web

### 1. Base de datos: MongoDB Atlas (gratis)

1. Creá una cuenta en MongoDB Atlas y un cluster del tier gratuito (Atlas
   lo llama **"Free"** en el selector actual — es el mismo tier que antes
   se conocía como M0, 512 MB, alcanza de sobra para el catálogo de varias
   bibliotecas chicas). Al momento de escribir esto no pedía tarjeta para
   el tier gratuito, pero confirmalo en el signup porque las políticas
   cambian. La región no es crítica — cualquiera cercana a donde esté la
   mayoría de tus usuarios anda bien (ej. `sa-east-1`/São Paulo para
   Argentina).
2. Creá un usuario de base de datos (usuario + contraseña) — es la
   credencial que va a usar la app para conectarse, no tu login de Atlas.
   Si usás el asistente **"Automate security setup"** al crear el cluster,
   Atlas te lo crea solo (con acceso de administrador) y te muestra la
   contraseña **una sola vez** — copiala en ese momento, no la vas a poder
   ver de nuevo (si la perdés, "Database Access" → tu usuario → "Edit
   Password" → "Autogenerate" te genera una nueva).
3. En "Network Access", permití conexiones desde cualquier IP
   (`0.0.0.0/0`, botón "Allow Access from Anywhere") — Render no tiene una
   IP fija en el tier gratuito, así que restringir por IP no es viable
   acá. **Ojo si usaste "Automate security setup" en el paso 1**: ese
   asistente solo agrega tu propia IP actual a la lista ("for local
   connectivity"), no `0.0.0.0/0` — hay que sumarlo aparte, a mano, en
   "Network Access", o el backend en Render no va a poder conectarse
   nunca (el error que da Node en ese caso no menciona IPs para nada —
   sale como un fallo de negociación TLS genérico, confuso de diagnosticar
   si no se sabe que es esto).
4. Copiá el "connection string" (botón "Connect" → elegí un método de
   conexión → "Drivers") — es la `MONGODB_URI` que vas a necesitar en el
   paso 3. Ahí mismo tenés que completar dos cosas a mano sobre el string
   que te da Atlas: reemplazar `<db_username>`/`<password>` por los datos
   reales del paso 2, y agregar el nombre de la base después del host
   (ej. `.../sibpsanjuan?...`) — sin eso, Mongo usa una base llamada
   `test` por default, que funciona pero no es lo que uno espera.

### 2. Repositorio

Render despliega desde un repositorio Git (GitHub/GitLab/Bitbucket).
Subí esta carpeta (`sibpsanjuan/`) a un repo propio si todavía no
lo está.

### 3. Backend + frontend: un solo servicio en Render (gratis)

1. Creá una cuenta en Render y un "Web Service" nuevo apuntando a tu
   repositorio.
2. Root directory: `sibpsanjuan/backend` (o la ruta que corresponda
   en tu repo).
3. **Build command** (compila el frontend y lo deja donde Express lo
   sirve):
   ```
   npm install && npm --prefix ../frontend install && npm --prefix ../frontend run build
   ```
4. **Start command**:
   ```
   npm start
   ```
5. Variables de entorno (mismas que `.env.example`):
   - `MONGODB_URI`: el connection string del paso 1.
   - `JWT_SECRET`: un valor largo al azar (generalo con
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   - `COOKIE_SECURE`: `1`.
6. Plan: el free tier de Render. Render te da una URL propia gratis
   (`tuapp.onrender.com`) — **no hace falta comprar ningún dominio**.

### La letra chica del free tier de Render

El servicio "duerme" después de ~15 minutos sin tráfico, y la primera
visita después de eso tarda unos segundos en responder mientras
despierta. Para carga de datos esporádica (no es un sitio público de
alto tráfico) esto es una molestia menor, no un problema — pero avisale
a quien vaya a usarlo para que no piense que "se rompió".

Los formularios ya muestran "Guardando…" y deshabilitan el botón
mientras esperan la respuesta, así que un doble clic durante ese
arranque no debería duplicar datos. La demora de la primera carga en sí
también tiene aviso propio, tanto en el panel de staff como en el
catálogo público del OPAC (pasados ~2.5s sin respuesta, ver GOB-4 en
`AUDITORIA.md`) — igual conviene avisarle a quien vaya a usarlo, porque
la primera vez que lo ve nadie sabe todavía que es normal.

## Opción C — Frontend en Vercel + backend en Render

Variante de la Opción A/B: en vez de que Render sirva también el build del
frontend, el frontend se despliega aparte en Vercel (CDN propio, preview
deployments por PR, dominio fácil) y solo la API queda en Render. La base de
datos sigue siendo Atlas en los tres casos — Vercel no incluye base de datos.

Esto **no** es el modo por defecto de esta app (que asume same-origin, un
solo servicio) — requiere las dos variables nuevas de abajo, pensadas
para no romper nada de la Opción A/B si no se definen.

### 1. Frontend en Vercel

Conviene hacer este paso primero (ver "Orden al desplegar" más abajo, para
no necesitar un redeploy extra del backend al final):

1. Creá una cuenta en Vercel, "Add New… → Project", apuntando al mismo
   repositorio de GitHub. Si el repo no aparece en la lista, es un tema de
   permisos: buscá un link "Configure account" / "Missing a repository?"
   cerca del buscador — te manda a la página de GitHub donde se le da
   acceso a la app de Vercel a repos nuevos ("All repositories" o
   agregando el puntual a la lista).
2. **Ojo con el Root Directory**: como este repo tiene `backend/` y
   `frontend/` como carpetas separadas, Vercel puede detectar
   automáticamente un "monorepo" y ofrecerte desplegar los DOS como
   "Services" dentro de un solo proyecto (una función nueva de Vercel,
   con su propio `vercel.json` generado de "services"). **No** es lo que
   queremos acá — ese modo asume que el backend corre como servicio de
   Vercel, y este backend está pensado para Render (Express tradicional,
   conexión a Mongo abierta una sola vez al arrancar, no probado en el
   modelo de Vercel). Si te aparece ese bloque de "Services", click en
   **Edit** al lado de "Root Directory" y escribí `frontend` a mano — eso
   hace que Vercel lo trate como un proyecto normal de un solo servicio,
   apuntando solo a esa carpeta (Framework se auto-completa como Vite,
   build command `npm run build`, output `dist` — no hace falta tocarlos).
3. Por ahora, no hace falta ninguna variable de entorno — `VITE_API_URL`
   se agrega en el paso 2, una vez que exista el backend.
4. `frontend/vercel.json` ya está en el repo con el rewrite necesario para
   que las rutas de React Router (`/libros`, `/opac/:codigo`, etc.) no den
   404 al entrar directo o refrescar — Vercel lo toma solo, no hace falta
   configurar nada a mano para eso (esto es un `vercel.json` distinto y
   más simple que el de "services" del punto 2 — este es el que sí
   queremos).
5. Deploy. Vercel te da una URL propia (`tuapp.vercel.app`) — de vuelta, no
   hace falta comprar dominio. Guardala, la necesitás en el paso 2.

### 2. Backend en Render

Igual que la Opción A/B (pasos 1-3), pero con dos variables de entorno más:

- `FRONTEND_URL`: la URL exacta de Vercel del paso 1, ej.
  `https://tuapp.vercel.app` (sin barra final). Habilita CORS con
  credenciales solo para ese origen — sin esto, el navegador bloquea los
  pedidos del frontend por CORS.
- `COOKIE_SAMESITE`: `none`. Necesario para que el navegador mande la
  cookie de sesión en pedidos cross-origin (Vercel → Render). Requiere
  `COOKIE_SECURE=1` (ya es el default) — una cookie `SameSite=None` sin
  `Secure` es rechazada por el navegador.

El **build command** en este caso es más simple, porque el frontend ya no
se compila acá:
```
npm install
```
Y no hace falta la variable `PORT` (Render la define solo).

**Fijá la versión de Node explícitamente.** Render usa por default la
versión de Node más nueva disponible (ej. 24.x) — en la práctica, esa
combinación puntual puede fallar la conexión a Atlas con un error de TLS
genérico y confuso (`SSL routines...tlsv1 alert internal error`,
`ReplicaSetNoPrimary`, no llega a ningún shard) que no menciona la
versión de Node para nada. Se soluciona agregando una variable de entorno
más:
- `NODE_VERSION`: `20`

Si en algún redeploy futuro volvés a ver ese mismo error de TLS después
de confirmar que `0.0.0.0/0` está en Network Access de Atlas (ver arriba),
es la primera variable para revisar.

### Orden al desplegar por primera vez

Primero el frontend en Vercel (para tener su URL y ponerla en
`FRONTEND_URL` de Render desde el arranque), después el backend en Render
con esa URL ya cargada — así no hace falta un redeploy extra de ninguno de
los dos al final. Recién al final, con el backend ya con su propia URL,
volvé a Vercel y agregá `VITE_API_URL` (Settings → Environment Variables)
apuntando a esa URL de Render — esta sí necesita un redeploy del frontend
después de agregarla (Deployments → menú "⋯" del último deploy →
Redeploy), porque `VITE_API_URL` se hornea en el build del frontend, no
se lee en runtime.

## Primer admin (con cualquiera de las tres opciones)

Una vez desplegado, corré el script de bootstrap **desde tu máquina**,
apuntando a la base de Atlas (mismo `MONGODB_URI` que configuraste en
Render):

```bash
cd backend
MONGODB_URI="<el mismo connection string de Atlas>" node scripts/crear-admin.js miusuario miclaveseguraDE8+
```

Con ese usuario entrás como `admin` a `https://tuapp.onrender.com` (Opción
A/B) o a tu URL de Vercel (Opción C, ej. `https://tuapp.vercel.app` — ahí
es donde vive el frontend; la URL de Render en ese caso es solo la API,
nadie entra a esa directamente salvo para pegarle a `/api/v1/...`). Desde
ahí podés crear directamente una biblioteca y su superbibliotecario (el
camino más corto para una sola biblioteca), o si vas a delegar la gestión
de varias bibliotecas, dar de alta primero un `supervisor` y que sea
quien cree las suyas. El superbibliotecario de cada biblioteca es quien
después, ya logueado, crea las cuentas `bibliotecario` de su propio staff
con los permisos que corresponda (catalogar/préstamos/devoluciones/
socios/exportar) — ver la sección "Jerarquía de roles" en `README.md`.

Un supervisor también puede pedir supervisar una biblioteca que el admin
todavía no le asignó (pantalla "Bibliotecas" → "Supervisar otra
biblioteca") — la solicitud queda pendiente hasta que vos, como admin, la
apruebes o la rechaces desde la misma pantalla. No hace falta ninguna
migración ni variable de entorno nueva para esto: es un modelo/rutas
aditivos (`SolicitudSupervision`), no cambia el schema de `Usuario`.

Las reglas de circulación de cada biblioteca (días de préstamo,
renovaciones máximas, multa, si sábados/domingos cuentan) se configuran
desde "Configurar préstamos" en esa misma pantalla (o desde
Bibliotecarios, si sos el superbibliotecario de esa biblioteca). Tampoco
necesita migración: son campos nuevos con default (`contarSabados`/
`contarDomingos` en `true`, o sea el mismo comportamiento de siempre —
cuenta calendario) que Mongoose completa solo en cualquier documento
`Biblioteca` ya existente.

Admin y supervisor ahora pueden entrar al catálogo/socios/circulación de
cualquier biblioteca en su alcance (selector "Biblioteca" en el
encabezado) — tampoco requiere migración: es un chequeo nuevo en
`requiereBiblioteca` (`middleware/auth.js`) sobre el mismo esquema de
`Usuario`/`Biblioteca` de siempre. La reserva de ejemplar al pedir un
préstamo desde el OPAC (antes se reservaba recién al aprobarlo) agrega un
valor nuevo al enum de `Ejemplar.estado` (`"reservado"`) y un campo
opcional `Solicitud.ejemplarId` — ambos aditivos, sin migración: los
documentos existentes ya tienen un `estado` válido dentro del enum
anterior, y el campo nuevo queda `null` donde no aplica. La carga masiva
de Libros por CSV suma la dependencia de backend `csv-parse` (correr
`npm install` en `backend/` al actualizar) pero no toca ningún schema.

La eliminación masiva en Catalogar (checkbox por fila + "eliminar
seleccionados"), la multi-selección de materias/autores en el catálogo
del OPAC y el encabezado responsive (menú hamburguesa por debajo de
860px) son 100% frontend — ni tocan el schema ni suman variables de
entorno ni dependencias nuevas. Un `npm --prefix frontend run build` (ya
parte del build command de Render) alcanza para tenerlos en producción.

El campo `eliminadoPor` (quién hizo cada borrado lógico, sumado a los 10
modelos catalogables + Socio) es aditivo y sin `required`: los documentos
ya eliminados antes de este campo simplemente quedan con `eliminadoPor:
null`, no hace falta ninguna migración ni backfill. La ruta nueva
`PUT /auth/password` (cambiar la propia contraseña estando logueado)
tampoco toca ningún schema ni suma dependencias — es una ruta más sobre
el mismo modelo `Usuario` de siempre.

La página nueva del aviso de privacidad (`/opac/:codigo/privacidad`) es
100% frontend — no toca el schema, no suma variables de entorno ni
dependencias. Es contenido estático (no lee nada de la base), así que no
hay nada que backfillear ni verificar en el deploy más allá del build
normal del frontend.

El catálogo de autoridades de autor (colección nueva `Autor`, rutas
`/api/v1/autores`, endpoint público `/api/v1/opac/:codigo/autores`) es
aditivo puro: una colección nueva, no un cambio a ninguna existente. No
hace falta ninguna migración — una biblioteca que nunca carga un autor
de autoridad no nota ninguna diferencia (el OPAC sigue facetando cada
string de autor tal cual, como siempre).

El campo `padreId` de `Archivo` (jerarquía opcional de un nivel, ver
ARCHIV-2) es aditivo y `default: null` — los archivos ya cargados
simplemente quedan sin padre, no hace falta backfillear nada. El campo
`nivelAcceso` (ver ARCHIV-3) es igual de aditivo, mismo `default: null`.
El lazy-loading de rutas (`React.lazy`/`Suspense`, ver FE-6) y el aviso de
carga lenta también en el OPAC (ver GOB-4) son 100% frontend, sin cambio
de schema. El workflow de CI (`.github/workflows/ci.yml`, ver ARQ-8) no
afecta el deploy en absoluto — corre en GitHub Actions, no en Render;
solo empieza a ejecutarse una vez que el repo esté conectado a un remoto
de GitHub.

El catálogo de autoridades de materia (colección nueva `Materia`, rutas
`/api/v1/materias`, endpoint público `/api/v1/opac/:codigo/materias`, ver
BIBL-3) es aditivo puro, mismo criterio que el catálogo de autoridades de
autor. La validación de dígito verificador de ISBN/ISSN (ver BIBL-4) es
un `validate` de Mongoose sobre campos ya existentes — **no** revalida ni
toca ningún libro/seriada ya guardado con un ISBN/ISSN inválido; solo
aplica a partir de la próxima vez que ese registro se cree o edite. El
límite explícito de `express.json` (ver CYBER-6, 2mb) y los try/catch
agregados en 9 rutas `PUT` (ver ARQ-12) son cambios de comportamiento del
backend sin ningún impacto de schema ni de deploy.

El CRUD ampliado de cuentas de staff (admin/supervisor gestionando
bibliotecarios directamente, y el reseteo de contraseña sin la actual vía
`PUT /usuarios/:id/password`) tampoco toca el schema — son rutas nuevas o
con el gate de rol ampliado sobre el mismo modelo `Usuario` de siempre, sin
campos nuevos ni backfill.

El botón "Ver OPAC" en cada tarjeta de biblioteca (panel de Bibliotecas),
la corrección de legibilidad del favicon/`og:image`, el `manifest.json`
nuevo para poder instalar el sitio como app en Android, y la página
nueva de Documentación (`/documentacion`, contenido estático, con su
sidebar y las capturas de pantalla de ejemplo en `frontend/public/docs/`)
son 100% frontend — sin cambio de schema, variables de entorno ni
dependencias nuevas. El `recargar()` agregado en `Socios.jsx` (ver UX-6
en `AUDITORIA.md`, el badge "OPAC: sí/no" que no se actualizaba solo)
tampoco tiene impacto de deploy — mismo criterio.

El soporte de CORS (dependencia nueva `cors` en `backend/`) y el
`sameSite` configurable de la cookie de sesión son aditivos y quedan
apagados por default: sin `FRONTEND_URL`/`COOKIE_SAMESITE` definidos, el
comportamiento same-origin de siempre no cambia. Solo hace falta correr
`npm install` en `backend/` y, si vas a usar el split de la Opción C,
definir esas dos variables — ver esa sección para el detalle.

## Actualizar un despliegue existente (versión con Seriadas/Recursos electrónicos)

Si ya tenías esta herramienta desplegada **antes** de que existieran los
tipos de material "Publicaciones seriadas" y "Recursos electrónicos", el
modelo de circulación cambió por dentro: los préstamos y ejemplares
pasaron de referenciar un libro fijo (`libroId`) a un par genérico
(`itemTipo`/`itemId`), para poder circular más de un tipo de material sin
volver a tocar ese código. Esto necesita un paso manual **antes** de
actualizar el código en Render, para no perder acceso a los préstamos y
ejemplares ya cargados:

```bash
cd backend
MONGODB_URI="<el mismo connection string de Atlas>" node scripts/migrar-item-polimorfico.js
```

Es seguro correrlo con la versión **vieja** de la app todavía desplegada
y sirviendo tráfico: Mongo no tiene esquema fijo, así que los campos
nuevos que este script agrega no le importan al código viejo, que sigue
leyendo/escribiendo solo `libroId`. También es repetible sin riesgo (si
se corta a mitad de camino, corrélo de nuevo) — solo toca los documentos
que todavía no tienen el campo nuevo. Podés verificar antes, sin escribir
nada, con:

```bash
MONGODB_URI="..." node scripts/migrar-item-polimorfico.js --verificar
```

Recién después de que el script termine sin errores, desplegá el código
nuevo (`render deploys create` o el redeploy automático del dashboard).
Si tu despliegue es nuevo (nunca tuvo la versión anterior), no hace falta
correr este script — no hay datos viejos que migrar.

## Actualizar un despliegue existente (versión con jerarquía de roles)

Si ya tenías esta herramienta desplegada **antes** de que existieran los
roles `supervisor`/`superbibliotecario`/`bibliotecario`, todas las
cuentas de staff que cargaste eran del viejo rol `biblioteca` — el schema
nuevo ya no acepta ese valor. Mismo procedimiento que la migración de
arriba: correrlo con el código viejo todavía desplegado, antes de
actualizar.

```bash
cd backend
MONGODB_URI="<el mismo connection string de Atlas>" node scripts/migrar-roles-jerarquia.js
# o, para solo contar sin escribir nada:
MONGODB_URI="..." node scripts/migrar-roles-jerarquia.js --verificar
```

Renombra cada cuenta `rol:"biblioteca"` a `rol:"superbibliotecario"` —
mismo `bibliotecaId`, ningún dato se pierde. Es literalmente lo que esa
cuenta ya hacía (acceso completo a su biblioteca); el nombre nuevo solo
refleja que ahora, además, puede crear cuentas `bibliotecario` propias
con permisos más acotados si querés delegar. Recién después de que
termine sin errores, desplegá el código nuevo. Si tu despliegue es nuevo,
no hace falta correrlo.

## Backups — el tier gratuito de Atlas no incluye ninguno

**Esto no es opcional para datos reales.** El tier M0 (gratuito) de
Atlas no tiene backups continuos ni snapshots automáticos — esa función
empieza recién en los tiers pagos. Mientras una biblioteca no tenga
Koha Puente propio, esta base de Mongo *es* su único registro
bibliográfico y de socios, no una copia de algo que existe en otro
lado — perderla (por un error de operación, un bug, o un incidente de
Atlas) significa perder ese catálogo para siempre, sin forma de
recuperarlo.

La forma más simple de tener una copia, sin pagar nada extra, es correr
`mongodump` a mano cada tanto (antes de una carga grande de datos es un
buen momento mínimo) **desde tu máquina**, con el mismo `MONGODB_URI`
que usa la app:

```bash
mongodump --uri="<el mismo connection string de Atlas>" --archive=backups/backup-$(date +%Y%m%d).gz --gzip
```

`mongodump`/`mongorestore` son parte de "MongoDB Database Tools" — no
vienen con Node ni con el driver de Mongo, hay que instalarlos aparte. En
Windows, si no tenés permisos de administrador (ej. `choco install`
falla con "Access denied" en `C:\ProgramData\chocolatey`), no hace falta
instalar nada system-wide: bajá el zip portable directo de
`https://www.mongodb.com/try/download/database-tools` (elegí Windows x86_64),
descomprimilo en cualquier carpeta de tu usuario (ej.
`C:\Users\tuusuario\tools\`), y corré `mongodump.exe`/`mongorestore.exe`
directo desde la carpeta `bin\` de adentro, sin instalar nada.

Guardá cada archivo `backups/backup-*.gz` en otro lugar además de tu
disco local (no en el mismo lugar que nada crítico de Atlas/Render — la
idea es que un incidente en un lado no se lleve puesta también la
copia). La carpeta `backups/` en la raíz del repo ya está en
`.gitignore` a propósito — son volcados reales de la base (con
`passwordHash` de cuentas incluido), nunca tienen que terminar en el
historial de git. Para restaurar, si hiciera falta:

```bash
mongorestore --uri="<connection string de Atlas>" --archive=backups/backup-20260719.gz --gzip
```

Si en algún momento el volumen de datos deja de tolerar perderse entre
una corrida manual y la siguiente, ese es el momento de pasar a un tier
de Atlas pago (el más económico ya incluye backups continuos) en vez de
seguir dependiendo de acordarse de correr el comando de arriba.

## Antes de importar datos reales a Koha/DigiBepé

Estos dos pasos son obligatorios antes de confiar en los archivos
exportados con datos reales, no opcionales:

- **CSV de socios**: Koha permite descargar una plantilla real desde
  "Herramientas → Importar socios". Compará esa plantilla contra el CSV
  que exporta esta herramienta — la columna `categorycode` tiene que
  coincidir con las categorías de socio que esa instancia Koha tiene
  configuradas, y `branchcode` va vacío a propósito (se completa al
  importar, eligiendo la biblioteca de destino para todo el lote).
- **MARCXML, uno por tipo de material**: son ocho exports distintos
  (`/api/v1/export/marcxml` para Libros, y `.../marcxml/seriadas`,
  `.../marcxml/recursosElectronicos`, `.../marcxml/materialSonoro`,
  `.../marcxml/materialAudiovisual`, `.../marcxml/materialCartografico`,
  `.../marcxml/materialGrafico`, `.../marcxml/materialDidactico`), cada
  uno con su propio Leader y campo 008 según el tipo de material. Probá
  cada uno por separado, primero con un archivo chico (2-3 registros)
  contra "Más → Herramientas → Preparar registros MARC para importar" en
  un Koha de prueba, antes de un lote grande con datos reales. Los
  recursos electrónicos no generan ítems al importar (no tienen
  ejemplares) — el registro bibliográfico queda con la URL de acceso en
  el campo 856. Para Material sonoro/Audiovisual, lo mismo aplica a los
  subtipos digitales (podcast/mp3/música digital, streaming): sin
  ejemplares, solo 856.
- **Los layouts finos del 008 (posiciones 18-34) de Material sonoro,
  cartográfico, audiovisual/gráfico y didáctico no están codificados** —
  quedan como "no codificado" a propósito (ver README, sección "Qué NO
  es"). Si tu Koha de destino depende de esas posiciones para clasificar
  el material automáticamente al importar, vas a necesitar completarlas
  a mano ahí, al menos hasta verificarlas contra la documentación oficial
  de LC.
- **Archivos y Objetos no tienen ningún export** — a propósito (ver
  README, sección "Tipos de material"). Si necesitás migrarlos a Koha
  Puente o a DigiBepé más adelante, es traspaso manual desde el panel,
  no un archivo que generar acá.
