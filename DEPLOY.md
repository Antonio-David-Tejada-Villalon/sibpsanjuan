# Despliegue — SIBPSANJUAN

Tres servicios, cada uno con su cuenta:

| Servicio | Qué hace | Dónde |
|---|---|---|
| **Vercel** | Sirve la app (panel y catálogo público) y reenvía a Render todo lo que es `/api`, los sitemaps y los bots de vista previa. Para el navegador es **una sola dirección**. | `frontend/` (`frontend/vercel.json`) |
| **Render** | Corre el servidor (la API). | `backend/` (`render.yaml`) |
| **MongoDB Atlas** | La base de datos. | — |

Que todo se vea bajo la dirección de Vercel no es un detalle: si la app
estuviera en `*.vercel.app` y la API en `*.onrender.com`, la cookie de
sesión sería "de terceros" y Safari (y todos los navegadores del iPhone) la
bloquean: no se podría ingresar.

Los pasos de las interfaces de estos servicios pueden cambiar con el
tiempo: esta guía describe el flujo y los valores, no capturas exactas.

## Planes y costos

- **Vercel**: el plan gratuito (Hobby) es para uso personal y no comercial,
  según las condiciones de Vercel. Para el sitio de un colegio corresponde
  el plan Pro.
- **Render**: el plan gratuito se duerme a los 15 minutos sin uso y la
  primera visita tarda cerca de un minuto en despertarlo (la app avisa que
  está cargando). El plan Starter no se duerme. Se cambia en el servicio
  ("Instance Type") o en `plan:` de `render.yaml`.
- **Atlas**: el cluster gratuito (512 MB) alcanza para empezar, pero **no
  tiene backups** (ver "Backups" más abajo).

## Región: Unión Europea

`render.yaml` crea el servidor en **Frankfurt**, y la base de Atlas va en la
misma región (**AWS Frankfurt, eu-central-1**). La Ley 25.326 (art. 12)
restringe enviar datos personales a países sin protección "adecuada"; la
AAIP considera adecuada a la Unión Europea y no a Estados Unidos. Con
servidor y base en la UE ese punto queda resuelto. La decisión final es del
colegio; la región no se puede cambiar después de crear cada servicio.

## 0. Antes de empezar: borrar lo anterior

Si había un despliegue anterior, borralo antes de conectar el repositorio a
los servicios nuevos (si no, se vuelve a desplegar solo con la configuración
vieja cada vez que cambia `master`):

1. **Atlas**: si la base vieja tiene datos que quieras conservar, hacé
   primero un `mongodump` (ver "Backups"). Después, en el proyecto viejo:
   el cluster → "…" → **Terminate**.
2. **Render**: el servicio viejo → Settings → al final, **Delete Web
   Service**.
3. **Vercel**: el proyecto viejo → Settings → General → al final, **Delete
   Project**.

## 1. Base de datos: MongoDB Atlas

1. Creá un proyecto y un cluster **Free** en **AWS / Frankfurt
   (eu-central-1)**. Atlas solo muestra en el formulario las regiones donde
   hay plan gratuito.
2. **Database Access**: creá un usuario de base de datos con contraseña
   larga (botón "Autogenerate"). Es la credencial de la app, no tu login de
   Atlas. Guardá la contraseña: Atlas la muestra una sola vez.
3. **Network Access**: agregá `0.0.0.0/0` ("Allow Access from Anywhere").
   Render no tiene IP fija en el plan gratuito. Si usaste "Automate security
   setup", ese asistente solo agrega tu IP actual: sumá `0.0.0.0/0` a mano o
   Render no va a poder conectarse (el error que se ve no habla de IPs, sino
   de una falla de TLS). Con un plan pago de Render podés usar sus IPs de
   salida (servicio → Connect → Outbound) en lugar de `0.0.0.0/0`.
4. **Connect → Drivers**: copiá la cadena de conexión, reemplazá
   `<db_username>` y `<db_password>`, y agregá el nombre de la base después
   del host: `mongodb+srv://usuario:clave@cluster.xxxxx.mongodb.net/sibpsanjuan?retryWrites=true&w=majority`.
   Esa es la `MONGODB_URI`.

## 2. Servidor: Render

1. **New → Blueprint** y elegí este repositorio (rama `master`). Render lee
   `render.yaml` y crea el servicio `sibpsanjuan-api` en Frankfurt.
2. Te pide dos valores:
   - `MONGODB_URI`: la del paso 1.
   - `SITIO_URL`: la dirección que va a tener el sitio en Vercel, con
     `https://` y sin barra final (ej. `https://biblioteca-colegio.vercel.app`).
     Si todavía no la sabés, dejala vacía y completala en el paso 4.

   `JWT_SECRET` y `PROXY_SECRETO` los genera Render solo.
3. Esperá a que el despliegue termine. Copiá la dirección del servicio (ej.
   `https://sibpsanjuan-api.onrender.com`) y, en **Environment**, el valor
   de `PROXY_SECRETO` (botón para verlo): los dos van a Vercel.
4. Opcional, en **Environment**: `GOOGLE_BOOKS_API_KEY` para que encuentre
   más portadas (ver `backend/.env.example`).

## 3. Sitio: Vercel

1. **Add New → Project** y elegí este repositorio. Si no aparece, es un
   tema de permisos de la app de Vercel en GitHub ("Configure account" /
   "Missing a repository?").
2. **Root Directory: `frontend`**. Si Vercel detecta el repo como
   "monorepo" y ofrece desplegar `backend/` y `frontend/` como "Services",
   no: tocá **Edit** junto a "Root Directory" y escribí `frontend`. El
   framework se completa solo (Vite, `npm run build`, `dist`).
3. **Environment Variables**, solo para **Production** (así las vistas
   previas de otras ramas no tocan los datos reales):
   - `API_URL`: la dirección de Render del paso 2, sin barra final.
   - `PROXY_SECRETO`: el mismo valor que en Render.

   **No** definas `VITE_API_URL`: la app llama a `/api` en su misma
   dirección y Vercel lo reenvía.
4. **Deploy**. Anotá la dirección de producción (ej.
   `https://biblioteca-colegio.vercel.app`, o el dominio propio si lo
   conectás en Settings → Domains).

## 4. Completar Render

Si en el paso 2 dejaste `SITIO_URL` vacía o la dirección de Vercel resultó
otra, cargala ahora en Render → Environment (Render vuelve a desplegar
solo). Con dominio propio, `SITIO_URL` es el dominio.

## 5. Primer admin

Desde tu máquina, en la carpeta `backend` del repo (con `npm install` hecho
una vez), apuntando a la misma base. En PowerShell:

```powershell
$env:MONGODB_URI = "<la MONGODB_URI del paso 1>"
node scripts/crear-admin.js admin "una-clave-larga-de-verdad"
Remove-Item Env:MONGODB_URI
```

(En bash: `MONGODB_URI="..." node scripts/crear-admin.js admin "..."`.)
Si te olvidás la clave, el mismo comando la cambia.

Después, en `https://<tu-sitio>/login` con ese usuario: creá la biblioteca
(su **código** es la dirección del catálogo: `/opac/<código>`) y su cuenta
de jefe/a de biblioteca (superbibliotecario), que a su vez crea las cuentas
del resto del personal con sus permisos. Las categorías Alumno y Docente se
crean solas con cada biblioteca.

## 6. Comprobar que quedó bien

1. `https://<tu-sitio>/api/health` tiene que responder
   `"ok":true` y `"viaProxy":true`. `ipSegun` dice de qué cabecera de
   Vercel salió el IP del visitante; tiene que ser `x-vercel-forwarded-for`,
   `x-real-ip` o `x-forwarded-for`.
   - `"viaProxy":false`: `PROXY_SECRETO` no es igual en Render y en Vercel.
   - `"ipSegun":"conexion"` con `viaProxy` en `true`: Vercel no mandó el IP;
     el límite de intentos de ingreso quedaría compartido por todos.
2. Entrar a la dirección de Render (`https://sibpsanjuan-api.onrender.com/`)
   tiene que llevarte al sitio.
3. Ingresá desde un iPhone o con Safari: con la sesión bajo la misma
   dirección, tiene que andar.
4. `https://<tu-sitio>/robots.txt` termina en
   `Sitemap: https://<tu-sitio>/sitemap.xml`, y ese sitemap lista
   `/opac/<código>/sitemap.xml`.
5. Vista previa al compartir (los bots no ejecutan JavaScript):
   ```bash
   curl -A "WhatsApp/2.23" https://<tu-sitio>/opac/<código>
   ```
   Tiene que traer `<meta property="og:title"`. Si trae la app vacía
   (`<div id="root">`), el reenvío de bots de `vercel.json` no se aplicó.
   Con Render dormido, el bot puede rendirse antes de que despierte.

## Alternativa: todo en Render, sin Vercel

Un solo servicio sirve la app y la API (y el servidor escribe el `<head>`
de cada página para todos, no solo para los bots). En `render.yaml`:

```yaml
    buildCommand: npm ci --omit=dev --prefix backend && npm ci --prefix frontend && npm run build --prefix frontend
```

Sin `PROXY_SECRETO`, y `SITIO_URL` vacía (o el dominio propio). La
dirección del sitio es la de Render.

## Buscadores (Google, Bing) y vista previa al compartir

Solo se indexa el catálogo público: el inicio del OPAC (`/opac/<código>`),
la ficha de cada material (`/opac/<código>/libro/<título>-<id>`, y lo mismo
para los otros tipos) y las páginas publicadas desde el CMS
(`/opac/<código>/pagina/<dirección>`). Nunca socios, préstamos, pedidos ni
búsquedas.

- **Qué ve un buscador.** Cada página pública tiene título, descripción,
  `canonical`, Open Graph y, en las fichas, datos estructurados `Book` y
  `BreadcrumbList` (ver `backend/src/seo/`). Vercel sirve la app y Google
  los ve al ejecutar el JavaScript, que es lo que hace siempre. WhatsApp,
  Facebook, Telegram y compañía no ejecutan JavaScript: `vercel.json` les
  manda a Render solo a esos bots, que reciben un HTML con los mismos
  metadatos.
- **Lo que no se indexa** responde `X-Robots-Tag: noindex`: el panel,
  `/login`, el ingreso, la cuenta y los préstamos del socio, las búsquedas
  con filtros (`?q=…`, que igual dejan seguir sus enlaces), la API y las
  vistas previas de Vercel. `robots.txt` no bloquea nada a propósito:
  bloquear una página impide que el buscador lea ese `noindex`, y bloquear
  `/api/` le impediría ver el catálogo.
- **Sitemap.** `/sitemap.xml` lista un sitemap por biblioteca
  (`/opac/<código>/sitemap.xml`) con todo el material vigente y la fecha
  de su último cambio. Lo dado de baja deja de aparecer solo.
- **Direcciones estables.** El id va al final de la dirección de la ficha:
  si cambia el título, la dirección vieja redirige con un 301 a la nueva y
  los enlaces ya compartidos siguen andando. Dos libros con el mismo título
  tienen direcciones distintas.
- **Imagen al compartir.** Es el logo cuadrado del CMS, nunca la portada:
  las portadas de Google Books no se pueden guardar más allá de su caché y
  la licencia de las demás no siempre está clara. Sin logo cargado, la
  vista previa sale sin imagen. La sinopsis tampoco se publica (el campo
  "Notas" es texto libre del staff y no va a la descripción).
- **Dominio.** Las direcciones absolutas (canonical, sitemap) salen de
  `SITIO_URL`. `robots.txt` lo arma Vercel al compilar con su dirección de
  producción: si conectás un dominio propio, actualizá también `SITIO_URL`.

### Registrar el sitio en Google y Bing

Ninguno de los dos indexa al instante ni lo garantiza: puede tardar de días
a semanas, y con pocas fichas o pocos enlaces externos, más.

1. **Google Search Console** (search.google.com/search-console), con la
   cuenta institucional del colegio:
   - Con dominio propio: propiedad de tipo **Dominio**, verificada con un
     registro TXT en el DNS (lo carga quien administre el dominio).
   - Con `*.vercel.app`: propiedad de tipo **Prefijo de URL**, verificada
     con el **archivo HTML** que da Google: copialo a `frontend/public/` y
     desplegá.
   - En "Sitemaps", enviá `sitemap.xml`.
   - "Inspección de URLs" con una ficha muestra cómo la ve Google, y la
     "Prueba de resultados enriquecidos" (search.google.com/test/rich-results)
     muestra si lee los datos `Book`/`BreadcrumbList`.
2. **Bing Webmaster Tools** (bing.com/webmasters): se puede importar la
   propiedad desde Search Console, sin verificar de nuevo. Bing también
   alimenta a DuckDuckGo y a otros buscadores.

## Capacidad de Atlas gratuito (512 MB)

Cada portada ocupa en la base unos 15 a 30 KB (dos tamaños en WebP): 5.000
libros con portada son entre 75 y 150 MB. Mirá "Data Size" en Atlas antes
de buscar portadas en masa (`node scripts/migrar-portadas.js --buscar-isbn`)
sobre un catálogo grande.

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
