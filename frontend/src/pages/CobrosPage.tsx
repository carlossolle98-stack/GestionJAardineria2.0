import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJson } from '@/lib/api';
import { money } from '@/lib/format';
import { mensajeWa, copiar } from '@/lib/whatsapp';
import type { ResumenPayload } from '@/types';
import { useToast } from '@/context/ToastContext';

export function CobrosPage() {
  const { toast } = useToast();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['resumen'],
    queryFn: () => getJson<ResumenPayload>('/api/resumen'),
  });

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;
  if (!data) return null;

  const provSub = data.cuentasPagar.proveedores.map((p) => p.nombre).join(' · ');

  return (
    <>
      <div className="section-header">
        <div className="section-title">Cobros y Deudas</div>
      </div>

      <div className="cards-grid">
        <div className="card rojo">
          <div className="card-label">Total por Cobrar</div>
          <div className="card-valor">{money(data.cuentasPorCobrar.total)}</div>
          <div className="card-sub">{data.cuentasPorCobrar.clientes.length} clientes con saldo</div>
        </div>
        <div className="card tierra">
          <div className="card-label">Cuentas a Pagar</div>
          <div className="card-valor">{money(data.cuentasPagar.total)}</div>
          <div className="card-sub">{provSub}</div>
        </div>
      </div>

      <div className="section-title" style={{ marginBottom: 12 }}>
        Saldos clientes
      </div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Monto</th>
                <th>Urgencia</th>
                <th>WA</th>
              </tr>
            </thead>
            <tbody>
              {data.cuentasPorCobrar.clientes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-state">
                    Sin deudas
                  </td>
                </tr>
              ) : (
                data.cuentasPorCobrar.clientes.map((c) => (
                  <tr key={c.nombre} className="prioridad-alta">
                    <td>
                      <strong>{c.nombre}</strong>
                    </td>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: 'var(--rojo)' }}>
                      {money(c.deuda)}
                    </td>
                    <td>
                      <span className="badge urgente">🔴 Urgente</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => {
                          void copiar(mensajeWa('cobro', c.nombre.split(' ')[0]), toast);
                          nav('/whatsapp');
                        }}
                      >
                        💬 Mensaje
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sep" />
      <div className="section-title" style={{ marginBottom: 12 }}>
        Proveedores
      </div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Factura</th>
                <th>Deuda total</th>
                <th>Saldo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.cuentasPagar.proveedores.map((p) => (
                <tr key={p._id}>
                  <td>{p.nombre}</td>
                  <td>{p.factura}</td>
                  <td>{money(p.deudaTotal)}</td>
                  <td style={{ fontWeight: 600, color: p.saldoActual > 0 ? 'var(--rojo)' : undefined }}>
                    {money(p.saldoActual)}
                  </td>
                  <td>
                    <span className="badge pendiente">{p.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
