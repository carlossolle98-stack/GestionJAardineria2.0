import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import type { Cliente, CobroDiario } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useJ2Local } from '@/context/J2LocalContext';

export function CargarPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const j2 = useJ2Local();
  const fechaHoy = todayISO();

  const { data: cobros = [] } = useQuery({
    queryKey: ['cobros-diarios', fechaHoy],
    queryFn: () => getJson<CobroDiario[]>(`/api/cobros-diarios?fecha=${fechaHoy}`),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
  });

  const [cCliente, setCCliente] = useState('');
  const [cMonto, setCMonto] = useState('');
  const [cHoras, setCHoras] = useState('');
  const [cFecha, setCFecha] = useState(fechaHoy);
  const [cMedio, setCMedio] = useState('Mercado Pago');
  const [cTipo, setCTipo] = useState('Cobro de trabajo');

  const valorHoraPreview = useMemo(() => {
    const m = Number(cMonto);
    const h = Number(cHoras);
    return m > 0 && h > 0 ? Math.round(m / h) : 0;
  }, [cMonto, cHoras]);

  const mut = useMutation({
    mutationFn: async () => {
      const monto = Number(cMonto);
      const horas = Number(cHoras) || 0;

      // 1. Registrar cobro diario (log general)
      const cobro = await sendJson<CobroDiario>('/api/cobros-diarios', 'POST', {
        cliente: cCliente.trim(),
        monto,
        fecha: cFecha,
        medio: cMedio,
        tipo: cTipo,
      });

      // 2. Registrar pago en la ficha del cliente (con horas → actualiza historial)
      const clienteMatch = clientes.find(
        (c) => c.nombre.toLowerCase() === cCliente.trim().toLowerCase()
      );
      if (clienteMatch) {
        await sendJson(`/api/clientes/${clienteMatch._id}/pagos`, 'POST', {
          fecha: cFecha,
          monto,
          horas,
        });
      }

      return cobro;
    },
    onSuccess: () => {
      j2.addIngreso({
        fecha: cFecha,
        cliente: cCliente.trim(),
        concepto: cTipo,
        monto: Number(cMonto),
        medio: cMedio,
      });
      qc.invalidateQueries({ queryKey: ['cobros-diarios'] });
      qc.invalidateQueries({ queryKey: ['resumen'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      setCCliente('');
      setCMonto('');
      setCHoras('');
      toast('✓ Cobro registrado y ficha de cliente actualizada');
    },
    onError: (e: Error) => toast(e.message),
  });

  function registrar() {
    if (!cCliente.trim()) { toast('⚠ Ingresá el nombre del cliente'); return; }
    if (!Number(cMonto) || Number(cMonto) <= 0) { toast('⚠ Ingresá un monto válido'); return; }
    mut.mutate();
  }

  const totalHoy = useMemo(() => cobros.reduce((s, c) => s + c.monto, 0), [cobros]);

  function exportCobros() {
    if (!cobros.length) { toast('⚠ Sin cobros hoy'); return; }
    const body =
      'Fecha\tCuenta\tDetalle\tIngresos\tEgresos\tSaldo\tMedio\n' +
      cobros.map((c) => `${c.fecha}\t${c.tipo}\t${c.cliente}\t\t${c.monto}\t\t${c.medio}`).join('\n');
    void navigator.clipboard.writeText(body);
    toast('✓ Copiado');
  }

  function exportClientes() {
    const lines = clientes.map((c) => {
      const st = c.deuda > 0 ? `${money(c.deuda)} ADEUDA` : 'Al día';
      return `${c.nombre} - ${c.direccion} - ${st}`;
    });
    void navigator.clipboard.writeText(`CLIENTES\n${'─'.repeat(40)}\n${lines.join('\n')}`);
    toast('✓ Copiado');
  }

  return (
    <>
      <div className="section-header">
        <div className="section-title">Cargar información</div>
      </div>

      <div className="alerta ok">
        <div>✅</div>
        <div>
          <strong>Carga diaria:</strong> cobros · visitados · gastos · agenda · mensajes
        </div>
      </div>

      <div className="section-title" style={{ margin: '20px 0 12px' }}>
        Registrar cobro
      </div>
      <div className="tabla-wrap" style={{ padding: 20 }}>
        <div className="form-grid">
          <div className="form-group">
            <label>Cliente</label>
            <input value={cCliente} onChange={(e) => setCCliente(e.target.value)} list="dl-clientes" placeholder="Nombre del cliente" />
            <datalist id="dl-clientes">
              {clientes.map((c) => (
                <option key={c._id} value={c.nombre} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label>Monto cobrado</label>
            <input type="number" value={cMonto} onChange={(e) => setCMonto(e.target.value)} placeholder="Ej: 45000" />
          </div>
          <div className="form-group">
            <label>Horas trabajadas</label>
            <select value={cHoras} onChange={(e) => setCHoras(e.target.value)}>
              <option value="">— sin cargar —</option>
              <option value="0.5">0.5 h</option>
              <option value="1">1 h</option>
              <option value="1.5">1.5 h</option>
              <option value="2">2 h</option>
              <option value="3">3 h</option>
              <option value="4">4 h</option>
              <option value="6">6 h</option>
              <option value="8">8 h</option>
            </select>
          </div>
          <div className="form-group">
            <label>Fecha</label>
            <input type="date" value={cFecha} onChange={(e) => setCFecha(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Medio de pago</label>
            <select value={cMedio} onChange={(e) => setCMedio(e.target.value)}>
              <option>Mercado Pago</option>
              <option>Transferencia bancaria</option>
              <option>Efectivo</option>
            </select>
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <select value={cTipo} onChange={(e) => setCTipo(e.target.value)}>
              <option>Cobro de trabajo</option>
              <option>Venta vivero</option>
              <option>Cobro deuda anterior</option>
            </select>
          </div>
        </div>

        {valorHoraPreview > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(46,125,50,0.08)', border: '1px solid rgba(46,125,50,0.2)',
            borderRadius: 8, padding: '6px 14px', marginBottom: 14, fontSize: 14,
          }}>
            <span style={{ color: '#555' }}>Valor hora:</span>
            <strong style={{ color: '#2e7d32', fontFamily: 'DM Mono,monospace' }}>
              {money(valorHoraPreview)}/h
            </strong>
          </div>
        )}

        <div style={{ display: 'block' }}>
          <button type="button" className="btn" onClick={registrar} disabled={mut.isPending}>
            {mut.isPending ? '…' : 'Registrar cobro'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>
          Cargado hoy — Total: {money(totalHoy)}
        </div>
        {cobros.length === 0 ? (
          <div className="empty-state">📝 Nada cargado hoy</div>
        ) : (
          <div className="tabla-wrap">
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Monto</th>
                    <th>Fecha</th>
                    <th>Medio</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {cobros.map((c) => (
                    <tr key={c._id}>
                      <td><strong>{c.cliente}</strong></td>
                      <td style={{ color: '#2e7d32', fontWeight: 600, fontFamily: 'DM Mono,monospace' }}>
                        +{money(c.monto)}
                      </td>
                      <td>{c.fecha}</td>
                      <td>{c.medio}</td>
                      <td>{c.tipo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="sep" />
      <div className="section-title" style={{ marginBottom: 12 }}>Exportar</div>
      <div className="tabla-wrap" style={{ padding: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn secundario" onClick={exportCobros}>
          Cobros del día (TSV)
        </button>
        <button type="button" className="btn secundario" onClick={exportClientes}>
          Lista clientes
        </button>
      </div>
    </>
  );
}
