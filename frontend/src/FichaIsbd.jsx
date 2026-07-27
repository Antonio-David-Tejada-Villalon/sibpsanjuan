import React, { useEffect } from "react";

// Formato ISBD (International Standard Bibliographic Description) para
// cualquiera de los 10 tipos de material — genérico a propósito: cada tipo
// solo tiene un subconjunto de estos campos, y las áreas que no aplican se
// omiten en vez de mostrarse vacías. Ver la puntuación ISBD real (": " para
// el subtítulo, " / " para la mención de responsabilidad, ". — " entre
// áreas, "[S.l.]"/"[s.n.]"/"[s.a.]" para lugar/editorial/fecha
// desconocidos dentro del área de publicación) — misma norma que ya usa
// este proyecto para MARC21 (ver marc/marcxml.js).
function areaTitulo(item) {
  const autores = (item.autores || []).join(" ; ");
  const responsabilidad = item.mencionResponsabilidad || autores;
  let texto = item.titulo || "";
  if (item.subtitulo) texto += ` : ${item.subtitulo}`;
  if (responsabilidad) texto += ` / ${responsabilidad}`;
  return texto || null;
}

function areaPublicacion(item) {
  const { lugarPublicacion, editorial, anio } = item;
  if (!lugarPublicacion && !editorial && !anio) return null;
  return `${lugarPublicacion || "[S.l.]"} : ${editorial || "[s.n.]"}, ${anio || "[s.a.]"}`;
}

function areaDescripcionFisica(item) {
  const extension = item.paginas ? `${item.paginas} p.` : item.duracion || null;
  let texto = extension || "";
  if (item.detallesFisicos) texto += texto ? ` : ${item.detallesFisicos}` : item.detallesFisicos;
  if (item.dimensiones) texto += texto ? ` ; ${item.dimensiones}` : item.dimensiones;
  if (item.materialComplementario) {
    texto += texto ? ` + ${item.materialComplementario}` : item.materialComplementario;
  }
  return texto || null;
}

function areaSerie(item) {
  if (!item.serie) return null;
  let texto = item.serie;
  if (item.serieVolumen) texto += ` ; ${item.serieVolumen}`;
  if (item.issn) texto += `, ISSN ${item.issn}`;
  return `(${texto})`;
}

function areaNotas(item) {
  const notas = [item.notas, item.notaAudiencia, item.notaIdioma].filter(Boolean);
  return notas.length ? notas.join(". ") : null;
}

function areaNumeroNormalizado(item) {
  if (item.isbn) return `ISBN ${item.isbn}`;
  // "issn" en Libro es el ISSN de la SERIE a la que pertenece (490 $x, ya
  // mostrado en areaSerie), no el identificador del ítem en sí — solo
  // cuenta como número normalizado propio cuando el tipo es Seriada (la
  // publicación periódica es lo que tiene ISSN propio).
  if (item.issn && item.itemTipo === "Seriada") return `ISSN ${item.issn}`;
  return null;
}

/** Arma el párrafo ISBD completo (áreas 1-8, las que apliquen) para un ítem de cualquier tipo. */
export function formatearFichaIsbd(item) {
  return [
    areaTitulo(item),
    item.edicion || null,
    areaPublicacion(item),
    areaDescripcionFisica(item),
    areaSerie(item),
    areaNotas(item),
    areaNumeroNormalizado(item),
  ]
    .filter(Boolean)
    .join(". — ");
}

// Campos que no entran en la puntuación ISBD clásica pero sí interesan al
// bibliotecario (clasificación, datos propios de cada tipo de material) —
// se muestran aparte, como una ficha técnica breve debajo del párrafo.
const CAMPOS_ADICIONALES = [
  ["subtipo", "Subtipo"],
  ["cdu", "Clasificación Decimal Universal (CDU)"],
  ["dewey", "Clasificación Decimal Dewey"],
  ["autorCorporativo", "Entidad corporativa"],
  ["tituloVariante", "Forma variante del título"],
  ["periodicidad", "Periodicidad"],
  ["tipoRecurso", "Tipo de recurso"],
  ["duracion", "Duración"],
  ["escala", "Escala"],
  ["proyeccion", "Proyección"],
  ["coordenadas", "Coordenadas"],
  ["tecnica", "Técnica"],
  ["edadRecomendada", "Edad recomendada"],
  ["componentes", "Componentes"],
  ["nivelDescripcion", "Nivel de descripción"],
  ["codigoReferencia", "Código de referencia"],
  ["productor", "Productor"],
  ["fechaInicio", "Fecha de inicio"],
  ["fechaFin", "Fecha de cierre/fin"],
  ["volumenSoporte", "Volumen y soporte"],
  ["condicionesAcceso", "Condiciones de acceso"],
  ["nivelAcceso", "Nivel de acceso"],
  ["periodo", "Período"],
  ["ubicacion", "Ubicación"],
];

function datosAdicionales(item) {
  return CAMPOS_ADICIONALES.filter(([campo]) => item[campo]).map(([campo, etiqueta]) => [etiqueta, String(item[campo])]);
}

function disponibilidad(item) {
  if (!Array.isArray(item.ejemplares)) return null;
  const total = item.ejemplares.length;
  const disponibles = item.ejemplares.filter((e) => e.estado === "disponible").length;
  if (total === 0) return "Sin ejemplares cargados.";
  return `${disponibles} de ${total} ejemplar(es) disponible(s) para préstamo.`;
}

/** Modal con la ficha ISBD completa de un ítem — reusa el mismo overlay/tarjeta que el detalle del OPAC. */
export default function FichaIsbdModal({ item, etiquetaTipo, onCerrar }) {
  useEffect(() => {
    function onTecla(e) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onTecla);
    return () => document.removeEventListener("keydown", onTecla);
  }, [onCerrar]);

  const parrafo = formatearFichaIsbd(item);
  const adicionales = datosAdicionales(item);
  const disp = disponibilidad(item);

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div
        className="modal-detalle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-isbd-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-detalle__cerrar" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
        <div className="modal-detalle__info" style={{ paddingRight: 0 }}>
          <span className="tarjeta-catalogo__tipo">Ficha ISBD — {etiquetaTipo}</span>
          <h2 id="ficha-isbd-titulo">{item.titulo}</h2>

          <p className="ficha-isbd__parrafo">{parrafo}</p>

          {item.materias?.length > 0 && (
            <div className="modal-detalle__materias">
              {item.materias.map((m) => (
                <span key={m} className="pill-materia">
                  {m}
                </span>
              ))}
            </div>
          )}

          {adicionales.length > 0 && (
            <dl className="modal-detalle__campos">
              {adicionales.map(([etiqueta, valor]) => (
                <React.Fragment key={etiqueta}>
                  <dt>{etiqueta}</dt>
                  <dd>{valor}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}

          {disp && <p className="tarjeta-catalogo__disponibilidad">{disp}</p>}

          {item.urlAcceso && (
            <p>
              <a href={item.urlAcceso} target="_blank" rel="noreferrer">
                {item.urlInstruccion || "Acceder"}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
