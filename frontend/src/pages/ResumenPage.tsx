import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, postAdminSeed, sendJson } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { money, todayISO } from '@/lib/format';
import { diasDesde, mesClaveRef } from '@/lib/j2local';
import { useJ2Local } from '@/context/J2LocalContext';
import { useAuth } from '@/context/AuthContext';
import { Dialogo, ConfirmarDialogo } from '@/components/Modal';
import type { ResumenPayload, Turno } from '@/types';

export function ResumenPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [seedBusy, setSeedBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [confirmando, setConfirmando] = useState<'periodo' | 'seed' | null>(null);
  const [seedSecret, setSeedSecret] = useState('');
  const { puede, esAdmin } = useAuth();
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

  type Alerta = { tipo: 'urgente' | 'aviso' | 'info'; titulo: string; texto: string };
  const alertasDyn: Alerta[] = [];

  // ── Turnos de hoy ──────────────────────────────────────────
  for (const t of turnos) {
    if (!t.realizado && t.fecha === hoy) {
      alertasDyn.push({
        tipo: 'aviso',
        titulo: `📅 Turno HOY — ${t.cliente}`,
        texto: `${t.hora ? t.hora + ' · ' : ''}${t.duracion} · ${t.tipo}`,
      });
    }
  }

  // ── Turnos vencidos sin realizar ───────────────────────────
  for (const t of turnos) {
    if (!t.realizado && t.fecha && t.fecha < hoy) {
      const dias = diasDesde(t.fecha);
      alertasDyn.push({
        tipo: dias > 7 ? 'urgente' : 'aviso',
        titulo: `Turno sin realizar hace ${dias} día${dias !== 1 ? 's' : ''} — ${t.cliente}`,
        texto: `Programado para ${t.fecha} (${t.duracion}). Marcá realizado o reprogramá.`,
      });
    }
  }

  // ── Deudas pendientes de clientes ──────────────────────────
  for (const d of j2.deudasClientes.filter((x) => x.estado === 'pendiente')) {
    const dias = diasDesde(d.fecha);
    alertasDyn.push({
      tipo: dias > 14 ? 'urgente' : 'aviso',
      titulo: `${dias > 14 ? '💰' : '🟡'} Deuda pendiente — ${d.nombreCliente} · ${money(d.monto)}`,
      texto: `${d.concepto} · hace ${dias} día${dias !== 1 ? 's' : ''}`,
    });
  }

  // ── Lista de espera sin fecha ──────────────────────────────
  for (const e of j2.listaEspera) {
    const dias = diasDesde(e.fechaAgregado);
    if (dias > 7) {
      alertasDyn.push({
        tipo: dias > 20 ? 'urgente' : 'aviso',
        titulo: `Lista de espera — ${e.nombreCliente} (${dias} días sin fecha)`,
        texto: [e.trabajo, e.notas].filter(Boolean).join(' · ') || 'Sin notas',
      });
    }
  }

  async function ejecutarSeedServidor() {
    const secret = seedSecret.trim();
    if (!secret) return;
    setConfirmando(null);
    setSeedSecret('');
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
        <button type="button" className="btn secundario" style={{ marginTop: 12 }} disabled={seedBusy} onClick={() => setConfirmando('seed')}>
          {seedBusy ? '…' : 'Cargar datos iniciales (seed)'}
        </button>
      </div>
    );
  if (!data?.settings)
    return (
      <div style={{ padding: 24 }}>
        <p>Sin configuración en el servidor.</p>
        <button type="button" className="btn" style={{ marginTop: 12 }} disabled={seedBusy} onClick={() => setConfirmando('seed')}>
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

  // Ingresos y resultado del mes — 100% local
  const ingresosMesLocal = j2.ingresos
    .filter((i) => i.fecha.startsWith(mc))
    .reduce((s, i) => s + i.monto, 0);
  const totalEgresosMes = totalFijos + totalVarios;
  const resultadoMes = ingresosMesLocal - totalEgresosMes;
  const mesNombre = new Date(mc + '-02').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const mesLabel = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);

  function ingresosLocalesDeMes(mesNombreEs: string, anio: number) {
    const num = MESES_NUM[mesNombreEs.toLowerCase()];
    if (!num) return null;
    const clave = `${anio}-${num}`;
    return j2.ingresos.filter((i) => i.fecha.startsWith(clave)).reduce((s, i) => s + i.monto, 0);
  }

  async function iniciarNuevoPeriodo() {
    const mesActualRaw = new Date(mc + '-02').toLocaleDateString('es-AR', { month: 'long' });
    const mesActual = mesActualRaw.charAt(0).toUpperCase() + mesActualRaw.slice(1);
    const anioActual = parseInt(mc.split('-')[0], 10);

    setConfirmando(null);
    setResetBusy(true);
    try {
      // 1. Limpiar arrays locales (conserva cuentas, empleados, inversiones)
      j2.resetLocalData();

      // 2. Actualizar tabla histórica: marcar mes anterior como cerrado y agregar el nuevo
      const historialCerrado = (s.mesesHistoricos ?? []).map((m) =>
        m.estado === 'En curso' ? { ...m, estado: 'Cerrado' } : m
      );
      const nuevoMesEntry = { mes: mesActual, anio: anioActual, ingresos: 0, egresos: 0, estado: 'En curso' };
      const yaExiste = historialCerrado.some((m) => m.mes === mesActual && m.anio === anioActual);
      await sendJson('/api/settings', 'PUT', {
        ...s,
        mesesHistoricos: yaExiste ? historialCerrado : [...historialCerrado, nuevoMesEntry],
      });

      await qc.invalidateQueries({ queryKey: ['resumen'] });
      toast(`✓ Nuevo período iniciado — ${mesActual} ${anioActual}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setResetBusy(false);
    }
  }

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
            Ingresos {money(ingresosMesLocal)} · Egresos {money(totalEgresosMes)}
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
      {alertasDyn.length === 0 ? (
        <div className="alerta ok">
          <div>✅</div>
          <div><strong>Todo al día</strong> — Sin turnos vencidos, deudas ni pendientes en lista de espera.</div>
        </div>
      ) : (
        alertasDyn.map((a, i) => (
          <div key={i} className={`alerta ${a.tipo}`}>
            <div>{a.tipo === 'urgente' ? '🔴' : '🟡'}</div>
            <div>
              <strong style={{ display: 'block', marginBottom: 4 }}>{a.titulo}</strong>
              {a.texto}
            </div>
          </div>
        ))
      )}

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
              {meses.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#aaa', padding: 16 }}>
                    Sin historial — empezá a cargar datos este mes
                  </td>
                </tr>
              ) : (
                meses.map((m, idx) => {
                  const isLast = idx === meses.length - 1;
                  const ingLocal = ingresosLocalesDeMes(m.mes, m.anio);
                  const ing = ingLocal !== null && ingLocal > 0
                    ? ingLocal
                    : (isLast && m.estado?.toLowerCase().includes('curso') ? data.ingresosMes : m.ingresos);
                  const egLocal = egresosLocalesDeMes(m.mes, m.anio);
                  const eg = (egLocal !== null && egLocal > 0) ? egLocal : m.egresos;
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Control interno: descuadre de caja */}
      {Object.keys(j2.descuadre).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>⚠ Control interno — Descuadre detectado</div>
          <div className="alerta urgente" style={{ display: 'block' }}>
            <p style={{ marginBottom: 8, fontSize: 13 }}>
              El saldo registrado en las cuentas no coincide con lo que suma el libro de movimientos.
              Puede haber un ingreso o egreso cargado fuera del sistema.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {Object.entries(j2.descuadre).map(([cuenta, dif]) => {
                const nombreCuenta: Record<string, string> = { mp: 'Mercado Pago', banco: 'Banco', efectivo: 'Efectivo' };
                return (
                  <div key={cuenta} style={{ fontFamily: 'DM Mono,monospace', fontSize: 13 }}>
                    <strong>{nombreCuenta[cuenta] ?? cuenta}:</strong>{' '}
                    <span style={{ color: dif > 0 ? '#2e7d32' : 'var(--rojo)' }}>
                      {dif > 0 ? '+' : ''}{money(dif)}
                    </span>
                    {' '}(el saldo supera al libro)
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: '1px solid rgba(26,46,26,0.1)',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {esAdmin && (
          <button
            type="button"
            className="btn secundario"
            disabled={resetBusy}
            onClick={() => setConfirmando('periodo')}
          >
            {resetBusy ? '…' : '🔄 Iniciar nuevo período'}
          </button>
        )}
        {puede('ajustes') && (
          <button
            type="button"
            className="btn fantasma sm"
            disabled={seedBusy}
            onClick={() => setConfirmando('seed')}
          >
            {seedBusy ? '…' : 'Reiniciar datos demo en el servidor'}
          </button>
        )}
      </div>

      {confirmando === 'periodo' && (
        <ConfirmarDialogo
          titulo="Iniciar nuevo período"
          peligro
          textoConfirmar="Iniciar período"
          mensaje={
            <>
              <p style={{ marginBottom: 'var(--sp-3)' }}>
                Se vacían ingresos, egresos, movimientos, deudas por cobrar, transferencias y la
                lista de espera.
              </p>
              <p style={{ marginBottom: 'var(--sp-3)' }}>
                Se conservan los saldos de cuentas ({money(cajaLiquidaTotal)}), empleados,
                inversiones y todo lo que vive en el servidor: clientes, agenda y prospectos.
              </p>
              <p>
                Antes de confirmar, conviene exportar los movimientos del período desde la pantalla
                Movimientos.
              </p>
            </>
          }
          onConfirmar={() => void iniciarNuevoPeriodo()}
          onCerrar={() => setConfirmando(null)}
        />
      )}

      {confirmando === 'seed' && (
        <Dialogo titulo="Reiniciar datos demo" onCerrar={() => setConfirmando(null)}>
          <div className="alerta urgente">
            <span aria-hidden="true">⚠️</span>
            <span>
              Se borran del servidor los clientes, proveedores y ajustes globales, y se vuelven a
              cargar los datos de ejemplo. No se puede deshacer.
            </span>
          </div>
          <div className="form-group">
            <label htmlFor="seed-secret">ADMIN_SEED_SECRET</label>
            <input
              id="seed-secret"
              type="password"
              autoComplete="off"
              value={seedSecret}
              onChange={(e) => setSeedSecret(e.target.value)}
            />
            <p className="form-ayuda">Es la variable configurada en el backend.</p>
          </div>
          <div className="dialogo-acciones">
            <button type="button" className="btn secundario" onClick={() => setConfirmando(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn peligro"
              disabled={!seedSecret.trim() || seedBusy}
              onClick={() => void ejecutarSeedServidor()}
            >
              Reiniciar datos
            </button>
          </div>
        </Dialogo>
      )}
    </>
  );
}
