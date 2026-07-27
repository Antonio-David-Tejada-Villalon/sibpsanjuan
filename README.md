# SIBPSANJUAN — MERN

Herramienta liviana para cargar material bibliográfico y socios
**ahora**, sin necesitar un servidor propio ni un dominio pagado, y
exportarlos en formatos que DigiBepé/Koha puede importar en bloque.

## Por qué existe esto

`files/` (la carpeta padre) tiene un camino completo para levantar
**Koha real** como sistema puente online (`01`–`05-*.sh`, `panel/`). Ese
camino necesita un VPS y, para tener URLs propias, un dominio — y ambos
tienen costo real.

Esta herramienta es el camino para cuando **no se puede pagar eso
todavía**: corre en hosting gratuito (Render + MongoDB Atlas, sin
comprar dominio — Render da una URL propia gratis). Arrancó siendo solo
captura de libros + exportación, y fue creciendo: ahora tiene un **OPAC**
(catálogo público) con **circulación básica** — un socio puede entrar,
ver el catálogo, pedir un préstamo o una renovación, y el staff de la
biblioteca gestiona esos pedidos — y cataloga los 8 tipos de material
bibliotecario planeados (ver "Tipos de material" más abajo):

- **Libros, Publicaciones seriadas, Material sonoro, Material
  audiovisual, Material cartográfico, Material gráfico, Material
  didáctico → MARCXML**, listo para "Preparar registros MARC para
  importar" en Koha (que es lo mismo que usa DigiBepé por dentro) — cada
  uno con su propio Leader y campo 008 según le corresponde por norma.
- **Recursos electrónicos → MARCXML**, sin ejemplares — el registro
  queda con la URL de acceso (856), no con un ítem para prestar.
- **Archivos y Objetos de museo → catálogo propio**, sin MARC ni
  circulación (ver "Tipos de material" más abajo — son piezas únicas que
  se consultan, no libros que se prestan).
- **Socios → CSV**, con las columnas del importador de socios de Koha.
- **OPAC + circulación**, para el día a día mientras no hay Koha Puente
  propio (ver más abajo).

No reemplaza a Koha Puente — conviven. Si en algún momento hay
presupuesto para un VPS + dominio, estos mismos archivos de export
sirven para importar todo lo cargado acá directamente a esa instancia, o
a DigiBepé el día de la aprobación.

## Tipos de material

Los 8 tipos bibliotecarios planeados ya están implementados (modelo +
formulario + circulación + export MARC propio cada uno):

- **Libros**, con subtipos: impreso, digital, ebook, folleto, manual,
  diccionario, enciclopedia, tesis, tesina, monografía, atlas, anuario,
  memoria, informe. El alta/edición individual es un editor MARC21 por
  solapas numeradas (0-8), calcado del layout de Koha ("Add MARC
  record"): 0 Clasificación (ISBN/CDU/Dewey), 1 Autores (principal y
  secundarios, con campos repetibles de verdad), 2 Título y publicación
  (incluida mención de edición y título variante), 3 Descripción física,
  4 Serie, 5 Notas (general/audiencia/idioma), 6 Materias (repetibles),
  7 Acceso electrónico, 8 Ejemplares (ver BIBL-6 en `AUDITORIA.md`). Los
  demás 9 tipos de material siguen con su formulario plano de siempre —
  este nivel de detalle solo se justificaba para Libros. La plantilla CSV
  de carga masiva (Libros → "Carga masiva desde CSV/Excel") tiene las
  mismas 28 columnas que el editor por solapas — todas opcionales salvo
  título.
- **Publicaciones seriadas** (revistas, diarios, boletines, journals):
  ISSN, periodicidad, numeración en vez de los campos de un libro.
- **Material sonoro** (CD, vinilo, cassette, audiolibros, podcast, MP3,
  música digital).
- **Material audiovisual** (DVD, BluRay, VHS, documentales, películas,
  videos educativos, streaming).
- **Material cartográfico** (mapas, planos, cartas topográficas, globos
  terráqueos): escala/proyección/coordenadas cuando corresponde.
- **Material gráfico** (fotografías, postales, láminas, afiches,
  grabados, ilustraciones).
- **Material didáctico** (juegos educativos, kits escolares,
  rompecabezas, material Montessori/manipulativo).
- **Recursos electrónicos** (PDF, EPUB, MOBI, HTML, sitios web, bases de
  datos, software): no tienen ejemplares ni se prestan — el socio accede
  directo por una URL, tanto en el OPAC como en el registro MARC
  exportado (campo 856).

Todos circulan igual (ejemplares, préstamo, devolución, mismo mecanismo
`itemTipo`/`itemId` — ver `backend/src/circulacion/tiposCirculantes.js`),
salvo los subtipos intrínsecamente digitales sin ejemplar físico:
`digital`/`ebook` en Libros, `podcast`/`mp3`/`musica_digital` en Sonoro,
`streaming` en Audiovisual, y todo Recursos electrónicos — esos se
ofrecen con un enlace "Acceder" directo en el OPAC, sin solicitud ni
aprobación de por medio.

Además, dos tipos que **a propósito no usan MARC** (no son ítems
bibliográficos individuales — son piezas únicas que se consultan, no se
prestan, y no tienen export):

- **Archivos** (manuscritos, cartas, actas, decretos, resoluciones,
  expedientes, documentos históricos): campos inspirados en ISAD(G) pero
  simplificados a un solo nivel por registro — código de referencia,
  nivel de descripción, productor, fechas extremas, volumen/soporte,
  alcance y contenido, condiciones de acceso. Explícitamente **no** es
  ISAD(G)/EAD completo (sin la jerarquía fondo→serie→subserie→expediente
  con relaciones plenas entre niveles) — sí admite, opcionalmente, **un**
  nivel de pertenencia: un registro puede marcar "Pertenece a" otro
  registro de Archivo ya cargado (`padreId`, ver ARCHIV-2 en
  `AUDITORIA.md`), para la biblioteca que quiera expresar, por ejemplo,
  que un expediente puntual pertenece a una serie puntual. No hace falta
  completarlo si no se necesita. También admite, aparte del texto libre
  de "condiciones de acceso", un campo estructurado opcional
  `nivelAcceso` (libre/restringido/confidencial, ver ARCHIV-3) para poder
  filtrar por nivel de acceso más adelante.
- **Objetos** de museo (obras de arte, medallas, objetos históricos,
  maquetas): número de inventario, procedencia, estado de conservación,
  ubicación, período, materiales, dimensiones. Tampoco es un estándar de
  registro de colecciones completo (Spectrum/Object ID) — mismo criterio
  de captura simplificada que el resto del proyecto.

Ninguno de los dos aparece en `backend/src/circulacion/tiposCirculantes.js`
(no circulan) ni tiene generador en `marc/marcxml.js` (no exportan) — el
staff los carga y el OPAC los muestra como catálogo de solo consulta.

## Qué NO es (a propósito, para no prometer de más)

- No es catalogación MARC21 completa (sin autoridades, sin materias
  normalizadas) — es captura simplificada, suficiente para migrar. Los
  layouts finos del campo 008 (posiciones 18-34) de Music, Maps, Visual
  Materials y Mixed Materials quedan sin codificar a propósito — no se
  pudo verificar el límite exacto de cada sub-posición contra la
  documentación oficial de LC, así que se prefirió no codificarlas antes
  que arriesgar un valor impreciso (ver comentarios en `marc/marcxml.js`).
- La circulación es intencionalmente más simple que la de Koha: sin cola
  de reservas (si dos socios quieren el mismo ítem, el segundo espera a
  que se libere, no hay lista de espera con orden), sin notificaciones de
  vencimiento, y las multas son un número que se muestra, no un cobro
  integrado.
- No autocompleta datos por ISBN/ISSN (Open Library/Google Books) — se
  carga todo a mano por ahora. Sí valida el dígito verificador de lo que
  se tipea (ISBN-10, ISBN-13 e ISSN, tolerando guiones — ver BIBL-4 en
  `AUDITORIA.md`): un ISBN/ISSN con el checksum mal da error al guardar,
  en vez de arrastrarse hasta el catálogo de Koha. Vacío sigue siendo
  válido, es un campo opcional.

## Arquitectura

Por defecto, un único servicio Node/Express sirve la API **y** el build de
React ya compilado — una sola URL, sin CORS, sin una segunda cuenta de
hosting. MongoDB Atlas (free tier M0) como base de datos. También se puede
desplegar el frontend aparte (ej. Vercel) con el backend en Render —
ver "Opción C" en `DEPLOY.md` — activando CORS y `sameSite=none` en la
cookie de sesión solo para ese caso (`FRONTEND_URL`/`COOKIE_SAMESITE`,
apagado por default).

Cada página del panel y del OPAC se carga en su propio chunk
(`React.lazy`/`Suspense` en `App.jsx`, ver FE-6 en `AUDITORIA.md`) — el
bundle inicial solo trae el marco (`Layout.jsx`/`OpacLayout.jsx`) más la
página que se está viendo, no las ~20 pantallas del sistema entero.

Cinco niveles, cada uno solo puede gestionar cuentas **estrictamente por
debajo** (nunca al mismo nivel ni por encima — ver
`backend/src/utils/jerarquia.js`):

- **admin**: control total. Da de alta supervisores y bibliotecas.
  Nadie puede editar ni eliminar su cuenta.
- **supervisor**: puede supervisar **varias bibliotecas a la vez**
  (a diferencia de los dos roles de abajo, que son de una sola). El
  admin le otorga qué bibliotecas ve y si puede crear bibliotecas
  nuevas (`puedeCrearBibliotecas`) o solo gestionar las que ya tiene
  asignadas. No puede tocar al admin. Además de lo que el admin le
  asigna directamente, puede **pedir** supervisar cualquier otra
  biblioteca existente (`POST /solicitudes-supervision`) — la solicitud
  queda pendiente hasta que el admin la apruebe o la rechace
  (`routes/solicitudesSupervision.js`); pedirla no otorga el alcance por
  sí sola, recién se agrega a `bibliotecasSupervisadas` al aprobarla.
- **superbibliotecario**: "admin, pero de una sola biblioteca" — acceso
  completo a todo lo de esa biblioteca (los 8 tipos de material, socios,
  circulación, export), y además puede crear/gestionar cuentas
  `bibliotecario` propias. Lo crea el admin o un supervisor con esa
  biblioteca en su alcance. No puede tocar admin ni supervisor.
- **bibliotecario**: acceso *solo* a lo que su superbibliotecario le
  otorgue, permiso por permiso (`catalogar`, `prestamos`, `devoluciones`,
  `socios`, `exportar` — cinco flags independientes). No puede crear ni
  gestionar ninguna otra cuenta.

Cada nivel tiene un CRUD completo (crear, listar, editar, resetear
contraseña, eliminar) sobre las cuentas **estrictamente por debajo** de la
propia — nunca sobre pares del mismo nivel (dos supervisores sin relación
entre sí no pueden tocarse mutuamente), mismo criterio de aislamiento que
ya regía el borrado (`puedeGestionar` en `jerarquia.js`, sin cambios).
Concretamente: el admin gestiona supervisor+superbibliotecario+bibliotecario;
el supervisor, superbibliotecario+bibliotecario dentro de su alcance; el
superbibliotecario, sus propios bibliotecarios. Antes de esto, admin y
supervisor solo podían *eliminar* un bibliotecario (vía el endpoint
consolidado), no crearlo/editar sus permisos directamente ni resetear
ninguna contraseña ajena — ahora `/bibliotecarios` (crear/listar/editar
permisos) también acepta admin/supervisor sobre la biblioteca activa del
selector del encabezado (`requiereBiblioteca`, mismo mecanismo que
Libros/Socios/etc.), y `PUT /usuarios/:id/password` permite fijarle una
contraseña nueva a cualquier cuenta gestionable sin conocer la vieja (a
diferencia de `PUT /auth/password`, que es self-service y sí la pide) —
para el caso de que alguien se la haya olvidado de verdad.

admin y supervisor no tienen una biblioteca propia fija — pueden
catalogar, ver/gestionar socios y registrar circulación de **cualquier
biblioteca dentro de su alcance** (admin: todas; supervisor: las de
`bibliotecasSupervisadas`), eligiendo con cuál trabajar desde el selector
"Biblioteca" del encabezado (`Layout.jsx`). Del lado del servidor, esto
pasa por el mismo `requiereBiblioteca` de siempre (`middleware/auth.js`):
para estos dos roles, la biblioteca objetivo viene del query param
`?bibliotecaId=` en vez de la sesión, validada contra su alcance en cada
pedido. superbibliotecario/bibliotecario siguen atados a una sola
biblioteca fija como siempre, y un bibliotecario nunca ve datos de otra
biblioteca aunque fuerce la URL.
- **socio**: sesión de OPAC, acotada a *una* biblioteca puntual (login
  distinto al de staff — cookies separadas a propósito, para que una
  persona pueda tener las dos sesiones abiertas en el mismo navegador
  sin que se pisen). Ve el catálogo público, pide préstamos y
  renovaciones, y ve si algún préstamo suyo está vencido y cuánto sería
  la multa — todo de solo lectura, nunca modifica ese estado (eso sigue
  siendo del staff). Nunca hace el préstamo por sí sola: el ítem lo
  entrega el staff en persona, y ahí arranca el préstamo de verdad.

Cualquier cuenta de staff logueada tiene su propio "Mi perfil" en el
encabezado (`/cambiar-password`, antes solo "Cambiar contraseña") — un
resumen de solo lectura de su rol y alcance (bibliotecas supervisadas,
permisos otorgados, etc.) más el formulario para cambiar su propia
contraseña (`PUT /auth/password`, pide la actual antes de aceptar la
nueva). No hay recuperación de contraseña por correo para quien la
olvida y no tiene a nadie por encima que se la resetee (el caso extremo
es `admin`) — este proyecto no tiene ningún servicio de mail configurado;
si un `admin` se queda afuera, la única vía es `scripts/crear-admin.js`
contra la base real.

Las cuatro cuentas de staff también tienen un link **"Documentación"** en
el nav principal del encabezado (último ítem, después de todo lo
funcional — es referencia, no una tarea; `/documentacion`,
`pages/Documentacion.jsx`) — una guía de uso completa y en lenguaje claro
(qué es el sistema, roles y permisos, cómo catalogar, carga masiva por
CSV, socios, circulación, el OPAC, exportar, gestión de cuentas, y una
sección de preguntas técnicas frecuentes — por qué falla un ISBN, qué es
el borrado lógico, etc.), con un índice fijo en pantalla al costado
(mismo patrón `position: sticky` que ya usaban los filtros del OPAC) y
capturas de pantalla reales (no maquetas) ilustrando cada sección
puntual, generadas navegando la app de verdad. Contenido estático, sin
permiso puntual: cualquiera de los cuatro roles la ve completa, para
entender el sistema aunque no tenga acceso a todas las pantallas que
describe.

### OPAC y circulación, en corto

- El OPAC vive en `/opac/<código-de-biblioteca>` (el código reemplaza al
  subdominio que tendría una instancia Koha real). El catálogo es **uno
  solo, unificado** (los 10 tipos de material combinados, como el
  buscador de Koha) con filtros laterales por tipo de ítem, materia y
  disponibilidad, "ordenar por" (relevancia/título/año), y portada
  opcional por ítem (`portadaUrl` — si no se cargó ninguna, se muestra un
  placeholder "Sin imagen de cubierta disponible").
- El staff da de alta el login del socio (nunca autoregistro) desde
  Socios → "Login OPAC".
- El OPAC tiene un aviso de privacidad público, sin necesitar sesión
  (`/opac/<código>/privacidad`, link en el pie de página de todo el
  OPAC) — qué datos de socio se guardan, para qué, y cómo pedir
  acceso/corrección/baja. Es lenguaje claro, no asesoría legal verificada
  para cada jurisdicción (ver "Aviso de privacidad" más abajo).
- Pedir un préstamo (de cualquier tipo circulante) **reserva un ejemplar
  puntual ya en el momento de pedirlo** (`Ejemplar.estado: "reservado"`,
  `Solicitud.ejemplarId` — ver `POST /opac/:codigo/solicitudes`), no
  recién al aprobarlo: mientras la solicitud está pendiente, el catálogo
  del OPAC ya lo muestra sin ejemplares libres (o con los que sigan
  disponibles, si hay más de uno), y nadie más puede pedir ese mismo
  ejemplar mientras tanto. El staff la aprueba o rechaza desde
  Circulación: aprobar transforma esa reserva en préstamo ("prestado");
  rechazar libera el ejemplar de vuelta a "disponible". Pedir una
  renovación crea la misma clase de solicitud pero sin reservar nada;
  aprobarla corre el vencimiento y respeta el tope de renovaciones de esa
  biblioteca. El staff también puede **renovar directo** desde Préstamos
  (sin que el socio lo haya pedido primero).
- Reglas de circulación **configurables por biblioteca** (pantalla
  "Configurar préstamos" — Bibliotecas para admin/supervisor, o
  Bibliotecarios para el propio superbibliotecario): días de préstamo,
  renovaciones máximas, multa por día de atraso, y si sábados y/o
  domingos cuentan para calcular el vencimiento y el atraso o se saltean
  (para bibliotecas que cierran esos días — ver `contarSabados`/
  `contarDomingos` en `Biblioteca.js` y el conteo día-hábil-por-día en
  `circulacion/reglas.js`).
- Cada tarjeta de biblioteca en "Bibliotecas" (admin/supervisor) tiene un
  botón **"Ver OPAC"** que abre el catálogo público de esa biblioteca en
  una pestaña nueva (`/opac/<código>`) — para revisar cómo queda de cara
  al público sin salir del panel.
- La URL de acceso (`urlAcceso` — 856$u) y los ejemplares físicos **no son
  excluyentes**: un mismo título puede tener las dos cosas (ej. un libro
  con copias impresas y además una versión digital de consulta). El OPAC
  muestra ambas si corresponde ("Acceso digital · N disponible(s) para
  préstamo", con los dos botones — Acceder y Solicitar préstamo — juntos)
  en vez de que una tape a la otra. Recursos electrónicos es la única
  excepción real: nunca tiene ejemplares, es puramente digital.
- El staff también puede registrar un préstamo directo (socio que llega
  sin pasar por el OPAC, de cualquier tipo circulante) desde Préstamos,
  buscando al socio por número/nombre/apellido y al material por título/
  ISBN/código de barras (dos buscadores con resultados en desplegable,
  sobre los datos ya cargados) — y procesar devoluciones. Al confirmar,
  muestra un resumen con socio, título, fecha de préstamo y fecha de
  vencimiento.
- El socio ve en "Mis préstamos" si alguno está vencido y el monto de la
  multa (mismas `calcularMulta`/`estaVencido` de `circulacion/reglas.js`
  que ya usaba la vista de staff) — de solo lectura, sin ninguna acción
  para pagarla o resolverla desde ahí.
- Carga masiva de Libros por CSV/Excel (Libros → "Carga masiva desde
  CSV/Excel"): plantilla descargable (`GET /libros/plantilla-csv`) con las
  mismas columnas del formulario, autores/materias separados por punto y
  coma dentro de la celda. La columna `ejemplares` sigue la misma
  convención que el textarea del alta individual (coma separa código de
  barras de signatura) pero con `;` entre un ejemplar y el siguiente en vez
  de un salto de línea (ej. `BPSJ-000001,863 BOR;BPSJ-000002,863 BOR`) —
  más fácil de editar en Excel que una celda multilínea. Al subirla (`POST
  /libros/importar-csv`, el CSV ya leído como texto en el navegador, sin
  multipart) cada fila crea el registro bibliográfico y sus ejemplares
  juntos; si falla la creación de los ejemplares (ej. código de barras ya
  usado en esa biblioteca) se deshace el libro entero, igual que en el alta
  individual, para no dejar un registro huérfano. Un `subtipo` que no
  coincida con el enum del modelo no hace fallar la fila: se avisa y cae al
  default (`impreso`). Ninguna fila mala aborta el resto del archivo: se
  acumulan y devuelven los errores/avisos fila por fila
  (`backend/src/utils/importarLibrosCsv.js`).
- Editar un libro muestra sus ejemplares (código de barras, signatura,
  estado) con acciones para corregirlos, agregar uno nuevo o eliminar uno
  puntual — antes esto solo se podía hacer en el alta inicial o por CSV;
  ahora también desde la edición (`PUT`/`DELETE
  /libros/:id/ejemplares/:ejemplarId`). Solo se puede eliminar un ejemplar
  "disponible": borrar uno prestado o reservado dejaría un Préstamo o una
  Solicitud pendiente apuntando a un ejemplar que ya no existe.
- En el catálogo del OPAC, "Ver detalle" en cada tarjeta siempre está
  visible (no solo al pasar el mouse) — abre un modal con toda la ficha
  del ítem tal como la cargó el bibliotecario (autor, editorial, año,
  ISBN/ISSN, materias, etc., según el tipo de material).
- El catálogo pagina de a 24 resultados (mismo componente `Pager.jsx` que
  ya usan las pantallas de staff) en vez de renderizar los cientos de
  tarjetas de una — el filtrado/orden se sigue calculando sobre todo lo
  cargado, solo la porción visible cambia con la página. La barra
  lateral de filtros (tipo de ítem, disponibilidad, autores y materias
  como "chips") quedó agrupada en tarjetas con estilo propio y fija en
  pantalla (`position: sticky`) al scrollear, y el layout usa más ancho
  de pantalla en esta vista puntual (`main:has(.catalogo-layout)` en
  `estilos.css`) sin angostar el resto de las pantallas. Autores y
  materias son multi-selección (facetas típicas de catálogo: elegir
  "Historia" + "Arte" a la vez trae lo que tenga cualquiera de las dos,
  no solo la intersección).
- El facet "Autores" del OPAC puede agrupar variantes del mismo nombre en
  una sola entrada (ej. "Borges, Jorge Luis" y "Borges, J.L." como un
  solo autor), vía un catálogo de formas normalizadas opcional (menú
  Catalogar → "Autores (autoridades)", permiso `catalogar`): cada
  registro tiene una `formaAutorizada` y una lista de `variantes`
  (separadas por **punto y coma**, no coma — un nombre "Apellido, Nombre"
  ya trae una coma adentro). No hace falta cargar nada acá para que el
  OPAC siga funcionando: sin ningún autor de autoridad, cada string queda
  como su propia faceta, igual que antes. La resolución pasa solo al
  leer el catálogo (`GET /opac/:codigo/autores`, público) — no reescribe
  ningún libro/seriada/etc. ya cargado.
- El facet "Materias" del OPAC tiene el mismo catálogo de autoridades
  opcional que "Autores" (ver BIBL-3 en `AUDITORIA.md`), mismo esqueleto
  letra por letra: menú Catalogar → "Materias (autoridades)", modelo
  `Materia` (`formaAutorizada` + `variantes`, separadas por punto y coma),
  endpoint público `GET /opac/:codigo/materias`. Sin cargar ninguna
  materia de autoridad, el comportamiento queda igual que antes.
- El campo "Autores" del alta/edición individual (Libros, Seriadas,
  Recursos electrónicos, y los tres Material* con autor) separa por
  **punto y coma**, no por coma — un nombre en formato "Apellido, Nombre"
  (la forma estándar bibliotecaria) ya trae una coma adentro, así que
  partir por coma simple rompía cualquier campo con más de un autor. La
  carga masiva por CSV ya usaba este mismo criterio; ahora los dos
  caminos son consistentes. "Materias" sigue separado por coma sin
  cambios — una materia no suele traer una coma adentro.
- Catalogar (Libros y el resto de los 10 tipos de material) permite
  eliminar de a muchos a la vez: un checkbox por fila más "seleccionar
  todos" en el encabezado, y una barra de acciones que aparece con
  "Eliminar seleccionados" en cuanto hay algo tildado. Reutiliza el mismo
  `eliminar` de a uno que ya tenía cada página (`useListaCrud.js` —
  `onEliminarSeleccionados`), sin sumar un endpoint de borrado en lote:
  para los volúmenes de una biblioteca chica alcanza. La selección se
  limpia sola al cambiar de página o de búsqueda. La confirmación (tanto
  individual como masiva) lista los títulos concretos a eliminar — no
  solo un número — y aclara que el borrado es lógico: el registro queda
  recuperable desde la base, no se pierde al instante. Cada borrado
  (de cualquier tipo de material o socio) también guarda quién lo hizo
  (`eliminadoPor`), además de cuándo (`eliminadoEn`).

### Identidad visual y accesibilidad

El ícono (`frontend/public/logo.png`, con el favicon derivado del mismo
archivo — ver `frontend/public/favicon*.png/.ico` y `apple-touch-icon.png`)
y el color de marca (naranja `#ff8300`, tomado de ese mismo logo) salen de un solo lugar
(`frontend/src/estilos.css`, variable `--brand`) y se usan a propósito
en pocos puntos — el logo, la acción principal de cada pantalla,
enlaces y el foco de teclado — no como color de fondo general.

`frontend/public/manifest.json` (Web App Manifest) permite instalar el
sitio como app desde Chrome en Android ("Agregar a pantalla de inicio").
Incluye dos juegos de íconos a propósito: `icon-*.png` (`purpose: "any"`,
mismo recorte ajustado que el resto del logo) e `icon-*-maskable.png`
(`purpose: "maskable"`, con bastante más margen alrededor) — Android le
aplica su propio recorte automático (círculo/squircle, según el
launcher) a cualquier ícono instalado sin declarar `maskable`, y con el
margen ajustado del logo normal ese recorte se comía el texto "SIBP".
Sin este manifest, Chrome instalaba la app igual (usando el
`apple-touch-icon`) pero sin control sobre ese recorte.

Tema claro/oscuro en todo el sistema (staff y OPAC), no solo el catálogo:
el botón 🌙/☀️ en el encabezado (`ThemeToggle.jsx`) guarda la elección en
`localStorage` y la aplica como `data-theme` en `<html>`; sin elección
guardada, se sigue el `prefers-color-scheme` del sistema operativo (ver
el `@media` correspondiente en `estilos.css`). El resto del CSS no sabe
en qué tema está — todo pasa por variables semánticas (`--bg`,
`--bg-elevado`, `--texto`, `--texto-tenue`, `--borde`, etc. en `:root`),
así que un componente nuevo hereda el tema automáticamente con tal de
usar esas variables en vez de colores sueltos. `tema.js` aplica la
elección guardada antes de que React monte nada (importado primero en
`main.jsx`), para que no haya parpadeo del tema equivocado al cargar. El
cambio de tema también se anuncia a lectores de pantalla (`role="status"`
oculto visualmente junto al botón — ver A11Y-5 en `AUDITORIA.md`).

El encabezado del panel de staff tiene un link "Panel" (a `/dashboard`)
como primer ítem del nav, visible para los cuatro roles de staff — antes
esa pantalla solo se veía justo después de loguearse (superbibliotecario/
bibliotecario) o no se veía nunca (admin/supervisor, que aterrizan en
"Bibliotecas"), sin ninguna forma de volver ahí desde el resto del panel.
El propio logo/nombre de marca también es un link al mismo destino —
patrón estándar de "logo lleva al inicio" — sin duplicar la lógica: los
dos apuntan a `/dashboard`, y para admin/supervisor sin biblioteca activa
elegida se comportan igual que cualquier otro link a una pantalla scoped
a biblioteca (mensaje para elegir una desde el selector, no un error).

**Buscar en el catálogo** (`/catalogo`, tarjeta nueva en el Panel) combina
los 10 tipos de material en una sola tabla, con el mismo sidebar de
filtros que el catálogo público del OPAC (tipo/autor/materia, colapsados
a 5 con "Ver más" — ver UX-7 en `AUDITORIA.md`), búsqueda simple y una
**búsqueda especializada** (título/autor/materia/ISBN-ISSN/año por
separado). Cada fila tiene **Editar** (lleva a la pantalla propia de ese
tipo con el formulario ya precargado), **Ficha ISBD** (modal con el
párrafo bibliográfico completo, en la puntuación real de la norma ISBD —
título, edición, publicación, descripción física, serie, notas, número
normalizado) y **Eliminar**, más selección múltiple para borrar varios a
la vez. Es la evolución de la tabla que antes vivía al pie del formulario
de Libros — se sacó de ahí porque ya no alcanzaba con un solo tipo de
material ni con un buscador de texto libre nomás.

El encabezado (staff y OPAC) es responsive: por debajo de 860px, la
navegación y el bloque de la derecha (selector de biblioteca, tema,
usuario) se colapsan detrás de un botón hamburguesa (☰/✕) en vez de
apretujarse en una fila que se corta o hace scroll horizontal — el botón
queda posicionado arriba a la derecha independientemente de cómo
wrappeen el logo y el nav debajo (ver el `@media (max-width: 860px)` en
`estilos.css`), y el menú se cierra solo al navegar a otra ruta.

Lo esencial de accesibilidad está resuelto: los mensajes de éxito/error
se anuncian a lectores de pantalla (`role="alert"`/`role="status"`),
las columnas de acción de las tablas tienen texto para lector de
pantalla aunque no se vea, y los formularios se deshabilitan mientras
envían (evita duplicar un libro o un socio si alguien hace doble clic
mientras el free tier de Render está "despertando" — ver "La letra
chica del free tier de Render" en `DEPLOY.md`). No es una auditoría
WCAG completa — por ejemplo, todavía no se mueve el foco al cambiar de
vista dentro del panel.

### Aviso de privacidad

`/opac/<código>/privacidad` (`AvisoPrivacidad.jsx`) es una página pública
del OPAC — no necesita sesión de socio, a propósito: un aviso de
privacidad tiene que poder leerse antes de decidir confiar los datos, no
después. Explica en lenguaje claro qué datos de socio se guardan, para
qué se usan, quién puede verlos, cuánto tiempo se conservan (ligado al
borrado lógico) y cómo pedir acceso/corrección/baja — dirigiendo esa
última parte al mostrador de la biblioteca, ya que el sistema no tiene
ningún campo de contacto configurado. El contenido nació como
`AVISO_PRIVACIDAD_BORRADOR.md` (todavía en la raíz del repo, con notas
sobre qué conviene verificar) y **no es asesoría legal verificada** para
cada jurisdicción — es una base razonable y honesta, no una garantía de
cumplimiento normativo puntual (ver GOB-3 en `AUDITORIA.md`).

Ver `DEPLOY.md` acá mismo para el paso a paso de despliegue gratuito.

## Desarrollo local

Camino rápido, sin instalar Mongo ni pedir cuenta de Atlas (los datos se
pierden al cortar, es solo para mirar/probar):

```bash
# Backend (Mongo descartable en memoria + admin de prueba ya creado)
cd backend
npm install
npm run dev:local        # http://localhost:3000 — admin / dev12345

# Frontend, en otra terminal
cd frontend
npm install
npm run dev               # http://localhost:5173, con proxy a la API
```

Para desarrollo contra una base persistente real:

```bash
cd backend
npm install
cp .env.example .env   # completá MONGODB_URI y JWT_SECRET
npm run dev             # http://localhost:3000
```

### Primer admin (con una base persistente, no con dev:local)

```bash
cd backend
node scripts/crear-admin.js miusuario miclaveseguraDE8+
```

### Tests

```bash
cd backend
npm test
```

- `test/reglas.test.js`, `test/marcxml.test.js`, `test/patronesCsv.test.js`,
  `test/camposComunes.test.js`, `test/jerarquia.test.js`,
  `test/validacionChecksums.test.js`: pruebas unitarias puras (generador
  MARCXML de los tipos de material con export, CSV de socios, reglas de
  circulación como vencimiento/renovaciones/multa, campos compartidos
  entre modelos, quién puede gestionar a quién en la jerarquía de roles,
  y el checksum de ISBN/ISSN — ver BIBL-4) — no necesitan base de datos.
- `test/integracion.test.js`: prueba de punta a punta contra un Mongo
  real (`mongodb-memory-server`) — desde admin creando un supervisor
  hasta un bibliotecario con permisos parciales chocando contra un 403,
  pasando por el flujo completo de circulación para cada tipo que
  circula, el ciclo de solicitud-de-supervisión (pedir, duplicado
  rechazado, aprobar, rechazar, y que un no-supervisor/no-admin no puede
  saltarse ninguno de los dos pasos), que Recursos electrónicos/Archivos/
  Objetos nunca entran a ese circuito ni tienen export, y que los scripts
  de migración de datos (`scripts/migrar-item-polimorfico.js`,
  `scripts/migrar-roles-jerarquia.js`) dejan todo consultable con la
  forma nueva. Todas las pruebas de integración viven en **un solo
  archivo** a propósito: cada archivo separado que levanta su propio
  Mongo generaba contención seria en algunos entornos (Windows en
  particular) al correr varios a la vez.

El frontend también tiene tests propios (`cd frontend && npm test`,
Vitest) — cubren las páginas de captura, utilidades compartidas como el
parser del textarea de ejemplares (`ejemplaresTexto.js`), y
`CatalogoPublico.jsx` (filtros multi-select, paginación, y los dos
fetches en cascada del catálogo + autoridades de autor — ver FE-7 en
`AUDITORIA.md`).

### CI

`.github/workflows/ci.yml` corre ambos suites de test (y el build de
frontend) en cada push/PR a `main` — bloquea el merge si algo se rompe,
sin tocar el deploy en sí (ver ARQ-8 en `AUDITORIA.md`).

## Despliegue gratuito

Ver `DEPLOY.md`.
