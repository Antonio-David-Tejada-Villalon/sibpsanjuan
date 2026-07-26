import React from "react";

// tipo="input" (default) mantiene el comportamiento de siempre — ningún uso
// existente pasa `tipo`, así que no cambia. tipo="select"/"textarea" son
// aditivos, para los formularios de los buckets nuevos (subtipo, periodicidad,
// etc.) sin tener que salirse de Campo como hacían Libros.jsx/Socios.jsx.
export default function Campo({ nombre, etiqueta, form, onCambiar, tipo = "input", opciones, ...props }) {
  const valor = form[nombre];
  const onChange = (e) => onCambiar(nombre, e.target.value);

  if (tipo === "select") {
    return (
      <label>
        {etiqueta}
        <select value={valor} onChange={onChange} {...props}>
          {(opciones || []).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (tipo === "textarea") {
    return (
      <label>
        {etiqueta}
        <textarea value={valor} onChange={onChange} {...props} />
      </label>
    );
  }

  return (
    <label>
      {etiqueta}
      <input value={valor} onChange={onChange} {...props} />
    </label>
  );
}
