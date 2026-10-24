import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

// /sw.js (ver src/service-worker/sw.js) con la lista de lo que se precarga:
// index.html y el JS/CSS del catálogo público (la entrada y las páginas de
// src/pages/opac, con lo que importan). El panel y las tipografías se
// guardan recién cuando se usan: a un alumno con datos móviles no se le
// descarga lo que no va a abrir. La versión cambia cuando cambia algún
// archivo, y eso es lo que hace aparecer "Hay una versión nueva".
function serviceWorker() {
  return {
    name: "service-worker",
    apply: "build",
    enforce: "post",
    generateBundle(_opciones, bundle) {
      const chunks = Object.values(bundle).filter((c) => c.type === "chunk");
      const porNombre = new Map(chunks.map((c) => [c.fileName, c]));
      const archivos = new Set();
      const agregar = (chunk) => {
        if (!chunk || archivos.has(chunk.fileName)) return;
        archivos.add(chunk.fileName);
        for (const css of chunk.viteMetadata?.importedCss ?? []) archivos.add(css);
        for (const importado of chunk.imports) agregar(porNombre.get(importado));
      };
      for (const chunk of chunks) {
        if (chunk.isEntry || /[\\/]pages[\\/]opac[\\/]/.test(chunk.facadeModuleId ?? "")) agregar(chunk);
      }
      // logo-64.png: el del encabezado cuando la institución no cargó el suyo.
      const precarga = ["/index.html", "/logo-64.png", ...[...archivos].sort().map((f) => `/${f}`)];
      const version = createHash("sha256").update(precarga.join("\n")).digest("hex").slice(0, 12);
      let fuente = readFileSync(fileURLToPath(new URL("./src/service-worker/sw.js", import.meta.url)), "utf8");
      for (const [marca, valor] of [
        ['const VERSION = "__VERSION__";', `const VERSION = ${JSON.stringify(version)};`],
        ["const PRECARGA = __PRECARGA__;", `const PRECARGA = ${JSON.stringify(precarga)};`],
      ]) {
        if (!fuente.includes(marca)) this.error(`sw.js: falta "${marca}"`);
        fuente = fuente.replace(marca, () => valor);
      }
      this.emitFile({ type: "asset", fileName: "sw.js", source: fuente });
    },
  };
}

export default defineConfig({
  plugins: [react(), robotsTxt(), serviceWorker()],
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
