import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/context/ToastContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { J2LocalProvider } from '@/context/J2LocalContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RequierePermiso, SinAcceso } from '@/components/RequierePermiso';
import { CargandoCards } from '@/components/Estados';
import { LoginPage } from '@/pages/LoginPage';
import { primeraRutaDisponible, type Permiso } from '@/lib/permisos';
import { ApiError } from '@/lib/api';

// Cada pantalla viaja en su propio chunk: el arranque no carga las doce.
const ResumenPage = lazy(() => import('@/pages/ResumenPage').then((m) => ({ default: m.ResumenPage })));
const ClientesPage = lazy(() => import('@/pages/ClientesPage').then((m) => ({ default: m.ClientesPage })));
const ProspectosPage = lazy(() => import('@/pages/ProspectosPage').then((m) => ({ default: m.ProspectosPage })));
const AgendaPage = lazy(() => import('@/pages/AgendaPage').then((m) => ({ default: m.AgendaPage })));
const CobrosPage = lazy(() => import('@/pages/CobrosPage').then((m) => ({ default: m.CobrosPage })));
const WhatsappPage = lazy(() => import('@/pages/WhatsappPage').then((m) => ({ default: m.WhatsappPage })));
const CargarPage = lazy(() => import('@/pages/CargarPage').then((m) => ({ default: m.CargarPage })));
const MovimientosPage = lazy(() => import('@/pages/MovimientosPage').then((m) => ({ default: m.MovimientosPage })));
const EsperaPage = lazy(() => import('@/pages/EsperaPage').then((m) => ({ default: m.EsperaPage })));
const EgresosPage = lazy(() => import('@/pages/EgresosPage').then((m) => ({ default: m.EgresosPage })));
const FinanzasPage = lazy(() => import('@/pages/FinanzasPage').then((m) => ({ default: m.FinanzasPage })));
const EmpleadosPage = lazy(() => import('@/pages/EmpleadosPage').then((m) => ({ default: m.EmpleadosPage })));
const UsuariosPage = lazy(() => import('@/pages/UsuariosPage').then((m) => ({ default: m.UsuariosPage })));
const InventarioPage = lazy(() => import('@/pages/InventarioPage').then((m) => ({ default: m.InventarioPage })));
const ProveedoresPage = lazy(() => import('@/pages/ProveedoresPage').then((m) => ({ default: m.ProveedoresPage })));

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos de gestión no cambian cada segundo: evita refetches constantes.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (intentos, error) => {
        // No tiene sentido reintentar si falta sesión o permiso.
        if (error instanceof ApiError && (error.esSesion || error.esPermiso)) return false;
        return intentos < 2;
      },
    },
  },
});

/** Envuelve una pantalla con su permiso. */
function P({ permiso, children }: { permiso: Permiso; children: ReactNode }) {
  return <RequierePermiso permiso={permiso}>{children}</RequierePermiso>;
}

function PantallaCarga({ texto }: { texto: string }) {
  return (
    <div className="auth-pantalla">
      <div style={{ textAlign: 'center', color: 'var(--texto-2)' }}>
        <div style={{ fontSize: 34, marginBottom: 'var(--sp-3)' }} aria-hidden="true">
          🌿
        </div>
        <p>{texto}</p>
      </div>
    </div>
  );
}

function Rutas() {
  const { estado, usuario } = useAuth();

  if (estado === 'cargando') return <PantallaCarga texto="Abriendo tu sesión…" />;
  if (estado === 'anonimo') return <LoginPage />;

  const inicio = primeraRutaDisponible(usuario?.permisos ?? []);

  return (
    <J2LocalProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              usuario?.permisos.includes('resumen') ? (
                <P permiso="resumen">
                  <ResumenPage />
                </P>
              ) : (
                <Navigate to={inicio} replace />
              )
            }
          />
          <Route path="clientes" element={<P permiso="clientes"><ClientesPage /></P>} />
          <Route path="prospectos" element={<P permiso="prospectos"><ProspectosPage /></P>} />
          <Route path="agenda" element={<P permiso="agenda"><AgendaPage /></P>} />
          <Route path="whatsapp" element={<P permiso="whatsapp"><WhatsappPage /></P>} />
          <Route path="cargar" element={<P permiso="cargar"><CargarPage /></P>} />
          <Route path="espera" element={<P permiso="espera"><EsperaPage /></P>} />
          <Route path="cobros" element={<P permiso="cobros"><CobrosPage /></P>} />
          <Route path="movimientos" element={<P permiso="movimientos"><MovimientosPage /></P>} />
          <Route path="egresos" element={<P permiso="egresos"><EgresosPage /></P>} />
          <Route path="finanzas" element={<P permiso="finanzas"><FinanzasPage /></P>} />
          <Route path="empleados" element={<P permiso="empleados"><EmpleadosPage /></P>} />
          <Route path="inventario" element={<P permiso="inventario"><InventarioPage /></P>} />
          <Route path="proveedores" element={<P permiso="egresos"><ProveedoresPage /></P>} />
          <Route path="usuarios" element={<P permiso="usuarios"><UsuariosPage /></P>} />
          <Route path="sin-acceso" element={<SinAcceso />} />
          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Route>
      </Routes>
    </J2LocalProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <Suspense fallback={<div className="page"><CargandoCards /></div>}>
                <Rutas />
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
