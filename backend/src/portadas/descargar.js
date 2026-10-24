import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

// Descarga de imágenes desde direcciones externas (portadas): Open Library,
// Google Books o una URL que pegó el staff. Como el servidor hace el pedido
// en nombre de quien escribió la URL, hay que evitar que se use para llegar
// a la red interna (SSRF): solo http/https a puertos estándar, ninguna IP
// privada, de loopback, link-local (169.254.169.254 = metadatos de la nube)
// ni reservada — revisado en CADA salto de redirección y en el momento de
// conectar (no antes), para que un DNS que cambia de respuesta entre el
// chequeo y la conexión no sirva de atajo.

// Dos listas separadas a propósito: en una sola, la regla IPv6 ::ffff:0:0/96
// (IPv4 mapeada) también atrapa toda dirección IPv4 que se consulte.
const BLOQUEADAS_IPV4 = new net.BlockList();
const BLOQUEADAS_IPV6 = new net.BlockList();
for (const [red, prefijo] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  BLOQUEADAS_IPV4.addSubnet(red, prefijo, "ipv4");
}
for (const [red, prefijo] of [
  ["::", 127], // :: y ::1
  ["::ffff:0:0", 96], // IPv4 mapeada: podría esconder 127.0.0.1
  ["64:ff9b::", 96], // NAT64
  ["100::", 64],
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4: puede embeber una IPv4 privada
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  BLOQUEADAS_IPV6.addSubnet(red, prefijo, "ipv6");
}

export function esDireccionPublica(ip) {
  const familia = net.isIP(ip);
  if (!familia) return false;
  return familia === 4 ? !BLOQUEADAS_IPV4.check(ip, "ipv4") : !BLOQUEADAS_IPV6.check(ip, "ipv6");
}

export class ErrorDescarga extends Error {
  constructor(mensaje, codigo, estado = null) {
    super(mensaje);
    this.name = "ErrorDescarga";
    this.codigo = codigo;
    // Estado HTTP de la respuesta remota, si la hubo (ej. 404 = no hay portada).
    this.estado = estado;
  }
}

const MENSAJE_BLOQUEADO = "Esa dirección apunta a una red interna o reservada y no se puede usar.";

function validarUrl(texto, { permitirDireccion, puertosPermitidos }) {
  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new ErrorDescarga("La dirección no es una URL válida.", "URL_INVALIDA");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ErrorDescarga("Solo se aceptan direcciones http:// o https://.", "PROTOCOLO");
  }
  if (url.username || url.password) {
    throw new ErrorDescarga("La dirección no puede llevar usuario ni contraseña.", "CREDENCIALES");
  }
  if (url.port && !puertosPermitidos.includes(url.port)) {
    throw new ErrorDescarga("Solo se aceptan los puertos estándar (80 y 443).", "PUERTO");
  }
  // Una IP escrita directamente no pasa por la búsqueda DNS: se revisa acá.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !permitirDireccion(host)) {
    throw new ErrorDescarga(MENSAJE_BLOQUEADO, "DESTINO_BLOQUEADO");
  }
  return url;
}

// lookup para http.request: resuelve el nombre y rechaza la conexión si
// CUALQUIERA de las direcciones no es pública. Se ejecuta al conectar, en
// cada salto. `resolver` y `permitirDireccion` solo se cambian en tests.
function crearLookup(resolver, permitirDireccion) {
  return (hostname, opciones, callback) => {
    resolver(hostname)
      .then((direcciones) => {
        if (!direcciones.length || direcciones.some((d) => !permitirDireccion(d.address))) {
          return callback(new ErrorDescarga(MENSAJE_BLOQUEADO, "DESTINO_BLOQUEADO"));
        }
        if (opciones?.all) return callback(null, direcciones);
        callback(null, direcciones[0].address, direcciones[0].family);
      })
      .catch(() => callback(new ErrorDescarga("No se encontró el servidor de esa dirección.", "DNS")));
  };
}

const resolverDns = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

function pedir(url, { lookup, deadline, maxBytes }) {
  return new Promise((resolve, reject) => {
    const cliente = url.protocol === "https:" ? https : http;
    const restante = deadline - Date.now();
    const errorTiempo = () => new ErrorDescarga("El servidor de la imagen tardó demasiado.", "TIEMPO");
    if (restante <= 0) return reject(errorTiempo());
    // Tope total, no de inactividad: un servidor que manda la imagen de a
    // poco no puede estirar la descarga más allá del plazo.
    let vencido = false;
    const req = cliente.get(
      url,
      {
        lookup,
        agent: false,
        headers: { "User-Agent": "SIBPSANJUAN/1.0 (catalogo de biblioteca escolar)", Accept: "image/*" },
      },
      (res) => {
        const estado = res.statusCode;
        if (estado >= 300 && estado < 400 && res.headers.location) {
          res.resume();
          return resolve({ redireccion: res.headers.location });
        }
        if (estado !== 200) {
          res.resume();
          return reject(new ErrorDescarga(`La dirección no devolvió una imagen (respuesta ${estado}).`, "ESTADO", estado));
        }
        const tipo = String(res.headers["content-type"] || "").toLowerCase();
        if (!tipo.startsWith("image/")) {
          res.resume();
          return reject(new ErrorDescarga("La dirección no devolvió una imagen.", "NO_ES_IMAGEN"));
        }
        if (Number(res.headers["content-length"]) > maxBytes) {
          res.destroy();
          return reject(new ErrorDescarga(`La imagen pesa más de ${maxBytes / 1024 / 1024} MB.`, "TAMANO"));
        }
        const partes = [];
        let total = 0;
        res.on("data", (parte) => {
          total += parte.length;
          if (total > maxBytes) {
            res.destroy();
            reject(new ErrorDescarga(`La imagen pesa más de ${maxBytes / 1024 / 1024} MB.`, "TAMANO"));
            return;
          }
          partes.push(parte);
        });
        res.on("end", () =>
          resolve({
            buffer: Buffer.concat(partes),
            tipo,
            cacheControl: res.headers["cache-control"] || "",
            expires: res.headers.expires || "",
          })
        );
        res.on("error", () => reject(vencido ? errorTiempo() : new ErrorDescarga("No se pudo descargar la imagen.", "RED")));
      }
    );
    const temporizador = setTimeout(() => {
      vencido = true;
      req.destroy(errorTiempo());
    }, restante);
    req.on("close", () => clearTimeout(temporizador));
    req.on("error", (err) =>
      reject(err instanceof ErrorDescarga ? err : vencido ? errorTiempo() : new ErrorDescarga("No se pudo descargar la imagen.", "RED"))
    );
  });
}

// Devuelve { buffer, tipo, urlFinal, cacheControl, expires }. Límites de
// referencia del prompt maestro: 5 MB y 10 s en total (redirecciones
// incluidas), y como mucho 5 redirecciones.
export async function descargarImagen(
  texto,
  {
    maxBytes = 5 * 1024 * 1024,
    timeoutMs = 10_000,
    maxRedirecciones = 5,
    // Estos tres solo se cambian en tests (servidor local en otro puerto).
    resolver = resolverDns,
    permitirDireccion = esDireccionPublica,
    puertosPermitidos = ["80", "443"],
  } = {}
) {
  const lookup = crearLookup(resolver, permitirDireccion);
  const deadline = Date.now() + timeoutMs;
  const reglas = { permitirDireccion, puertosPermitidos };
  let url = validarUrl(texto, reglas);
  for (let saltos = 0; ; saltos++) {
    const resultado = await pedir(url, { lookup, deadline, maxBytes });
    if (!resultado.redireccion) return { ...resultado, urlFinal: url.href };
    if (saltos >= maxRedirecciones) {
      throw new ErrorDescarga("La dirección redirige demasiadas veces.", "REDIRECCIONES");
    }
    url = validarUrl(new URL(resultado.redireccion, url).href, reglas);
  }
}
