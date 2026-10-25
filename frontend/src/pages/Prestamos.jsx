import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { tienePermiso } from "../permisos.js";
import { fechaCorta, nombreSocio } from "../circulacion.js";

// Todos los préstamos en curso de la biblioteca, para ver de un vistazo qué
// está afuera y qué venció. Prestar está en su propia pantalla y en la
// ficha de cada socio; renovar y devolver, también en la ficha.
export default function Prestamos() {
  const { sesion } = useAuth();
  const [filtro, setFiltro] = useState("activo");
  const [prestamos, setPrestamos] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [procesandoId, setProcesandoId] = useState(null);

  async function recargar() {
    setPrestamos(await api.listarPrestamos({ estado: filtro }));
  }

  useEffect(() => {
    setPrestamos(null);
    recargar().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  async function accion(p, tipo) {
    setError("");
    setAviso("");
    setProcesandoId(p._id);
    try {
      if (tipo === "renovar") {
        const r = await api.renovarPrestamo(p._id);
        setAviso(`Renovado «${p.item?.titulo ?? ""}» hasta el ${fechaCorta(r.fechaVencimiento)}.`);
      } else {
        const r = await api.procesarDevolucion(p._id);
        setAviso(
          r.reservaSiguiente
            ? `Devuelto. No lo pongas en el estante: quedó apartado para ${nombreSocio(r.reservaSiguiente.socio)}, que lo había reservado.`
            : `Devuelto «${p.item?.titulo ?? ""}».`
        );
      }
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <>
      <h1>Préstamos en curso</h1>
      <div className="pestanas-seccion" role="group" aria-label="Qué préstamos ver">
        <button type="button" className={filtro === "activo" ? "es-activa" : ""} aria-pressed={filtro === "activo"} onClick={() => setFiltro("activo")}>
          Todos
        </button>
        <button type="button" className={filtro === "vencido" ? "es-activa" : ""} aria-pressed={filtro === "vencido"} onClick={() => setFiltro("vencido")}>
          Vencidos
        </button>
      </div>
      {error && <div className="flash error" role="alert">{error}</div>}
      {aviso && <div className="flash ok" role="status">{aviso}</div>}
      {prestamos === null ? (
        <p>Cargando…</p>
      ) : (
        <div className="tabla-desplazable">
          <table>
            <thead>
              <tr>
                <th>Vence</th>
                <th>Socio</th>
                <th>Título</th>
                <th>Código</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {prestamos.map((p) => (
                <tr key={p._id} className={p.vencido ? "fila-vencida" : undefined}>
                  <td>
                    {fechaCorta(p.fechaVencimiento)}
                    {p.vencido && <small className="vencimiento-vencido"> · hace {p.diasAtraso} {p.diasAtraso === 1 ? "día" : "días"}</small>}
                  </td>
                  <td>{p.socio ? <Link to={`/socios/${p.socioId}`}>{nombreSocio(p.socio)}</Link> : "—"}</td>
                  <td>{p.item ? <Link to={`/catalogo/${p.itemTipo}/${p.itemId}`}>{p.item.titulo}</Link> : "—"}</td>
                  <td>{p.ejemplar?.codigoBarras ?? "—"}</td>
                  <td className="acciones-fila">
                    {tienePermiso(sesion, "prestamos") && (
                      <button className="secundario" onClick={() => accion(p, "renovar")} disabled={procesandoId === p._id || p.renovacionesRestantes === 0}>
                        Renovar
                      </button>
                    )}
                    {tienePermiso(sesion, "devoluciones") && (
                      <button onClick={() => accion(p, "devolver")} disabled={procesandoId === p._id}>
                        Devolver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {prestamos.length === 0 && (
                <tr>
                  <td colSpan={5}>{filtro === "vencido" ? "No hay préstamos vencidos." : "No hay préstamos en curso."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
