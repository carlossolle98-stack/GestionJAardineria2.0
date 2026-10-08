import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import type { Cliente } from '@/types';
import { useToast } from '@/context/ToastContext';

type Props = { cliente: Cliente };

export function ClienteHistorial({ cliente }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [fecha, setFecha] = useState(todayISO());
  const [monto, setMonto] = useState('');
  const [horas, setHoras] = useState('');

  const pagos = [...(cliente.pagos || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const total = pagos.reduce((s, p) => s + p.monto, 0);
  const horasTot = pagos.reduce((s, p) => s + (Number(p.horas) || 0), 0);
  const vh = horasTot > 0 ? Math.round(total / horasTot) : 0;

  const addMut = useMutation({
    mutationFn: () =>
      sendJson<Cliente>(`/api/clientes/${cliente._id}/pagos`, 'POST', {
        fecha,
        monto: Number(monto),
        horas: horas ? Number(horas) : 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['resumen'] });
      setMonto('');
      setHoras('');
      setShowForm(false);
      toast('✓ Pago registrado');
    },
    onError: (e: Error) => toast(e.message),
  });

  const delMut = useMutation({
    mutationFn: (pagoId: string) =>
      sendJson(`/api/clientes/${cliente._id}/pagos/${pagoId}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['resumen'] });
      toast('Pago eliminado');
    },
    onError: (e: Error) => toast(e.message),
  });

  const rows = [...pagos].reverse().slice(0, 24);

  return (
    <div style={{ background: '#f8fdf7', padding: '16px 20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="card-valor" style={{ fontSize: 22, color: 'var(--verde-vivo)' }}>
            {money(total)}
          </div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Total cobrado</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="card-valor" style={{ fontSize: 22 }}>
            {horasTot > 0 ? `${horasTot}h` : '—'}
          </div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Horas</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="card-valor" style={{ fontSize: 22 }}>
            {vh > 0 ? `${money(vh)}/h` : '—'}
          </div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Valor hora prom.</div>
        </div>
      </div>

      <table style={{ width: '100%', fontSize: 12, marginBottom: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'rgba(26,46,26,0.06)' }}>
            <th style={{ padding: 8 }}>Fecha</th>
            <th style={{ padding: 8 }}>Monto</th>
            <th style={{ padding: 8, textAlign: 'center' }}>Hs</th>
            <th style={{ padding: 8 }} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: 16, color: '#bbb', textAlign: 'center' }}>
                Sin visitas registradas
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <tr key={p._id}>
                <td style={{ padding: 8 }}>{p.fecha}</td>
                <td style={{ padding: 8, fontFamily: 'DM Mono,monospace', color: '#2e7d32', fontWeight: 600 }}>
                  {money(p.monto)}
                </td>
                <td style={{ padding: 8, textAlign: 'center' }}>{p.horas ? `${p.horas}` : '—'}</td>
                <td style={{ padding: 8 }}>
                  <button
                    type="button"
                    className="btn secundario sm"
                    onClick={() => delMut.mutate(p._id)}
                    style={{ opacity: 0.7 }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <button type="button" className="btn sm" onClick={() => setShowForm((v) => !v)}>
        + Registrar ingreso
      </button>

      {showForm && (
        <div style={{ marginTop: 12, padding: 14, background: '#fff', borderRadius: 10, border: '1px solid rgba(74,140,63,0.2)' }}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
            <div className="form-group">
              <label htmlFor="clientehistorial-fecha-1">Fecha</label>
              <input id="clientehistorial-fecha-1" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="clientehistorial-monto-2">Monto</label>
              <input id="clientehistorial-monto-2" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="45000" />
            </div>
            <div className="form-group">
              <label htmlFor="clientehistorial-horas-3">Horas</label>
              <select id="clientehistorial-horas-3" value={horas} onChange={(e) => setHoras(e.target.value)}>
                <option value="">—</option>
                <option value="0.5">0.5</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="4">4</option>
                <option value="8">8</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            className="btn sm"
            disabled={addMut.isPending}
            onClick={() => {
              if (!monto || Number(monto) <= 0) {
                toast('⚠ Monto inválido');
                return;
              }
              addMut.mutate();
            }}
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  );
}
