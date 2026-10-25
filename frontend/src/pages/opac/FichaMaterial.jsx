import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CircleCheck, Clock, Globe, Landmark, Share2 } from "lucide-react";
import api, { urlPortada } from "../../api.js";
import Portada from "../../Portada.jsx";
import { useSocioAuth } from "../../SocioAuthContext.jsx";
import { idDeDireccion, textoDisponibilidad, urlFicha, useEnLinea, SIN_CONEXION } from "../../opac.js";
import { useMetadatos } from "../../metadatos.js";
import { usePreferencias } from "../../preferencias.js";

// Ficha pública de un material, con dirección propia
// (/opac/<código>/<segmento>/<título>-<id>): se puede compartir, guardar y
// la indexan los buscadores. Reemplaza al modal de detalle del catálogo.

const ESTADO_EJEMPLAR = {
  disponible: "Disponible",
  reservado: "Reservado",
  prestado: "Prestado",
  sala: "Solo para leer en la biblioteca",
  no_prestable: "No se presta",
  danado: "No disponible",
  reparacion: "En reparación",
  extraviado: "No disponible",
};

// Créditos de la fuente de la portada: Open Library agradece un enlace de
// cortesía y los términos de Google piden atribución.
const CREDITO_PORTADA = {
  openlibrary: { nombre: "Open Library", url: "https://openlibrary.org" },
  googlebooks: { nombre: "Google Books", url: "https://books.google.com" },
};

function veces(n) {
  return `${n} ${n === 1 ? "vez" : "veces"}`;
}

// Antes de pedir, el socio ve qué implica según su categoría: cuánto dura,
// cuántas renovaciones tiene y cuántos préstamos lleva. El backend vuelve a
// controlar todo: esto solo informa.
function ConfirmarPedido({ ficha, reglas, enviando, enLinea, enEspera, onConfirmar, onCancelar }) {
  // Una reserva en espera todavía no ocupa un lugar: el tope se controla al
  // llegar el ejemplar.
  const llegoAlTope = !enEspera && reglas && reglas.maxPrestamos != null && reglas.enCurso >= reglas.maxPrestamos;
  return (
    <div className="confirmar-pedido" role="group" aria-labelledby="titulo-confirmar">
      <h2 id="titulo-confirmar">{enEspera ? "Confirmá tu reserva" : "Confirmá tu pedido"}</h2>
      {enEspera ? (
        <p>
          Todos los ejemplares de <strong>{ficha.titulo}</strong> están prestados. Si lo reservás, cuando vuelva uno se aparta a tu nombre y
          te avisamos en la campana para que pases a buscarlo.
        </p>
      ) : (
        <p>
          Vas a pedir <strong>{ficha.titulo}</strong>. Se reserva un ejemplar a tu nombre y, cuando la biblioteca lo apruebe, lo retirás ahí.
        </p>
      )}
      {reglas === undefined ? (
        <p role="status">Cargando tus reglas de préstamo…</p>
      ) : reglas ? (
        <ul>
          <li>
            Dura {reglas.diasPrestamo} {reglas.diasPrestamo === 1 ? "día" : "días"}
            {reglas.categoria ? ` (categoría ${reglas.categoria.nombre})` : ""}.
          </li>
          <li>{reglas.maxRenovaciones > 0 ? `Podés renovarlo hasta ${veces(reglas.maxRenovaciones)}.` : "No se puede renovar."}</li>
          {reglas.maxPrestamos != null && (
            <li>
              Tenés {reglas.enCurso} de {reglas.maxPrestamos} préstamos o pedidos en curso.
            </li>
          )}
          {reglas.multaPorDiaVencido > 0 && <li>Si te atrasás, la multa es de ${reglas.multaPorDiaVencido} por día.</li>}
        </ul>
      ) : null}
      {llegoAlTope && (
        <p className="flash aviso" role="status">
          Ya llegaste al máximo de préstamos a la vez. Devolvé uno para poder pedir otro.
        </p>
      )}
      {!enLinea && (
        <p className="flash aviso" role="status">
          {SIN_CONEXION}
        </p>
      )}
      <div className="categoria__acciones">
        <button type="button" onClick={onConfirmar} disabled={enviando || llegoAlTope || !enLinea} aria-busy={enviando}>
          {enviando ? "Enviando…" : enEspera ? "Confirmar reserva" : "Confirmar pedido"}
        </button>
        <button type="button" className="secundario" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function FichaMaterial({ itemTipo }) {
  const { codigo, sesion } = useSocioAuth();
  const { slugId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const enLinea = useEnLinea();
  const id = idDeDireccion(slugId);
  const [ficha, setFicha] = useState(undefined); // undefined = cargando, null = no existe
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [reglas, setReglas] = useState(undefined);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // { ok, texto }
  const [compartido, setCompartido] = useState("");
  // Si ya lo pidió o reservó, no se le ofrece pedirlo de nuevo.
  const [miPedido, setMiPedido] = useState(null);

  function cargarMiPedido() {
    if (!sesion || !id) return setMiPedido(null);
    return api.opacMisSolicitudes(codigo).then(
      (lista) => setMiPedido(lista.find((s) => s.tipo === "prestamo" && String(s.itemId) === id && ["pendiente", "en_espera"].includes(s.estado)) ?? null),
      () => setMiPedido(null)
    );
  }

  useEffect(() => {
    cargarMiPedido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, id, sesion]);

  function cargar() {
    setError("");
    return api
      .opacFicha(codigo, itemTipo, id)
      .then((f) => {
        setFicha(f);
        // Dirección canónica: si el título cambió (o el enlace vino sin él), se
        // reemplaza sin sumar una entrada al historial.
        const canonica = urlFicha(codigo, f);
        if (location.pathname !== canonica) navigate(canonica, { replace: true });
      })
      .catch((err) => {
        setFicha(null);
        if (err.status !== 404) setError(err.message);
      });
  }

  useEffect(() => {
    if (!id) {
      setFicha(null);
      return;
    }
    setFicha(undefined);
    setConfirmando(false);
    setResultado(null);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, itemTipo, id]);

  useMetadatos(ficha?.seo);
  // Con ahorro de datos, la portada de 120 px también en la ficha.
  const { ahorro } = usePreferencias();
  const tamanoPortada = ahorro ? "miniatura" : "grande";

  async function abrirConfirmacion() {
    setConfirmando(true);
    setResultado(null);
    setReglas(undefined);
    try {
      setReglas(await api.opacMisReglas(codigo));
    } catch {
      setReglas(null);
    }
  }

  async function confirmar() {
    setEnviando(true);
    try {
      const solicitud = await api.opacSolicitarPrestamo(codigo, itemTipo, ficha.id);
      setResultado({
        ok: true,
        texto:
          solicitud?.estado === "en_espera"
            ? "Listo: quedó tu reserva. Cuando se devuelva un ejemplar, te avisamos en la campana."
            : "Listo: tu pedido quedó registrado. Te avisamos en la campana cuando la biblioteca lo apruebe.",
      });
      setConfirmando(false);
      await Promise.all([cargar(), cargarMiPedido()]);
    } catch (err) {
      setResultado({ ok: false, texto: err.message });
    } finally {
      setEnviando(false);
    }
  }

  async function compartir() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: ficha.titulo, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCompartido("Enlace copiado.");
    } catch (err) {
      if (err?.name !== "AbortError") setCompartido(`No se pudo copiar. El enlace es: ${url}`);
    }
  }

  if (ficha === undefined) return <p role="status">Cargando…</p>;
  if (!ficha) {
    return (
      <>
        <h1>Material no encontrado</h1>
        {error ? (
          <div className="flash error" role="alert">
            {error}{" "}
            <button type="button" className="secundario" onClick={cargar}>
              Reintentar
            </button>
          </div>
        ) : (
          <p>Este material no existe o ya no está en el catálogo.</p>
        )}
        <p>
          <Link to={`/opac/${codigo}`}>Volver al catálogo</Link>
        </p>
      </>
    );
  }

  const credito = ficha.portada && CREDITO_PORTADA[ficha.portadaFuente];
  const puedePedir = ficha.circula && !ficha.soloLectura;
  // Sin ejemplar libre pero con copias que circulan: se puede reservar y esperar.
  const enEspera = puedePedir && ficha.disponibles === 0 && ficha.prestables > 0;
  const pedible = puedePedir && (ficha.disponibles > 0 || enEspera);
  const Icono = ficha.soloLectura ? Landmark : ficha.disponibles > 0 ? CircleCheck : ficha.urlAcceso ? Globe : Clock;

  return (
    <article className="ficha-material">
      <nav aria-label="Ubicación" className="migas">
        <ol>
          <li>
            <Link to={`/opac/${codigo}`}>Catálogo</Link>
          </li>
          <li>
            <Link to={`/opac/${codigo}?tipo=${ficha.itemTipo}`}>{ficha.etiquetaTipo}</Link>
          </li>
          <li aria-current="page">{ficha.titulo}</li>
        </ol>
      </nav>

      <div className="ficha-material__cuerpo">
        <div className="ficha-material__portada">
          <Portada
            src={urlPortada(codigo, ficha.id, ficha.portada, tamanoPortada)}
            titulo={ficha.titulo}
            autor={ficha.autores[0]}
            tamano={tamanoPortada}
            decorativa={false}
          />
          {credito && (
            <small className="modal-detalle__credito">
              Portada:{" "}
              <a href={credito.url} target="_blank" rel="noopener noreferrer">
                {credito.nombre}
              </a>
            </small>
          )}
        </div>

        <div className="ficha-material__info">
          <span className="tarjeta-catalogo__tipo">{ficha.etiquetaTipo}</span>
          <h1>{ficha.titulo}</h1>
          {ficha.subtitulo && <p className="ficha-material__subtitulo">{ficha.subtitulo}</p>}
          {ficha.autores.length > 0 && (
            <p className="ficha-material__autores">
              {ficha.autores.map((a, i) => (
                <React.Fragment key={a}>
                  {i > 0 && " · "}
                  <Link to={`/opac/${codigo}?autor=${encodeURIComponent(a)}`}>{a}</Link>
                </React.Fragment>
              ))}
            </p>
          )}

          <p className={`ficha-material__disponibilidad${ficha.disponibles > 0 || ficha.soloLectura ? " es-disponible" : ""}`}>
            <Icono size={18} strokeWidth={1.5} aria-hidden="true" />
            {textoDisponibilidad(ficha)}
          </p>

          <div className="ficha-material__acciones">
            {ficha.urlAcceso && (
              <a className="boton-enlace" href={ficha.urlAcceso} target="_blank" rel="noopener noreferrer">
                {ficha.urlInstruccion || "Acceder al recurso"}
              </a>
            )}
            {pedible && sesion && !confirmando && !miPedido && (
              <button type="button" onClick={abrirConfirmacion} disabled={!enLinea}>
                {enEspera ? "Reservar" : "Pedir préstamo"}
              </button>
            )}
            {sesion && miPedido && (
              <Link className="boton-enlace secundario" to={`/opac/${codigo}/cuenta`}>
                {miPedido.estado === "en_espera" ? "Ya lo reservaste: ver en Mi cuenta" : "Ya lo pediste: ver en Mi cuenta"}
              </Link>
            )}
            {pedible && sesion === null && (
              <Link className="boton-enlace secundario" rel="nofollow" to={`/opac/${codigo}/login?volver=${encodeURIComponent(location.pathname)}`}>
                {enEspera ? "Ingresá para reservarlo" : "Ingresá para pedirlo"}
              </Link>
            )}
            <button type="button" className="secundario" onClick={compartir}>
              <Share2 size={16} strokeWidth={1.5} aria-hidden="true" /> Compartir
            </button>
          </div>
          {pedible && sesion && !enLinea && !confirmando && <p className="categoria__nota">{SIN_CONEXION}</p>}
          {compartido && (
            <p className="categoria__nota" role="status">
              {compartido}
            </p>
          )}
          {resultado && (
            <div className={`flash ${resultado.ok ? "ok" : "error"}`} role={resultado.ok ? "status" : "alert"}>
              {resultado.texto}
              {resultado.ok && (
                <>
                  {" "}
                  <Link to={`/opac/${codigo}/cuenta`}>Ver mis pedidos</Link>
                </>
              )}
            </div>
          )}
          {confirmando && (
            <ConfirmarPedido
              ficha={ficha}
              reglas={reglas}
              enviando={enviando}
              enLinea={enLinea}
              enEspera={enEspera}
              onConfirmar={confirmar}
              onCancelar={() => setConfirmando(false)}
            />
          )}

          {ficha.detalle.length > 0 && (
            <dl className="modal-detalle__campos">
              {ficha.detalle.map(({ etiqueta, valor }) => (
                <React.Fragment key={etiqueta}>
                  <dt>{etiqueta}</dt>
                  <dd>{valor}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}

          {ficha.materias.length > 0 && (
            <div className="modal-detalle__materias">
              <h2 className="sr-only">Materias</h2>
              {ficha.materias.map((m) => (
                <Link key={m} className="pill-materia" to={`/opac/${codigo}?materia=${encodeURIComponent(m)}`}>
                  {m}
                </Link>
              ))}
            </div>
          )}

          {ficha.ejemplares.length > 0 && (
            <section className="ficha-material__ejemplares">
              <h2>Ejemplares</h2>
              <ul>
                {ficha.ejemplares.map((e, i) => (
                  <li key={i}>
                    <span>
                      {e.signatura || "Sin signatura"}
                      {e.ubicacion && <small className="texto-secundario"> · {e.ubicacion}</small>}
                      {e.nota && <small className="ejemplar-nota">{e.nota}</small>}
                    </span>
                    <span className={`estado-ejemplar estado-ejemplar--${e.estado}`}>{ESTADO_EJEMPLAR[e.estado] || e.estado}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
