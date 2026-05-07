import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
import { csvEscape, downloadCsv } from '@/lib/j2local';
import type { Cliente, Prospecto, Turno } from '@/types';

function csvRows(rows: (string | number)[][]) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function MovimientosPage() {
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
    const cob = csvRows([
      ['Cliente', 'Fecha', 'Monto', 'Horas'],
      ...filasCobros.map((p) => [p.nombre, p.fecha, p.monto, p.horas ?? '']),
    ]);
    downloadCsv(`jardineria_cobros_${fecha}.csv`, cob);
    setTimeout(() => {
      const t = csvRows([
        ['Fecha', 'Hora', 'Cliente', 'Duración', 'Tipo', 'Estado'],
        ...turnosOrd.map((x) => [
          x.fecha,
          x.hora || '',
          x.cliente,
          x.duracion,
          x.tipo,
          x.realizado ? 'Realizado' : 'Pendiente',
        ]),
      ]);
      downloadCsv(`jardineria_turnos_${fecha}.csv`, t);
    }, 400);
    setTimeout(() => {
      const pr = csvRows([
        ['Nombre', 'Zona', 'Tipo', 'Frecuencia', 'Estado', 'Notas'],
        ...prospectos.map((p) => [
          p.nombre,
          p.zona,
          p.tipoTrabajo,
          p.frecuencia,
          p.estado,
          p.notas || '',
        ]),
      ]);
      downloadCsv(`jardineria_prospectos_${fecha}.csv`, pr);
    }, 800);
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
          <strong>CSV para Excel.</strong> Podés bajar cada tabla o todo junto.
        </div>
      </div>

      <div className="section-title" style={{ margin: '20px 0 12px' }}>
        💵 Historial de cobros por cliente
      </div>
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
                  <td colSpan={5} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>
                    Sin cobros registrados
                  </td>
                </tr>
              ) : (
                filasCobros.map((p, i) => {
                  const vh =
                    p.horas && p.horas > 0 ? `$${Math.round(p.monto / p.horas).toLocaleString('es-AR')}` : '—';
                  return (
                    <tr key={`${p.nombre}-${p.fecha}-${i}`}>
                      <td>
                        <strong>{p.nombre}</strong>
                      </td>
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
            'cobros.csv',
            csvRows([
              ['Cliente', 'Fecha', 'Monto', 'Horas'],
              ...filasCobros.map((p) => [p.nombre, p.fecha, p.monto, p.horas ?? '']),
            ])
          )
        }
      >
        ⬇ Descargar cobros CSV
      </button>

      <div className="section-title" style={{ marginBottom: 12 }}>
        📅 Turnos agendados
      </div>
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
                  <td colSpan={6} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>
                    Sin turnos registrados
                  </td>
                </tr>
              ) : (
                turnosOrd.map((t) => (
                  <tr key={t._id}>
                    <td>{t.fecha}</td>
                    <td style={{ fontFamily: 'DM Mono,monospace' }}>{t.hora || '—'}</td>
                    <td>
                      <strong>{t.cliente}</strong>
                    </td>
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
              ...turnosOrd.map((x) => [
                x.fecha,
                x.hora || '',
                x.cliente,
                x.duracion,
                x.tipo,
                x.realizado ? 'Realizado' : 'Pendiente',
              ]),
            ])
          )
        }
      >
        ⬇ Descargar turnos CSV
      </button>

      <div className="section-title" style={{ marginBottom: 12 }}>
        🌱 Prospectos
      </div>
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
                  <td colSpan={6} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>
                    Sin prospectos registrados
                  </td>
                </tr>
              ) : (
                prospectos.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <strong>{p.nombre}</strong>
                    </td>
                    <td>{p.zona}</td>
                    <td>{p.tipoTrabajo}</td>
                    <td>{p.frecuencia}</td>
                    <td>
                      <span className="badge pendiente">{p.estado}</span>
                    </td>
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
              ...prospectos.map((p) => [
                p.nombre,
                p.zona,
                p.tipoTrabajo,
                p.frecuencia,
                p.estado,
                p.notas || '',
              ]),
            ])
          )
        }
      >
        ⬇ Descargar prospectos CSV
      </button>
    </>
  );
}
