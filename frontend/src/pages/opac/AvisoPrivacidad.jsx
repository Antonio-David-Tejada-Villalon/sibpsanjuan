import React from "react";

// Contenido basado en AVISO_PRIVACIDAD_BORRADOR.md (raíz del repo) — ver
// GOB-3 en AUDITORIA.md. Redactado en lenguaje claro, no es asesoría legal:
// si tu biblioteca depende de un organismo con su propio aviso de
// privacidad general, ese texto tiene prioridad sobre este.
export default function AvisoPrivacidad() {
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1>Aviso de privacidad</h1>

      <h2>Qué datos guardamos de vos</h2>
      <p>
        Cuando te asociás, guardamos tu número de socio, apellido y nombre, DNI, dirección, localidad, categoría
        de socio, fecha de nacimiento, teléfono y email — los que hayas dado al momento de asociarte. Si pediste
        acceso a este catálogo en línea, también guardamos una contraseña, protegida de forma que ni el personal
        de la biblioteca puede leerla directamente.
      </p>

      <h2>Para qué los usamos</h2>
      <p>
        Únicamente para gestionar tu membresía y tus préstamos: saber quién sos cuando retirás o devolvés un
        material, avisarte si tenés algo vencido, y calcular una multa si tu biblioteca cobra por atraso. No los
        usamos para ningún otro fin, y no se los vendemos ni compartimos con terceros.
      </p>

      <h2>Quién puede verlos</h2>
      <p>
        El personal de esta biblioteca, según el permiso que tenga asignado. Si tu biblioteca es supervisada por
        otra institución, esa supervisión también puede ver tus datos dentro del alcance que le corresponda.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Mientras seas socio activo. Si dejás de serlo y el personal da de baja tu ficha, tus datos no se borran
        al instante — quedan marcados como inactivos y son recuperables por un tiempo, por si la baja fue un
        error, antes de una limpieza definitiva.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir en cualquier momento: ver qué datos tuyos tenemos guardados, corregir un dato que esté mal, o
        pedir que te demos de baja como socio. Para cualquiera de estas tres cosas, acercate al mostrador de la
        biblioteca.
      </p>

      <p>
        <small>
          Esta es una guía general sobre el manejo de tus datos en esta biblioteca — para consultas puntuales
          sobre los tuyos, hablá directamente con el personal.
        </small>
      </p>
    </div>
  );
}
