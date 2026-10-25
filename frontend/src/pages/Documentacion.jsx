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
  { id: "buscar-catalogo", etiqueta: "El catálogo y la ficha de cada material" },
  { id: "items", etiqueta: "Ítems: los ejemplares (952)" },
  { id: "socios", etiqueta: "Socios y su ficha" },
  { id: "circulacion", etiqueta: "Prestar, devolver y reservar" },
  { id: "notificaciones", etiqueta: "Notificaciones" },
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
          <strong>"BIBLIOTECA"</strong> del encabezado antes de entrar a Catálogo, Socios o Notificaciones. Sin elegir
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
        <p>
          Menú <strong>Catálogo → Catalogar</strong>: primero elegís qué vas a cargar, y se abre el formulario de ese
          tipo de material, solo en su pantalla. Lo que ya está cargado no se ve acá sino en{" "}
          <a href="#buscar-catalogo">el Catálogo</a>. Al guardar, el sistema te lleva a la ficha del material (si es
          nuevo y se presta, directo a su vista <a href="#items">Ítems</a>, para cargarle los ejemplares).
        </p>
        <Captura
          src="/docs/catalogar-tipos.png"
          alt='Pantalla "Catalogar": una tarjeta por tipo de material (Libro, Publicación seriada, Recurso electrónico, Material sonoro, audiovisual, cartográfico, gráfico, didáctico, Archivo, Objeto) y otra para la carga masiva de libros.'
        />
        <p>Los 10 tipos de material que soporta el sistema:</p>
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
          <strong>Ejemplares.</strong> Al cargar un material nuevo que circula, se pueden anotar de una vez los
          ejemplares, uno por línea (<code>código de barras, signatura</code>). Después, agregar, editar o dar de
          baja ejemplares se hace en la vista <a href="#items">Ítems</a> de su ficha. Sin ejemplares, el material
          queda catalogado pero nadie lo puede pedir prestado (0 disponibles).
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
          <strong>Autores y materias con autoridades (opcional).</strong> Menú Catálogo → "Autores (autoridades)" /
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
          Catalogar → <strong>Libro</strong> abre un editor organizado en <strong>9 solapas numeradas (0 a 8)</strong>, calcado
          del editor de registros MARC de Koha — cada solapa agrupa los campos y subcampos MARC21 que le
          corresponden, con la etiqueta de cada campo mostrando siempre su número de tag entre paréntesis (ej.{" "}
          <code>245 $a</code>). No hace falta llenar las 9: solo <strong>Título propiamente dicho</strong> (solapa
          2) es obligatorio, el resto queda vacío sin problema si no aplica o no lo tenés a mano todavía.
        </p>
        <ol>
          <li>
            <strong>Antes de las solapas</strong>, un recuadro aparte ("Datos internos de SIBPSANJUAN") pide el{" "}
            <strong>Subtipo</strong> (impreso, digital, ebook, etc. — define el ícono en el catálogo) y la{" "}
            <strong>Portada</strong>: un libro con ISBN la busca solo al guardarse (Open Library y después Google
            Books); si no aparece, se puede pegar la URL de una imagen, que el sistema descarga y guarda. Sin
            portada, el catálogo muestra una tapa con el título. Estos dos datos no son MARC, son de uso interno del
            sistema.
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
            estándar MARC21 en sí. Solo aparece al cargar un libro nuevo: después, los ejemplares se manejan en la
            vista <a href="#items">Ítems</a> de la ficha.
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
          Solo para <strong>Libros</strong> (el resto de los tipos se carga uno por uno). Desde Catalogar →{" "}
          <strong>"Carga masiva de libros"</strong>:
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
        <p>
          La plantilla trae las mismas columnas que las 9 solapas del editor MARC de{" "}
          <a href="#catalogar-libros">Cargar un libro</a> (edición, CDU/Dewey, autor corporativo, título variante,
          descripción física, serie/ISSN, notas de audiencia/idioma, instrucción de acceso, además de las de
          siempre) — todas opcionales salvo el título. No hace falta completarlas todas: una fila con solo título,
          autor e ISBN se carga igual de bien que antes.
        </p>
        <Captura
          src="/docs/carga-masiva.png"
          alt='Pantalla "Carga masiva de libros", con el link para descargar la plantilla y el selector de archivo.'
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

      <Seccion id="buscar-catalogo" titulo="El catálogo y la ficha de cada material">
        <p>
          Menú <strong>Catálogo → Catálogo</strong>: todo lo que catalogaste, de los 10 tipos de material. Arriba de
          la lista, una pestaña por tipo con su cantidad (<strong>Todos</strong>, Libros, Publicaciones seriadas…) para
          ver un tipo solo; a la izquierda, el mismo sidebar de filtros que ve el socio en el OPAC (tipo de ítem, autor,
          materia).
        </p>
        <Captura
          src="/docs/catalogo.png"
          alt='Pantalla "Catálogo": búsqueda arriba, sidebar de filtros a la izquierda, pestañas por tipo de material ("Todos (5)", "Libros (5)") y la tabla de resultados con Editar, Ficha ISBD y Eliminar en cada fila.'
        />
        <p>
          <strong>Búsqueda simple</strong>, arriba de todo: un solo campo que busca por título, autor, materia o
          ISBN/ISSN a la vez. Si necesitás precisión — por ejemplo, un autor puntual sin traer todo lo que tenga esa
          palabra en el título — desplegá <strong>"Búsqueda especializada"</strong>: título, autor, materia,
          ISBN/ISSN y año, cada uno por separado. Los campos completados se combinan entre sí (todos tienen que
          coincidir) y con la búsqueda simple de arriba, si también tiene algo escrito.
        </p>
        <p>
          <strong>Filtros del sidebar.</strong> Tipos de ítem, Autores y Materias funcionan igual que en el OPAC —
          multi-selección, con la cantidad de resultados entre paréntesis. Si hay más de cinco valores distintos en
          cualquiera de los tres grupos, solo se muestran los primeros cinco con un botón{" "}
          <strong>"Ver N más"</strong>.
        </p>
        <p>
          <strong>Editar</strong> abre el formulario de ese tipo de material con el registro cargado.{" "}
          <strong>Eliminar</strong> es un borrado lógico (recuperable) y admite <strong>selección múltiple</strong>.{" "}
          <strong>Ficha ISBD</strong> muestra, en un recuadro, la descripción bibliográfica con la puntuación ISBD:
        </p>
        <Captura
          src="/docs/ficha-isbd.png"
          alt='Recuadro "Ficha ISBD — Libro" mostrando el párrafo "Ficciones : Cuentos / Borges, Jorge Luis. — Buenos Aires : Emecé, 1944. — ISBN 9789500000000", las materias como etiquetas, el subtipo y la disponibilidad de ejemplares.'
        />
        <h3>La ficha del material</h3>
        <p>
          El título de cada fila abre la <strong>ficha del material</strong>, como la de Koha: a la izquierda, las
          vistas; arriba, las acciones (Nuevo, Editar registro, Agregar ítem, Reservar, Imprimir, Dar de baja).
        </p>
        <ul>
          <li>
            <strong>Normal</strong>: portada, datos y la tabla de <strong>Existencias</strong> — cada ejemplar con su
            ubicación, signatura, estado (disponible, prestado y a quién, apartado, en reparación…), última vez visto y
            código de barras, con "Imprimir etiqueta" y "Editar".
          </li>
          <li>
            <strong>MARC</strong>: el mismo registro que se exporta a Koha, campo por campo, con los indicadores y el
            nombre de cada subcampo (no la tienen Archivos y Objetos, que no se exportan a MARC).
          </li>
          <li>
            <strong>ISBD</strong>: la ficha catalográfica con su puntuación.
          </li>
          <li>
            <strong>Ítems</strong> y <strong>Reservas</strong>: ver las secciones <a href="#items">Ítems</a> y{" "}
            <a href="#circulacion">Prestar, devolver y reservar</a>.
          </li>
          <li>
            <strong>Historial de préstamos</strong>: quién lo tuvo y cuándo.
          </li>
        </ul>
        <Captura
          src="/docs/ficha-material.png"
          alt='Ficha de "Cuentos de la selva" en la vista Normal: vistas a la izquierda (Normal, MARC, ISBD, Ítems, Reservas, Historial de préstamos), barra de acciones, portada, datos y la tabla de Existencias con un ejemplar prestado y otro disponible.'
        />
        <Captura
          src="/docs/vista-marc.png"
          alt='Vista MARC de la misma ficha: campos 000, 001, 008, 100, 245, 260, 650 y 952, cada uno con sus indicadores y sus subcampos con nombre (por ejemplo, 245 $a Título propiamente dicho).'
        />
      </Seccion>

      <Seccion id="items" titulo="Ítems: los ejemplares (952)">
        <p>
          La vista <strong>Ítems</strong> de la ficha es el equivalente a "Agregar ítem" de Koha: la lista de copias
          físicas y, debajo, el formulario para agregar o editar una. Cada campo muestra su subcampo del 952 (código de
          barras $p, signatura $o, número de copia $t, ubicación $c, si se presta $7, estado físico $4, fecha y fuente
          de adquisición $d/$e, precio $g, inventario $i, nota pública $z y nota interna $x).
        </p>
        <Captura
          src="/docs/items.png"
          alt='Vista Ítems: tabla de ejemplares con casillas para elegir cuáles imprimir, botones de editar, duplicar y borrar, y el formulario "Agregar ejemplar" con los campos del 952, el botón "Agregar y duplicar" y "Copias iguales".'
        />
        <ul>
          <li>
            <strong>Agregar ejemplar</strong>: la signatura viene sugerida de los ejemplares que ya tiene.
          </li>
          <li>
            <strong>Agregar y duplicar</strong>: guarda y deja el formulario listo para la copia siguiente, con el
            código de barras y el número de copia ya corridos (BPSJ-000009 → BPSJ-000010).
          </li>
          <li>
            <strong>Copias iguales</strong>: carga varias copias de una vez (hasta 50), con códigos correlativos.
          </li>
          <li>
            <strong>Duplicar</strong> (en cada fila) copia los datos de un ejemplar para cargar otro parecido.
          </li>
          <li>
            <strong>¿Se presta?</strong> distingue lo que circula de lo que es solo para leer en sala o de referencia;
            el <strong>estado físico</strong> (dañado, en reparación, extraviado, retirado) lo saca de circulación
            hasta corregirlo. Las dos cosas se ven en el OPAC.
          </li>
          <li>
            <strong>Imprimir etiquetas</strong>: tildá los ejemplares y se imprimen las etiquetas de lomo, con la
            signatura en renglones y el código de barras debajo.
          </li>
        </ul>
        <p>
          Un ejemplar prestado o apartado no se puede borrar: primero hay que devolverlo o cancelar la reserva.
        </p>
      </Seccion>

      <Seccion id="socios" titulo="Socios y su ficha">
        <p>
          Menú <strong>Socios</strong> (necesita el permiso "Gestionar socios" para bibliotecario):{" "}
          <strong>Buscar socios</strong> y <strong>Nuevo socio</strong> son dos pestañas separadas. El alta pide
          primero la categoría, porque decide qué datos se cargan (para Alumno, solo legajo, curso y correos).
        </p>
        <p>
          Cada socio de la lista abre su <strong>ficha</strong>, como la de Koha: a la izquierda quién es; arriba, las
          acciones (Editar, Dar acceso al catálogo, Imprimir credencial, Buscar para reservar, Dar de baja); en el
          centro sus datos y cómo usa la biblioteca (categoría, reglas, cuántos préstamos tiene en curso, cuándo vence
          su cuenta); y abajo la caja <strong>Prestar</strong> y sus préstamos, pedidos y reservas, e historial.
        </p>
        <Captura
          src="/docs/ficha-socio.png"
          alt='Ficha de Valentina Gómez (2318): resumen a la izquierda, barra de acciones, datos personales y uso de la biblioteca, caja Prestar con el código de barras, y la pestaña Préstamos con columnas Renovar y Devolver para tildar.'
        />
        <p>
          <strong>Acceso al catálogo en línea.</strong> Un socio nunca se autoregistra: el staff le pone una
          contraseña desde su ficha ("Dar acceso al catálogo"). Si alguien dice que no puede entrar, mirá en la ficha
          "Catálogo en línea": si dice "Sin acceso todavía", nunca tuvo contraseña.
        </p>
        <p>
          <strong>Credencial.</strong> "Imprimir credencial" arma una tarjeta de 85,6 × 54 mm (tamaño tarjeta de
          crédito) con el nombre de la institución, los datos del socio y su número en código de barras (Code 39, el
          que leen todos los lectores de mostrador). Al imprimir, elegí "Tamaño real" o escala 100 %.
        </p>
        <Captura
          src="/docs/credencial.png"
          alt='Credencial de Valentina Gómez: cabecera con el nombre del colegio, número de socio 2318, categoría Alumno, curso 3° B y el código de barras del número de socio.'
        />
        <p>
          <strong>Vencimiento de la cuenta</strong> (opcional, al editar): por ejemplo, al terminar el ciclo lectivo.
          Con la cuenta vencida no se le presta ni se le reserva hasta renovarla.
        </p>
        <p>
          El borrado de un socio es <strong>lógico</strong> (recuperable desde la base) y no se puede dar de baja a
          alguien con préstamos sin devolver.
        </p>
      </Seccion>

      <Seccion id="circulacion" titulo="Prestar, devolver y reservar">
        <p>Ya no hay una sección "Circulación": cada cosa está donde se usa.</p>
        <ul>
          <li>
            <strong>Prestar</strong>: desde la ficha del socio (caja "Prestar") o desde Socios → Prestar, eligiendo al
            socio y pasando el lector por cada ejemplar. Se respetan las reglas de su categoría (días, tope de
            préstamos a la vez) y que su cuenta esté vigente.
          </li>
          <li>
            <strong>Renovar y devolver</strong>: en la pestaña Préstamos de la ficha del socio, tildando en las
            columnas Renovar y/o Devolver y apretando "Renovar o devolver lo seleccionado" (o "Renovar todos").
          </li>
          <li>
            <strong>Devolver con el lector</strong>: Socios → Devolver, sin buscar al socio. Si alguien estaba
            esperando ese material, aparece el aviso <strong>"No lo pongas en el estante"</strong> con el nombre de
            quien lo reservó: el ejemplar ya quedó apartado para esa persona y le llega el aviso.
          </li>
          <li>
            <strong>Préstamos en curso</strong>: Socios → Préstamos en curso, con un filtro de vencidos.
          </li>
        </ul>
        <h3>Pedidos y reservas</h3>
        <p>
          <strong>El socio lo pide desde el OPAC.</strong> Si hay un ejemplar libre, queda apartado a su nombre ahí
          mismo; si están todos prestados, la reserva queda <strong>en espera</strong> y, cuando se devuelve un
          ejemplar, se le aparta al primero de la cola. En los dos casos, el pedido aparece en{" "}
          <a href="#notificaciones">Notificaciones</a> y en la ficha del socio, con "Prestar ahora" (cuando viene a
          buscarlo) o "Rechazar".
        </p>
        <p>
          <strong>La biblioteca reserva para un socio</strong> desde la vista <strong>Reservas</strong> de la ficha del
          material (o con "Buscar para reservar" desde la ficha del socio): se busca al socio por nombre o número, se
          elige "el próximo disponible" o un ejemplar puntual, y se ve la cola con su prioridad. Si algo lo impide
          (cuenta vencida, tope de su categoría, ya lo tiene prestado o ya lo reservó), lo dice antes de intentar.
        </p>
        <Captura
          src="/docs/reservas.png"
          alt='Vista Reservas de "Facundo": socio elegido (Rivas, Tomás), aviso de que no hay ejemplares libres y la reserva queda en espera, botón "Reservar (en espera)", y la cola con Valentina Gómez primera, con el ejemplar apartado y los botones "Prestar ahora" y "Cancelar".'
        />
        <p>
          <strong>Reglas configurables por biblioteca</strong> (pantalla "Configurar préstamos", desde Bibliotecas
          para admin/supervisor o desde Bibliotecarios para el superbibliotecario): días de préstamo, renovaciones
          máximas, multa por día de atraso, y si sábados y/o domingos cuentan para calcular vencimiento y atraso (o
          se saltean, para bibliotecas que cierran esos días).
        </p>
        <p>
          <strong>Categorías de socio</strong> (en la misma pantalla, debajo): cada biblioteca arranca con Alumno y
          Docente, y se pueden sumar otras. Cada categoría puede tener sus propios días de préstamo, renovaciones,
          multa y cantidad de préstamos a la vez; lo que deja vacío usa la regla general. Al cargar un socio se le
          elige la categoría, y el socio ve sus reglas en "Mi cuenta" del OPAC.
        </p>
      </Seccion>

      <Seccion id="notificaciones" titulo="Notificaciones">
        <p>
          La <strong>campana</strong> del encabezado muestra cuántas cosas nuevas hay. Para el personal:{" "}
          <strong>para resolver</strong> (pedidos del OPAC, renovaciones pedidas, ejemplares apartados que nadie pasó
          a buscar), <strong>préstamos vencidos</strong> y <strong>avisos del sistema</strong> (por ejemplo, socios con una
          categoría que no existe, a los que se les aplican las reglas generales). "Ver todas" abre la página de Notificaciones, con las acciones a mano
          (Prestar, Rechazar, Cancelar reserva).
        </p>
        <Captura
          src="/docs/notificaciones.png"
          alt='Página "Notificaciones": grupo "Para resolver" con «Facundo» apartado para Valentina Gómez y los botones Prestar y Cancelar reserva; grupos "Préstamos vencidos" y "Avisos del sistema" vacíos.'
        />
        <p>
          El <strong>socio</strong> también tiene su campana en el OPAC: le avisa cuando un préstamo está por vencer o
          ya venció, cuando aceptaron su pedido o le apartaron una reserva (para que pase a buscarlo), cuando le
          renovaron un préstamo y cuando le rechazaron o cancelaron un pedido. Las notificaciones se calculan en el momento (no se mandan correos todavía) y se marcan como
          leídas al abrirlas.
        </p>
      </Seccion>

      <Seccion id="opac" titulo="El catálogo público (OPAC)">
        <p>
          Vive en <code>/opac/&lt;código-de-biblioteca&gt;</code> — el código reemplaza al subdominio que tendría
          una instancia Koha real. Desde el panel de Bibliotecas, el botón <strong>"Ver OPAC"</strong> en cada
          tarjeta lo abre directo en una pestaña nueva.
        </p>
        <p>
          Lo que el catálogo muestra de la institución se carga en <strong>Contenido del OPAC</strong>: nombre,
          logos, color de acento (el sistema avisa si el texto no se va a leer bien), contacto, avisos con fechas y
          páginas como el reglamento. Se trabaja en un borrador, se revisa con la vista previa (celular, tablet y
          escritorio) y lo publica el superbibliotecario, un supervisor o el admin. Cada publicación queda en el
          historial y se puede volver a una anterior.
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
          del encabezado (igual que Catálogo, Socios y Notificaciones).
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
