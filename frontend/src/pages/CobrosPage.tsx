import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import type { ResumenPayload, Cliente } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useJ2Local } from '@/context/J2LocalContext';
import { NOMBRES_CUENTA } from '@/lib/j2local';

export function CobrosPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const j2 = useJ2Local();

  // ── Deudas locales ──────────────────────────────────────────
  const [dcNombre, setDcNombre] = useState('');
  const [dcConcepto, setDcConcepto] = useState('');
  const [dcMonto, setDcMonto] = useState('');
  const [dcFecha, setDcFecha] = useState(todayISO());
  const [openPagoId, setOpenPagoId] = useState<string | null>(null);
  const [pagoCuenta, setPagoCuenta] = useState<'mp' | 'banco' | 'efectivo'>('mp');
  const [verPagadas, setVerPagadas] = useState(false);

  const pendientes = j2.deudasClientes.filter((d) => d.estado === 'pendiente');
  const pagadas = j2.deudasClientes.filter((d) => d.estado === 'pagado');
  const totalPendiente = pendientes.reduce((s, d) => s + d.monto, 0);

  // Clientes formales (para datalist + sync badge)
  const { data: clientesData = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
  });

  // Proveedores (sección independiente al final)
  const { data, isLoading } = useQuery({
    queryKey: ['resumen'],
    queryFn: () => getJson<ResumenPayload>('/api/resumen'),
  });
  const proveedores = data?.cuentasPagar.proveedores ?? [];

  // Busca cliente formal por nombre (case-insensitive)
  function buscarFormal(nombre: string) {
    return clientesData.find(
      (c) => c.nombre.toLowerCase() === nombre.trim().toLowerCase()
    ) ?? null;
  }

  async function registrarDeuda() {
    const m = parseInt(dcMonto, 10);
    if (!dcNombre.trim()) { toast('⚠ Ingresá el nombre del cliente'); return; }
    if (!m || m <= 0) { toast('⚠ Ingresá un monto válido'); return; }
    if (!dcFecha) { toast('⚠ Elegí una fecha'); return; }

    // Si coincide con cliente formal → actualizar badge en ficha del cliente
    const formal = buscarFormal(dcNombre);
    if (formal) {
      await sendJson(`/api/clientes/${formal._id}`, 'PATCH', {
        deuda: (formal.deuda || 0) + m,
      }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['clientes'] });
    }

    j2.addDeudaCliente({
      nombreCliente: dcNombre.trim(),
      concepto: dcConcepto.trim() || 'Servicio de jardinería',
      monto: m,
      fecha: dcFecha,
    });
    setDcNombre(''); setDcConcepto(''); setDcMonto('');
    toast('✓ Deuda registrada');
  }

  async function confirmarPago(id: string) {
    const deuda = j2.deudasClientes.find((d) => d.id === id);
    j2.pagarDeudaCliente(id, pagoCuenta);
    setOpenPagoId(null);

    // Si coincide con cliente formal → reducir badge en ficha del cliente
    if (deuda) {
      const formal = buscarFormal(deuda.nombreCliente);
      if (formal) {
        await sendJson(`/api/clientes/${formal._id}`, 'PATCH', {
          deuda: Math.max(0, (formal.deuda || 0) - deuda.monto),
        }).catch(() => {});
        qc.invalidateQueries({ queryKey: ['clientes'] });
      }
    }

    toast(`✓ Cobro registrado → ${NOMBRES_CUENTA[pagoCuenta]}`);
  }

  return (
    <>
      {/* ── Sección local ── */}
      <div className="section-header">
        <div className="section-title">💳 Cuentas por Cobrar</div>
      </div>

      <div className="cards-grid">
        <div className="card rojo">
          <div className="card-label">Total Pendiente</div>
          <div className="card-valor">{money(totalPendiente)}</div>
          <div className="card-sub">
            {pendientes.length
              ? pendientes.map((d) => `${d.nombreCliente.split(' ')[0]} ${money(d.monto)}`).join(' · ')
              : 'Sin deudas pendientes'}
          </div>
        </div>
      </div>

      <div className="section-title" style={{ marginBottom: 14 }}>➕ Registrar deuda</div>
      <div className="tabla-wrap" style={{ padding: 20 }}>
        <div className="form-grid">
          <div className="form-group">
            <label>Cliente</label>
            <input
              list="dl-cobros-clientes"
              value={dcNombre}
              onChange={(e) => setDcNombre(e.target.value)}
              placeholder="Nombre del cliente"
              autoComplete="off"
            />
            <datalist id="dl-cobros-clientes">
              {clientesData.map((c) => (
                <option key={c._id} value={c.nombre} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label>Concepto</label>
            <input value={dcConcepto} onChange={(e) => setDcConcepto(e.target.value)} placeholder="Ej: Corte de césped" />
          </div>
          <div className="form-group">
            <label>Monto</label>
            <input type="number" value={dcMonto} onChange={(e) => setDcMonto(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Fecha del servicio</label>
            <input type="date" value={dcFecha} onChange={(e) => setDcFecha(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn" onClick={registrarDeuda}>
          Registrar deuda
        </button>
      </div>

      <div className="section-title" style={{ margin: '20px 0 12px' }}>📋 Deudas pendientes</div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Concepto</th>
                <th>Monto</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>
                    ✓ No hay deudas pendientes
                  </td>
                </tr>
              ) : (
                pendientes.map((d) => (
                  <Fragment key={d.id}>
                    <tr className="prioridad-alta">
                      <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fecha}</td>
                      <td><strong>{d.nombreCliente}</strong></td>
                      <td style={{ fontSize: 13, color: '#555' }}>{d.concepto}</td>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: 'var(--rojo)' }}>
                        {money(d.monto)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => setOpenPagoId((id) => (id === d.id ? null : d.id))}
                          >
                            ✓ Ya cobré
                          </button>
                          <button
                            type="button"
                            style={{ background: 'none', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 6, cursor: 'pointer', color: 'var(--rojo)', padding: '2px 8px' }}
                            onClick={() => { if (confirm(`¿Eliminar deuda de ${d.nombreCliente}?`)) j2.removeDeudaCliente(d.id); }}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                    {openPagoId === d.id && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div style={{ background: '#f0fdf0', padding: '14px 20px', borderTop: '1px dashed #a3e6a3' }}>
                            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>
                              ¿Cómo te pagó {d.nombreCliente}?
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                              <div className="form-group" style={{ minWidth: 160 }}>
                                <label>Medio de pago</label>
                                <select value={pagoCuenta} onChange={(e) => setPagoCuenta(e.target.value as 'mp' | 'banco' | 'efectivo')}>
                                  <option value="mp">Mercado Pago</option>
                                  <option value="banco">Transferencia bancaria</option>
                                  <option value="efectivo">Efectivo</option>
                                </select>
                              </div>
                              <button type="button" className="btn sm" onClick={() => confirmarPago(d.id)}>
                                ✓ Confirmar cobro
                              </button>
                              <button type="button" className="btn secundario sm" onClick={() => setOpenPagoId(null)}>
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

      {/* Historial cobrado */}
      <div style={{ margin: '16px 0 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>✅ Historial cobrado ({pagadas.length})</div>
        <button type="button" className="btn secundario sm" onClick={() => setVerPagadas((v) => !v)}>
          {verPagadas ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      {verPagadas && (
        <div className="tabla-wrap">
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha deuda</th>
                  <th>Cliente</th>
                  <th>Concepto</th>
                  <th>Monto</th>
                  <th>Cobrado</th>
                  <th>Cuenta</th>
                </tr>
              </thead>
              <tbody>
                {pagadas.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#aaa', padding: 16 }}>Sin cobros registrados</td></tr>
                ) : (
                  pagadas.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fecha}</td>
                      <td><strong>{d.nombreCliente}</strong></td>
                      <td style={{ fontSize: 13, color: '#555' }}>{d.concepto}</td>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: '#2e7d32' }}>{money(d.monto)}</td>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fechaPago || '—'}</td>
                      <td>{NOMBRES_CUENTA[d.cuentaCobro || ''] || d.cuentaCobro || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="sep" />

      {/* ── Proveedores ── */}
      {isLoading ? (
        <p style={{ padding: 16, color: '#888' }}>Cargando proveedores…</p>
      ) : (
        <>
          <div className="section-title" style={{ marginBottom: 12 }}>Proveedores</div>
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
                  {proveedores.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#aaa', padding: 16 }}>Sin proveedores con deuda</td></tr>
                  ) : (
                    proveedores.map((p) => (
                      <tr key={p._id}>
                        <td>{p.nombre}</td>
                        <td>{p.factura}</td>
                        <td>{money(p.deudaTotal)}</td>
                        <td style={{ fontWeight: 600, color: p.saldoActual > 0 ? 'var(--rojo)' : undefined }}>{money(p.saldoActual)}</td>
                        <td><span className="badge pendiente">{p.estado}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
