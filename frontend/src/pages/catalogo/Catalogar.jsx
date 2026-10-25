import React, { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { FileSpreadsheet } from "lucide-react";
import { TIPOS_MATERIAL } from "./tipos.js";

// "Catalogar": primero se elige qué se va a cargar, y cada tipo tiene su
// formulario solo, en su propia pantalla. Lo ya cargado está en "Catálogo".
export default function Catalogar() {
  return (
    <>
      <h1>Catalogar</h1>
      <p>
        ¿Qué vas a cargar? Lo que ya está cargado lo encontrás en el <Link to="/catalogo">Catálogo</Link>.
      </p>
      <ul className="grilla-tipos">
        {TIPOS_MATERIAL.map(({ segmento, etiqueta, descripcion, Icono }) => (
          <li key={segmento}>
            <Link to={`/catalogar/${segmento}`} className="tarjeta-tipo">
              <Icono size={24} strokeWidth={1.5} aria-hidden="true" />
              <span className="tarjeta-tipo__nombre">{etiqueta}</span>
              <span className="tarjeta-tipo__descripcion">{descripcion}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link to="/catalogar/importar" className="tarjeta-tipo">
            <FileSpreadsheet size={24} strokeWidth={1.5} aria-hidden="true" />
            <span className="tarjeta-tipo__nombre">Carga masiva de libros</span>
            <span className="tarjeta-tipo__descripcion">Muchos libros de una vez, desde una planilla (CSV).</span>
          </Link>
        </li>
      </ul>
    </>
  );
}

const CargaMasivaLibros = lazy(() => import("../Libros.jsx").then((m) => ({ default: m.CargaMasivaLibros })));

export function ImportarLibros() {
  return (
    <>
      <nav aria-label="Ubicación" className="migas">
        <ol>
          <li>
            <Link to="/catalogar">Catalogar</Link>
          </li>
          <li aria-current="page">Carga masiva de libros</li>
        </ol>
      </nav>
      <h1>Carga masiva de libros</h1>
      <Suspense fallback={<p>Cargando…</p>}>
        <CargaMasivaLibros onImportado={() => {}} />
      </Suspense>
      <p>
        Después de importar, los libros aparecen en el <Link to="/catalogo?tipo=Libro">Catálogo</Link>.
      </p>
    </>
  );
}
