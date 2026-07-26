import React, { useEffect, useState } from "react";
import api, { TIPOS_CIRCULANTES } from "../api.js";

function formatear(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-AR");
}

function coincideSocio(socio, texto) {
  return `${socio.numeroSocio} ${socio.apellido} ${socio.nombre}`.toLowerCase().includes(texto);
}

function coincideItem(entrada, texto) {
  const { item } = entrada;
  const codigosBarra = (item.ejemplares || []).map((e) => e.codigoBarras).join(" ");
  return `${item.titulo} ${item.isbn || ""} ${codigosBarra}`.toLowerCase().includes(texto);
}

// Buscador con resultados en desplegable — mismo dato (texto tipeado) filtra
// contra una lista ya cargada en memoria (socios o ítems circulantes, ambas
// listas chicas en una biblioteca típica) en vez de pegarle a la API por
// cada tecla. Una vez elegido un resultado, se reemplaza por una tarjeta de
// resumen con un botón "Cambiar" para volver a buscar.
function Buscador({ etiqueta, placeholder, texto, onTexto, resultados, renderResultado, elegido, onElegir, onQuitar }) {
  if (elegido) {
    return (
      <div className="resultado-elegido">
        {elegido}
        <button type="button" className="secundario" onClick={onQuitar}>
          Cambiar
        </button>
      </div>
    );
  }
  return (
    <div className="buscador-combo">
      <label>
        {etiqueta}
        <input value={texto} onChange={(e) => onTexto(e.target.value)} placeholder={placeholder} autoComplete="off" />
      </label>
      {texto.trim() && (
        <ul className="buscador-combo__resultados">
          {resultados.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => onElegir(r)}>
                {renderResultado(r)}
              </button>
            </li>
          ))}
          {resultados.length === 0 && <li className="buscador-combo__sin-resultados">Sin coincidencias.</li>}
        </ul>
      )}
    </div>
  );
}

export default function Prestamos() {
  const [prestamos, setPrestamos] = useState(null);
  const [socios, setSocios] = useState([]);
  // Un grupo de ítems por tipo circulante: [{ itemTipo, etiqueta, items }, ...]
  const [gruposItems, setGruposItems] = useState([]);
  const [textoSocio, setTextoSocio] = useState("");
  const [socioElegido, setSocioElegido] = useState(null);
  const [textoItem, setTextoItem] = useState("");
  const [itemElegido, setItemElegido] = useState(null); // { itemTipo, etiquetaTipo, item }
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null); // último préstamo recién creado, con sus datos
  const [procesandoId, setProcesandoId] = useState(null);

  async function recargar() {
    setPrestamos(await api.listarPrestamos("activo"));
  }

  useEffect(() => {
    recargar();
    api.listarSocios().then(setSocios);
    Promise.all(
      TIPOS_CIRCULANTES.map(({ itemTipo, etiqueta, listar }) =>
        listar().then((items) => ({ itemTipo, etiqueta, items }))
      )
    ).then(setGruposItems);
  }, []);

  const resultadosSocio = textoSocio.trim()
    ? socios.filter((s) => coincideSocio(s, textoSocio.trim().toLowerCase())).slice(0, 8)
    : [];

  const todosLosItems = gruposItems.flatMap(({ itemTipo, etiqueta, items }) =>
    items.map((item) => ({ itemTipo, etiquetaTipo: etiqueta, item }))
  );
  const resultadosItem = textoItem.trim()
    ? todosLosItems.filter((entrada) => coincideItem(entrada, textoItem.trim().toLowerCase())).slice(0, 8)
    : [];

  function onQuitarSocio() {
    setSocioElegido(null);
    setTextoSocio("");
  }

  function onQuitarItem() {
    setItemElegido(null);
    setTextoItem("");
  }

  async function prestamoDirecto(e) {
    e.preventDefault();
    setError("");
    setConfirmacion(null);
    setGuardando(true);
    try {
      const prestamo = await api.crearPrestamoDirecto({
        socioId: socioElegido._id,
        itemTipo: itemElegido.itemTipo,
        itemId: itemElegido.item._id,
      });
      setConfirmacion({ prestamo, socio: socioElegido, itemInfo: itemElegido });
      onQuitarSocio();
      onQuitarItem();
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function devolucion(id) {
    setError("");
    setProcesandoId(id);
    try {
      await api.procesarDevolucion(id);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  async function renovar(id) {
    setError("");
    setProcesandoId(id);
    try {
      await api.renovarPrestamo(id);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <>
      <h1>Préstamos activos</h1>
      {error && <div className="flash error" role="alert">{error}</div>}

      {confirmacion && (
        <div className="flash ok" role="status">
          <strong>Préstamo registrado.</strong> {confirmacion.socio.apellido}, {confirmacion.socio.nombre} (socio{" "}
          {confirmacion.socio.numeroSocio}) se llevó <em>{confirmacion.itemInfo.item.titulo}</em> (
          {confirmacion.itemInfo.etiquetaTipo}) el {formatear(confirmacion.prestamo.fechaEntrega)}. Debe
          devolverlo antes del <strong>{formatear(confirmacion.prestamo.fechaVencimiento)}</strong>.
        </div>
      )}

      <form className="card" onSubmit={prestamoDirecto}>
        <h2>Préstamo directo (socio que llega sin pedirlo por el OPAC)</h2>

        <Buscador
          etiqueta="Buscar socio por número, nombre o apellido"
          placeholder="Ej: 0001, o Pérez"
          texto={textoSocio}
          onTexto={setTextoSocio}
          resultados={resultadosSocio}
          renderResultado={(s) => (
            <>
              {s.apellido}, {s.nombre} <small>(socio {s.numeroSocio})</small>
            </>
          )}
          elegido={
            socioElegido && (
              <span>
                <strong>Socio:</strong> {socioElegido.apellido}, {socioElegido.nombre} (
                {socioElegido.numeroSocio})
              </span>
            )
          }
          onElegir={(s) => {
            setSocioElegido(s);
            setTextoSocio("");
          }}
          onQuitar={onQuitarSocio}
        />

        <Buscador
          etiqueta="Buscar material por título, ISBN o código de barras"
          placeholder="Ej: Ficciones, o BPSJ-000001"
          texto={textoItem}
          onTexto={setTextoItem}
          resultados={resultadosItem}
          renderResultado={({ item, etiquetaTipo }) => {
            const disponibles = (item.ejemplares || []).filter((e) => e.estado === "disponible").length;
            return (
              <>
                {item.titulo} <small>— {etiquetaTipo} ({disponibles} disponibles)</small>
              </>
            );
          }}
          elegido={
            itemElegido && (
              <span>
                <strong>Material:</strong> {itemElegido.item.titulo} <small>({itemElegido.etiquetaTipo})</small>
              </span>
            )
          }
          onElegir={(entrada) => {
            setItemElegido(entrada);
            setTextoItem("");
          }}
          onQuitar={onQuitarItem}
        />

        <button type="submit" disabled={guardando || !socioElegido || !itemElegido}>
          {guardando ? "Registrando…" : "Registrar préstamo"}
        </button>
      </form>

      {prestamos === null ? (
        <p>Cargando...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Socio</th>
              <th>Ítem</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {prestamos.map((p) => (
              <tr key={p._id}>
                <td>{p.socio ? `${p.socio.apellido}, ${p.socio.nombre}` : "—"}</td>
                <td>{p.item?.titulo}</td>
                <td>{formatear(p.fechaVencimiento)}</td>
                <td>{p.vencido ? <strong>atrasado</strong> : "al día"}</td>
                <td>
                  <button
                    className="secundario"
                    onClick={() => renovar(p._id)}
                    disabled={procesandoId === p._id}
                  >
                    {procesandoId === p._id ? "Procesando…" : "Renovar"}
                  </button>{" "}
                  <button onClick={() => devolucion(p._id)} disabled={procesandoId === p._id}>
                    {procesandoId === p._id ? "Procesando…" : "Registrar devolución"}
                  </button>
                </td>
              </tr>
            ))}
            {prestamos.length === 0 && (
              <tr>
                <td colSpan={5}>No hay préstamos activos.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
