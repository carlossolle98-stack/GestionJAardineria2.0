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
  const [cDetalle, setCDetalle] = useState('');
  const [cCombinado, setCCombinado] = useState(false);
  const [cMonto2, setCMonto2] = useState('');
  const [cMedio2, setCMedio2] = useState('Efectivo');

  const esVenta = cTipo === 'Venta vivero' || cTipo === 'Venta producto digital';
  const montoTotal = cCombinado
    ? (Number(cMonto) || 0) + (Number(cMonto2) || 0)
    : Number(cMonto) || 0;

  const valorHoraPreview = useMemo(() => {
    const m = montoTotal;
    const h = Number(cHoras);
    return m > 0 && h > 0 ? Math.round(m / h) : 0;
  }, [montoTotal, cHoras]);

  const mut = useMutation({
    mutationFn: async () => {
      const monto1 = Number(cMonto);
      const monto2 = cCombinado ? Number(cMonto2) : 0;
      const horas = Number(cHoras) || 0;
      const tipoFinal = esVenta && cDetalle.trim() ? `${cTipo} — ${cDetalle.trim()}` : cTipo;

      // 1. Registrar cobro(s) diario(s)
      const cobro = await sendJson<CobroDiario>('/api/cobros-diarios', 'POST', {
        cliente: cCliente.trim(),
        monto: monto1,
        fecha: cFecha,
        medio: cMedio,
        tipo: tipoFinal,
      });
      if (cCombinado && monto2 > 0) {
        await sendJson('/api/cobros-diarios', 'POST', {
          cliente: cCliente.trim(),
          monto: monto2,
          fecha: cFecha,
          medio: cMedio2,
          tipo: tipoFinal,
        });
      }

      // 2. Registrar pago en ficha del cliente (total combinado)
      const clienteMatch = clientes.find(
        (c) => c.nombre.toLowerCase() === cCliente.trim().toLowerCase()
      );
      if (clienteMatch) {
        await sendJson(`/api/clientes/${clienteMatch._id}/pagos`, 'POST', {
          fecha: cFecha,
          monto: monto1 + monto2,
          horas,
          medio: cCombinado ? `${cMedio} + ${cMedio2}` : cMedio,
        });
      }

      return cobro;
    },
    onSuccess: () => {
      const conceptoFinal = esVenta && cDetalle.trim()
        ? `${cTipo} — ${cDetalle.trim()}`
        : cTipo;
      // Registrar uno o dos ingresos en j2 según la cuenta
      j2.addIngreso({
        fecha: cFecha,
        cliente: cCliente.trim(),
        concepto: conceptoFinal,
        monto: Number(cMonto),
        medio: cMedio,
      });
      if (cCombinado && Number(cMonto2) > 0) {
        j2.addIngreso({
          fecha: cFecha,
          cliente: cCliente.trim(),
          concepto: conceptoFinal,
          monto: Number(cMonto2),
          medio: cMedio2,
        });
      }
      qc.invalidateQueries({ queryKey: ['cobros-diarios'] });
      qc.invalidateQueries({ queryKey: ['resumen'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      setCCliente('');
      setCMonto('');
      setCMonto2('');
      setCHoras('');
      setCDetalle('');
      toast(cCombinado ? '✓ Cobro combinado registrado' : '✓ Cobro registrado');
    },
    onError: (e: Error) => toast(e.message),
  });

  function registrar() {
    if (!cCliente.trim()) { toast('⚠ Ingresá el nombre del cliente'); return; }
    if (!Number(cMonto) || Number(cMonto) <= 0) { toast('⚠ Ingresá un monto válido'); return; }
    if (cCombinado && (!Number(cMonto2) || Number(cMonto2) <= 0)) {
      toast('⚠ Ingresá el segundo monto'); return;
    }
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
            <label htmlFor="cargar-cliente-1">Cliente</label>
            <input id="cargar-cliente-1" value={cCliente} onChange={(e) => setCCliente(e.target.value)} list="dl-clientes" placeholder="Nombre del cliente" />
            <datalist id="dl-clientes">
              <option value="Varios / Consumidor Final" />
              {clientes.map((c) => (
                <option key={c._id} value={c.nombre} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label htmlFor="cargar-monto-cobrado-2">Monto cobrado</label>
            <input id="cargar-monto-cobrado-2" type="number" value={cMonto} onChange={(e) => setCMonto(e.target.value)} placeholder="Ej: 45000" />
          </div>
          <div className="form-group">
            <label>Horas trabajadas</label>
            <input
              type="number"
              step="any"
              min="0"
              value={cHoras}
              onChange={(e) => setCHoras(e.target.value)}
              placeholder="Ej: 1.5 o 3.5"
            />
          </div>
          <div className="form-group">
            <label htmlFor="cargar-fecha-3">Fecha</label>
            <input id="cargar-fecha-3" type="date" value={cFecha} onChange={(e) => setCFecha(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="cargar-medio-de-pago-4">{cCombinado ? 'Medio 1' : 'Medio de pago'}</label>
            <select id="cargar-medio-de-pago-4" value={cMedio} onChange={(e) => setCMedio(e.target.value)}>
              <option>Mercado Pago</option>
              <option>Transferencia bancaria</option>
              <option>Efectivo</option>
            </select>
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <select
              value={cTipo}
              onChange={(e) => { setCTipo(e.target.value); setCDetalle(''); }}
            >
              <option>Cobro de trabajo</option>
              <option>Venta vivero</option>
              <option>Venta producto digital</option>
              <option>Cobro deuda anterior</option>
            </select>
          </div>
          {esVenta && (
            <div className="form-group">
              <label>¿Qué vendiste?</label>
              <input
                value={cDetalle}
                onChange={(e) => setCDetalle(e.target.value)}
                placeholder={cTipo === 'Venta vivero' ? 'Ej: Rosales, Sustrato, Fertilizante…' : 'Ej: Guía de poda en PDF, Curso online…'}
              />
            </div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0', cursor: 'pointer', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={cCombinado}
            onChange={(e) => { setCCombinado(e.target.checked); if (!e.target.checked) { setCMonto2(''); } }}
          />
          Pago combinado (dos medios)
        </label>

        {cCombinado && (
          <div className="form-grid" style={{ marginBottom: 8 }}>
            <div className="form-group">
              <label>Monto 2</label>
              <input
                type="number"
                value={cMonto2}
                onChange={(e) => setCMonto2(e.target.value)}
                placeholder="Ej: 20000"
              />
            </div>
            <div className="form-group">
              <label>Medio 2</label>
              <select value={cMedio2} onChange={(e) => setCMedio2(e.target.value)}>
                <option>Mercado Pago</option>
                <option>Transferencia bancaria</option>
                <option>Efectivo</option>
              </select>
            </div>
          </div>
        )}

        {cCombinado && montoTotal > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(46,125,50,0.08)', border: '1px solid rgba(46,125,50,0.2)',
            borderRadius: 8, padding: '6px 14px', marginBottom: 8, fontSize: 14,
          }}>
            <span style={{ color: '#555' }}>Total:</span>
            <strong style={{ color: '#2e7d32', fontFamily: 'DM Mono,monospace' }}>{money(montoTotal)}</strong>
            <span style={{ color: '#888', fontSize: 12 }}>({money(Number(cMonto))} {cMedio} + {money(Number(cMonto2) || 0)} {cMedio2})</span>
          </div>
        )}

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
              <table className="responsive">
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
                      <td data-label="Cliente"><strong>{c.cliente}</strong></td>
                      <td data-label="Monto" style={{ color: '#2e7d32', fontWeight: 600, fontFamily: 'DM Mono,monospace' }}>
                        +{money(c.monto)}
                      </td>
                      <td data-label="Fecha">{c.fecha}</td>
                      <td data-label="Medio">{c.medio}</td>
                      <td data-label="Tipo">{c.tipo}</td>
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
