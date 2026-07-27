import React from "react";

// Documentación interna para las cuatro cuentas de staff (admin,
// supervisor, superbibliotecario, bibliotecario) — no depende de ningún
// permiso puntual: aunque un bibliotecario no tenga, por ejemplo, el
// permiso "exportar", igual puede leer acá para qué sirve, para entender
// el sistema completo, no solo lo que él mismo puede tocar. Contenido
// estático (no lee nada de la base), igual que AvisoPrivacidad.jsx.
const INDICE = [
  { id: "que-es", etiqueta: "Qué es SIBPSANJUAN" },
  { id: "roles", etiqueta: "Roles: quién puede hacer qué" },
  { id: "catalogar", etiqueta: "Catalogar material" },
  { id: "catalogar-libros", etiqueta: "Cargar un libro (editor MARC)" },
  { id: "carga-masiva", etiqueta: "Carga masiva de libros (CSV/Excel)" },
  { id: "socios", etiqueta: "Socios" },
  { id: "circulacion", etiqueta: "Circulación y préstamos" },
  { id: "opac", etiqueta: "El catálogo público (OPAC)" },
  { id: "exportar", etiqueta: "Exportar a Koha / DigiBepé" },
  { id: "cuentas", etiqueta: "Gestión de cuentas de staff" },
  { id: "tecnico", etiqueta: "Preguntas técnicas frecuentes" },
];

function Seccion({ id, titulo, children }) {
  return (
    <section id={id} className="card" style={{ scrollMarginTop: "1rem" }}>
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

// Captura de pantalla real de ejemplo, no una maqueta — cada una se
// generó navegando la app de verdad. figcaption explica qué se ve, para
// quien use un lector de pantalla y no vea la imagen en sí.
function Captura({ src, alt }) {
  return (
    <figure className="doc-captura">
      <img src={src} alt={alt} loading="lazy" />
      <figcaption>{alt}</figcaption>
    </figure>
  );
}

export default function Documentacion() {
  return (
    <div className="doc-layout">
      <nav className="card doc-sidebar" aria-label="Índice de la documentación">
        <h2>Índice</h2>
        <ul>
          {INDICE.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.etiqueta}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="doc-contenido">
        <h1>Documentación</h1>
        <p>
          Guía de uso de SIBPSANJUAN para el staff — qué hace cada pantalla, cómo catalogar, cómo funciona la
          circulación, y algunas explicaciones técnicas de por qué el sistema se comporta como se comporta. No
          reemplaza lo que ya te explica cada pantalla (mensajes de error, textos de ayuda puntuales); es la vista
          completa, para cuando hace falta más contexto.
        </p>

        <Seccion id="que-es" titulo="Qué es SIBPSANJUAN">
        <p>
          Es una herramienta liviana para cargar el catálogo bibliotecario y los socios de una biblioteca{" "}
          <strong>ahora</strong>, sin necesitar un servidor propio ni un dominio pagado, y exportarlos en formatos
          que Koha (y por lo tanto DigiBepé, que usa Koha por dentro) puede importar en bloque.
        </p>
        <p>
          No reemplaza a un Koha propio ("Koha Puente") — conviven. Mientras una biblioteca no tenga uno, este
          sistema es su catálogo real: carga de material, altas de socios, y un <strong>OPAC</strong> (catálogo
          público) con circulación básica, para que un socio pueda ver qué hay y pedir un préstamo sin que el staff
          tenga que hacer todo a mano. El día que haya presupuesto para un Koha propio, los mismos exports de acá
          sirven para migrar todo lo cargado.
        </p>
        <p>
          Catalogá acá <strong>sabiendo que en algún momento vas a exportar</strong> — por eso los campos y los
          formatos siguen normas bibliotecarias reales (MARC21, ISBN/ISSN con dígito verificador) en vez de ser
          libres.
        </p>
      </Seccion>

      <Seccion id="roles" titulo="Roles: quién puede hacer qué">
        <p>Hay cinco niveles. Cada uno solo gestiona cuentas <strong>estrictamente por debajo</strong> suyo:</p>
        <ul>
          <li>
            <strong>admin</strong> — control total del sistema. Da de alta bibliotecas y supervisores. Nadie puede
            editar ni eliminar esta cuenta.
          </li>
          <li>
            <strong>supervisor</strong> — puede supervisar varias bibliotecas a la vez (a diferencia de
            superbibliotecario/bibliotecario, que son de una sola). El admin le asigna qué bibliotecas ve; también
            puede <em>pedir</em> supervisar una biblioteca que todavía no tiene asignada, y queda pendiente hasta
            que el admin la apruebe.
          </li>
          <li>
            <strong>superbibliotecario</strong> — "admin, pero de una sola biblioteca": acceso completo a todo lo de
            esa biblioteca (catalogación, socios, circulación, export), y puede crear/gestionar sus propias cuentas{" "}
            <code>bibliotecario</code>.
          </li>
          <li>
            <strong>bibliotecario</strong> — acceso solo a lo que su superbibliotecario le otorgue, permiso por
            permiso: <em>Catalogar</em>, <em>Aprobar solicitudes y registrar préstamos directos</em>,{" "}
            <em>Procesar devoluciones</em>, <em>Gestionar socios</em> y <em>Exportar</em>. No puede crear ni
            gestionar ninguna otra cuenta.
          </li>
          <li>
            <strong>socio</strong> — no es staff. Sesión aparte, acotada a una biblioteca, de solo lectura sobre su
            propia situación (ve el catálogo, pide préstamos/renovaciones, ve si algo le venció).
          </li>
        </ul>
        <p>
          Admin y supervisor no tienen una biblioteca fija — eligen con cuál trabajar desde el selector{" "}
          <strong>"BIBLIOTECA"</strong> del encabezado antes de entrar a Catalogar, Socios o Circulación. Sin elegir
          ninguna, esas pantallas no muestran nada (no es un error, es que todavía no elegiste sobre qué biblioteca
          operar).
        </p>
        <p>
          Cada cuenta (menos <code>socio</code>) puede cambiar su propia contraseña desde{" "}
          <strong>"Mi perfil"</strong>, en el encabezado. Quien gestiona una cuenta desde arriba en la jerarquía
          (admin/supervisor/superbibliotecario, según corresponda) también puede resetearle la contraseña a una
          cuenta de abajo sin necesitar la vieja — botón <strong>"Resetear contraseña"</strong> donde se gestiona
          esa cuenta (Bibliotecas, Bibliotecarios).
        </p>
      </Seccion>

      <Seccion id="catalogar" titulo="Catalogar material">
        <p>El menú <strong>Catalogar</strong> agrupa los 10 tipos de material que soporta el sistema:</p>
        <Captura
          src="/docs/catalogar.png"
          alt='Solapa "Clasificación" del editor de Libros, con el ISBN, la CDU y la clasificación Dewey completados como ejemplo.'
        />
        <ul>
          <li>
            <strong>8 tipos con export a MARC</strong> (tienen ejemplares que se prestan, salvo los subtipos
            intrínsecamente digitales): Libros, Publicaciones seriadas, Material sonoro, Material audiovisual,
            Material cartográfico, Material gráfico, Material didáctico, y Recursos electrónicos (este último nunca
            tiene ejemplares — es puramente digital, con una URL de acceso).
          </li>
          <li>
            <strong>2 tipos sin MARC ni circulación</strong>: Archivos (documentos históricos, con campos inspirados
            en la norma ISAD(G)) y Objetos de museo. Son piezas únicas que se consultan, no se prestan.
          </li>
        </ul>
        <p>
          <strong>Libros</strong> tiene su propio editor por solapas MARC21 — ver la sección siguiente para el
          detalle paso a paso. Los otros 9 tipos usan un formulario más simple, de una sola pantalla, con estas
          convenciones:
        </p>
        <p>
          <strong>Ejemplares.</strong> Al cargar un ítem que circula, el textarea de ejemplares pide{" "}
          <code>código de barras, signatura</code> por línea — una línea por copia física. Sin ejemplares cargados,
          el ítem queda catalogado pero nadie lo puede pedir prestado (0 disponibles).
        </p>
        <p>
          <strong>Autores.</strong> El campo de autores se separa por <strong>punto y coma</strong> (
          <code>;</code>), no por coma — un nombre en formato "Apellido, Nombre" ya trae una coma adentro, así que
          separar por coma simple rompería cualquier campo con más de un autor. Ejemplo: escribir{" "}
          <code>Borges, Jorge Luis; Cortázar, Julio</code> carga dos autores completos, no cuatro fragmentos.
        </p>
        <p>
          <strong>ISBN / ISSN.</strong> Se valida el dígito verificador real de la norma (ISBN-10, ISBN-13, ISSN) —
          no alcanza con que "parezca" un ISBN, tiene que tener el checksum matemáticamente correcto. El campo es
          opcional: podés dejarlo vacío sin problema, pero si escribís algo, tiene que ser válido. Ver la sección
          técnica más abajo para el motivo.
        </p>
        <p>
          <strong>Autores y materias con autoridades (opcional).</strong> Menú Catalogar → "Autores (autoridades)" /
          "Materias (autoridades)": un catálogo aparte donde podés declarar que varias formas de escribir un mismo
          autor o materia ("Borges, Jorge Luis" y "Borges, J.L.") son la misma, con una{" "}
          <strong>forma autorizada</strong> y sus <strong>variantes</strong> (separadas por <code>;</code>). El OPAC
          agrupa las variantes bajo la forma autorizada al facetar y filtrar. No hace falta cargar nada acá para que
          el catálogo funcione — sin autoridades cargadas, cada texto tal como se escribió es su propia faceta,
          igual que siempre.
        </p>
      </Seccion>

      <Seccion id="catalogar-libros" titulo="Cómo cargar un libro con el editor MARC">
        <p>
          Libros → "Nuevo libro" abre un editor organizado en <strong>9 solapas numeradas (0 a 8)</strong>, calcado
          del editor de registros MARC de Koha — cada solapa agrupa los campos y subcampos MARC21 que le
          corresponden, con la etiqueta de cada campo mostrando siempre su número de tag entre paréntesis (ej.{" "}
          <code>245 $a</code>). No hace falta llenar las 9: solo <strong>Título propiamente dicho</strong> (solapa
          2) es obligatorio, el resto queda vacío sin problema si no aplica o no lo tenés a mano todavía.
        </p>
        <ol>
          <li>
            <strong>Antes de las solapas</strong>, un recuadro aparte ("Datos internos de SIBPSANJUAN") pide el{" "}
            <strong>Subtipo</strong> (impreso, digital, ebook, etc. — define el ícono en el catálogo) y, opcional,
            una <strong>URL de portada</strong>. Estos dos campos no son MARC, son de uso interno del sistema.
          </li>
          <li>
            <strong>Solapa 0 — Clasificación:</strong> ISBN (validado con dígito verificador), Clasificación
            Decimal Universal (CDU) y clasificación Dewey — las tres opcionales, y las tres de un solo valor.
          </li>
          <li>
            <strong>Solapa 1 — Autores:</strong> a diferencia del resto de los tipos de material, acá cada autor va
            en <strong>su propia fila</strong>, no separado por punto y coma dentro de un mismo campo. La primera
            fila es el autor/a principal (100), y cada fila que agregues con el ícono{" "}
            <strong>"◨ Repetir"</strong> es un autor/a secundario/a (700). El ícono <strong>"✕ Quitar"</strong>{" "}
            (en rojo) borra una fila ya repetida — solo aparece cuando hay más de una, porque el primer autor nunca
            se puede quitar del todo (podés dejarlo vacío si no aplica). También hay un campo aparte para{" "}
            <strong>entidad corporativa</strong> (110), para cuando el responsable es una institución y no una
            persona — típico de anuarios, informes o memorias institucionales.
          </li>
        </ol>
        <Captura
          src="/docs/libros-marc-autores.png"
          alt='Solapa "Autores" con dos autores cargados (Borges, Jorge Luis como principal y Bioy Casares, Adolfo como secundario) y los íconos "Repetir" (cuadrado) y "Quitar" (X roja) junto a cada fila.'
        />
        <ol start={4}>
          <li>
            <strong>Solapa 2 — Título y publicación:</strong> título, subtítulo, mención de responsabilidad ("por
            Jorge Luis Borges"), forma variante del título, <strong>mención de edición</strong> ("2a ed."), lugar de
            publicación, editorial y año.
          </li>
        </ol>
        <Captura
          src="/docs/libros-marc-titulo.png"
          alt='Solapa "Título y publicación" completa: Ficciones, subtítulo Cuentos, mención de responsabilidad, edición "2a ed.", Buenos Aires, Emecé, 1944.'
        />
        <ol start={5}>
          <li>
            <strong>Solapa 3 — Descripción física:</strong> cantidad de páginas, otros detalles físicos (ej.
            "il." para ilustrado), dimensiones (ej. "21 cm") y material complementario (ej. "1 CD-ROM").
          </li>
          <li>
            <strong>Solapa 4 — Serie:</strong> si el libro pertenece a una colección editorial, su nombre, el número
            de volumen dentro de la colección, y el ISSN de la serie si lo tiene.
          </li>
          <li>
            <strong>Solapa 5 — Notas:</strong> una nota general de texto libre, más dos notas puntuales opcionales
            (audiencia — "Para niños de 8 a 10 años" — e idioma, para cuando el contenido no está solo en español).
          </li>
          <li>
            <strong>Solapa 6 — Materias:</strong> mismo mecanismo de filas repetibles que Autores — una materia por
            fila, con "Repetir"/"Quitar".
          </li>
          <li>
            <strong>Solapa 7 — Acceso electrónico:</strong> solo tiene sentido si el libro (o su subtipo
            digital/ebook) tiene una URL de acceso — el texto del enlace y la dirección web. Un libro puede tener
            ejemplares físicos <em>y</em> acceso digital al mismo tiempo, no hay que elegir uno solo.
          </li>
          <li>
            <strong>Solapa 8 — Ejemplares:</strong> igual que en el resto de los tipos de material, una línea por
            copia física (<code>código de barras, signatura</code>). Es un campo local de Koha (952), no del
            estándar MARC21 en sí.
          </li>
        </ol>
        <Captura
          src="/docs/libros-marc-ejemplares.png"
          alt='Solapa "Ejemplares" con dos copias físicas cargadas: BPSJ-000001 y BPSJ-000002, ambas con signatura "863 BOR".'
        />
        <p>
          Al guardar, todo lo cargado en las 9 solapas queda en el mismo registro — y al volver a abrir el libro
          para editarlo, cada solapa trae sus datos ya completos, filas repetidas incluidas. Los campos que no se
          usan quedan simplemente vacíos: no aparecen en el catálogo ni en el export MARC (ver{" "}
          <a href="#exportar">Exportar</a> más abajo), a diferencia de forzar un valor inventado solo para
          completar el campo.
        </p>
      </Seccion>

      <Seccion id="carga-masiva" titulo="Carga masiva de libros (CSV/Excel)">
        <p>
          Solo para <strong>Libros</strong> (el resto de los tipos se carga uno por uno). Desde Libros → "Carga
          masiva desde CSV/Excel":
        </p>
        <ol>
          <li>
            Descargá la <strong>plantilla</strong> (mismo botón) — trae las columnas exactas que espera el sistema
            y una fila de ejemplo.
          </li>
          <li>
            Completala en Excel/LibreOffice/Google Sheets, <strong>una fila por libro</strong>. Autores y materias
            van separados por <code>;</code> dentro de la celda, igual que en el formulario individual.
          </li>
          <li>
            La columna <strong>ejemplares</strong> sigue la convención{" "}
            <code>códigoDeBarras,signatura;códigoDeBarras,signatura</code> — coma entre código de barras y
            signatura de un mismo ejemplar, punto y coma entre un ejemplar y el siguiente.
          </li>
          <li>Subí el archivo. Cada fila se valida por separado — una fila con errores no aborta el resto.</li>
        </ol>
        <Captura
          src="/docs/carga-masiva.png"
          alt='Panel "Carga masiva desde CSV/Excel" desplegado en Libros, con el link para descargar la plantilla y el selector de archivo.'
        />
        <p>
          Al terminar, el sistema te muestra <strong>cuántos se cargaron</strong> y una lista de{" "}
          <strong>qué filas fallaron y por qué</strong>. La causa más común, de lejos, es un <strong>ISBN
          inválido</strong>: si armaste la planilla con ISBNs de prueba/inventados (por ejemplo, un contador tipo{" "}
          <code>9789500000001</code>, <code>...002</code>, <code>...003</code>...), casi ninguno va a tener un
          dígito verificador matemáticamente correcto, y el sistema los va a rechazar a todos con el mismo error
          ("no es un ISBN válido"). No es un bug del sistema — es la validación funcionando como debe. Si son datos
          de prueba, lo más simple es <strong>dejar la columna ISBN vacía</strong> (es opcional); si son libros
          reales, usá el ISBN real que trae el libro impreso.
        </p>
        <p>
          Un <code>subtipo</code> que no coincida exactamente con los valores esperados (ej. "Novela" en vez de
          "impreso") no hace fallar la fila: se avisa y el libro se carga igual con el subtipo por defecto,
          corregible después editándolo.
        </p>
      </Seccion>

      <Seccion id="socios" titulo="Socios">
        <p>
          Alta, edición y baja desde el menú <strong>Socios</strong> (necesita el permiso "Gestionar socios" para
          bibliotecario; admin/supervisor/superbibliotecario siempre tienen acceso completo).
        </p>
        <p>
          <strong>Login del OPAC.</strong> Un socio nunca se autoregistra — el staff le da de alta el acceso al
          catálogo público desde el botón <strong>"Login OPAC"</strong> en la fila del socio, poniéndole una
          contraseña. La tabla muestra un indicador <strong>"OPAC: sí/no"</strong> por socio, para saber de un
          vistazo quién ya tiene acceso configurado. Si un socio dice que "no puede entrar" al OPAC, revisá primero
          ese indicador: si dice "no", nunca tuvo contraseña asignada (no es que la haya olvidado).
        </p>
        <Captura
          src="/docs/socios.png"
          alt='Tabla de Socios: fila de un socio con los botones "Editar" y "Login OPAC", y el indicador "OPAC: sí".'
        />
        <p>
          El borrado de un socio (individual o masivo, con checkbox por fila) es <strong>lógico</strong>: el
          registro queda marcado como eliminado y recuperable desde la base, no se pierde al instante — ver la
          sección técnica sobre borrado lógico más abajo.
        </p>
      </Seccion>

      <Seccion id="circulacion" titulo="Circulación y préstamos">
        <p>Dos caminos para que un préstamo empiece:</p>
        <ul>
          <li>
            <strong>El socio lo pide desde el OPAC.</strong> Al pedirlo, el ejemplar queda{" "}
            <strong>reservado</strong> ahí mismo (no recién cuando el staff aprueba) — mientras la solicitud está
            pendiente, ese ejemplar ya no aparece disponible para nadie más. El staff la ve en{" "}
            <strong>Circulación → Solicitudes</strong> y la aprueba (la reserva pasa a préstamo real) o la rechaza
            (el ejemplar vuelve a estar disponible).
          </li>
          <li>
            <strong>El staff lo carga directo</strong>, desde <strong>Préstamos</strong>, para un socio que llega
            sin pasar por el OPAC — buscando al socio por número/nombre/apellido y al material por
            título/ISBN/código de barras.
          </li>
        </ul>
        <Captura
          src="/docs/circulacion.png"
          alt='Pantalla de Circulación → Solicitudes pendientes, con un préstamo pedido desde el OPAC esperando "Aprobar" o "Rechazar".'
        />
        <p>
          <strong>Devoluciones</strong> y <strong>renovaciones</strong> (tanto pedidas por el socio como cargadas
          directo por el staff) se procesan desde las mismas pantallas de Circulación/Préstamos.
        </p>
        <p>
          <strong>Reglas configurables por biblioteca</strong> (pantalla "Configurar préstamos", desde Bibliotecas
          para admin/supervisor o desde Bibliotecarios para el superbibliotecario): días de préstamo, renovaciones
          máximas, multa por día de atraso, y si sábados y/o domingos cuentan para calcular vencimiento y atraso (o
          se saltean, para bibliotecas que cierran esos días).
        </p>
      </Seccion>

      <Seccion id="opac" titulo="El catálogo público (OPAC)">
        <p>
          Vive en <code>/opac/&lt;código-de-biblioteca&gt;</code> — el código reemplaza al subdominio que tendría
          una instancia Koha real. Desde el panel de Bibliotecas, el botón <strong>"Ver OPAC"</strong> en cada
          tarjeta lo abre directo en una pestaña nueva.
        </p>
        <Captura
          src="/docs/opac.png"
          alt="Catálogo público del OPAC: filtros de disponibilidad, tipo de ítem, autores y materias a la izquierda, resultados a la derecha."
        />
        <p>
          Es un catálogo unificado (los 10 tipos de material juntos) con filtros por tipo de ítem, disponibilidad,
          autor y materia, buscador de texto, y "Ver detalle" con la ficha completa de cada ítem. El socio que
          inició sesión ve además "Mis préstamos" (con multa si algo está vencido) y puede pedir préstamos y
          renovaciones — siempre de solo lectura sobre su propia situación, nunca modifica nada directamente.
        </p>
        <p>
          El OPAC también tiene un <strong>aviso de privacidad</strong> público (link en el pie de página, sin
          necesitar sesión) que explica en lenguaje claro qué datos de socio se guardan y cómo pedir
          acceso/corrección/baja.
        </p>
      </Seccion>

      <Seccion id="exportar" titulo="Exportar a Koha / DigiBepé">
        <p>
          Menú <strong>Exportar</strong> (permiso "Exportar" para bibliotecario). Dos formatos, según el tipo de
          dato:
        </p>
        <ul>
          <li>
            <strong>MARCXML</strong>, uno por cada uno de los 8 tipos de material con export — cada uno con su
            propio Leader y campo 008 según le corresponde por norma MARC21. Se importa desde Koha con "Más →
            Herramientas → Preparar registros MARC para importar".
          </li>
          <li>
            <strong>CSV de socios</strong>, con las columnas que espera el importador de socios de Koha.
          </li>
        </ul>
        <p>
          Archivos y Objetos <strong>no tienen export</strong> — a propósito, no son ítems bibliográficos MARC. Si
          hace falta migrarlos, es traspaso manual desde el panel.
        </p>
        <p>
          Antes de un lote grande con datos reales, probá cada export con un archivo chico (2-3 registros) contra
          un Koha de prueba primero.
        </p>
      </Seccion>

      <Seccion id="cuentas" titulo="Gestión de cuentas de staff">
        <p>Cada nivel gestiona cuentas estrictamente por debajo del suyo, dentro de su alcance:</p>
        <ul>
          <li>
            <strong>admin</strong> gestiona supervisores, superbibliotecarios y bibliotecarios de cualquier
            biblioteca.
          </li>
          <li>
            <strong>supervisor</strong> gestiona superbibliotecarios y bibliotecarios, pero solo de las bibliotecas
            que tiene en su alcance.
          </li>
          <li>
            <strong>superbibliotecario</strong> gestiona los bibliotecarios de su propia biblioteca.
          </li>
        </ul>
        <p>
          "Gestionar" incluye crear, listar, editar permisos/alcance, <strong>resetear la contraseña</strong> (sin
          necesitar la vieja — para cuando alguien se la olvida de verdad) y eliminar. Ningún nivel puede tocar una
          cuenta de su propio rango ni de uno superior — ni siquiera el admin puede gestionar a otro admin.
        </p>
        <Captura
          src="/docs/cuentas.png"
          alt='Fila de un bibliotecario con sus permisos otorgados y el formulario inline de "Resetear contraseña" abierto.'
        />
        <p>
          Para admin/supervisor, la gestión de bibliotecarios se hace sobre la biblioteca elegida en el selector
          del encabezado (igual que Catalogar/Socios/Circulación).
        </p>
      </Seccion>

      <Seccion id="tecnico" titulo="Preguntas técnicas frecuentes">
        <p>
          <strong>¿Por qué el sistema rechaza un ISBN que "se ve bien"?</strong> Todo ISBN/ISSN real termina en un{" "}
          <strong>dígito verificador</strong>, calculado matemáticamente a partir de los dígitos anteriores (norma
          ISBN-10, ISBN-13 o ISSN). El sistema recalcula ese dígito y lo compara — si no coincide, no es un ISBN que
          pueda existir de verdad, más allá de que "tenga la pinta". Un ISBN inventado a mano o generado como
          contador secuencial (<code>...0001</code>, <code>...0002</code>...) casi nunca cae justo en un dígito
          verificador válido. El campo es opcional: si es un dato de prueba, dejalo vacío.
        </p>
        <p>
          <strong>¿Qué es el "borrado lógico"?</strong> "Eliminar" en este sistema nunca borra el registro de la
          base al instante — lo marca como eliminado (con fecha y quién lo hizo) y deja de aparecer en las listas y
          en el OPAC, pero sigue ahí, recuperable, por si el borrado fue un error. Es el mismo criterio que usa
          cualquier sistema de gestión con datos institucionales.
        </p>
        <p>
          <strong>¿Por qué a veces tarda unos segundos en cargar por primera vez?</strong> El hosting gratuito
          "duerme" el servicio después de ~15 minutos sin uso — la primera visita después de eso tarda unos
          segundos en despertarlo. Es normal, no significa que algo se rompió; el sistema avisa esto solo cuando
          detecta que está tardando.
        </p>
        <p>
          <strong>¿Por qué autores/materias se separan por punto y coma y no por coma?</strong> Aplica a la carga
          masiva por CSV y al formulario de los 9 tipos de material que no son Libros — porque un nombre en formato
          bibliotecario estándar ("Apellido, Nombre") ya trae una coma adentro, usarla también como separador entre
          autores distintos rompería cualquier campo con más de uno. El editor MARC de Libros evita el problema de
          otra forma: cada autor/materia va en su propia fila repetible, sin necesitar ningún separador (ver{" "}
          <a href="#catalogar-libros">Cargar un libro</a> más arriba).
        </p>
        <p>
          <strong>¿Los campos de catalogación siguen alguna norma?</strong> Sí — MARC21 para el export
          bibliográfico (Leader y campo 008 según el tipo de material), ISBD/RCAA2 como referencia general, e
          ISAD(G) para los campos de Archivos. No es una implementación 100% completa de ninguna norma (por
          ejemplo, no hay autoridades MARC21 completas, solo el catálogo simplificado de autores/materias descripto
          arriba) — es captura simplificada, suficiente para migrar a un Koha real más adelante.
        </p>
      </Seccion>
      </div>
    </div>
  );
}
