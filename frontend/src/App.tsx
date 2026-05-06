import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/context/ToastContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ResumenPage } from '@/pages/ResumenPage';
import { ClientesPage } from '@/pages/ClientesPage';
import { ProspectosPage } from '@/pages/ProspectosPage';
import { AgendaPage } from '@/pages/AgendaPage';
import { CobrosPage } from '@/pages/CobrosPage';
import { WhatsappPage } from '@/pages/WhatsappPage';
import { CargarPage } from '@/pages/CargarPage';

const qc = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
