import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
import { money } from '@/lib/format';
import type { ResumenPayload } from '@/types';

export function ResumenPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['resumen'],
    queryFn: () => getJson<ResumenPayload>('/api/resumen'),
  });

  if (isLoading) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (error) return <p style={{ padding: 24, color: 'var(--rojo)' }}>{String(error)}</p>;
  if (!data?.settings) return <p style={{ padding: 24 }}>Sin configuración. Ejecutá seed en el backend.</p>;

  const s = data.settings;
  const subCaja = `MP ${money(s.cajaLiquida.mercadoPago)} · Banco ${money(s.cajaLiquida.banco)} · Efectivo ${money(
    s.cajaLiquida.efectivo
  )}`;
  const subDeuda =
    data.cuentasPorCobrar.clientes.length > 0
      ? data.cuentasPorCobrar.clientes.map((c) => `${c.nombre.split(' ')[0]} ${money(c.deuda)}`).join(' · ')
      : 'Sin deudas registradas';
  const subEmp = s.empleadosEsteMes.map((e) => `${e.nombre} ${money(e.monto)}`).join(' · ');
  const meses = s.mesesHistoricos;
  const ultimo = meses[meses.length - 1];
  const ingresoUltimo =
    ultimo?.estado?.toLowerCase().includes('curso') ? data.ingresosMes : ultimo?.ingresos ?? 0;
  const resultadoUltimo = ingresoUltimo - (ultimo?.egresos ?? 0);

  return (
    <>
      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Caja Líquida</div>
          <div className="card-valor">{money(s.cajaLiquida.total)}</div>
          <div className="card-sub">{subCaja}</div>
        </div>
        <div className="card rojo">
          <div className="card-label">Cuentas por Cobrar</div>
          <div className="card-valor">{money(data.cuentasPorCobrar.total)}</div>
          <div className="card-sub">{subDeuda}</div>
        </div>
        <div className="card amarillo">
          <div className="card-label">Empleados Este Mes</div>
          <div className="card-valor">
            {money(s.empleadosEsteMes.reduce((a, e) => a + e.monto, 0))}
          </div>
          <div className="card-sub">{subEmp}</div>
        </div>
        <div className="card azul">
          <div className="card-label">{s.resultadoMesActual.etiqueta}</div>
          <div className="card-valor" style={{ color: s.resultadoMesActual.monto < 0 ? 'var(--rojo)' : '#2e7d32' }}>
            {money(s.resultadoMesActual.monto)}
          </div>
          <div className="card-sub">{s.resultadoMesActual.sub}</div>
        </div>
        <div className="card tierra">
          <div className="card-label">Patrimonio Total</div>
          <div className="card-valor">{money(s.patrimonio.total)}</div>
          <div className="card-sub">Activos no líquidos: {money(s.patrimonio.activosNoLiquidos)}</div>
        </div>
      </div>

      <div className="section-header">
        <div className="section-title">🚨 Alertas del Día</div>
      </div>
      {s.alertas.map((a, i) => (
        <div key={i} className={`alerta ${a.tipo}`}>
          <div>{a.tipo === 'urgente' ? '🔴' : a.tipo === 'aviso' ? '🟡' : a.tipo === 'info' ? '🔵' : '🟢'}</div>
          <div>
            <strong style={{ display: 'block', marginBottom: 4 }}>{a.titulo}</strong>
            {a.texto}
          </div>
        </div>
      ))}

      <div className="sep" />

      <div className="section-header">
        <div className="section-title">📈 Últimos meses</div>
      </div>
      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Año</th>
                <th>Ingresos</th>
                <th>Egresos</th>
                <th>Resultado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m, idx) => {
                const isLast = idx === meses.length - 1;
                const ing = isLast && m.estado?.toLowerCase().includes('curso') ? data.ingresosMes : m.ingresos;
                const res = ing - m.egresos;
                const urgente = m.estado?.toLowerCase().includes('curso');
                return (
                  <tr key={`${m.mes}-${m.anio}`} className={urgente ? 'prioridad-alta' : undefined}>
                    <td>
                      <strong>{m.mes}</strong>
                    </td>
                    <td>{m.anio}</td>
                    <td style={ing === 0 && urgente ? { color: 'var(--rojo)' } : undefined}>
                      {ing === 0 && urgente ? `${money(0)} (sin cargar)` : money(ing)}
                    </td>
                    <td>{money(m.egresos)}</td>
                    <td style={{ color: res >= 0 ? '#2e7d32' : 'var(--rojo)', fontWeight: 600 }}>
                      {res >= 0 ? '+' : ''}
                      {money(res)}
                    </td>
                    <td>
                      <span className={`badge ${urgente ? 'urgente' : 'ok'}`}>
                        {urgente ? '⚠ En curso' : '✓ Cerrado'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#888' }}>
        Mes en curso ({data.mesClave}): ingresos combinados visitas + cargas diarias = {money(data.ingresosMes)} ·
        resultado fila = {money(resultadoUltimo)}
      </p>
    </>
  );
}
