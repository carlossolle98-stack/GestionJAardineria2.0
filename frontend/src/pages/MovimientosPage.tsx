import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
import { csvEscape, downloadCsv, NOMBRES_CUENTA } from '@/lib/j2local';
import { money } from '@/lib/format';
import { useJ2Local } from '@/context/J2LocalContext';
import type { Cliente, Prospecto, Turno } from '@/types';

function csvRows(rows: (string | number | undefined)[][]) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function MovimientosPage() {
  const j2 = useJ2Local();

  const { data: clientes = [], isLoading: lc } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
  });
  const { data: turnos = [], isLoading: lt } = useQuery({
    queryKey: ['turnos-all'],
    queryFn: () => getJson<Turno[]>('/api/turnos'),
  });
  const { data: prospectos = [], isLoading: lp } = useQuery({
    queryKey: ['prospectos'],
    queryFn: () => getJson<Prospecto[]>('/api/prospectos'),
  });

  const filasCobros = useMemo(() => {
    const out: { nombre: string; fecha: string; monto: number; horas?: number }[] = [];
    for (const c of clientes) {
      for (const p of c.pagos || []) {
        out.push({ nombre: c.nombre, fecha: p.fecha, monto: p.monto, horas: p.horas });
      }
    }
    return out.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [clientes]);

  const turnosOrd = useMemo(
    () => [...turnos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')),
    [turnos]
  );

  const fecha = new Date().toISOString().split('T')[0];

  function descargarTodo() {
    // Movimientos locales (movlog)
    const mov = csvRows([
      ['Fecha', 'Tipo', 'Concepto', 'Detalle', 'Monto', 'Cuenta'],
      ...j2.movlog.map((m) => [m.fecha, m.tipo, m.concepto, m.detalle, m.monto, NOMBRES_CUENTA[m.cuenta] || m.cuenta]),
    ]);
    downloadCsv(`jardineria_movimientos_${fecha}.csv`, mov);

    setTimeout(() => {
      // Ingresos locales
      const ing = csvRows([
        ['Fecha', 'Cliente', 'Concepto', 'Monto', 'Medio'],
        ...j2.ingresos.map((i) => [i.fecha, i.cliente, i.concepto, i.monto, i.medio]),
      ]);
      downloadCsv(`jardineria_ingresos_${fecha}.csv`, ing);
    }, 150);

    setTimeout(() => {
      // Egresos locales
      const eg = csvRows([
        ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Monto', 'Cuenta'],
        ...j2.egresos.map((e) => [e.fecha, e.tipo, e.categoria, e.concepto, e.monto, NOMBRES_CUENTA[e.cuenta] || e.cuenta]),
      ]);
      downloadCsv(`jardineria_egresos_${fecha}.csv`, eg);
    }, 300);

    setTimeout(() => {
      // Deudas clientes
      const deudas = csvRows([
        ['Fecha', 'Cliente', 'Concepto', 'Monto', 'Estado', 'Fecha cobro', 'Cuenta cobro'],
        ...j2.deudasClientes.map((d) => [
          d.fecha, d.nombreCliente, d.concepto, d.monto,
          d.estado, d.fechaPago || '', NOMBRES_CUENTA[d.cuentaCobro || ''] || d.cuentaCobro || '',
        ]),
      ]);
      downloadCsv(`jardineria_deudas_${fecha}.csv`, deudas);
    }, 600);

    setTimeout(() => {
      // Cobros backend
      const cob = csvRows([
        ['Cliente', 'Fecha', 'Monto', 'Horas'],
        ...filasCobros.map((p) => [p.nombre, p.fecha, p.monto, p.horas ?? '']),
      ]);
      downloadCsv(`jardineria_cobros_backend_${fecha}.csv`, cob);
    }, 900);

    setTimeout(() => {
      const t = csvRows([
        ['Fecha', 'Hora', 'Cliente', 'Duración', 'Tipo', 'Estado'],
        ...turnosOrd.map((x) => [x.fecha, x.hora || '', x.cliente, x.duracion, x.tipo, x.realizado ? 'Realizado' : 'Pendiente']),
      ]);
      downloadCsv(`jardineria_turnos_${fecha}.csv`, t);
    }, 1200);

    setTimeout(() => {
      const pr = csvRows([
        ['Nombre', 'Zona', 'Tipo', 'Frecuencia', 'Estado', 'Notas'],
        ...prospectos.map((p) => [p.nombre, p.zona, p.tipoTrabajo, p.frecuencia, p.estado, p.notas || '']),
      ]);
      downloadCsv(`jardineria_prospectos_${fecha}.csv`, pr);
    }, 1500);
  }

  if (lc || lt || lp) return <p style={{ padding: 16 }}>Cargando…</p>;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Movimientos <small>Todos los registros de la app</small>
        </div>
        <button type="button" className="btn" onClick={descargarTodo}>
          ⬇ Descargar todo (CSV)
        </button>
      </div>

      <div className="alerta info">
        <div>💡</div>
        <div>
          <strong>CSV para Excel.</strong> Se descargan 6 archivos: movimientos, egresos, deudas, cobros, turnos y prospectos.
        </div>
      </div>

      {/* ── Movimientos locales (movlog) ── */}
      <div className="section-title" style={{ margin: '20px 0 12px' }}>
        📋 Movimientos financieros (app)
      </div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th>Detalle</th>
                <th>Monto</th>
                <th>Cuenta</th>
              </tr>
            </thead>
            <tbody>
              {j2.movlog.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>Sin movimientos registrados</td>
                </tr>
              ) : (
                j2.movlog.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{m.fecha}</td>
                    <td><span className="badge pendiente">{m.tipo}</span></td>
                    <td><strong>{m.concepto}</strong></td>
                    <td style={{ fontSize: 12, color: '#666' }}>{m.detalle || '—'}</td>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: m.monto >= 0 ? '#2e7d32' : 'var(--rojo)' }}>
                      {m.monto >= 0 ? '+' : ''}{money(m.monto)}
                    </td>
                    <td style={{ fontSize: 12 }}>{NOMBRES_CUENTA[m.cuenta] || m.cuenta || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <button
        type="button"
        className="btn secundario sm"
        style={{ marginBottom: 20 }}
        onClick={() =>
          downloadCsv(
            `movimientos_${fecha}.csv`,
            csvRows([
              ['Fecha', 'Tipo', 'Concepto', 'Detalle', 'Monto', 'Cuenta'],
              ...j2.movlog.map((m) => [m.fecha, m.tipo, m.concepto, m.detalle, m.monto, NOMBRES_CUENTA[m.cuenta] || m.cuenta]),
            ])
          )
        }
      >
        ⬇ Descargar movimientos CSV
      </button>

      {/* ── Cobros backend ── */}
      <div className="section-title" style={{ marginBottom: 12 }}>💵 Cobros por cliente (servidor)</div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Monto</th>
                <th>Horas</th>
                <th>$/hora</th>
              </tr>
            </thead>
            <tbody>
              {filasCobros.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>Sin cobros registrados</td>
                </tr>
              ) : (
                filasCobros.map((p, i) => {
                  const vh = p.horas && p.horas > 0 ? `$${Math.round(p.monto / p.horas).toLocaleString('es-AR')}` : '—';
                  return (
                    <tr key={`${p.nombre}-${p.fecha}-${i}`}>
                      <td><strong>{p.nombre}</strong></td>
                      <td>{p.fecha}</td>
                      <td style={{ fontFamily: 'DM Mono,monospace', color: '#2e7d32', fontWeight: 600 }}>
                        ${p.monto.toLocaleString('es-AR')}
                      </td>
                      <td style={{ textAlign: 'center' }}>{p.horas ? `${p.horas}h` : '—'}</td>
                      <td style={{ textAlign: 'center', color: '#888' }}>{vh}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <button
        type="button"
        className="btn secundario sm"
        style={{ marginBottom: 20 }}
        onClick={() =>
          downloadCsv(
            'cobros_backend.csv',
            csvRows([
              ['Cliente', 'Fecha', 'Monto', 'Horas'],
              ...filasCobros.map((p) => [p.nombre, p.fecha, p.monto, p.horas ?? '']),
            ])
          )
        }
      >
        ⬇ Descargar cobros CSV
      </button>

      {/* ── Deudas clientes ── */}
      <div className="section-title" style={{ marginBottom: 12 }}>💳 Deudas por cobrar (registro)</div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Concepto</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Fecha cobro</th>
                <th>Medio</th>
              </tr>
            </thead>
            <tbody>
              {j2.deudasClientes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>Sin deudas registradas</td>
                </tr>
              ) : (
                [...j2.deudasClientes]
                  .sort((a, b) => b.fecha.localeCompare(a.fecha))
                  .map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fecha}</td>
                      <td><strong>{d.nombreCliente}</strong></td>
                      <td style={{ fontSize: 12, color: '#666' }}>{d.concepto}</td>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: d.estado === 'pendiente' ? 'var(--rojo)' : '#2e7d32' }}>
                        {money(d.monto)}
                      </td>
                      <td>
                        <span className={`badge ${d.estado === 'pendiente' ? 'urgente' : 'ok'}`}>
                          {d.estado === 'pendiente' ? '⏳ Pendiente' : '✓ Cobrado'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fechaPago || '—'}</td>
                      <td style={{ fontSize: 12 }}>{NOMBRES_CUENTA[d.cuentaCobro || ''] || d.cuentaCobro || '—'}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <button
        type="button"
        className="btn secundario sm"
        style={{ marginBottom: 20 }}
        onClick={() =>
          downloadCsv(
            `deudas_clientes_${fecha}.csv`,
            csvRows([
              ['Fecha', 'Cliente', 'Concepto', 'Monto', 'Estado', 'Fecha cobro', 'Medio'],
              ...j2.deudasClientes.map((d) => [
                d.fecha, d.nombreCliente, d.concepto, d.monto,
                d.estado, d.fechaPago || '', NOMBRES_CUENTA[d.cuentaCobro || ''] || d.cuentaCobro || '',
              ]),
            ])
          )
        }
      >
        ⬇ Descargar deudas CSV
      </button>

      {/* ── Turnos ── */}
      <div className="section-title" style={{ marginBottom: 12 }}>📅 Turnos agendados</div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Duración</th>
                <th>Tipo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {turnosOrd.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>Sin turnos registrados</td>
                </tr>
              ) : (
                turnosOrd.map((t) => (
                  <tr key={t._id}>
                    <td>{t.fecha}</td>
                    <td style={{ fontFamily: 'DM Mono,monospace' }}>{t.hora || '—'}</td>
                    <td><strong>{t.cliente}</strong></td>
                    <td>{t.duracion}</td>
                    <td>{t.tipo}</td>
                    <td>
                      <span className={`badge ${t.realizado ? 'ok' : 'pendiente'}`}>
                        {t.realizado ? '✓ Realizado' : '○ Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <button
        type="button"
        className="btn secundario sm"
        style={{ marginBottom: 20 }}
        onClick={() =>
          downloadCsv(
            'turnos.csv',
            csvRows([
              ['Fecha', 'Hora', 'Cliente', 'Duración', 'Tipo', 'Estado'],
              ...turnosOrd.map((x) => [x.fecha, x.hora || '', x.cliente, x.duracion, x.tipo, x.realizado ? 'Realizado' : 'Pendiente']),
            ])
          )
        }
      >
        ⬇ Descargar turnos CSV
      </button>

      {/* ── Prospectos ── */}
      <div className="section-title" style={{ marginBottom: 12 }}>🌱 Prospectos</div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Zona</th>
                <th>Tipo</th>
                <th>Frecuencia</th>
                <th>Estado</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {prospectos.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>Sin prospectos</td>
                </tr>
              ) : (
                prospectos.map((p) => (
                  <tr key={p._id}>
                    <td><strong>{p.nombre}</strong></td>
                    <td>{p.zona}</td>
                    <td>{p.tipoTrabajo}</td>
                    <td>{p.frecuencia}</td>
                    <td><span className="badge pendiente">{p.estado}</span></td>
                    <td style={{ fontSize: 12, color: '#888' }}>{p.notas || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <button
        type="button"
        className="btn secundario sm"
        onClick={() =>
          downloadCsv(
            'prospectos.csv',
            csvRows([
              ['Nombre', 'Zona', 'Tipo', 'Frecuencia', 'Estado', 'Notas'],
              ...prospectos.map((p) => [p.nombre, p.zona, p.tipoTrabajo, p.frecuencia, p.estado, p.notas || '']),
            ])
          )
        }
      >
        ⬇ Descargar prospectos CSV
      </button>
    </>
  );
}
