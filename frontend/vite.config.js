import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// robots.txt del build, para cuando el frontend se sirve aparte (Vercel). Si
// el backend sirve todo, responde el suyo (backend/src/seo/rutas.js), con
// las mismas reglas. El Sitemap: necesita la dirección absoluta del sitio:
// SITIO_URL, o la de producción que Vercel define al compilar. Las vistas
// previas de Vercel no se indexan.
function robotsTxt() {
  return {
    name: "robots-txt",
    apply: "build",
    generateBundle() {
      const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
      const sitio = (process.env.SITIO_URL || (vercel ? `https://${vercel}` : "")).replace(/\/+$/, "");
      const vistaPrevia = Boolean(process.env.VERCEL_ENV) && process.env.VERCEL_ENV !== "production";
      const lineas = vistaPrevia
        ? ["# Vista previa: no se indexa.", "User-agent: *", "Disallow: /"]
        : [
            "# Se indexa solo el catálogo público (/opac/...). El panel, el ingreso",
            '# y las cuentas de socios responden "X-Robots-Tag: noindex".',
            "User-agent: *",
            "Allow: /",
            ...(sitio ? ["", `Sitemap: ${sitio}/sitemap.xml`] : []),
          ];
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `${lineas.join("\n")}\n` });
    },
  };
}

export default defineConfig({
  plugins: [react(), robotsTxt()],
  server: {
    // host explícito en 127.0.0.1: en algunos entornos Windows, "localhost"
    // resuelve primero a ::1 (IPv6) y curl/navegadores apuntando a
    // 127.0.0.1 se quedan con "connection refused" pese a que Vite dice
    // estar "ready".
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
  },
});
