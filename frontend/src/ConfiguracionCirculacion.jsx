import React, { useEffect, useState } from "react";
import api from "./api.js";

// Compartido entre Bibliotecarios.jsx (el propio superbibliotecario, sobre
// su única biblioteca) y AdminBibliotecas.jsx (admin/supervisor, una por
// cada biblioteca en su alcance) — mismo formulario, el backend decide con
// puedeConfigurarCirculacion() quién puede tocar cuál (ver bibliotecas.js).
export default function ConfiguracionCirculacion({ bibliotecaId }) {
  const [form, setForm] = useState(null); // null = cargando
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    setForm(null);
    setError("");
    setGuardado(false);
    api
      .obtenerBiblioteca(bibliotecaId)
      .then((b) =>
        setForm({
          diasPrestamo: b.diasPrestamo,
          maxRenovaciones: b.maxRenovaciones,
          multaPorDiaVencido: b.multaPorDiaVencido,
          contarSabados: b.contarSabados,
          contarDomingos: b.contarDomingos,
        })
      )
      .catch((err) => setError(err.message));
  }, [bibliotecaId]);

  function onCambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setGuardado(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const actualizada = await api.actualizarConfiguracionCirculacion(bibliotecaId, form);
      setForm({
        diasPrestamo: actualizada.diasPrestamo,
        maxRenovaciones: actualizada.maxRenovaciones,
        multaPorDiaVencido: actualizada.multaPorDiaVencido,
        contarSabados: actualizada.contarSabados,
        contarDomingos: actualizada.contarDomingos,
      });
      setGuardado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (!form) {
    return (
      <div className="card">
        {error ? <div className="flash error" role="alert">{error}</div> : <p>Cargando configuración…</p>}
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h3>Configuración de préstamos</h3>
      {error && <div className="flash error" role="alert">{error}</div>}
      {guardado && <div className="flash ok" role="status">Guardado.</div>}
      <label>
        Días de préstamo
        <input
          type="number"
          min="1"
          value={form.diasPrestamo}
          onChange={(e) => onCambiar("diasPrestamo", Number(e.target.value))}
          required
        />
      </label>
      <label>
        Renovaciones máximas (0 = no se puede renovar)
        <input
          type="number"
          min="0"
          value={form.maxRenovaciones}
          onChange={(e) => onCambiar("maxRenovaciones", Number(e.target.value))}
          required
        />
      </label>
      <label>
        Multa por día de atraso, en $ (0 = no cobra)
        <input
          type="number"
          min="0"
          value={form.multaPorDiaVencido}
          onChange={(e) => onCambiar("multaPorDiaVencido", Number(e.target.value))}
          required
        />
      </label>
      <label style={{ display: "block", fontWeight: "normal" }}>
        <input
          type="checkbox"
          checked={form.contarSabados}
          onChange={(e) => onCambiar("contarSabados", e.target.checked)}
        />{" "}
        Contar los sábados para el vencimiento y el atraso
      </label>
      <label style={{ display: "block", fontWeight: "normal" }}>
        <input
          type="checkbox"
          checked={form.contarDomingos}
          onChange={(e) => onCambiar("contarDomingos", e.target.checked)}
        />{" "}
        Contar los domingos para el vencimiento y el atraso
      </label>
      <p>
        <small>Si destildás los dos, los préstamos solo cuentan de lunes a viernes.</small>
      </p>
      <button type="submit" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar configuración"}
      </button>
    </form>
  );
}
