import React, { useEffect, useState } from "react";
import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import api from "../../api.js";
import { useSocioAuth } from "../../SocioAuthContext.jsx";
import { useMetadatosPrivados } from "../../metadatos.js";

function formatear(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-AR");
}

// Días de calendario (no horas) entre hoy y la fecha: "vence mañana"
// tiene que significar mañana, aunque falten 30 horas.
function diasHasta(fecha, ahora) {
  const inicio = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((inicio(new Date(fecha)) - inicio(ahora)) / 86400000);
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Estado de un préstamo en palabras (nunca solo con color): vencido,
// devuelto o cuánto falta. "vencido" y la multa vienen calculados del
// backend; acá solo se arma el texto.
export function estadoDelPrestamo(p, ahora = new Date()) {
  if (p.fechaDevolucion) return { tipo: "devuelto", texto: `Devuelto el ${formatear(p.fechaDevolucion)}` };
  const dias = diasHasta(p.fechaVencimiento, ahora);
  if (p.vencido) {
    const cuando = dias < 0 ? `Venció hace ${plural(-dias, "día", "días")}` : "Venció hoy";
    return { tipo: "vencido", texto: p.multa > 0 ? `${cuando} · multa $${p.multa}` : cuando };
  }
  if (dias <= 0) return { tipo: "vigente", texto: "Vence hoy" };
  if (dias === 1) return { tipo: "vigente", texto: "Vence mañana" };
  return { tipo: "vigente", texto: `Vence en ${dias} días` };
}

const ICONO_ESTADO = { devuelto: CircleCheck, vencido: TriangleAlert, vigente: Clock };

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
  useMetadatosPrivados("Mis préstamos");
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
      ) : prestamos.length === 0 ? (
        <p>Todavía no tenés préstamos.</p>
      ) : (
        // Tarjetas y no tabla: en el teléfono una tabla de cinco columnas
        // obligaba a desplazarse de costado.
        <ul className="lista-mis-prestamos">
          {prestamos.map((p) => {
            const estado = estadoDelPrestamo(p);
            const Icono = ICONO_ESTADO[estado.tipo];
            // El backend vuelve a chequear el tope: esto solo evita ofrecer
            // un pedido que ya se sabe que va a ser rechazado.
            const sinRenovaciones = reglas && p.renovaciones >= reglas.maxRenovaciones;
            return (
              <li key={p._id} className="tarjeta-prestamo">
                <h2 className="tarjeta-prestamo__titulo">{p.item?.titulo || "Material sin título"}</h2>
                <p className={`estado-prestamo estado-prestamo--${estado.tipo}`}>
                  <Icono size={16} strokeWidth={1.5} aria-hidden="true" />
                  {estado.texto}
                </p>
                <dl className="tarjeta-prestamo__datos">
                  <div>
                    <dt>Retirado</dt>
                    <dd>{formatear(p.fechaEntrega)}</dd>
                  </div>
                  <div>
                    <dt>Vence</dt>
                    <dd>{formatear(p.fechaVencimiento)}</dd>
                  </div>
                  <div>
                    <dt>Renovaciones</dt>
                    <dd>{reglas ? `${p.renovaciones} de ${reglas.maxRenovaciones}` : p.renovaciones}</dd>
                  </div>
                </dl>
                {!p.fechaDevolucion &&
                  (sinRenovaciones ? (
                    <p className="categoria__nota">Ya usaste todas las renovaciones de este préstamo.</p>
                  ) : (
                    <button
                      onClick={() => pedirRenovacion(p._id)}
                      disabled={procesandoId === p._id}
                      aria-busy={procesandoId === p._id}
                    >
                      {procesandoId === p._id ? "Enviando…" : "Pedir renovación"}
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
