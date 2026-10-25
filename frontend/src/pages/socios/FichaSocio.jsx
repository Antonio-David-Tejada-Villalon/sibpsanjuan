import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { BookUp, IdCard, KeyRound, Pencil, Trash2 } from "lucide-react";
import api from "../../api.js";
import CampoPassword from "../../CampoPassword.jsx";
import { useAuth } from "../../AuthContext.jsx";
import { tienePermiso } from "../../permisos.js";
import { cuentaVencida, fechaCorta, fechaIso, nombreSocio } from "../../circulacion.js";

// La ficha de un socio, como la de Koha: arriba las acciones; a la
// izquierda, quién es; en el centro, sus datos y cómo usa la biblioteca;
// abajo, sus préstamos (con renovar y devolver tildando), sus pedidos y
// reservas, y el historial. Desde acá también se le presta.

const DATOS_PERSONALES = [
  ["dni", "DNI"],
  ["fechaNacimiento", "Fecha de nacimiento"],
  ["direccion", "Dirección"],
  ["localidad", "Localidad"],
  ["telefono", "Teléfono"],
  ["email", "Correo"],
  ["curso", "Curso y división"],
  ["emailTutor", "Correo del tutor o tutora"],
];

function iniciales(socio) {
  return `${socio.nombre?.[0] ?? ""}${socio.apellido?.[0] ?? ""}`.toUpperCase();
}

function Dato({ etiqueta, children }) {
  return (
    <div className="ficha-dato">
      <dt>{etiqueta}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

function textoReglas(reglas) {
  if (!reglas) return "";
  const partes = [`${reglas.diasPrestamo} días por préstamo`, `${reglas.maxRenovaciones} renovaciones`];
  if (reglas.maxPrestamos != null) partes.push(`hasta ${reglas.maxPrestamos} a la vez`);
  if (reglas.multaPorDiaVencido) partes.push(`multa de $${reglas.multaPorDiaVencido} por día de atraso`);
  return partes.join(" · ");
}

function EstadoVencimiento({ prestamo }) {
  if (!prestamo.vencido) return <>{fechaCorta(prestamo.fechaVencimiento)}</>;
  return (
    <span className="vencimiento-vencido">
      {fechaCorta(prestamo.fechaVencimiento)}
      <small>Vencido hace {prestamo.diasAtraso} {prestamo.diasAtraso === 1 ? "día" : "días"}</small>
    </span>
  );
}

function TablaPrestamos({ prestamos, puedeRenovar, puedeDevolver, onProcesar, procesando }) {
  const [renovar, setRenovar] = useState(() => new Set());
  const [devolver, setDevolver] = useState(() => new Set());

  useEffect(() => {
    setRenovar(new Set());
    setDevolver(new Set());
  }, [prestamos]);

  const alternar = (conjunto, setConjunto, id) => {
    const nuevo = new Set(conjunto);
    if (nuevo.has(id)) nuevo.delete(id);
    else nuevo.add(id);
    setConjunto(nuevo);
  };
  const renovables = prestamos.filter((p) => p.renovacionesRestantes > 0);
  const totalMulta = prestamos.reduce((a, p) => a + (p.multa || 0), 0);

  if (prestamos.length === 0) return <p>No tiene préstamos en curso.</p>;

  return (
    <>
      <div className="tabla-desplazable">
        <table className="tabla-prestamos-socio">
          <thead>
            <tr>
              <th>Vence</th>
              <th>Título</th>
              <th>Código y signatura</th>
              <th>Prestado el</th>
              <th>Multa</th>
              {puedeRenovar && (
                <th>
                  Renovar
                  <div className="seleccionar-todo">
                    <button type="button" className="enlace-boton" onClick={() => setRenovar(new Set(renovables.map((p) => p._id)))}>
                      todo
                    </button>{" "}
                    |{" "}
                    <button type="button" className="enlace-boton" onClick={() => setRenovar(new Set())}>
                      ninguno
                    </button>
                  </div>
                </th>
              )}
              {puedeDevolver && (
                <th>
                  Devolver
                  <div className="seleccionar-todo">
                    <button type="button" className="enlace-boton" onClick={() => setDevolver(new Set(prestamos.map((p) => p._id)))}>
                      todo
                    </button>{" "}
                    |{" "}
                    <button type="button" className="enlace-boton" onClick={() => setDevolver(new Set())}>
                      ninguno
                    </button>
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {prestamos.map((p) => (
              <tr key={p._id} className={p.vencido ? "fila-vencida" : undefined}>
                <td>
                  <EstadoVencimiento prestamo={p} />
                </td>
                <td>{p.item ? <Link to={`/catalogo/${p.itemTipo}/${p.itemId}`}>{p.item.titulo}</Link> : "Material dado de baja"}</td>
                <td>
                  {p.ejemplar?.codigoBarras ?? "—"}
                  {p.ejemplar?.signatura && <small className="texto-secundario"> · {p.ejemplar.signatura}</small>}
                </td>
                <td>{fechaCorta(p.fechaEntrega)}</td>
                <td>{p.multa ? `$${p.multa}` : "—"}</td>
                {puedeRenovar && (
                  <td>
                    <label className="casilla-tabla">
                      <input
                        type="checkbox"
                        checked={renovar.has(p._id)}
                        disabled={p.renovacionesRestantes === 0}
                        onChange={() => alternar(renovar, setRenovar, p._id)}
                        aria-label={`Renovar ${p.item?.titulo ?? ""}`}
                      />
                      <small>
                        {p.renovacionesRestantes === 0 ? "Sin renovaciones" : `Le quedan ${p.renovacionesRestantes}`}
                      </small>
                    </label>
                  </td>
                )}
                {puedeDevolver && (
                  <td>
                    <input
                      type="checkbox"
                      checked={devolver.has(p._id)}
                      onChange={() => alternar(devolver, setDevolver, p._id)}
                      aria-label={`Devolver ${p.item?.titulo ?? ""}`}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {totalMulta > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}>Total de multas</td>
                <td>${totalMulta}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {(puedeRenovar || puedeDevolver) && (
        <div className="acciones-tabla">
          <button type="button" disabled={procesando || (renovar.size === 0 && devolver.size === 0)} onClick={() => onProcesar({ renovar, devolver })}>
            {procesando ? "Procesando…" : "Renovar o devolver lo seleccionado"}
          </button>
          {puedeRenovar && (
            <button
              type="button"
              className="secundario"
              disabled={procesando || renovables.length === 0}
              onClick={() => onProcesar({ renovar: new Set(renovables.map((p) => p._id)), devolver: new Set() })}
            >
              Renovar todos
            </button>
          )}
        </div>
      )}
    </>
  );
}

function TablaReservas({ solicitudes, puedeGestionar, onAccion, procesandoId }) {
  if (solicitudes.length === 0) return <p>No tiene pedidos ni reservas abiertos.</p>;
  return (
    <div className="tabla-desplazable">
      <table>
        <thead>
          <tr>
            <th>Pedido el</th>
            <th>Título</th>
            <th>Estado</th>
            {puedeGestionar && <th><span className="sr-only">Acciones</span></th>}
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((s) => (
            <tr key={s._id}>
              <td>{fechaCorta(s.fechaSolicitud)}</td>
              <td>{s.item ? <Link to={`/catalogo/${s.itemTipo}/${s.itemId}`}>{s.item.titulo}</Link> : s.tipo === "renovacion" ? "Renovación de un préstamo" : "—"}</td>
              <td>
                {s.tipo === "renovacion"
                  ? "Pidió renovar"
                  : s.estado === "en_espera"
                    ? "En espera de que se devuelva un ejemplar"
                    : `Apartado: ejemplar ${s.ejemplar?.codigoBarras ?? ""} desde el ${fechaCorta(s.fechaDisponible || s.fechaSolicitud)}`}
                {s.origen === "staff" && <small className="texto-secundario"> · reserva del mostrador</small>}
              </td>
              {puedeGestionar && (
                <td className="acciones-fila">
                  {s.estado === "pendiente" && (
                    <button type="button" disabled={procesandoId === s._id} onClick={() => onAccion("aprobar", s)}>
                      {s.tipo === "renovacion" ? "Renovar" : "Prestar ahora"}
                    </button>
                  )}
                  <button type="button" className="secundario" disabled={procesandoId === s._id} onClick={() => onAccion("cancelar", s)}>
                    {s.estado === "pendiente" && s.origen === "opac" ? "Rechazar" : "Cancelar"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaHistorial({ prestamos }) {
  if (prestamos === null) return <p>Cargando…</p>;
  if (prestamos.length === 0) return <p>Todavía no devolvió ningún préstamo.</p>;
  return (
    <div className="tabla-desplazable">
      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Prestado el</th>
            <th>Vencía</th>
            <th>Devuelto el</th>
            <th>Código</th>
          </tr>
        </thead>
        <tbody>
          {prestamos.map((p) => (
            <tr key={p._id}>
              <td>{p.item?.titulo ?? "Material dado de baja"}</td>
              <td>{fechaCorta(p.fechaEntrega)}</td>
              <td>{fechaCorta(p.fechaVencimiento)}</td>
              <td>{fechaCorta(p.fechaDevolucion)}</td>
              <td>{p.ejemplar?.codigoBarras ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FichaSocio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { sesion } = useAuth();
  const [socio, setSocio] = useState(undefined);
  const [prestamos, setPrestamos] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [historial, setHistorial] = useState(null);
  const [pestana, setPestana] = useState("prestamos");
  const [mensajes, setMensajes] = useState(() => (location.state?.aviso ? [{ tipo: "ok", texto: location.state.aviso }] : []));
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [prestando, setPrestando] = useState(false);
  const [verAcceso, setVerAcceso] = useState(false);
  const [password, setPassword] = useState("");
  const [datosCompletos, setDatosCompletos] = useState(null);
  const codigoRef = useRef(null);

  const puedePrestar = tienePermiso(sesion, "prestamos");
  const puedeDevolver = tienePermiso(sesion, "devoluciones");
  const puedeEditar = tienePermiso(sesion, "socios");
  const puedeVerDatos = tienePermiso(sesion, "datosSocios");

  async function cargar() {
    try {
      const [s, p, sol] = await Promise.all([
        api.obtenerSocio(id),
        api.listarPrestamos({ estado: "activo", socioId: id }),
        api.listarSolicitudes({ estado: "abiertas", socioId: id }),
      ]);
      setSocio(s);
      setPrestamos(p);
      setSolicitudes(sol);
    } catch (err) {
      if (err.status === 404) setSocio(null);
      else setError(err.message);
    }
  }

  useEffect(() => {
    setSocio(undefined);
    setHistorial(null);
    setDatosCompletos(null);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (pestana === "historial" && historial === null) {
      api.listarPrestamos({ estado: "devuelto", socioId: id }).then(setHistorial, (err) => setError(err.message));
    }
  }, [pestana, historial, id]);

  useEffect(() => {
    if (socio) document.title = `${nombreSocio(socio)} · Socios`;
  }, [socio]);

  function avisoReserva(r) {
    return r?.reservaSiguiente
      ? {
          tipo: "aviso",
          texto: `No lo pongas en el estante: «${r.item?.titulo ?? "el ejemplar"}» quedó apartado para ${nombreSocio(r.reservaSiguiente.socio)} (n.º ${r.reservaSiguiente.socio.numeroSocio}), que lo había reservado.`,
        }
      : null;
  }

  async function prestar(e) {
    e.preventDefault();
    const valor = codigo.trim();
    if (!valor) return;
    setPrestando(true);
    setError("");
    try {
      const prestamo = await api.prestarPorCodigo(id, valor);
      setMensajes([{ tipo: "ok", texto: `Prestado ${valor}. Vence el ${fechaCorta(prestamo.fechaVencimiento)}.` }]);
      setCodigo("");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setPrestando(false);
      codigoRef.current?.focus();
    }
  }

  async function procesar({ renovar, devolver }) {
    setProcesando(true);
    setError("");
    const nuevos = [];
    for (const p of prestamos) {
      const titulo = p.item?.titulo ?? "el material";
      try {
        if (devolver.has(p._id)) {
          const r = await api.procesarDevolucion(p._id);
          nuevos.push({ tipo: "ok", texto: `Devuelto «${titulo}».` });
          const aviso = avisoReserva({ ...r, item: p.item });
          if (aviso) nuevos.push(aviso);
        } else if (renovar.has(p._id)) {
          const r = await api.renovarPrestamo(p._id);
          nuevos.push({ tipo: "ok", texto: `Renovado «${titulo}» hasta el ${fechaCorta(r.fechaVencimiento)}.` });
        }
      } catch (err) {
        nuevos.push({ tipo: "error", texto: `«${titulo}»: ${err.message}` });
      }
    }
    setMensajes(nuevos);
    await cargar();
    setHistorial(null);
    setProcesando(false);
  }

  async function accionSolicitud(accion, s) {
    setProcesandoId(s._id);
    setError("");
    try {
      if (accion === "aprobar") {
        await api.aprobarSolicitud(s._id, { enMostrador: true });
        setMensajes([{ tipo: "ok", texto: s.tipo === "renovacion" ? "Renovación aprobada." : `Prestado «${s.item?.titulo ?? ""}».` }]);
      } else {
        const nota = window.prompt("Motivo (opcional, lo ve el socio):") ?? "";
        const r = s.estado === "pendiente" && s.origen === "opac" ? await api.rechazarSolicitud(s._id, nota) : await api.cancelarSolicitud(s._id, nota);
        const nuevos = [{ tipo: "ok", texto: "Listo: se anuló el pedido." }];
        const aviso = avisoReserva({ ...r, item: s.item });
        if (aviso) nuevos.push(aviso);
        setMensajes(nuevos);
      }
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  async function guardarAcceso(e) {
    e.preventDefault();
    setError("");
    try {
      await api.crearCredencialesSocio(id, password);
      setPassword("");
      setVerAcceso(false);
      setMensajes([{ tipo: "ok", texto: "Contraseña del catálogo guardada. Ya puede ingresar con su número de socio." }]);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function verDatos() {
    setError("");
    try {
      setDatosCompletos(await api.verDatosContactoSocio(id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function eliminar() {
    if (prestamos.length) {
      setError("Tiene préstamos sin devolver: primero hay que registrar la devolución.");
      return;
    }
    if (!window.confirm(`¿Dar de baja a ${nombreSocio(socio)}? Queda guardado y se puede recuperar desde la base de datos.`)) return;
    try {
      await api.eliminarSocio(id);
      navigate("/socios", { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  if (socio === undefined) return <p>Cargando…</p>;
  if (socio === null) {
    return (
      <>
        <h1>Socio no encontrado</h1>
        <p>
          Puede que se haya dado de baja. <Link to="/socios">Volver a la lista</Link>
        </p>
      </>
    );
  }

  const datos = { ...socio, ...(datosCompletos || {}) };
  const hayOcultos = DATOS_PERSONALES.some(([campo]) => typeof datos[campo] === "string" && datos[campo].includes("•••"));
  const vencida = cuentaVencida(socio);
  const vencidos = prestamos.filter((p) => p.vencido).length;
  const enTope = socio.reglas?.maxPrestamos != null && socio.reglas.enCurso >= socio.reglas.maxPrestamos;

  return (
    <div className="ficha-socio">
      <aside className="ficha-socio__resumen">
        <div className="avatar-socio" aria-hidden="true">
          {iniciales(socio)}
        </div>
        <p className="ficha-socio__nombre">{nombreSocio(socio)}</p>
        <p>N.º {socio.numeroSocio}</p>
        <p>{socio.categoriaInfo?.nombre ?? socio.categoria}</p>
        {socio.curso && <p>{socio.curso}</p>}
        <p className="texto-secundario">{socio.biblioteca?.nombre}</p>
        <nav aria-label="Secciones de la ficha" className="ficha-socio__menu">
          {puedePrestar && (
            <a href="#prestar" onClick={() => setTimeout(() => codigoRef.current?.focus(), 0)}>
              Préstamo
            </a>
          )}
          <a href="#detalle">Detalle</a>
          <a href="#circulacion" onClick={() => setPestana("prestamos")}>
            Préstamos ({prestamos.length})
          </a>
          <a href="#circulacion" onClick={() => setPestana("reservas")}>
            Pedidos y reservas ({solicitudes.length})
          </a>
          <a href="#circulacion" onClick={() => setPestana("historial")}>
            Historial de préstamos
          </a>
        </nav>
      </aside>

      <div className="ficha-socio__principal">
        <div className="barra-herramientas" role="toolbar" aria-label="Acciones sobre el socio">
          {puedeEditar && (
            <Link className="boton-enlace secundario" to={`/socios/${id}/editar`}>
              <Pencil size={16} strokeWidth={1.5} aria-hidden="true" /> Editar
            </Link>
          )}
          {puedeEditar && (
            <button type="button" className="secundario" onClick={() => setVerAcceso((v) => !v)} aria-expanded={verAcceso}>
              <KeyRound size={16} strokeWidth={1.5} aria-hidden="true" /> {socio.tieneLoginOpac ? "Cambiar contraseña del catálogo" : "Dar acceso al catálogo"}
            </button>
          )}
          <Link className="boton-enlace secundario" to={`/socios/${id}/credencial`}>
            <IdCard size={16} strokeWidth={1.5} aria-hidden="true" /> Imprimir credencial
          </Link>
          {puedePrestar && (
            <Link className="boton-enlace secundario" to={`/catalogo?reservarPara=${id}`}>
              <BookUp size={16} strokeWidth={1.5} aria-hidden="true" /> Buscar para reservar
            </Link>
          )}
          {puedeEditar && (
            <button type="button" className="peligro" onClick={eliminar}>
              <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" /> Dar de baja
            </button>
          )}
        </div>

        <h1>
          {nombreSocio(socio)} <span className="texto-secundario">({socio.numeroSocio})</span>
        </h1>

        {verAcceso && (
          <form className="card" onSubmit={guardarAcceso}>
            <CampoPassword
              etiqueta={`Contraseña del catálogo en línea para ${socio.nombre} (mínimo 8 caracteres)`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button type="submit">Guardar contraseña</button>{" "}
            <button type="button" className="secundario" onClick={() => setVerAcceso(false)}>
              Cancelar
            </button>
          </form>
        )}

        {error && <div className="flash error" role="alert">{error}</div>}
        {mensajes.map((m, i) => (
          <div key={i} className={`flash ${m.tipo}`} role={m.tipo === "error" ? "alert" : "status"}>
            {m.texto}
          </div>
        ))}
        {vencida && (
          <div className="flash error" role="status">
            La cuenta venció el {fechaIso(socio.vigenteHasta)}: no se le puede prestar ni reservar hasta renovarla (Editar → «La cuenta vence el»).
          </div>
        )}
        {vencidos > 0 && (
          <div className="flash aviso" role="status">
            Tiene {vencidos} {vencidos === 1 ? "préstamo vencido" : "préstamos vencidos"}.
          </div>
        )}

        <div className="ficha-socio__columnas" id="detalle">
          <section className="card">
            <h2>Datos personales</h2>
            <dl className="ficha-datos">
              {DATOS_PERSONALES.filter(([campo]) => datos[campo]).map(([campo, etiqueta]) => (
                <Dato key={campo} etiqueta={etiqueta}>
                  {datos[campo]}
                </Dato>
              ))}
            </dl>
            {hayOcultos && !datosCompletos && (
              <p className="datos-ocultos">
                <small>Los datos de contacto se muestran ocultos.</small>{" "}
                {puedeVerDatos ? (
                  <button type="button" className="secundario" onClick={verDatos}>
                    Ver datos completos
                  </button>
                ) : (
                  <small>Para verlos hace falta el permiso «Ver datos de contacto de socios».</small>
                )}
              </p>
            )}
            {datosCompletos && (
              <p>
                <small>Quedó registrado que viste los datos completos.</small>
              </p>
            )}
          </section>
          <section className="card">
            <h2>Uso de la biblioteca</h2>
            <dl className="ficha-datos">
              <Dato etiqueta="N.º de socio">{socio.numeroSocio}</Dato>
              <Dato etiqueta="Categoría">{socio.categoriaInfo?.nombre ?? `${socio.categoria} (sin reglas propias)`}</Dato>
              <Dato etiqueta="Reglas">{textoReglas(socio.reglas)}</Dato>
              <Dato etiqueta="En curso">
                {socio.reglas?.enCurso ?? 0}
                {socio.reglas?.maxPrestamos != null ? ` de ${socio.reglas.maxPrestamos}` : ""} préstamos o pedidos
              </Dato>
              <Dato etiqueta="Alta">{fechaCorta(socio.creado)}</Dato>
              <Dato etiqueta="Cuenta vence">{socio.vigenteHasta ? fechaIso(socio.vigenteHasta) : "No vence"}</Dato>
              <Dato etiqueta="Biblioteca">{socio.biblioteca?.nombre}</Dato>
              <Dato etiqueta="Catálogo en línea">{socio.tieneLoginOpac ? "Tiene contraseña" : "Sin acceso todavía"}</Dato>
            </dl>
          </section>
        </div>

        {puedePrestar && (
          <form className="card caja-prestar" id="prestar" onSubmit={prestar}>
            <h2>Prestar</h2>
            <label htmlFor="codigo-prestar">Código de barras del ejemplar</label>
            <div className="fila-campo-boton">
              <input
                id="codigo-prestar"
                ref={codigoRef}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Escaneá o escribí el código"
                autoComplete="off"
                disabled={vencida}
              />
              <button type="submit" disabled={prestando || vencida || !codigo.trim()}>
                {prestando ? "Prestando…" : "Prestar"}
              </button>
            </div>
            {enTope && <small>Está en el tope de su categoría: para prestarle otro, primero tiene que devolver uno.</small>}
          </form>
        )}

        <section className="card" id="circulacion">
          <div className="pestanas" role="tablist" aria-label="Circulación del socio">
            {[
              ["prestamos", `Préstamos (${prestamos.length})`],
              ["reservas", `Pedidos y reservas (${solicitudes.length})`],
              ["historial", "Historial"],
            ].map(([clave, texto]) => (
              <button
                key={clave}
                type="button"
                role="tab"
                id={`pestana-${clave}`}
                aria-selected={pestana === clave}
                aria-controls={`panel-${clave}`}
                className={pestana === clave ? "pestana es-activa" : "pestana"}
                onClick={() => setPestana(clave)}
              >
                {texto}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`pestana-${pestana}`}>
            {pestana === "prestamos" && (
              <TablaPrestamos prestamos={prestamos} puedeRenovar={puedePrestar} puedeDevolver={puedeDevolver} onProcesar={procesar} procesando={procesando} />
            )}
            {pestana === "reservas" && (
              <TablaReservas solicitudes={solicitudes} puedeGestionar={puedePrestar} onAccion={accionSolicitud} procesandoId={procesandoId} />
            )}
            {pestana === "historial" && <TablaHistorial prestamos={historial} />}
          </div>
        </section>
      </div>
    </div>
  );
}
