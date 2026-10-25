import { useEffect, useState } from "react";

// Cada tipo de material tiene su segmento en la URL de la ficha
// (/opac/<código>/<segmento>/<título>-<id>). Mismo listado que TIPOS en
// backend/src/opac/catalogo.js.
export const SEGMENTOS = {
  libro: "Libro",
  "publicacion-seriada": "Seriada",
  "recurso-electronico": "RecursoElectronico",
  "material-sonoro": "MaterialSonoro",
  "material-audiovisual": "MaterialAudiovisual",
  "material-cartografico": "MaterialCartografico",
  "material-grafico": "MaterialGrafico",
  "material-didactico": "MaterialDidactico",
  archivo: "Archivo",
  objeto: "Objeto",
};

export function urlFicha(codigo, material) {
  return `/opac/${codigo}/${material.segmento}/${material.slug}-${material.id}`;
}

// El id va al final, después del título: si el título cambia, los enlaces
// viejos siguen funcionando (y se redirigen a la dirección nueva).
export function idDeDireccion(slugId) {
  const coincidencia = /([0-9a-f]{24})$/.exec(slugId || "");
  return coincidencia ? coincidencia[1] : null;
}

// Sin conexión, las acciones que necesitan el servidor (pedir, renovar) se
// deshabilitan y se explica por qué, en vez de fallar al tocarlas.
export function useEnLinea() {
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const conectado = () => setEnLinea(true);
    const desconectado = () => setEnLinea(false);
    window.addEventListener("online", conectado);
    window.addEventListener("offline", desconectado);
    return () => {
      window.removeEventListener("online", conectado);
      window.removeEventListener("offline", desconectado);
    };
  }, []);
  return enLinea;
}

export const SIN_CONEXION = "Sin conexión: para hacer pedidos hace falta internet.";

// Texto de disponibilidad, igual en la tarjeta y en la ficha. Acceso
// digital y ejemplares físicos no se excluyen: un libro puede tener ambos.
export function textoDisponibilidad(material) {
  if (material.soloLectura) return "Se consulta en la biblioteca";
  const partes = [];
  if (material.urlAcceso) partes.push("Acceso digital");
  if (material.circula) {
    partes.push(
      material.disponibles > 0
        ? `${material.disponibles} ${material.disponibles === 1 ? "ejemplar disponible" : "ejemplares disponibles"}`
        : material.prestables > 0
          ? "Sin ejemplares libres: se puede reservar"
          : material.total > 0
            ? "No se presta: se consulta en la biblioteca"
            : "Sin ejemplares para préstamo"
    );
  }
  return partes.join(" · ") || "Sin ejemplares para préstamo";
}
