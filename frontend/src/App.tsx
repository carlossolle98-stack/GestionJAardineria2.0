import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/context/ToastContext';
import { J2LocalProvider } from '@/context/J2LocalContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PinGate } from '@/components/PinGate';
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

// Rutas solo para el sitio admin (modo build VITE_APP_ROLE=empleado las bloquea)
// En el sitio principal se protegen con PinGate en runtime
const A = esAdmin;

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <J2LocalProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                {/* Rutas libres */}
                <Route path="clientes"   element={<ClientesPage />} />
                <Route path="prospectos" element={<ProspectosPage />} />
                <Route path="agenda"     element={<AgendaPage />} />
                <Route path="whatsapp"   element={<WhatsappPage />} />
                <Route path="cargar"     element={<CargarPage />} />
                <Route path="espera"     element={<EsperaPage />} />

                {/* Rutas privadas — PinGate en sitio principal, redirect en sitio equipo */}
                <Route index element={A
                  ? <PinGate><ResumenPage /></PinGate>
                  : <Navigate to="/agenda" replace />}
                />
                <Route path="cobros" element={A
                  ? <PinGate><CobrosPage /></PinGate>
                  : <Navigate to="/agenda" replace />}
                />
                <Route path="movimientos" element={A
                  ? <PinGate><MovimientosPage /></PinGate>
                  : <Navigate to="/agenda" replace />}
                />
                <Route path="egresos" element={A
                  ? <PinGate><EgresosPage /></PinGate>
                  : <Navigate to="/agenda" replace />}
                />
                <Route path="finanzas" element={A
                  ? <PinGate><FinanzasPage /></PinGate>
                  : <Navigate to="/agenda" replace />}
                />
                <Route path="empleados" element={A
                  ? <PinGate><EmpleadosPage /></PinGate>
                  : <Navigate to="/agenda" replace />}
                />

                <Route path="*" element={<Navigate to={A ? '/' : '/agenda'} replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </J2LocalProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
