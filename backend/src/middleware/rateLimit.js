import rateLimit from "express-rate-limit";

// Un límite por IP en los dos endpoints de login (staff y OPAC) — antes no
// había ninguno, lo que dejaba la puerta abierta a fuerza bruta/enumeración
// sin fricción (ver CYBER-2 y ARQ-2 en la auditoría). 20 intentos cada 15
// minutos es generoso para uso legítimo (varias personas de una misma
// biblioteca o institución pueden compartir la IP detrás del proxy de
// Render) pero vuelve impráctico adivinar contraseñas a fuerza bruta.
//
// Cada llamada crea una instancia nueva — el store en memoria de
// express-rate-limit es por instancia, así que /api/auth/login y
// /api/opac/:codigo/login necesitan cada uno la suya para no compartir
// contador entre sí.
export function crearLimitadorLogin() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    // Función en vez de número fijo: se evalúa en cada request, no al
    // construir el middleware — esto último pasaría demasiado temprano
    // para que un test pueda cambiar la variable de entorno (los `import`
    // de ES modules se resuelven antes que el resto del código del
    // archivo, así que asignar process.env.LOGIN_RATE_LIMIT en el propio
    // test/integracion.test.js llegaría tarde si esto se leyera una sola
    // vez acá). Configurable solo para que esa suite pueda subirlo: ese
    // archivo comparte una única app — y por lo tanto un único limitador —
    // entre todos sus tests, que en conjunto hacen bastantes más de 20
    // logins legítimos. El valor por defecto en producción sigue siendo
    // 20, sin cambios.
    limit: () => Number(process.env.LOGIN_RATE_LIMIT) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos." },
  });
}
