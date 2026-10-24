import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import "./tema.js";
import "./preferencias.js";
import { escucharInstalacion, registrarServiceWorker } from "./pwa.js";
import "./sistema-diseno/tokens.css";
import "./estilos.css";

// En desarrollo no: Vite sirve los archivos sin hash y el service worker
// guardaría versiones viejas.
if (import.meta.env.PROD) registrarServiceWorker();
escucharInstalacion();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
