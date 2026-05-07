import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJson, sendJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import { mensajeWa, copiar } from '@/lib/whatsapp';
import type { ResumenPayload } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useJ2Local } from '@/context/J2LocalContext';

export function CobrosPage() {
  const { toast } = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const j2 = useJ2Local();
  const [openId, setOpenId] = useState<string | null>(null);
  const [cpMonto, setCpMonto] = useState('');
  const [cpFecha, setCpFecha] = useState(todayISO());
  const [cpMedio, setCpMedio] = useState('Mercado Pago');

  const { data, isLoading } = useQuery({
    queryKey: ['resumen'],
    queryFn: () => getJson<ResumenPayload>('/api/resumen'),
  });

  const cobrarMut = useMutation({
    mutationFn: async (p: {
      id: string;
      nombre: string;
      deuda: number;
      monto: number;
      fecha: string;
      medio: string;
    }) => {
      const { id, nombre, deuda, monto, fecha, medio } = p;
      await sendJson(`/api/clientes/${id}/pagos`, 'POST', { fecha, monto, horas: 0 });
      await sendJson(`/api/clientes/${id}`, 'PATCH', { deuda: Math.max(0, deuda - monto) });
      await sendJson('/api/cobros-diarios', 'POST', {
        cliente: nombre,
        monto,
        fecha,
        medio,
        tipo: 'Cobro deuda anterior',
      });
    },
    onSuccess: (_d, vars) => {
      j2.ingresarPorMedio(vars.medio, vars.monto);
      qc.invalidateQueries({ queryKey: ['resumen'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      setOpenId(null);
      toast('✓ Cobro registrado y actualizado en la ficha del cliente');
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;
  if (!data) return null;

  const provSub = data.cuentasPagar.proveedores.map((p) => p.nombre).join(' · ');
  const conDeuda = data.cuentasPorCobrar.clientes;

  function confirmar(c: { _id: string; nombre: string; deuda: number }) {
    const m = parseInt(cpMonto, 10);
    if (!m || m <= 0) {
      toast('⚠ Ingresá un monto válido');
      return;
    }
    if (!cpFecha) {
      toast('⚠ Elegí una fecha');
      return;
    }
    cobrarMut.mutate({
      id: c._id,
      nombre: c.nombre,
      deuda: c.deuda,
      monto: m,
      fecha: cpFecha,
      medio: cpMedio,
    });
  }

  return (
    <>
      <div className="section-header">
        <div className="section-title">Cobros y Deudas</div>
      </div>

      <div className="cards-grid">
        <div className="card rojo">
          <div className="card-label">Total por Cobrar</div>
          <div className="card-valor">{money(data.cuentasPorCobrar.total)}</div>
          <div className="card-sub">
            {conDeuda.length
              ? conDeuda.map((c) => `${c.nombre.split(' ')[0]} ${money(c.deuda)}`).join(' · ')
              : 'Sin deudas pendientes'}
          </div>
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
                <th>Dirección</th>
                <th>Urgencia</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {conDeuda.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>
                    ✓ No hay deudas pendientes de clientes
                  </td>
                </tr>
              ) : (
                conDeuda.map((c) => (
                  <Fragment key={c._id}>
                    <tr className="prioridad-alta">
                      <td>
                        <strong>{c.nombre}</strong>
                      </td>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: 'var(--rojo)' }}>
                        {money(c.deuda)}
                      </td>
                      <td style={{ fontSize: 12, color: '#666' }}>{c.direccion || '—'}</td>
                      <td>
                        <span className="badge urgente">🔴 Urgente</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => {
                              setOpenId((id) => (id === c._id ? null : c._id));
                              setCpMonto(String(c.deuda));
                              setCpFecha(todayISO());
                            }}
                          >
                            ✓ Ya cobré
                          </button>
                          <button
                            type="button"
                            className="btn secundario sm"
                            onClick={() => {
                              void copiar(mensajeWa('cobro', c.nombre.split(' ')[0]), toast);
                              nav('/whatsapp');
                            }}
                          >
                            💬 WA
                          </button>
                        </div>
                      </td>
                    </tr>
                    {openId === c._id && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div
                            style={{
                              background: '#f0fdf0',
                              padding: '14px 20px',
                              borderTop: '1px dashed #a3e6a3',
                            }}
                          >
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                              <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                                <label>Monto cobrado</label>
                                <input
                                  type="number"
                                  value={cpMonto}
                                  onChange={(e) => setCpMonto(e.target.value)}
                                />
                              </div>
                              <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                                <label>Fecha</label>
                                <input type="date" value={cpFecha} onChange={(e) => setCpFecha(e.target.value)} />
                              </div>
                              <div className="form-group" style={{ flex: 1, minWidth: 130 }}>
                                <label>Medio</label>
                                <select value={cpMedio} onChange={(e) => setCpMedio(e.target.value)}>
                                  <option>Mercado Pago</option>
                                  <option>Transferencia bancaria</option>
                                  <option>Efectivo</option>
                                </select>
                              </div>
                              <button
                                type="button"
                                className="btn sm"
                                disabled={cobrarMut.isPending}
                                onClick={() => confirmar(c)}
                              >
                                ✓ Confirmar
                              </button>
                              <button type="button" className="btn secundario sm" onClick={() => setOpenId(null)}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
