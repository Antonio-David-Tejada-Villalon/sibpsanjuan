import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import api from "../../api.js";
import CodigoBarras from "../../CodigoBarras.jsx";
import { fechaIso, nombreSocio } from "../../circulacion.js";

const ORIGEN_API = import.meta.env.VITE_API_URL || "";

// Credencial del socio para imprimir (tamaño tarjeta, 85,6 × 54 mm): nombre
// e identidad de la institución (del CMS), datos del socio, vencimiento y
// el código de barras de su número, para prestarle con el lector. Al
// imprimir se oculta todo lo demás de la pantalla.
export default function Credencial() {
  const { id } = useParams();
  const [socio, setSocio] = useState(null);
  const [identidad, setIdentidad] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .obtenerSocio(id)
      .then((s) => {
        setSocio(s);
        return api.opacContenido(s.biblioteca.codigo).then((c) => setIdentidad(c.identidad), () => {});
      })
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <div className="flash error" role="alert">{error}</div>;
  if (!socio) return <p>Cargando…</p>;

  const logo = identidad?.logos?.cuadrado || identidad?.logos?.horizontal;
  const catalogo = `${window.location.host}/opac/${socio.biblioteca.codigo}`;

  return (
    <div className="pantalla-credencial">
      <div className="barra-herramientas no-imprimir">
        <button type="button" onClick={() => window.print()}>
          <Printer size={16} strokeWidth={1.5} aria-hidden="true" /> Imprimir
        </button>
        <Link className="boton-enlace secundario" to={`/socios/${id}`}>
          Volver a la ficha
        </Link>
      </div>
      <p className="no-imprimir">
        <small>
          Se imprime en tamaño tarjeta (85,6 × 54 mm). En el diálogo de impresión, elegí «Tamaño real» o escala 100 % para que el código de
          barras se lea bien.
        </small>
      </p>

      <article className="credencial" aria-label={`Credencial de ${nombreSocio(socio)}`}>
        <header className="credencial__cabecera">
          {logo && <img src={`${ORIGEN_API}${logo}`} alt="" />}
          <div>
            <strong>{identidad?.nombre || socio.biblioteca.nombre}</strong>
            <span>Credencial de la biblioteca</span>
          </div>
        </header>
        <div className="credencial__cuerpo">
          <p className="credencial__nombre">{nombreSocio(socio)}</p>
          <dl>
            <div>
              <dt>Socio n.º</dt>
              <dd>{socio.numeroSocio}</dd>
            </div>
            <div>
              <dt>Categoría</dt>
              <dd>{socio.categoriaInfo?.nombre ?? socio.categoria}</dd>
            </div>
            {socio.curso && (
              <div>
                <dt>Curso</dt>
                <dd>{socio.curso}</dd>
              </div>
            )}
            <div>
              <dt>Válida hasta</dt>
              <dd>{socio.vigenteHasta ? fechaIso(socio.vigenteHasta) : "Sin vencimiento"}</dd>
            </div>
          </dl>
        </div>
        <footer className="credencial__pie">
          <CodigoBarras valor={socio.numeroSocio} alto={34} modulo={1.4} />
          <small>Catálogo: {catalogo}</small>
        </footer>
      </article>
    </div>
  );
}
