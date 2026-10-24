import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api.js";
import { useSocioAuth } from "../../SocioAuthContext.jsx";
import { enVistaPrevia } from "../../ContenidoOpacContext.jsx";
import TextoSeguro from "../../TextoSeguro.jsx";

function formatearFecha(iso) {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

// Página del CMS (ej. "Cómo pedir un libro", "Reglamento"). Las legales
// muestran versión, desde cuándo rigen y quién responde por el texto.
export default function PaginaOpac() {
  const { codigo } = useSocioAuth();
  const { slug } = useParams();
  const [pagina, setPagina] = useState(undefined); // undefined = cargando, null = no existe
  const [error, setError] = useState("");

  useEffect(() => {
    setPagina(undefined);
    setError("");
    const pedido = enVistaPrevia()
      ? api.obtenerBorradorContenido().then((b) => b.datos.paginas.find((p) => p.slug === slug) || null)
      : api.opacPagina(codigo, slug);
    pedido.then(setPagina).catch((err) => {
      setPagina(null);
      if (err.status !== 404) setError(err.message);
    });
  }, [codigo, slug]);

  useEffect(() => {
    if (pagina) document.title = pagina.titulo;
  }, [pagina]);

  if (pagina === undefined) return <p>Cargando…</p>;
  if (!pagina) {
    return (
      <>
        <h1>Página no encontrada</h1>
        {error ? <div className="flash error" role="alert">{error}</div> : <p>Esta página no existe o ya no está publicada.</p>}
      </>
    );
  }
  return (
    <article className="pagina-opac">
      <h1>{pagina.titulo}</h1>
      {pagina.legal && (
        <p className="pagina-opac__legal">
          Versión {pagina.legal.version}
          {pagina.legal.vigenteDesde && ` · Vigente desde el ${formatearFecha(pagina.legal.vigenteDesde)}`}
          {pagina.legal.responsable && ` · Responsable: ${pagina.legal.responsable}`}
        </p>
      )}
      <TextoSeguro texto={pagina.cuerpo} className="texto-cms" />
    </article>
  );
}
