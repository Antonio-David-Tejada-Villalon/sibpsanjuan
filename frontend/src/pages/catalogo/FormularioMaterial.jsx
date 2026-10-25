import React, { Suspense, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import api from "../../api.js";
import { TIPO_POR_SEGMENTO } from "./tipos.js";

// El formulario de un tipo de material, solo (/catalogar/<segmento> para
// cargar uno nuevo y /catalogar/<segmento>/<id> para editarlo). Al guardar
// va a la ficha del material: si es nuevo y circula, a su pestaña Ítems,
// para cargarle los ejemplares como en Koha.
export default function FormularioMaterial() {
  const { segmento, id } = useParams();
  const navigate = useNavigate();
  const tipo = TIPO_POR_SEGMENTO[segmento];
  const [entidad, setEntidad] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setEntidad(null);
    setError("");
    if (!tipo || !id) return;
    api
      .obtenerMaterial(tipo.itemTipo, id)
      .then((r) => setEntidad({ ...r.item, ejemplares: r.ejemplares }))
      .catch((err) => setError(err.message));
  }, [tipo, id]);

  if (!tipo) return <Navigate to="/catalogar" replace />;

  const ficha = (itemId) => `/catalogo/${tipo.itemTipo}/${itemId}`;
  const { Formulario } = tipo;

  return (
    <>
      <nav aria-label="Ubicación" className="migas">
        <ol>
          <li>
            <Link to="/catalogar">Catalogar</Link>
          </li>
          {id && (
            <li>
              <Link to={ficha(id)}>{entidad?.titulo ?? tipo.etiqueta}</Link>
            </li>
          )}
          <li aria-current="page">{id ? "Editar" : `Nuevo: ${tipo.etiqueta.toLowerCase()}`}</li>
        </ol>
      </nav>
      {error && <div className="flash error" role="alert">{error}</div>}
      {id && !entidad && !error ? (
        <p>Cargando…</p>
      ) : (
        <Suspense fallback={<p>Cargando…</p>}>
          <Formulario
            entidad={entidad}
            alGuardar={(guardado, esNuevo) =>
              navigate(`${ficha(guardado._id)}${esNuevo && tipo.circula ? "?vista=items" : ""}`, {
                state: { aviso: esNuevo ? "Material cargado." : "Cambios guardados." },
              })
            }
            alCancelar={() => navigate(id ? ficha(id) : "/catalogar")}
          />
        </Suspense>
      )}
    </>
  );
}
