import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
