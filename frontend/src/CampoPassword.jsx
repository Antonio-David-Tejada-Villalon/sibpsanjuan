import React, { useId, useState } from "react";

// Envoltorio de <input type="password"> con un botón "ojito" para revisar
// que se tipeó bien antes de guardar — mismo mecanismo en los diez campos
// de contraseña del sistema (login de staff y de socio, alta de cuentas,
// reseteo de contraseña ajena, cambio de la propia, credenciales de OPAC de
// un socio) en vez de repetir el toggle en cada uno. Mismo esqueleto que
// Campo.jsx (dueño de su propio <label>, prop "etiqueta"), pero con
// label/htmlFor explícito en vez del <label> que envuelve al input — acá
// hace falta, a diferencia de Campo.jsx, porque el botón es un segundo
// elemento "labelable" (un <button> también lo es, igual que <input>): dos
// controles adentro de un mismo <label> implícito confunde tanto a
// "getByLabelText" en los tests como, en teoría, a un lector de pantalla, ya
// que el nombre accesible del botón ("Mostrar contraseña") también contiene
// la palabra "contraseña" de la etiqueta del campo.
//
// "etiqueta" es opcional: ResetearPassword.jsx es un formulario inline
// compacto sin espacio para una etiqueta visible arriba del campo — ahí el
// nombre accesible se pasa como aria-label directo (queda en ...resto,
// spreadeado sobre el input) en vez de esta etiqueta.
export default function CampoPassword({ etiqueta, value, onChange, ...resto }) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div className="campo-password">
      {etiqueta && <label htmlFor={id}>{etiqueta}</label>}
      <div className="campo-password__caja">
        <input id={id} type={visible ? "text" : "password"} value={value} onChange={onChange} {...resto} />
        <button
          type="button"
          className="campo-password__boton"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
        >
          <span aria-hidden="true">{visible ? "🙈" : "👁️"}</span>
        </button>
      </div>
    </div>
  );
}
