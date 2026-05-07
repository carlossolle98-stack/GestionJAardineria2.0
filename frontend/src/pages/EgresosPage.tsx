import { useMemo, useState } from 'react';
import { todayISO } from '@/lib/format';
import { LABEL_EGRESO, NOMBRES_CUENTA, csvEscape, downloadCsv, mesClaveRef } from '@/lib/j2local';
import type { J2EgresoTipo } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';

const CATS_FIJO = ['Monotributo', 'Seguro', 'Mutual', 'Marketing', 'ChatGPT', 'Claude', 'Otro'];

export function EgresosPage() {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const mc = mesClaveRef();
  const [tipo, setTipo] = useState<J2EgresoTipo>('fijo');
  const [categoria, setCategoria] = useState(CATS_FIJO[0]);
  const [empleado, setEmpleado] = useState('');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [cuenta, setCuenta] = useState<'mp' | 'banco' | 'efectivo'>('mp');
  const [filtro, setFiltro] = useState<'todos' | J2EgresoTipo>('todos');

  const empleadosActivos = j2.empleados.filter((e) => e.activo);

  const stats = useMemo(() => {
    const fijos   = j2.egresos.filter((e) => e.tipo === 'fijo'        && e.fecha.startsWith(mc));
    const varios  = j2.egresos.filter((e) => e.tipo === 'varios'       && e.fecha.startsWith(mc));
    const sueldos = j2.egresos.filter((e) => e.tipo === 'sueldo'       && e.fecha.startsWith(mc));
    const mercs   = j2.egresos.filter((e) => e.tipo === 'mercaderia'   && e.fecha.startsWith(mc));
    const invs    = j2.egresos.filter((e) => e.tipo === 'inventario'   && e.fecha.startsWith(mc));
    const bancs   = j2.egresos.filter((e) => e.tipo === 'bancario'     && e.fecha.startsWith(mc));
    const tf = fijos.reduce((s, e) => s + e.monto, 0);
    const tv = varios.reduce((s, e) => s + e.monto, 0);
    const ts = sueldos.reduce((s, e) => s + e.monto, 0);
    const tm = mercs.reduce((s, e) => s + e.monto, 0);
    const ti = invs.reduce((s, e) => s + e.monto, 0);
    const tb = bancs.reduce((s, e) => s + e.monto, 0);
    return { fijos, varios, sueldos, mercs, invs, bancs, tf, tv, ts, tm, ti, tb, total: tf + tv + ts + tm + ti + tb };
  }, [j2.egresos, mc]);

  const lista = useMemo(() => {
    let rows = [...j2.egresos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    if (filtro !== 'todos') rows = rows.filter((e) => e.tipo === filtro);
    return rows;
  }, [j2.egresos, filtro]);

  function registrar() {
    const m = parseInt(monto, 10);
    if (!m || m <= 0) {
      toast('⚠ Ingresá un monto válido');
      return;
    }
    if (!fecha) {
      toast('⚠ Elegí una fecha');
      return;
    }
    const cat =
      tipo === 'fijo' ? categoria
      : tipo === 'sueldo' ? (empleado || 'Sueldo')
      : LABEL_EGRESO[tipo] || 'Varios';
    j2.addEgreso({
      fecha,
      tipo,
      categoria: cat,
      concepto: concepto.trim() || cat,
      monto: m,
      cuenta: tipo === 'inventario' ? 'efectivo' : cuenta,
    });
    setConcepto('');
    setMonto('');
    toast('✓ Egreso registrado');
  }

  function csvEgresos() {
    const filas = [['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Monto', 'Cuenta']];
    j2.egresos.forEach((e) =>
      filas.push([
        e.fecha,
        e.tipo,
        e.categoria,
        e.concepto,
        e.monto,
        NOMBRES_CUENTA[e.cuenta] || e.cuenta,
      ])
    );
    return filas.map((r) => r.map(csvEscape).join(',')).join('\n');
  }

  const totalRegs =
    stats.fijos.length + stats.varios.length + stats.sueldos.length + stats.mercs.length + stats.invs.length + stats.bancs.length;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Egresos <small>Gastos fijos, mercadería y más</small>
        </div>
      </div>

      <div className="cards-grid">
        <div className="card rojo">
          <div className="card-label">Gastos Fijos del Mes</div>
          <div className="card-valor">${stats.tf.toLocaleString('es-AR')}</div>
          <div className="card-sub">
            {stats.fijos.length ? stats.fijos.map((e) => e.categoria).join(' · ') : '—'}
          </div>
        </div>
        <div className="card amarillo">
          <div className="card-label">Gastos Varios del Mes</div>
          <div className="card-valor">${(stats.tv + stats.ts + stats.tm + stats.ti + stats.tb).toLocaleString('es-AR')}</div>
          <div className="card-sub">
            {[
              stats.varios.length && `Varios $${stats.tv.toLocaleString('es-AR')}`,
              stats.sueldos.length && `Sueldos $${stats.ts.toLocaleString('es-AR')}`,
              stats.mercs.length && `Merc. $${stats.tm.toLocaleString('es-AR')}`,
              stats.invs.length && `Inv. $${stats.ti.toLocaleString('es-AR')}`,
              stats.bancs.length && `Banc. $${stats.tb.toLocaleString('es-AR')}`,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </div>
        </div>
        <div className="card tierra">
          <div className="card-label">Total Egresos del Mes</div>
          <div className="card-valor">${stats.total.toLocaleString('es-AR')}</div>
          <div className="card-sub">{totalRegs} registros</div>
        </div>
      </div>

      <div className="section-title" style={{ marginBottom: 14 }}>
        ➕ Registrar egreso
      </div>
      <div className="tabla-wrap" style={{ padding: 20 }}>
        <div className="form-grid">
          <div className="form-group">
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as J2EgresoTipo)}>
              <option value="fijo">Gasto fijo</option>
              <option value="varios">Gasto varios</option>
              <option value="sueldo">Sueldo / Empleado</option>
              <option value="mercaderia">Compra / Mercadería</option>
              <option value="inventario">Diferencia de inventario</option>
              <option value="bancario">Mov. bancario negativo</option>
            </select>
          </div>
          {tipo === 'fijo' && (
            <div className="form-group">
              <label>Categoría</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {CATS_FIJO.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          {tipo === 'sueldo' && (
            <div className="form-group">
              <label>Empleado</label>
              <select value={empleado} onChange={(e) => setEmpleado(e.target.value)}>
                {empleadosActivos.length === 0 && <option value="">Sin empleados activos</option>}
                {empleadosActivos.map((e) => (
                  <option key={e.id} value={e.nombre}>{e.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Concepto / Detalle</label>
            <input value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Monto</label>
            <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          {tipo !== 'inventario' && (
            <div className="form-group">
              <label>Cuenta de pago</label>
              <select value={cuenta} onChange={(e) => setCuenta(e.target.value as 'mp' | 'banco' | 'efectivo')}>
                <option value="mp">Mercado Pago</option>
                <option value="banco">Banco</option>
                <option value="efectivo">Efectivo</option>
              </select>
            </div>
          )}
        </div>
        <button type="button" className="btn" onClick={registrar}>
          Registrar egreso
        </button>
      </div>

      <div className="section-title" style={{ margin: '20px 0 12px' }}>
        📋 Historial de egresos
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['todos', 'fijo', 'varios', 'sueldo', 'mercaderia', 'inventario', 'bancario'] as const).map((f) => (
          <button key={f} type="button" className="btn secundario sm" onClick={() => setFiltro(f)}>
            {f === 'todos' ? 'Todos' : LABEL_EGRESO[f]}
          </button>
        ))}
        <button type="button" className="btn secundario sm" onClick={() => downloadCsv('egresos.csv', csvEgresos())}>
          ⬇ CSV
        </button>
      </div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Concepto</th>
                <th>Monto</th>
                <th>Cuenta</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>
                    Sin egresos registrados
                  </td>
                </tr>
              ) : (
                lista.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{e.fecha}</td>
                    <td>
                      <span className="badge pendiente">{LABEL_EGRESO[e.tipo]}</span>
                    </td>
                    <td>{e.categoria}</td>
                    <td>{e.concepto}</td>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: 'var(--rojo)' }}>
                      -${e.monto.toLocaleString('es-AR')}
                    </td>
                    <td>{NOMBRES_CUENTA[e.cuenta]}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar egreso de $${e.monto}?`)) j2.removeEgreso(e.id);
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid rgba(192,57,43,0.3)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          color: 'var(--rojo)',
                        }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
