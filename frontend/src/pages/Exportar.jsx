import React from "react";

export default function Exportar() {
  return (
    <>
      <h1>Exportar para DigiBepé / Koha</h1>
      <div className="card">
        <h2>Libros (MARCXML)</h2>
        <p>
          Un archivo <code>.xml</code> con todos tus libros en formato MARC21/MARCXML, listo para
          "Preparar registros MARC para importar" en Koha.
        </p>
        <a href="/api/v1/export/marcxml">
          <button>Descargar libros.xml</button>
        </a>
      </div>
      <div className="card">
        <h2>Publicaciones seriadas (MARCXML)</h2>
        <p>
          Igual que Libros, pero con el tag de material que corresponde a una publicación seriada
          (022 en vez de 020, 310/362 con la periodicidad y numeración).
        </p>
        <a href="/api/v1/export/marcxml/seriadas">
          <button>Descargar seriadas.xml</button>
        </a>
      </div>
      <div className="card">
        <h2>Recursos electrónicos (MARCXML)</h2>
        <p>
          Sin ejemplares — cada registro incluye la URL de acceso (campo 856), no un ítem para que
          Koha cree con código de barras.
        </p>
        <a href="/api/v1/export/marcxml/recursosElectronicos">
          <button>Descargar recursos-electronicos.xml</button>
        </a>
      </div>
      <div className="card">
        <h2>Material sonoro (MARCXML)</h2>
        <p>CD, vinilo, cassette, audiolibros, podcast, MP3, música digital — con sus ejemplares.</p>
        <a href="/api/v1/export/marcxml/materialSonoro">
          <button>Descargar material-sonoro.xml</button>
        </a>
      </div>
      <div className="card">
        <h2>Material audiovisual (MARCXML)</h2>
        <p>DVD, BluRay, VHS, documentales, películas, videos educativos, streaming.</p>
        <a href="/api/v1/export/marcxml/materialAudiovisual">
          <button>Descargar material-audiovisual.xml</button>
        </a>
      </div>
      <div className="card">
        <h2>Material cartográfico (MARCXML)</h2>
        <p>Mapas, planos, cartas topográficas, globos terráqueos, con escala/proyección si se cargaron.</p>
        <a href="/api/v1/export/marcxml/materialCartografico">
          <button>Descargar material-cartografico.xml</button>
        </a>
      </div>
      <div className="card">
        <h2>Material gráfico (MARCXML)</h2>
        <p>Fotografías, postales, láminas, afiches, grabados, ilustraciones.</p>
        <a href="/api/v1/export/marcxml/materialGrafico">
          <button>Descargar material-grafico.xml</button>
        </a>
      </div>
      <div className="card">
        <h2>Material didáctico (MARCXML)</h2>
        <p>Juegos educativos, kits escolares, rompecabezas, material Montessori/manipulativo.</p>
        <a href="/api/v1/export/marcxml/materialDidactico">
          <button>Descargar material-didactico.xml</button>
        </a>
      </div>
      <div className="card">
        <h2>Socios (CSV)</h2>
        <p>
          Un archivo <code>.csv</code> con todos tus socios, con las columnas del importador de
          socios de Koha. Antes de importarlo de verdad, confirmá contra la plantilla real de tu
          Koha (Herramientas → Importar socios → plantilla) — el nombre de columna de categoría y
          de biblioteca tienen que coincidir con lo que esa instancia tiene configurado.
        </p>
        <a href="/api/v1/export/socios.csv">
          <button>Descargar socios.csv</button>
        </a>
      </div>
    </>
  );
}
