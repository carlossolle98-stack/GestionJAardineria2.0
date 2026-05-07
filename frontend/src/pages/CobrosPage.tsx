import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJson, sendJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import { mensajeWa, copiar } from '@/lib/whatsapp';
import type { ResumenPayload, Cliente } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useJ2Local } from '@/context/J2LocalContext';
import { NOMBRES_CUENTA } from '@/lib/j2local';

export function CobrosPage() {
  const { toast } = useToast();
  const nav = useNavigate();
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

  function registrarDeuda() {
    const m = parseInt(dcMonto, 10);
    if (!dcNombre.trim()) { toast('⚠ Ingresá el nombre del cliente'); return; }
    if (!m || m <= 0) { toast('⚠ Ingresá un monto válido'); return; }
    if (!dcFecha) { toast('⚠ Elegí una fecha'); return; }
    j2.addDeudaCliente({
      nombreCliente: dcNombre.trim(),
      concepto: dcConcepto.trim() || 'Servicio de jardinería',
      monto: m,
      fecha: dcFecha,
    });
    setDcNombre(''); setDcConcepto(''); setDcMonto('');
    toast('✓ Deuda registrada');
  }

  function confirmarPago(id: string) {
    j2.pagarDeudaCliente(id, pagoCuenta);
    setOpenPagoId(null);
    toast(`✓ Cobro registrado → ${NOMBRES_CUENTA[pagoCuenta]}`);
  }

  // ── Backend cobros ───────────────────────────────────────────
  const [openId, setOpenId] = useState<string | null>(null);
  const [cpMonto, setCpMonto] = useState('');
  const [cpFecha, setCpFecha] = useState(todayISO());
  const [cpMedio, setCpMedio] = useState('Mercado Pago');

  const { data: clientesData = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
  });

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

  function confirmarBackend(c: { _id: string; nombre: string; deuda: number }) {
    const m = parseInt(cpMonto, 10);
    if (!m || m <= 0) { toast('⚠ Ingresá un monto válido'); return; }
    if (!cpFecha) { toast('⚠ Elegí una fecha'); return; }
    cobrarMut.mutate({ id: c._id, nombre: c.nombre, deuda: c.deuda, monto: m, fecha: cpFecha, medio: cpMedio });
  }

  const conDeudaBackend = data?.cuentasPorCobrar.clientes ?? [];
  const proveedores = data?.cuentasPagar.proveedores ?? [];

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

      {/* ── Sección backend (clientes formales) ── */}
      {isLoading ? (
        <p style={{ padding: 16, color: '#888' }}>Cargando datos del servidor…</p>
      ) : (
        <>
          <div className="section-title" style={{ marginBottom: 12 }}>👥 Clientes formales con deuda (servidor)</div>
          <div className="tabla-wrap">
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Monto</th>
                    <th>Dirección</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {conDeudaBackend.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>
                        ✓ Sin deudas en el servidor
                      </td>
                    </tr>
                  ) : (
                    conDeudaBackend.map((c) => (
                      <Fragment key={c._id}>
                        <tr className="prioridad-alta">
                          <td><strong>{c.nombre}</strong></td>
                          <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: 'var(--rojo)' }}>{money(c.deuda)}</td>
                          <td style={{ fontSize: 12, color: '#666' }}>{c.direccion || '—'}</td>
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
                                onClick={() => { void copiar(mensajeWa('cobro', c.nombre.split(' ')[0]), toast); nav('/whatsapp'); }}
                              >
                                💬 WA
                              </button>
                            </div>
                          </td>
                        </tr>
                        {openId === c._id && (
                          <tr>
                            <td colSpan={4} style={{ padding: 0 }}>
                              <div style={{ background: '#f0fdf0', padding: '14px 20px', borderTop: '1px dashed #a3e6a3' }}>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                  <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                                    <label>Monto cobrado</label>
                                    <input type="number" value={cpMonto} onChange={(e) => setCpMonto(e.target.value)} />
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
                                  <button type="button" className="btn sm" disabled={cobrarMut.isPending} onClick={() => confirmarBackend(c)}>
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
                  {proveedores.map((p) => (
                    <tr key={p._id}>
                      <td>{p.nombre}</td>
                      <td>{p.factura}</td>
                      <td>{money(p.deudaTotal)}</td>
                      <td style={{ fontWeight: 600, color: p.saldoActual > 0 ? 'var(--rojo)' : undefined }}>{money(p.saldoActual)}</td>
                      <td><span className="badge pendiente">{p.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
