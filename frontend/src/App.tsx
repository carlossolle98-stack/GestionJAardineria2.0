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

const qc = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <J2LocalProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<ResumenPage />} />
                <Route path="clientes" element={<ClientesPage />} />
                <Route path="prospectos" element={<ProspectosPage />} />
                <Route path="agenda" element={<AgendaPage />} />
                <Route path="cobros" element={<CobrosPage />} />
                <Route path="whatsapp" element={<WhatsappPage />} />
                <Route path="cargar" element={<CargarPage />} />
                <Route path="movimientos" element={<MovimientosPage />} />
                <Route path="espera" element={<EsperaPage />} />
                <Route path="egresos" element={<EgresosPage />} />
                <Route path="finanzas" element={<FinanzasPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </J2LocalProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
