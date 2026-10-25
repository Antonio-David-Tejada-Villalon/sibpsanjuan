import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import { SocioAuthProvider, useSocioAuth } from "./SocioAuthContext.jsx";
import { ContenidoOpacProvider } from "./ContenidoOpacContext.jsx";
import { SEGMENTOS } from "./opac.js";
import { rutaPorRol } from "./rutaPorRol.js";
import { obtenerBibliotecaActivaId } from "./bibliotecaActiva.js";
import { useAvisoCargaLenta } from "./useAvisoCargaLenta.js";
import Layout from "./Layout.jsx";
import EstadoConexion from "./EstadoConexion.jsx";
import OpacLayout from "./pages/opac/OpacLayout.jsx";

// Cada página del panel/OPAC en su propio chunk (ver FE-6 en AUDITORIA.md):
// con ~20 pantallas importadas de forma estática, el bundle inicial crecía
// con cada bucket nuevo aunque una biblioteca solo use unos pocos. Layout.jsx
// y OpacLayout.jsx quedan eager arriba porque son el "marco" que se monta
// siempre, no una pantalla puntual.
const Login = lazy(() => import("./pages/Login.jsx"));
const CambiarPassword = lazy(() => import("./pages/CambiarPassword.jsx"));
const Documentacion = lazy(() => import("./pages/Documentacion.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Bibliotecarios = lazy(() => import("./pages/Bibliotecarios.jsx"));
const BuscarCatalogo = lazy(() => import("./pages/BuscarCatalogo.jsx"));
const Catalogar = lazy(() => import("./pages/catalogo/Catalogar.jsx"));
const ImportarLibros = lazy(() => import("./pages/catalogo/Catalogar.jsx").then((m) => ({ default: m.ImportarLibros })));
const FormularioMaterial = lazy(() => import("./pages/catalogo/FormularioMaterial.jsx"));
const FichaMaterialPanel = lazy(() => import("./pages/catalogo/FichaMaterialPanel.jsx"));
const Autores = lazy(() => import("./pages/Autores.jsx"));
const Materias = lazy(() => import("./pages/Materias.jsx"));
const ListaSocios = lazy(() => import("./pages/socios/ListaSocios.jsx"));
const FormularioSocio = lazy(() => import("./pages/socios/FormularioSocio.jsx"));
const FichaSocio = lazy(() => import("./pages/socios/FichaSocio.jsx"));
const Credencial = lazy(() => import("./pages/socios/Credencial.jsx"));
const Prestar = lazy(() => import("./pages/mostrador/Prestar.jsx"));
const Devolver = lazy(() => import("./pages/mostrador/Devolver.jsx"));
const Prestamos = lazy(() => import("./pages/Prestamos.jsx"));
const Notificaciones = lazy(() => import("./pages/Notificaciones.jsx"));
const Exportar = lazy(() => import("./pages/Exportar.jsx"));
const AdminBibliotecas = lazy(() => import("./pages/AdminBibliotecas.jsx"));
const CatalogoPublico = lazy(() => import("./pages/opac/CatalogoPublico.jsx"));
const LoginSocio = lazy(() => import("./pages/opac/LoginSocio.jsx"));
const MisPrestamos = lazy(() => import("./pages/opac/MisPrestamos.jsx"));
const AvisoPrivacidad = lazy(() => import("./pages/opac/AvisoPrivacidad.jsx"));
const PaginaOpac = lazy(() => import("./pages/opac/PaginaOpac.jsx"));
const FichaMaterial = lazy(() => import("./pages/opac/FichaMaterial.jsx"));
const CuentaSocio = lazy(() => import("./pages/opac/CuentaSocio.jsx"));
const ContenidoOpac = lazy(() => import("./pages/ContenidoOpac.jsx"));

// Las direcciones de antes de separar formularios y catálogo (/libros,
// /seriadas…) llevan al catálogo filtrado por ese tipo.
const RUTAS_VIEJAS = {
  "/libros": "Libro",
  "/seriadas": "Seriada",
  "/recursos-electronicos": "RecursoElectronico",
  "/material-sonoro": "MaterialSonoro",
  "/material-audiovisual": "MaterialAudiovisual",
  "/material-cartografico": "MaterialCartografico",
  "/material-grafico": "MaterialGrafico",
  "/material-didactico": "MaterialDidactico",
  "/archivos": "Archivo",
  "/objetos": "Objeto",
};

// Sin este aviso, la demora inicial del free tier (ver useAvisoCargaLenta)
// se lee como "está roto" en vez de "es normal, esperá".
function CargandoInicial() {
  const tardando = useAvisoCargaLenta();

  return (
    <p style={{ padding: "2rem" }} role="status">
      Cargando...
      {tardando && (
        <>
          <br />
          <small>
            Puede tardar unos segundos si el servidor estaba inactivo — es normal, no hace falta recargar.
          </small>
        </>
      )}
    </p>
  );
}

// Roles con panel de biblioteca (catalogación/circulación/socios/export):
// superbibliotecario tiene acceso completo, bibliotecario según sus
// permisos individuales (ver requierePermiso en el backend — el frontend
// solo oculta/gatea la navegación, el 403 real siempre lo decide el
// servidor si alguien fuerza la URL). admin y supervisor también pueden
// entrar acá, pero sobre la biblioteca que elijan en el selector de
// Layout.jsx (ver requiereBibliotecaActiva más abajo) — no tienen una sola
// bibliotecaId fija como los otros dos roles.
const ROLES_STAFF = ["superbibliotecario", "bibliotecario", "admin", "supervisor"];

// Quién gestiona cuentas "bibliotecario" (ver backend/src/utils/jerarquia.js):
// el superbibliotecario de su propia biblioteca, y admin/supervisor dentro
// de su alcance (biblioteca activa del selector). Un bibliotecario nunca
// gestiona a nadie (rango más bajo), por eso queda afuera de esta lista a
// diferencia de ROLES_STAFF.
const ROLES_GESTIONAN_BIBLIOTECARIOS = ["superbibliotecario", "admin", "supervisor"];

function RutaProtegida({ rolesPermitidos, requiereBibliotecaActiva, children }) {
  const { sesion } = useAuth();
  if (sesion === undefined) return <CargandoInicial />;
  if (sesion === null) return <Navigate to="/login" replace />;
  if (rolesPermitidos && !rolesPermitidos.includes(sesion.rol)) {
    return <Navigate to={rutaPorRol(sesion.rol)} replace />;
  }
  if (
    requiereBibliotecaActiva &&
    (sesion.rol === "admin" || sesion.rol === "supervisor") &&
    !obtenerBibliotecaActivaId()
  ) {
    return (
      <Layout>
        <p>Elegí una biblioteca en el selector de arriba para ver este módulo.</p>
      </Layout>
    );
  }
  return <Layout>{children}</Layout>;
}

function RutaProtegidaSocio({ children }) {
  const { codigo, sesion } = useSocioAuth();
  const location = useLocation();
  if (sesion === undefined) return <CargandoInicial />;
  // Después de ingresar vuelve a donde quería ir (ver LoginSocio).
  if (sesion === null) return <Navigate to={`/opac/${codigo}/login?volver=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

// El contenido del CMS (identidad, avisos, páginas) depende del código de
// biblioteca que resuelve SocioAuthProvider desde la URL.
function ConContenidoOpac({ children }) {
  const { codigo } = useSocioAuth();
  return <ContenidoOpacProvider codigo={codigo}>{children}</ContenidoOpacProvider>;
}

function OpacApp() {
  return (
    <SocioAuthProvider>
      <ConContenidoOpac>
        <OpacLayout>
          <Suspense fallback={<CargandoInicial />}>
            <Routes>
              <Route index element={<CatalogoPublico />} />
              <Route path="login" element={<LoginSocio />} />
              <Route path="privacidad" element={<AvisoPrivacidad />} />
              <Route path="pagina/:slug" element={<PaginaOpac />} />
              {/* Ficha de cada material: /opac/<código>/<segmento>/<título>-<id> */}
              {Object.entries(SEGMENTOS).map(([segmento, itemTipo]) => (
                <Route key={segmento} path={`${segmento}/:slugId`} element={<FichaMaterial itemTipo={itemTipo} />} />
              ))}
              <Route
                path="cuenta"
                element={
                  <RutaProtegidaSocio>
                    <CuentaSocio />
                  </RutaProtegidaSocio>
                }
              />
              <Route
                path="mis-prestamos"
                element={
                  <RutaProtegidaSocio>
                    <MisPrestamos />
                  </RutaProtegidaSocio>
                }
              />
            </Routes>
          </Suspense>
        </OpacLayout>
      </ConContenidoOpac>
    </SocioAuthProvider>
  );
}

// Una pantalla del panel de una biblioteca (con su Layout y sesión).
function panel(elemento) {
  return (
    <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
      {elemento}
    </RutaProtegida>
  );
}

function Rutas() {
  const { sesion } = useAuth();
  return (
    <Suspense fallback={<CargandoInicial />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <RutaProtegida rolesPermitidos={["admin", "supervisor"]}>
              <AdminBibliotecas />
            </RutaProtegida>
          }
        />
        <Route path="/dashboard" element={panel(<Dashboard />)} />
        <Route path="/notificaciones" element={panel(<Notificaciones />)} />
        <Route path="/circulacion" element={<Navigate to="/notificaciones" replace />} />

        {/* Socios: la lista y el alta en pestañas, la ficha de cada uno. */}
        <Route path="/socios" element={panel(<ListaSocios />)} />
        <Route path="/socios/nuevo" element={panel(<FormularioSocio />)} />
        <Route path="/socios/:id" element={panel(<FichaSocio />)} />
        <Route path="/socios/:id/editar" element={panel(<FormularioSocio />)} />
        <Route path="/socios/:id/credencial" element={panel(<Credencial />)} />

        {/* Mostrador */}
        <Route path="/prestar" element={panel(<Prestar />)} />
        <Route path="/devolver" element={panel(<Devolver />)} />
        <Route path="/prestamos" element={panel(<Prestamos />)} />

        {/* Catálogo: lo cargado (con su ficha) y, aparte, los formularios. */}
        <Route path="/catalogo" element={panel(<BuscarCatalogo />)} />
        <Route path="/catalogo/:itemTipo/:id" element={panel(<FichaMaterialPanel />)} />
        <Route path="/catalogar" element={panel(<Catalogar />)} />
        <Route path="/catalogar/importar" element={panel(<ImportarLibros />)} />
        <Route path="/catalogar/:segmento" element={panel(<FormularioMaterial />)} />
        <Route path="/catalogar/:segmento/:id" element={panel(<FormularioMaterial />)} />
        {Object.entries(RUTAS_VIEJAS).map(([ruta, itemTipo]) => (
          <Route key={ruta} path={ruta} element={<Navigate to={`/catalogo?tipo=${itemTipo}`} replace />} />
        ))}
        <Route path="/autores" element={panel(<Autores />)} />
        <Route path="/materias" element={panel(<Materias />)} />

        <Route path="/exportar" element={panel(<Exportar />)} />
        <Route path="/contenido" element={panel(<ContenidoOpac />)} />
        <Route
          path="/cambiar-password"
          element={
            <RutaProtegida rolesPermitidos={ROLES_STAFF}>
              <CambiarPassword />
            </RutaProtegida>
          }
        />
        <Route
          path="/documentacion"
          element={
            <RutaProtegida rolesPermitidos={ROLES_STAFF}>
              <Documentacion />
            </RutaProtegida>
          }
        />
        <Route
          path="/bibliotecarios"
          element={
            <RutaProtegida rolesPermitidos={ROLES_GESTIONAN_BIBLIOTECARIOS} requiereBibliotecaActiva>
              <Bibliotecarios />
            </RutaProtegida>
          }
        />
        <Route path="/opac/:codigo/*" element={<OpacApp />} />
        <Route
          path="/"
          element={sesion === undefined ? null : <Navigate to={sesion === null ? "/login" : rutaPorRol(sesion.rol)} replace />}
        />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <EstadoConexion />
      <Rutas />
    </AuthProvider>
  );
}
