import { useMemo, useState } from 'react';
import { money } from '@/lib/format';
import { useJ2Local } from '@/context/J2LocalContext';

const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const TIPO_LABELS: Record<string, string> = {
  fijo: 'Gastos fijos',
  sueldo: 'Sueldos',
  varios: 'Varios',
  mercaderia: 'Mercadería',
  inventario: 'Inventario',
  bancario: 'Bancario',
};
const TIPO_COLORES: Record<string, string> = {
  fijo: '#e74c3c',
  sueldo: '#e67e22',
  varios: '#e91e8c',
  mercaderia: '#9b59b6',
  inventario: '#3498db',
  bancario: '#95a5a6',
};
const COLOR_ING = '#2e7d32';
const COLOR_EGR = '#c0392b';
const COLOR_RES_POS = '#1565c0';
const COLOR_RES_NEG = '#b71c1c';

/** Retorna los últimos N meses como "YYYY-MM" del más antiguo al más reciente. */
function ultimosMeses(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

function labelMes(ym: string) {
  const [y, m] = ym.split('-');
  return `${MESES_ES[Number(m) - 1]} ${y.slice(2)}`;
}

/** Escala un valor a píxeles dentro de una altura máxima. */
function escala(val: number, max: number, altura: number) {
  if (max === 0) return 0;
  return Math.round((val / max) * altura);
}

// ── Gráfico de barras agrupadas ────────────────────────────────────────────

interface BarGroupProps {
  meses: string[];
  seriesA: number[];
  seriesB: number[];
  colorA: string;
  colorB: string;
  labelA: string;
  labelB: string;
  formatY?: (v: number) => string;
}

function BarGroupChart({
  meses, seriesA, seriesB, colorA, colorB, labelA, labelB, formatY = money,
}: BarGroupProps) {
  const [hover, setHover] = useState<number | null>(null);

  const padL = 64, padR = 16, padT = 16, padB = 40;
  const W = 580, H = 260;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(...seriesA, ...seriesB, 1);
  const groupW = innerW / meses.length;
  const barW = Math.max(6, Math.min(28, groupW * 0.38));
  const gap = Math.max(2, barW * 0.2);

  // Y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * max));

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: W, display: 'block', fontFamily: 'inherit' }}
        role="img"
        aria-label={`Gráfico comparativo ${labelA} vs ${labelB}`}
      >
        {/* Y axis ticks */}
        {ticks.map((t) => {
          const y = padT + innerH - escala(t, max, innerH);
          return (
            <g key={t}>
              <line x1={padL - 4} y1={y} x2={padL + innerW} y2={y} stroke="var(--borde-color, #e0e0e0)" strokeWidth={0.8} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={10} fill="var(--texto-2, #888)">
                {t >= 1000 ? `$${(t / 1000).toFixed(0)}k` : `$${t}`}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {meses.map((mes, i) => {
          const cx = padL + i * groupW + groupW / 2;
          const xA = cx - gap / 2 - barW;
          const xB = cx + gap / 2;
          const hA = escala(seriesA[i], max, innerH);
          const hB = escala(seriesB[i], max, innerH);
          const isHov = hover === i;

          return (
            <g key={mes} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Hover zone */}
              <rect x={padL + i * groupW} y={padT} width={groupW} height={innerH} fill="transparent" />

              {/* Bar A */}
              <rect
                x={xA} y={padT + innerH - hA} width={barW} height={Math.max(hA, 1)}
                fill={colorA} rx={2} opacity={isHov ? 1 : 0.85}
              />
              {/* Bar B */}
              <rect
                x={xB} y={padT + innerH - hB} width={barW} height={Math.max(hB, 1)}
                fill={colorB} rx={2} opacity={isHov ? 1 : 0.85}
              />

              {/* X label */}
              <text x={cx} y={H - padB + 14} textAnchor="middle" fontSize={10} fill="var(--texto-2, #888)">
                {labelMes(mes)}
              </text>

              {/* Tooltip on hover */}
              {isHov && (
                <g>
                  <rect x={cx - 60} y={padT} width={120} height={52} rx={4} fill="var(--superficie, #fff)" stroke="var(--borde-color,#ddd)" strokeWidth={1} />
                  <text x={cx} y={padT + 15} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--texto, #222)">{labelMes(mes)}</text>
                  <circle cx={cx - 46} cy={padT + 28} r={4} fill={colorA} />
                  <text x={cx - 38} y={padT + 32} fontSize={10} fill="var(--texto, #222)">{formatY(seriesA[i])}</text>
                  <circle cx={cx - 46} cy={padT + 44} r={4} fill={colorB} />
                  <text x={cx - 38} y={padT + 48} fontSize={10} fill="var(--texto, #222)">{formatY(seriesB[i])}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Axes */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="var(--texto-2,#aaa)" strokeWidth={1} />
        <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="var(--texto-2,#aaa)" strokeWidth={1} />
      </svg>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: colorA, display: 'inline-block' }} />
          {labelA}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: colorB, display: 'inline-block' }} />
          {labelB}
        </div>
      </div>
    </div>
  );
}

// ── Barras horizontales ────────────────────────────────────────────────────

function HorizBarChart({ items }: { items: { label: string; valor: number; color: string }[] }) {
  const max = Math.max(...items.map((i) => i.valor), 1);
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span>{item.label}</span>
            <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600 }}>{money(item.valor)}</span>
          </div>
          <div style={{ height: 10, background: 'var(--fondo)', borderRadius: 5, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(item.valor / max) * 100}%`,
                background: item.color,
                borderRadius: 5,
                transition: 'width 0.4s ease',
                minWidth: item.valor > 0 ? 4 : 0,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Línea de resultado ─────────────────────────────────────────────────────

function ResultadoLine({ meses, resultados }: { meses: string[]; resultados: number[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const padL = 64, padR = 16, padT = 20, padB = 36;
  const W = 580, H = 180;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const absMax = Math.max(...resultados.map(Math.abs), 1);
  const mid = padT + innerH / 2;

  function yOf(v: number) {
    return mid - (v / absMax) * (innerH / 2);
  }

  const points = meses.map((_, i) => {
    const x = padL + (i / (meses.length - 1 || 1)) * innerW;
    const y = yOf(resultados[i]);
    return { x, y };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }} role="img" aria-label="Resultado mensual">
        {/* Zero line */}
        <line x1={padL} y1={mid} x2={padL + innerW} y2={mid} stroke="var(--texto-2,#aaa)" strokeWidth={1} strokeDasharray="4 3" />

        {/* Fill areas */}
        {resultados.map((v, i) => {
          if (i === 0) return null;
          const x1 = points[i - 1].x, y1 = points[i - 1].y;
          const x2 = points[i].x, y2 = points[i].y;
          const color = (v + resultados[i - 1]) / 2 >= 0 ? COLOR_RES_POS : COLOR_RES_NEG;
          return (
            <polygon
              key={i}
              points={`${x1},${y1} ${x2},${y2} ${x2},${mid} ${x1},${mid}`}
              fill={color}
              opacity={0.12}
            />
          );
        })}

        {/* Line */}
        <polyline points={polyline} fill="none" stroke={COLOR_RES_POS} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* Points + labels */}
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={p.x} cy={p.y} r={5} fill={resultados[i] >= 0 ? COLOR_RES_POS : COLOR_RES_NEG} />
            {hover === i && (
              <g>
                <rect x={p.x - 44} y={p.y - 30} width={88} height={24} rx={4} fill="var(--superficie,#fff)" stroke="var(--borde-color,#ddd)" strokeWidth={1} />
                <text x={p.x} y={p.y - 14} textAnchor="middle" fontSize={10} fontWeight={700} fill={resultados[i] >= 0 ? COLOR_RES_POS : COLOR_RES_NEG}>
                  {resultados[i] >= 0 ? '+' : ''}{money(resultados[i])}
                </text>
              </g>
            )}
            <text x={p.x} y={H - padB + 14} textAnchor="middle" fontSize={10} fill="var(--texto-2,#888)">{labelMes(meses[i])}</text>
          </g>
        ))}

        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="var(--texto-2,#aaa)" strokeWidth={1} />
        <text x={padL - 8} y={mid + 4} textAnchor="end" fontSize={10} fill="var(--texto-2,#888)">$0</text>
      </svg>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────

export function GraficosPage() {
  const j2 = useJ2Local();
  const [rango, setRango] = useState(6);

  const meses = useMemo(() => ultimosMeses(rango), [rango]);

  const { ingPorMes, egrPorMes, resultados } = useMemo(() => {
    const ing: number[] = meses.map((m) =>
      j2.ingresos.filter((i) => i.fecha.startsWith(m)).reduce((s, i) => s + i.monto, 0)
    );
    const egr: number[] = meses.map((m) =>
      j2.egresos.filter((e) => e.fecha.startsWith(m)).reduce((s, e) => s + e.monto, 0)
    );
    return { ingPorMes: ing, egrPorMes: egr, resultados: ing.map((v, i) => v - egr[i]) };
  }, [meses, j2.ingresos, j2.egresos]);

  // Egresos por tipo del mes más reciente con datos
  const egresosPorTipo = useMemo(() => {
    const mesActual = meses[meses.length - 1];
    const del = j2.egresos.filter((e) => e.fecha.startsWith(mesActual));
    const tipos = new Map<string, number>();
    for (const e of del) {
      tipos.set(e.tipo, (tipos.get(e.tipo) ?? 0) + e.monto);
    }
    return [...tipos.entries()]
      .map(([tipo, valor]) => ({
        label: TIPO_LABELS[tipo] ?? tipo,
        valor,
        color: TIPO_COLORES[tipo] ?? '#95a5a6',
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [meses, j2.egresos]);

  // Ingresos por medio del mes actual
  const ingresosPorMedio = useMemo(() => {
    const mesActual = meses[meses.length - 1];
    const del = j2.ingresos.filter((i) => i.fecha.startsWith(mesActual));
    const medios = new Map<string, number>();
    for (const i of del) {
      const m = i.medio || 'Sin especificar';
      medios.set(m, (medios.get(m) ?? 0) + i.monto);
    }
    const coloresMedio = ['#2e7d32', '#1565c0', '#6a1b9a', '#e65100', '#00695c'];
    return [...medios.entries()]
      .map(([label, valor], idx) => ({ label, valor, color: coloresMedio[idx % coloresMedio.length] }))
      .sort((a, b) => b.valor - a.valor);
  }, [meses, j2.ingresos]);

  const mesLabel = labelMes(meses[meses.length - 1]);
  const totalIng = ingPorMes.reduce((s, v) => s + v, 0);
  const totalEgr = egrPorMes.reduce((s, v) => s + v, 0);

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Gráficos <small>Análisis de ingresos y egresos</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[3, 6, 12].map((n) => (
            <button
              key={n}
              type="button"
              className={`btn ${rango === n ? '' : 'secundario'} sm`}
              onClick={() => setRango(n)}
            >
              {n} meses
            </button>
          ))}
        </div>
      </div>

      {/* Cards resumen */}
      <div className="cards-grid" style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="card-label">📈 Ingresos ({rango}m)</div>
          <div className="card-valor" style={{ color: 'var(--verde-vivo)' }}>{money(totalIng)}</div>
          <div className="card-sub">Promedio: {money(Math.round(totalIng / rango))} / mes</div>
        </div>
        <div className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="card-label">📉 Egresos ({rango}m)</div>
          <div className="card-valor" style={{ color: 'var(--rojo)' }}>{money(totalEgr)}</div>
          <div className="card-sub">Promedio: {money(Math.round(totalEgr / rango))} / mes</div>
        </div>
        <div className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="card-label">💹 Resultado ({rango}m)</div>
          <div className="card-valor" style={{ color: totalIng - totalEgr >= 0 ? COLOR_RES_POS : COLOR_RES_NEG }}>
            {totalIng - totalEgr >= 0 ? '+' : ''}{money(totalIng - totalEgr)}
          </div>
          <div className="card-sub">Margen: {totalIng > 0 ? Math.round(((totalIng - totalEgr) / totalIng) * 100) : 0}%</div>
        </div>
      </div>

      {/* Gráfico 1: Ingresos vs Egresos */}
      <div className="card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
        <h3 style={{ margin: '0 0 var(--sp-4)', fontSize: 'var(--txt-base)', fontWeight: 700 }}>
          Ingresos vs Egresos — últimos {rango} meses
        </h3>
        <BarGroupChart
          meses={meses}
          seriesA={ingPorMes}
          seriesB={egrPorMes}
          colorA={COLOR_ING}
          colorB={COLOR_EGR}
          labelA="Ingresos"
          labelB="Egresos"
        />
      </div>

      {/* Gráfico 2: Resultado mensual */}
      <div className="card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
        <h3 style={{ margin: '0 0 var(--sp-4)', fontSize: 'var(--txt-base)', fontWeight: 700 }}>
          Resultado neto por mes
        </h3>
        <ResultadoLine meses={meses} resultados={resultados} />
        <div style={{ display: 'flex', gap: 24, marginTop: 'var(--sp-3)', flexWrap: 'wrap' }}>
          {resultados.map((r, i) => (
            <div key={meses[i]} style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--texto-2)' }}>{labelMes(meses[i])}: </span>
              <span style={{ fontWeight: 600, color: r >= 0 ? COLOR_RES_POS : COLOR_RES_NEG }}>
                {r >= 0 ? '+' : ''}{money(r)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Gráficos 3 y 4 en dos columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--sp-4)' }}>
        <div className="card" style={{ padding: 'var(--sp-5)' }}>
          <h3 style={{ margin: '0 0 var(--sp-4)', fontSize: 'var(--txt-base)', fontWeight: 700 }}>
            Egresos por tipo — {mesLabel}
          </h3>
          {egresosPorTipo.length === 0 ? (
            <p style={{ color: 'var(--texto-2)', fontSize: 13 }}>Sin egresos registrados este mes.</p>
          ) : (
            <HorizBarChart items={egresosPorTipo} />
          )}
        </div>

        <div className="card" style={{ padding: 'var(--sp-5)' }}>
          <h3 style={{ margin: '0 0 var(--sp-4)', fontSize: 'var(--txt-base)', fontWeight: 700 }}>
            Ingresos por medio — {mesLabel}
          </h3>
          {ingresosPorMedio.length === 0 ? (
            <p style={{ color: 'var(--texto-2)', fontSize: 13 }}>Sin ingresos registrados este mes.</p>
          ) : (
            <HorizBarChart items={ingresosPorMedio} />
          )}
        </div>
      </div>
    </>
  );
}
