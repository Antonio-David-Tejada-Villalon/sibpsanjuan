# Despliegue gratuito — Captura DigiBepé

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
  --clusterName digibepe-captura \
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

1. Creá una cuenta en MongoDB Atlas y un cluster del tier gratuito
   (M0, 512 MB — alcanza sobra para el catálogo de varias bibliotecas
   chicas). Al momento de escribir esto no pedía tarjeta para el tier
   gratuito, pero confirmalo en el signup porque las políticas cambian.
2. Creá un usuario de base de datos (usuario + contraseña) — es la
   credencial que va a usar la app para conectarse, no tu login de Atlas.
3. En "Network Access", permití conexiones desde cualquier IP
   (`0.0.0.0/0`) — Render no tiene una IP fija en el tier gratuito, así
   que restringir por IP no es viable acá.
4. Copiá el "connection string" (botón "Connect" → "Drivers") — es la
   `MONGODB_URI` que vas a necesitar en el paso 3.

### 2. Repositorio

Render despliega desde un repositorio Git (GitHub/GitLab/Bitbucket).
Subí esta carpeta (`digibepe-captura/`) a un repo propio si todavía no
lo está.

### 3. Backend + frontend: un solo servicio en Render (gratis)

1. Creá una cuenta en Render y un "Web Service" nuevo apuntando a tu
   repositorio.
2. Root directory: `digibepe-captura/backend` (o la ruta que corresponda
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

## Primer admin (con cualquiera de las dos opciones)

Una vez desplegado, corré el script de bootstrap **desde tu máquina**,
apuntando a la base de Atlas (mismo `MONGODB_URI` que configuraste en
Render):

```bash
cd backend
MONGODB_URI="<el mismo connection string de Atlas>" node scripts/crear-admin.js miusuario miclaveseguraDE8+
```

Con ese usuario entrás a `https://tuapp.onrender.com` como `admin`. Desde
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
mongodump --uri="<el mismo connection string de Atlas>" --archive=backup-$(date +%Y%m%d).gz --gzip
```

Guardá ese archivo en otro lugar (no en el mismo disco que nada crítico
de Atlas/Render — la idea es que un incidente en un lado no se lleve
puesta también la copia). Para restaurar, si hiciera falta:

```bash
mongorestore --uri="<connection string de Atlas>" --archive=backup-20260719.gz --gzip
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
