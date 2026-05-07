import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJson, sendJson } from '@/lib/api';
import { money } from '@/lib/format';
import { mensajeWa, copiar } from '@/lib/whatsapp';
import type { Cliente } from '@/types';
import { ClienteHistorial } from '@/components/clientes/ClienteHistorial';
import { useToast } from '@/context/ToastContext';

export function ClientesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nNombre, setNNombre] = useState('');
  const [nDir, setNDir] = useState('');
  const [nPago, setNPago] = useState('Transferencia');

  const { data = [], isLoading } = useQuery({
    queryKey: ['clientes', q],
    queryFn: () => getJson<Cliente[]>(`/api/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });

  const addCliente = useMutation({
    mutationFn: () =>
      sendJson<Cliente>('/api/clientes', 'POST', {
        nombre: nNombre.trim(),
        direccion: nDir.trim() || 'dato pendiente',
        formaPago: nPago,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      setNNombre('');
      setNDir('');
      setShowNew(false);
      toast('✓ Cliente agregado');
    },
    onError: (e: Error) => toast(e.message),
  });

  const delCliente = useMutation({
    mutationFn: (id: string) => sendJson(`/api/clientes/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast('Cliente eliminado');
    },
    onError: (e: Error) => toast(e.message),
  });

  const limpiarDeuda = useMutation({
    mutationFn: (id: string) => sendJson(`/api/clientes/${id}`, 'PATCH', { deuda: 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast('✓ Deuda del cliente limpiada');
    },
    onError: (e: Error) => toast(e.message),
  });

  const lista = useMemo(() => data, [data]);

  function waCobro(nombre: string) {
    const txt = mensajeWa('cobro', nombre.split(' ')[0]);
    void copiar(txt, toast);
    nav('/whatsapp');
  }

  function waTurno(nombre: string) {
    const txt = mensajeWa('turno', nombre.split(' ')[0]);
    void copiar(txt, toast);
    nav('/whatsapp');
  }

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Clientes Fijos <small>Hacé clic en un cliente para ver historial</small>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="🔍 Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              border: '1px solid rgba(26,46,26,0.18)',
              borderRadius: 8,
              padding: '8px 12px',
              width: 200,
              fontFamily: 'inherit',
            }}
          />
          <button type="button" className="btn" onClick={() => setShowNew((v) => !v)}>
            + Nuevo cliente
          </button>
        </div>
      </div>

      {showNew && (
        <div className="tabla-wrap" style={{ padding: 20, marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 14, fontSize: 16 }}>
            Agregar cliente
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Nombre</label>
              <input value={nNombre} onChange={(e) => setNNombre(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Dirección</label>
              <input value={nDir} onChange={(e) => setNDir(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Forma de pago</label>
              <select value={nPago} onChange={(e) => setNPago(e.target.value)}>
                <option>Transferencia</option>
                <option>Contado</option>
                <option>Transf / Contado</option>
                <option>Mercado Pago</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn" onClick={() => addCliente.mutate()} disabled={addCliente.isPending}>
              Guardar
            </button>
            <button type="button" className="btn secundario" onClick={() => setShowNew(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>#</th>
                <th>Nombre</th>
                <th>Dirección</th>
                <th>Pago</th>
                <th>Pagado acum.</th>
                <th>Último pago</th>
                <th>Estado</th>
                <th>Acción</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const pagos = c.pagos || [];
                const tot = pagos.reduce((s, p) => s + p.monto, 0);
                const ult = pagos.length ? pagos[pagos.length - 1] : null;
                const abierto = openId === c._id;
                return (
                  <Fragment key={c._id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setOpenId(abierto ? null : c._id)}
                    >
                      <td>{abierto ? '▼' : '▶'}</td>
                      <td style={{ color: '#aaa' }}>{c.num}</td>
                      <td>
                        <strong>{c.nombre}</strong>
                      </td>
                      <td style={{ fontSize: 12, color: '#666' }}>{c.direccion}</td>
                      <td>
                        <span className="badge info" style={{ fontSize: 11 }}>
                          {c.formaPago}
                        </span>
                      </td>
                      <td>
                        {tot > 0 ? (
                          <>
                            <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: '#2e7d32' }}>
                              {money(tot)}
                            </span>
                            <div style={{ fontSize: 10, color: '#aaa' }}>({pagos.length} pagos)</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {ult ? (
                          <>
                            {ult.fecha}
                            <br />
                            <span style={{ fontFamily: 'DM Mono,monospace', color: '#2e7d32' }}>{money(ult.monto)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {c.deuda > 0 ? (
                          <span className="badge urgente">{money(c.deuda)} adeuda</span>
                        ) : tot > 0 ? (
                          <span className="badge ok">Al día</span>
                        ) : (
                          <span className="badge pendiente">Sin registros</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.deuda > 0 ? (
                            <>
                              <button type="button" className="btn sm" onClick={() => waCobro(c.nombre)}>
                                💬 Cobrar
                              </button>
                              <button
                                type="button"
                                className="btn secundario sm"
                                style={{ fontSize: 11 }}
                                onClick={() => {
                                  if (confirm(`¿Limpiar deuda de ${c.nombre}? (queda en $0)`))
                                    limpiarDeuda.mutate(c._id);
                                }}
                              >
                                🗑 Deuda
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn secundario sm" onClick={() => waTurno(c.nombre)}>
                              📅 Turno
                            </button>
                          )}
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn secundario sm"
                          style={{ color: 'var(--rojo)', border: '1px solid rgba(192,57,43,0.3)' }}
                          onClick={() => {
                            if (confirm(`¿Eliminar a ${c.nombre}?`)) delCliente.mutate(c._id);
                          }}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                    {abierto && (
                      <tr key={`${c._id}-h`}>
                        <td colSpan={10} style={{ padding: 0 }}>
                          <ClienteHistorial cliente={c} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#888', textAlign: 'right', marginTop: 8 }}>
        Total: {lista.length} clientes
      </p>
    </>
  );
}
