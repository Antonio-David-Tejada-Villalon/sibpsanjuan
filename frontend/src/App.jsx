import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import { SocioAuthProvider, useSocioAuth } from "./SocioAuthContext.jsx";
import { rutaPorRol } from "./rutaPorRol.js";
import { obtenerBibliotecaActivaId } from "./bibliotecaActiva.js";
import { useAvisoCargaLenta } from "./useAvisoCargaLenta.js";
import Layout from "./Layout.jsx";
import OpacLayout from "./pages/opac/OpacLayout.jsx";

// Cada página del panel/OPAC en su propio chunk (ver FE-6 en AUDITORIA.md):
// con ~20 pantallas importadas de forma estática, el bundle inicial crecía
// con cada bucket nuevo aunque una biblioteca solo use unos pocos. Layout.jsx
// y OpacLayout.jsx quedan eager arriba porque son el "marco" que se monta
// siempre, no una pantalla puntual.
const Login = lazy(() => import("./pages/Login.jsx"));
const CambiarPassword = lazy(() => import("./pages/CambiarPassword.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Bibliotecarios = lazy(() => import("./pages/Bibliotecarios.jsx"));
const Libros = lazy(() => import("./pages/Libros.jsx"));
const Autores = lazy(() => import("./pages/Autores.jsx"));
const Materias = lazy(() => import("./pages/Materias.jsx"));
const Seriadas = lazy(() => import("./pages/Seriadas.jsx"));
const RecursosElectronicos = lazy(() => import("./pages/RecursosElectronicos.jsx"));
const MaterialSonoro = lazy(() => import("./pages/MaterialSonoro.jsx"));
const MaterialAudiovisual = lazy(() => import("./pages/MaterialAudiovisual.jsx"));
const MaterialCartografico = lazy(() => import("./pages/MaterialCartografico.jsx"));
const MaterialGrafico = lazy(() => import("./pages/MaterialGrafico.jsx"));
const MaterialDidactico = lazy(() => import("./pages/MaterialDidactico.jsx"));
const Archivos = lazy(() => import("./pages/Archivos.jsx"));
const Objetos = lazy(() => import("./pages/Objetos.jsx"));
const Socios = lazy(() => import("./pages/Socios.jsx"));
const Exportar = lazy(() => import("./pages/Exportar.jsx"));
const AdminBibliotecas = lazy(() => import("./pages/AdminBibliotecas.jsx"));
const Circulacion = lazy(() => import("./pages/Circulacion.jsx"));
const Prestamos = lazy(() => import("./pages/Prestamos.jsx"));
const CatalogoPublico = lazy(() => import("./pages/opac/CatalogoPublico.jsx"));
const LoginSocio = lazy(() => import("./pages/opac/LoginSocio.jsx"));
const MisPrestamos = lazy(() => import("./pages/opac/MisPrestamos.jsx"));
const AvisoPrivacidad = lazy(() => import("./pages/opac/AvisoPrivacidad.jsx"));

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
  if (sesion === undefined) return <CargandoInicial />;
  if (sesion === null) return <Navigate to={`/opac/${codigo}/login`} replace />;
  return children;
}

function OpacApp() {
  return (
    <SocioAuthProvider>
      <OpacLayout>
        <Suspense fallback={<CargandoInicial />}>
          <Routes>
            <Route index element={<CatalogoPublico />} />
            <Route path="login" element={<LoginSocio />} />
            <Route path="privacidad" element={<AvisoPrivacidad />} />
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
    </SocioAuthProvider>
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
      <Route
        path="/dashboard"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Dashboard />
          </RutaProtegida>
        }
      />
      <Route
        path="/libros"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Libros />
          </RutaProtegida>
        }
      />
      <Route
        path="/seriadas"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Seriadas />
          </RutaProtegida>
        }
      />
      <Route
        path="/recursos-electronicos"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <RecursosElectronicos />
          </RutaProtegida>
        }
      />
      <Route
        path="/material-sonoro"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <MaterialSonoro />
          </RutaProtegida>
        }
      />
      <Route
        path="/material-audiovisual"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <MaterialAudiovisual />
          </RutaProtegida>
        }
      />
      <Route
        path="/material-cartografico"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <MaterialCartografico />
          </RutaProtegida>
        }
      />
      <Route
        path="/material-grafico"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <MaterialGrafico />
          </RutaProtegida>
        }
      />
      <Route
        path="/material-didactico"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <MaterialDidactico />
          </RutaProtegida>
        }
      />
      <Route
        path="/archivos"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Archivos />
          </RutaProtegida>
        }
      />
      <Route
        path="/objetos"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Objetos />
          </RutaProtegida>
        }
      />
      <Route
        path="/autores"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Autores />
          </RutaProtegida>
        }
      />
      <Route
        path="/materias"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Materias />
          </RutaProtegida>
        }
      />
      <Route
        path="/socios"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Socios />
          </RutaProtegida>
        }
      />
      <Route
        path="/circulacion"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Circulacion />
          </RutaProtegida>
        }
      />
      <Route
        path="/prestamos"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Prestamos />
          </RutaProtegida>
        }
      />
      <Route
        path="/exportar"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF} requiereBibliotecaActiva>
            <Exportar />
          </RutaProtegida>
        }
      />
      <Route
        path="/cambiar-password"
        element={
          <RutaProtegida rolesPermitidos={ROLES_STAFF}>
            <CambiarPassword />
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
      <Rutas />
    </AuthProvider>
  );
}
