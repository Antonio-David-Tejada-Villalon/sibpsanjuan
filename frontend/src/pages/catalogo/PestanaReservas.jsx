import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, CircleX } from "lucide-react";
import api from "../../api.js";
import SelectorSocio from "../../SelectorSocio.jsx";
import { ESTADOS_EJEMPLAR, cuentaVencida, fechaCorta, fechaIso, nombreSocio } from "../../circulacion.js";

// La pestaña "Reservas" de un material, como "Reservar" en Koha: se busca al
// socio, se ven las advertencias (cuenta vencida, en el tope, ya lo tiene,
// sin ejemplares) y se reserva el próximo disponible o un ejemplar puntual.
// Si están todos prestados, la reserva queda en espera y se le aparta el
// primero que vuelva. Abajo, la fila de reservas de este material.

function motivoNoReservable(e) {
  if (e.estadoVisible === "prestado" && e.prestamo) return `Prestado, vuelve el ${fechaCorta(e.prestamo.fechaVencimiento)}`;
  if (e.estadoVisible === "reservado") return "Ya está apartado para otra reserva";
  return ESTADOS_EJEMPLAR[e.estadoVisible] ?? e.estadoVisible;
}

export default function PestanaReservas({ itemTipo, itemId, titulo, ejemplares, socioInicial, onCambio, puedeReservar }) {
  const [socio, setSocio] = useState(null);
  const [cola, setCola] = useState(null);
  const [ejemplarElegido, setEjemplarElegido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  async function cargarCola() {
    setCola(await api.listarSolicitudes({ estado: "abiertas", itemTipo, itemId }));
  }

  useEffect(() => {
    cargarCola().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemTipo, itemId]);

  useEffect(() => {
    if (socioInicial) api.obtenerSocio(socioInicial).then(setSocio, () => {});
  }, [socioInicial]);

  async function elegir(s) {
    setError("");
    setAviso("");
    setEjemplarElegido("");
    setSocio(await api.obtenerSocio(s._id).catch(() => s));
  }

  const libres = ejemplares.filter((e) => e.estadoVisible === "disponible");
  const circulan = ejemplares.filter((e) => ["disponible", "prestado", "reservado"].includes(e.estadoVisible));
  // Lo que el servidor rechazaría (backend/src/circulacion/reservas.js)
  // impide reservar; que quede en espera solo se avisa.
  const impedimentos = [];
  const advertencias = [];
  if (socio) {
    if (cuentaVencida(socio)) impedimentos.push(`La cuenta de ${socio.nombre} venció el ${fechaIso(socio.vigenteHasta)}: hay que renovarla primero.`);
    if (circulan.length === 0) impedimentos.push("No hay ejemplares de este material que se puedan prestar.");
    else if (libres.length === 0) advertencias.push("No hay ejemplares libres ahora: la reserva queda en espera y se le aparta el primero que se devuelva.");
    if (libres.length > 0 && socio.reglas?.maxPrestamos != null && socio.reglas.enCurso >= socio.reglas.maxPrestamos) {
      impedimentos.push(`Está en el tope de su categoría (${socio.reglas.enCurso} de ${socio.reglas.maxPrestamos} préstamos o pedidos).`);
    }
    if (ejemplares.some((e) => e.prestamo?.socio?.numeroSocio === socio.numeroSocio)) impedimentos.push("Ya tiene prestado un ejemplar de este material.");
    if (cola?.some((s) => s.tipo === "prestamo" && String(s.socioId) === String(socio._id))) {
      impedimentos.push("Ya tiene un pedido o una reserva de este material.");
    }
  }
  const bloqueada = !socio || impedimentos.length > 0;

  async function reservar(e) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    setAviso("");
    try {
      const r = await api.crearReserva({ socioId: socio._id, itemTipo, itemId, ejemplarId: ejemplarElegido || undefined });
      setAviso(
        r.estado === "en_espera"
          ? `Reserva en espera para ${nombreSocio(socio)}: cuando se devuelva un ejemplar, se le aparta y le llega el aviso.`
          : `Listo: un ejemplar quedó apartado para ${nombreSocio(socio)}. Le llega el aviso para que pase a buscarlo.`
      );
      setSocio(null);
      setEjemplarElegido("");
      await Promise.all([cargarCola(), onCambio()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function accion(s, tipo) {
    setProcesandoId(s._id);
    setError("");
    setAviso("");
    try {
      if (tipo === "prestar") {
        await api.aprobarSolicitud(s._id, { enMostrador: true });
        setAviso(`Prestado a ${nombreSocio(s.socio)}.`);
      } else {
        const nota = window.prompt("Motivo (opcional, lo ve el socio):") ?? "";
        const r = await api.cancelarSolicitud(s._id, nota);
        setAviso(r.reservaSiguiente ? `Reserva cancelada. El ejemplar pasó a ${nombreSocio(r.reservaSiguiente.socio)}, que estaba esperando.` : "Reserva cancelada.");
      }
      await Promise.all([cargarCola(), onCambio()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <>
      <h2>Reservar «{titulo}»</h2>
      {error && <div className="flash error" role="alert">{error}</div>}
      {aviso && <div className="flash ok" role="status">{aviso}</div>}

      {puedeReservar && (
        <div className="card">
          {!socio ? (
            <SelectorSocio etiqueta="Buscar al socio" onElegir={elegir} />
          ) : (
            <form onSubmit={reservar}>
              <div className="socio-elegido">
                <div>
                  <strong>
                    <Link to={`/socios/${socio._id}`}>{nombreSocio(socio)}</Link>
                  </strong>{" "}
                  <span className="texto-secundario">n.º {socio.numeroSocio}</span>
                  {socio.categoriaInfo && <p>{socio.categoriaInfo.nombre}</p>}
                </div>
                <button type="button" className="secundario" onClick={() => setSocio(null)}>
                  Cambiar de socio
                </button>
              </div>
              {impedimentos.length + advertencias.length > 0 && (
                <ul className={impedimentos.length ? "advertencias-reserva advertencias-reserva--bloquea" : "advertencias-reserva"} role="status">
                  {[...impedimentos, ...advertencias].map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                  {impedimentos.length > 0 && <li>Por eso no se puede reservar para este socio.</li>}
                </ul>
              )}
              {libres.length > 0 && (
                <fieldset className="eleccion-ejemplar">
                  <legend>¿Qué ejemplar?</legend>
                  <label>
                    <input type="radio" name="ejemplar" value="" checked={ejemplarElegido === ""} onChange={() => setEjemplarElegido("")} /> El próximo
                    disponible
                  </label>
                  <div className="tabla-desplazable">
                    <table>
                      <thead>
                        <tr>
                          <th>Reservar</th>
                          <th>Código de barras</th>
                          <th>Signatura</th>
                          <th>Copia</th>
                          <th>Información</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ejemplares.map((e) => {
                          const libre = e.estadoVisible === "disponible";
                          return (
                            <tr key={e._id}>
                              <td>
                                {libre ? (
                                  <input
                                    type="radio"
                                    name="ejemplar"
                                    value={e._id}
                                    checked={ejemplarElegido === e._id}
                                    onChange={() => setEjemplarElegido(e._id)}
                                    aria-label={`Reservar el ejemplar ${e.codigoBarras}`}
                                  />
                                ) : (
                                  <CircleX size={18} strokeWidth={1.5} className="icono-no" aria-label="No se puede reservar" />
                                )}
                              </td>
                              <td>{e.codigoBarras}</td>
                              <td>{e.signatura || "—"}</td>
                              <td>{e.numeroCopia || "—"}</td>
                              <td>
                                {libre ? (
                                  <span className="texto-ok">
                                    <CircleCheck size={14} strokeWidth={1.5} aria-hidden="true" /> Disponible
                                  </span>
                                ) : (
                                  motivoNoReservable(e)
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </fieldset>
              )}
              <button type="submit" disabled={enviando || bloqueada}>
                {enviando ? "Reservando…" : libres.length ? "Hacer reserva" : "Reservar (en espera)"}
              </button>
            </form>
          )}
        </div>
      )}

      <h3>Reservas de este material</h3>
      {cola === null ? (
        <p>Cargando…</p>
      ) : cola.length === 0 ? (
        <p>No hay reservas ni pedidos abiertos.</p>
      ) : (
        <div className="tabla-desplazable">
          <table>
            <thead>
              <tr>
                <th>Prioridad</th>
                <th>Socio</th>
                <th>Pedido el</th>
                <th>Estado</th>
                {puedeReservar && <th><span className="sr-only">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {cola.map((s, i) => (
                <tr key={s._id}>
                  <td>{i + 1}</td>
                  <td>{s.socio ? <Link to={`/socios/${s.socioId}`}>{nombreSocio(s.socio)}</Link> : "—"}</td>
                  <td>{fechaCorta(s.fechaSolicitud)}</td>
                  <td>
                    {s.estado === "en_espera"
                      ? "En espera de que se devuelva un ejemplar"
                      : `Apartado: ${s.ejemplar?.codigoBarras ?? ""} desde el ${fechaCorta(s.fechaDisponible || s.fechaSolicitud)}`}
                    <small className="texto-secundario"> · {s.origen === "staff" ? "desde el mostrador" : "pedido en el catálogo"}</small>
                  </td>
                  {puedeReservar && (
                    <td className="acciones-fila">
                      {s.estado === "pendiente" && (
                        <button type="button" disabled={procesandoId === s._id} onClick={() => accion(s, "prestar")}>
                          Prestar ahora
                        </button>
                      )}
                      <button type="button" className="secundario" disabled={procesandoId === s._id} onClick={() => accion(s, "cancelar")}>
                        Cancelar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
