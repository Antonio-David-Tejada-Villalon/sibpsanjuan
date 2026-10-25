import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api.js";
import Pager from "../../Pager.jsx";
import { useAuth } from "../../AuthContext.jsx";
import { obtenerBibliotecaActivaId } from "../../bibliotecaActiva.js";
import { cuentaVencida, fechaIso, nombreSocio } from "../../circulacion.js";
import PestanasSocios from "./PestanasSocios.jsx";

const POR_PAGINA = 50;

// La pestaña "Buscar socios": cada socio lleva a su ficha (datos,
// préstamos, devoluciones y renovaciones). El alta está en la otra pestaña.
export default function ListaSocios() {
  const { sesion } = useAuth();
  const bibliotecaId = sesion?.bibliotecaId || obtenerBibliotecaActivaId();
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ items: [], total: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    if (bibliotecaId) api.listarCategorias(bibliotecaId).then(setCategorias).catch(() => {});
  }, [bibliotecaId]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    const espera = setTimeout(() => {
      api
        .listarSociosPaginado(pagina, POR_PAGINA, busqueda.trim())
        .then((r) => vigente && setDatos(r))
        .catch((err) => vigente && setError(err.message))
        .finally(() => vigente && setCargando(false));
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [pagina, busqueda]);

  const nombreCategoria = new Map(categorias.map((c) => [c.codigo, c.nombre]));

  return (
    <>
      <h1>Socios</h1>
      <PestanasSocios />
      <label>
        Buscar por número, apellido, nombre o DNI
        <input
          type="search"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPagina(1);
          }}
          placeholder="Ej.: 2318, o Gómez"
        />
      </label>
      {error && <div className="flash error" role="alert">{error}</div>}
      {cargando && datos.items.length === 0 ? (
        <p>Cargando…</p>
      ) : (
        <div className="tabla-desplazable">
          <table className="tabla-socios">
            <thead>
              <tr>
                <th>N.º de socio</th>
                <th>Apellido y nombre</th>
                <th>Categoría</th>
                <th>Curso</th>
                <th>Cuenta</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((socio) => (
                <tr key={socio._id}>
                  <td>{socio.numeroSocio}</td>
                  <td>
                    <Link to={`/socios/${socio._id}`}>{nombreSocio(socio)}</Link>
                  </td>
                  <td>{nombreCategoria.get((socio.categoria || "").toUpperCase()) || socio.categoria}</td>
                  <td>{socio.curso || "—"}</td>
                  <td>
                    {cuentaVencida(socio) ? (
                      <span className="etiqueta-estado etiqueta-estado--error">Vencida el {fechaIso(socio.vigenteHasta)}</span>
                    ) : (
                      <span className="etiqueta-estado etiqueta-estado--ok">Activa</span>
                    )}
                  </td>
                </tr>
              ))}
              {datos.items.length === 0 && (
                <tr>
                  <td colSpan={5}>{busqueda ? "Ningún socio coincide con la búsqueda." : "Todavía no hay socios cargados."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Pager pagina={pagina} porPagina={POR_PAGINA} total={datos.total} onCambiar={setPagina} etiqueta="socios" />
    </>
  );
}
