import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/context/ToastContext';
import { J2LocalProvider } from '@/context/J2LocalContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ResumenPage } from '@/pages/ResumenPage';
import { ClientesPage } from '@/pages/ClientesPage';
import { ProspectosPage } from '@/pages/ProspectosPage';
import { AgendaPage } from '@/pages/AgendaPage';
import { CobrosPage } from '@/pages/CobrosPage';
import { WhatsappPage } from '@/pages/WhatsappPage';
import { CargarPage } from '@/pages/CargarPage';
import { MovimientosPage } from '@/pages/MovimientosPage';
import { EsperaPage } from '@/pages/EsperaPage';
import { EgresosPage } from '@/pages/EgresosPage';
import { FinanzasPage } from '@/pages/FinanzasPage';
import { EmpleadosPage } from '@/pages/EmpleadosPage';
import { esAdmin } from '@/lib/role';

const qc = new QueryClient();

// Ruta protegida: si no es admin, redirige a /agenda
const A = esAdmin;

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <J2LocalProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={A ? <ResumenPage /> : <Navigate to="/agenda" replace />} />
                <Route path="clientes"    element={<ClientesPage />} />
                <Route path="prospectos"  element={<ProspectosPage />} />
                <Route path="agenda"      element={<AgendaPage />} />
                <Route path="cobros"      element={A ? <CobrosPage />      : <Navigate to="/agenda" replace />} />
                <Route path="whatsapp"    element={<WhatsappPage />} />
                <Route path="cargar"      element={<CargarPage />} />
                <Route path="movimientos" element={A ? <MovimientosPage /> : <Navigate to="/agenda" replace />} />
                <Route path="espera"      element={<EsperaPage />} />
                <Route path="egresos"     element={A ? <EgresosPage />     : <Navigate to="/agenda" replace />} />
                <Route path="finanzas"    element={A ? <FinanzasPage />    : <Navigate to="/agenda" replace />} />
                <Route path="empleados"   element={A ? <EmpleadosPage />   : <Navigate to="/agenda" replace />} />
                <Route path="*"           element={<Navigate to={A ? '/' : '/agenda'} replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </J2LocalProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
