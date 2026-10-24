import React, { useEffect, useState } from "react";
import api from "../../api.js";
import { useSocioAuth } from "../../SocioAuthContext.jsx";

function formatear(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-AR");
}

function veces(n) {
  return `${n} ${n === 1 ? "vez" : "veces"}`;
}

// Las reglas de la categoría del socio (Alumno, Docente...), dichas en
// frases cortas: cuánto dura un préstamo, cuántas veces se renueva, cuántos
// puede tener a la vez y la multa. Solo lectura — las fija la biblioteca.
export function ReglasDelSocio({ reglas }) {
  const items = [`Cada préstamo dura ${reglas.diasPrestamo} ${reglas.diasPrestamo === 1 ? "día" : "días"}.`];
  items.push(
    reglas.maxRenovaciones > 0
      ? `Podés renovarlo hasta ${veces(reglas.maxRenovaciones)}.`
      : "Los préstamos no se pueden renovar."
  );
  if (reglas.maxPrestamos != null) {
    items.push(
      `Podés tener hasta ${reglas.maxPrestamos} a la vez, contando los pedidos pendientes. Ahora tenés ${reglas.enCurso}.`
    );
  }
  if (reglas.multaPorDiaVencido > 0) {
    items.push(`Si te atrasás, la multa es de $${reglas.multaPorDiaVencido} por día.`);
  }
  return (
    <section className="card mis-reglas" aria-labelledby="titulo-mis-reglas">
      <h2 id="titulo-mis-reglas">
        Tus reglas de préstamo{reglas.categoria ? ` · ${reglas.categoria.nombre}` : ""}
      </h2>
      <ul>
        {items.map((texto) => (
          <li key={texto}>{texto}</li>
        ))}
      </ul>
    </section>
  );
}

export default function MisPrestamos() {
  const { codigo } = useSocioAuth();
  const [prestamos, setPrestamos] = useState(null);
  const [reglas, setReglas] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [procesandoId, setProcesandoId] = useState(null);

  async function recargar() {
    setPrestamos(await api.opacMisPrestamos(codigo));
  }

  useEffect(() => {
    // Si falla, la página sigue sirviendo sin el recuadro de reglas.
    api.opacMisReglas(codigo).then(setReglas, () => setReglas(null));
  }, [codigo]);

  useEffect(() => {
    recargar();
  }, [codigo]);

  async function pedirRenovacion(prestamoId) {
    setMensaje("");
    setError("");
    setProcesandoId(prestamoId);
    try {
      await api.opacSolicitarRenovacion(codigo, prestamoId);
      setMensaje("Pedido de renovación enviado — la biblioteca lo va a revisar.");
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <>
      <h1>Mis préstamos</h1>
      {reglas && <ReglasDelSocio reglas={reglas} />}
      {mensaje && <div className="flash ok" role="status">{mensaje}</div>}
      {error && <div className="flash error" role="alert">{error}</div>}
      {prestamos === null ? (
        <p>Cargando...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Libro</th>
              <th>Entrega</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {prestamos.map((p) => (
              <tr key={p._id}>
                <td>{p.item?.titulo}</td>
                <td>{formatear(p.fechaEntrega)}</td>
                <td>{formatear(p.fechaVencimiento)}</td>
                <td>
                  {p.fechaDevolucion
                    ? "devuelto"
                    : p.vencido
                    ? `atrasado${p.multa > 0 ? ` — multa: $${p.multa}` : ""}`
                    : "al día"}
                </td>
                <td>
                  {!p.fechaDevolucion && (
                    <button onClick={() => pedirRenovacion(p._id)} disabled={procesandoId === p._id}>
                      {procesandoId === p._id ? "Enviando…" : "Pedir renovación"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {prestamos.length === 0 && (
              <tr>
                <td colSpan={5}>Todavía no tenés préstamos.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
