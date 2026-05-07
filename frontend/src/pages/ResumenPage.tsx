import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, postAdminSeed } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { money, todayISO } from '@/lib/format';
import { diasDesde, mesClaveRef } from '@/lib/j2local';
import { useJ2Local } from '@/context/J2LocalContext';
import type { ResumenPayload, Turno } from '@/types';

export function ResumenPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [seedBusy, setSeedBusy] = useState(false);
  const j2 = useJ2Local();
  const mc = mesClaveRef();
  const fijosMes   = j2.egresos.filter((e) => e.tipo === 'fijo'   && e.fecha.startsWith(mc));
  const variosMes  = j2.egresos.filter((e) => e.tipo !== 'fijo'   && e.fecha.startsWith(mc));
  const sueldosMes = j2.egresos.filter((e) => e.tipo === 'sueldo' && e.fecha.startsWith(mc));
  const totalFijos   = fijosMes.reduce((s, e) => s + e.monto, 0);
  const totalVarios  = variosMes.reduce((s, e) => s + e.monto, 0);
  const totalSueldos = sueldosMes.reduce((s, e) => s + e.monto, 0);
  const subSueldos = j2.empleados
    .map((emp) => {
      const t = sueldosMes.filter((e) => e.categoria === emp.nombre).reduce((s, e) => s + e.monto, 0);
      return t > 0 ? `${emp.nombre.split(' ')[0]} $${t.toLocaleString('es-AR')}` : null;
    })
    .filter(Boolean)
    .join(' · ');
  const inv = j2.inversiones;
  const totalUSD = (inv.usd?.cantidad || 0) * (inv.usd?.precio || 0);
  const totalInv = (inv.cocos || 0) + (inv.servente || 0) + totalUSD;

  const { data, isLoading, error } = useQuery({
    queryKey: ['resumen'],
    queryFn: () => getJson<ResumenPayload>('/api/resumen'),
  });

  const { data: turnos = [] } = useQuery({
    queryKey: ['turnos-all'],
    queryFn: () => getJson<Turno[]>('/api/turnos'),
  });

  const hoy = todayISO();
  const alertasDyn: { titulo: string; texto: string }[] = [];
  for (const t of turnos) {
    if (!t.realizado && t.fecha && t.fecha < hoy) {
      const dias = diasDesde(t.fecha);
      if (dias > 3) {
        alertasDyn.push({
          titulo: `Turno pendiente hace ${dias} días — ${t.cliente}`,
          texto: `Programado para ${t.fecha} (${t.duracion}). Marcá realizado o reprogramá.`,
        });
      }
    }
  }
  for (const e of j2.listaEspera) {
    const dias = diasDesde(e.fechaAgregado);
    if (dias > 10) {
      alertasDyn.push({
        titulo: `Lista de espera urgente — ${e.nombreCliente} (${dias} días sin fecha)`,
        texto: [e.trabajo, e.notas].filter(Boolean).join(' · ') || 'Sin notas',
      });
    }
  }

  async function ejecutarSeedServidor() {
    const secret = window.prompt('ADMIN_SEED_SECRET (variable en Railway / backend):');
    if (secret == null || secret === '') return;
    if (
      !window.confirm(
        'Se borran en el servidor: clientes, proveedores y ajustes globales, y se vuelven a cargar los datos por defecto. ¿Seguro?'
      )
    )
      return;
    setSeedBusy(true);
    try {
      const r = await postAdminSeed(secret, { force: true });
      toast(`Seed OK · ${r.totals.clientes} clientes`);
      await qc.invalidateQueries({ queryKey: ['resumen'] });
      await qc.invalidateQueries({ queryKey: ['turnos-all'] });
      await qc.invalidateQueries({ queryKey: ['clientes'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setSeedBusy(false);
    }
  }

  if (isLoading) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (error)
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--rojo)' }}>{String(error)}</p>
        <button type="button" className="btn secundario" style={{ marginTop: 12 }} disabled={seedBusy} onClick={ejecutarSeedServidor}>
          {seedBusy ? '…' : 'Cargar datos iniciales (seed)'}
        </button>
      </div>
    );
  if (!data?.settings)
    return (
      <div style={{ padding: 24 }}>
        <p>Sin configuración en el servidor.</p>
        <button type="button" className="btn" style={{ marginTop: 12 }} disabled={seedBusy} onClick={ejecutarSeedServidor}>
          {seedBusy ? '…' : 'Cargar datos iniciales (seed)'}
        </button>
      </div>
    );

  const s = data.settings;
  const cajaLiquidaTotal = (j2.cuentas.mp || 0) + (j2.cuentas.banco || 0) + (j2.cuentas.efectivo || 0);
  const subCaja = `MP ${money(j2.cuentas.mp || 0)} · Banco ${money(j2.cuentas.banco || 0)} · Efectivo ${money(j2.cuentas.efectivo || 0)}`;
  const deudaPendientes = j2.deudasClientes.filter((d) => d.estado === 'pendiente');
  const totalDeudaPendiente = deudaPendientes.reduce((sum, d) => sum + d.monto, 0);
  const subDeuda =
    deudaPendientes.length > 0
      ? deudaPendientes.map((d) => `${d.nombreCliente.split(' ')[0]} ${money(d.monto)}`).join(' · ')
      : 'Sin deudas pendientes';
  const patrimonioTotal = cajaLiquidaTotal + totalInv + totalDeudaPendiente;
  const meses = s.mesesHistoricos;

  const MESES_NUM: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  };

  function egresosLocalesDeMes(mesNombreEs: string, anio: number) {
    const num = MESES_NUM[mesNombreEs.toLowerCase()];
    if (!num) return null;
    const clave = `${anio}-${num}`;
    return j2.egresos.filter((e) => e.fecha.startsWith(clave)).reduce((s, e) => s + e.monto, 0);
  }

  // Resultado del mes actual: ingresos del backend - todos los egresos locales del mes
  const totalEgresosMes = totalFijos + totalVarios;
  const resultadoMes = data.ingresosMes - totalEgresosMes;
  const mesNombre = new Date(mc + '-02').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const mesLabel = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);

  return (
    <>
      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Caja Líquida</div>
          <div className="card-valor">{money(cajaLiquidaTotal)}</div>
          <div className="card-sub">{subCaja}</div>
        </div>
        <div className="card rojo">
          <div className="card-label">Cuentas por Cobrar</div>
          <div className="card-valor">{money(totalDeudaPendiente)}</div>
          <div className="card-sub">{subDeuda}</div>
        </div>
        <div className="card amarillo">
          <div className="card-label">Sueldos Este Mes</div>
          <div className="card-valor">{money(totalSueldos)}</div>
          <div className="card-sub">{subSueldos || 'Sin sueldos cargados'}</div>
        </div>
        <div className="card">
          <div className="card-label">Gastos Fijos del Mes</div>
          <div className="card-valor">{money(totalFijos)}</div>
          <div className="card-sub">
            {fijosMes.length ? fijosMes.map((e) => e.categoria).join(' · ') : 'Sin gastos fijos'}
          </div>
        </div>
        <div className="card tierra">
          <div className="card-label">Egresos Varios del Mes</div>
          <div className="card-valor">{money(totalVarios)}</div>
          <div className="card-sub">
            {variosMes.length ? `${variosMes.length} conceptos` : 'Sin gastos varios'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Inversiones</div>
          <div className="card-valor">{money(totalInv)}</div>
          <div className="card-sub">
            COCOS {money(inv.cocos || 0)} · Servente {money(inv.servente || 0)} · USD {money(totalUSD)}
          </div>
        </div>
        <div className="card azul">
          <div className="card-label">Resultado {mesLabel}</div>
          <div className="card-valor" style={{ color: resultadoMes < 0 ? 'var(--rojo)' : '#2e7d32' }}>
            {resultadoMes >= 0 ? '+' : ''}{money(resultadoMes)}
          </div>
          <div className="card-sub">
            Ingresos {money(data.ingresosMes)} · Egresos {money(totalEgresosMes)}
          </div>
        </div>
        <div className="card tierra">
          <div className="card-label">Patrimonio Total</div>
          <div className="card-valor">{money(patrimonioTotal)}</div>
          <div className="card-sub">
            Caja {money(cajaLiquidaTotal)} · Inv. {money(totalInv)} · C×C {money(totalDeudaPendiente)}
          </div>
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
      {alertasDyn.map((a, i) => (
        <div key={`d-${i}`} className="alerta urgente">
          <div>🔴</div>
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
                const egLocal = egresosLocalesDeMes(m.mes, m.anio);
                const eg = egLocal !== null ? egLocal : m.egresos;
                const res = ing - eg;
                const urgente = m.estado?.toLowerCase().includes('curso');
                return (
                  <tr key={`${m.mes}-${m.anio}`} className={urgente ? 'prioridad-alta' : undefined}>
                    <td><strong>{m.mes}</strong></td>
                    <td>{m.anio}</td>
                    <td style={ing === 0 && urgente ? { color: 'var(--rojo)' } : undefined}>
                      {ing === 0 && urgente ? `${money(0)} (sin cargar)` : money(ing)}
                    </td>
                    <td>{money(eg)}</td>
                    <td style={{ color: res >= 0 ? '#2e7d32' : 'var(--rojo)', fontWeight: 600 }}>
                      {res >= 0 ? '+' : ''}{money(res)}
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
        resultado fila = {money(resultadoMes)}
      </p>
      <div
        style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: '1px solid rgba(26,46,26,0.1)',
        }}
      >
        <button
          type="button"
          className="btn secundario"
          style={{ fontSize: 12 }}
          disabled={seedBusy}
          onClick={ejecutarSeedServidor}
        >
          {seedBusy ? '…' : 'Reiniciar datos demo en servidor (seed)'}
        </button>
      </div>
    </>
  );
}
