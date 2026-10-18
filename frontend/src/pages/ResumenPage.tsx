import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ModalImportarHistorial } from '@/components/ImportarHistorial';
import { getJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import { diasDesde, mesClaveRef } from '@/lib/j2local';
import { useJ2Local } from '@/context/J2LocalContext';
import { useAuth } from '@/context/AuthContext';
import { ErrorCarga } from '@/components/Estados';
import { totalBienesDeUso } from '@/lib/activos';
import type { Activo, ResumenPayload, Turno } from '@/types';

export function ResumenPage() {
  const { puede } = useAuth();
  const [verTodo, setVerTodo] = useState(false);
  const [importando, setImportando] = useState(false);
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
  const totalUSD = inv.usd.cantidad * inv.usd.precio;
  const invActivas = inv.items.filter((i) => i.activa || i.saldo !== 0);
  const totalInv = invActivas.reduce((s, i) => s + i.saldo, 0) + totalUSD;
  const deudaCreditos = inv.creditos.filter((x) => !x.anulado).reduce((s, x) => s + x.saldo, 0);
  const deudaAguinaldos = j2.empleados
    .filter((e) => e.modalidad === 'sinDescuentos')
    .reduce((s, e) => s + Math.max(0, e.aguinaldoDevengado || 0), 0);

  // Del servidor sólo sale el historial viejo de meses: si falla, el resto del resumen sigue funcionando.
  const { data, error, refetch } = useQuery({
    queryKey: ['resumen'],
    queryFn: () => getJson<ResumenPayload>('/api/resumen'),
  });

  const { data: turnos = [] } = useQuery({
    queryKey: ['turnos-all'],
    queryFn: () => getJson<Turno[]>('/api/turnos'),
  });

  // Los bienes de uso suman al patrimonio; si no se pueden leer, el balance lo aclara.
  const { data: activosFijos, isError: sinActivos } = useQuery({
    queryKey: ['activos'],
    queryFn: () => getJson<Activo[]>('/api/activos'),
    enabled: puede('finanzas'),
    retry: false,
  });
  const totalBienes = totalBienesDeUso(activosFijos ?? []);

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

  const cajaLiquidaTotal = (j2.cuentas.mp || 0) + (j2.cuentas.banco || 0) + (j2.cuentas.efectivo || 0);
  const subCaja = `MP ${money(j2.cuentas.mp || 0)} · Banco ${money(j2.cuentas.banco || 0)} · Efectivo ${money(j2.cuentas.efectivo || 0)}`;
  const deudaPendientes = j2.deudasClientes.filter((d) => d.estado === 'pendiente');
  const totalDeudaPendiente = deudaPendientes.reduce((sum, d) => sum + d.monto, 0);
  const subDeuda =
    deudaPendientes.length > 0
      ? deudaPendientes.map((d) => `${d.nombreCliente.split(' ')[0]} ${money(d.monto)}`).join(' · ')
      : 'Sin deudas pendientes';
  const totalActivos = cajaLiquidaTotal + totalInv + totalDeudaPendiente + totalBienes;
  const totalDeudas = deudaCreditos + deudaAguinaldos;
  const patrimonioTotal = totalActivos - totalDeudas;
  const meses = armarMeses();

  // Ingresos y resultado del mes — 100% local
  const ingresosMesLocal = j2.ingresos
    .filter((i) => i.fecha.startsWith(mc))
    .reduce((s, i) => s + i.monto, 0);
  const totalEgresosMes = totalFijos + totalVarios;
  const resultadoMes = ingresosMesLocal - totalEgresosMes;
  const mesNombre = new Date(mc + '-02').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const mesLabel = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);

  /**
   * Últimos 12 meses armados con los datos de la app. Para meses sin datos
   * cargados acá (anteriores a la app) se usa el total guardado en el servidor.
   * Ningún botón hace falta para pasar de mes: el actual está en curso y los demás cerrados.
   */
  function armarMeses() {
    const NUM: Record<string, string> = {
      enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
      julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
    };
    const totales = new Map<string, { ingresos: number; egresos: number }>();
    for (const m of data?.settings?.mesesHistoricos ?? []) {
      const num = NUM[m.mes.toLowerCase()];
      if (num) totales.set(`${m.anio}-${num}`, { ingresos: m.ingresos || 0, egresos: m.egresos || 0 });
    }
    const locales = new Map<string, { ingresos: number; egresos: number }>();
    for (const i of j2.ingresos) {
      const k = i.fecha.slice(0, 7);
      locales.set(k, { ingresos: (locales.get(k)?.ingresos || 0) + i.monto, egresos: locales.get(k)?.egresos || 0 });
    }
    for (const e of j2.egresos) {
      const k = e.fecha.slice(0, 7);
      locales.set(k, { ingresos: locales.get(k)?.ingresos || 0, egresos: (locales.get(k)?.egresos || 0) + e.monto });
    }
    // Un mes cerrado que vino de la planilla manda: lo cargado en la app para ese
    // mes puede estar incompleto (se empezó a usar a mitad de camino).
    for (const [k, v] of locales) {
      if (k !== mc && totales.has(k)) continue;
      totales.set(k, v);
    }
    if (!totales.has(mc)) totales.set(mc, { ingresos: 0, egresos: 0 });
    return [...totales.entries()]
      .filter(([k]) => k <= mc)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, verTodo ? undefined : 12)
      .map(([clave, v]) => {
        const nombre = new Date(clave + '-02T12:00:00').toLocaleDateString('es-AR', { month: 'long' });
        return {
          clave,
          mes: nombre.charAt(0).toUpperCase() + nombre.slice(1),
          anio: Number(clave.slice(0, 4)),
          ...v,
          enCurso: clave === mc,
        };
      });
  }

  return (
    <>
      {error && (
        <ErrorCarga
          mensaje="No se pudo leer el historial de meses anteriores del servidor. Los números de este mes están completos."
          onReintentar={() => void refetch()}
        />
      )}
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
            {[...invActivas.map((i) => `${i.nombre} ${money(i.saldo)}`), `USD ${money(totalUSD)}`].join(' · ')}
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
          <div className="card-label">Patrimonio neto</div>
          <div className="card-valor">{money(patrimonioTotal)}</div>
          <div className="card-sub">
            Tiene {money(Math.round(totalActivos))} · Debe {money(totalDeudas)}
          </div>
        </div>
      </div>

      <div className="tabla-wrap" style={{ marginBottom: 'var(--sp-7)' }}>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Lo que tiene la empresa</th><th style={{ textAlign: 'right' }}>Monto</th></tr>
            </thead>
            <tbody>
              <tr><td>Caja (Mercado Pago, banco y efectivo)</td><td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)' }}>{money(cajaLiquidaTotal)}</td></tr>
              <tr><td>Inversiones y dólares</td><td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)' }}>{money(totalInv)}</td></tr>
              <tr><td>Cuentas por cobrar</td><td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)' }}>{money(totalDeudaPendiente)}</td></tr>
              <tr>
                <td>
                  Bienes de uso (valor libro)
                  {sinActivos && <span style={{ fontSize: 12, color: 'var(--texto-3)' }}> · no se pudieron leer, no están sumados</span>}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)' }}>{money(Math.round(totalBienes))}</td>
              </tr>
              <tr style={{ fontWeight: 700 }}><td>Total activos</td><td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)' }}>{money(Math.round(totalActivos))}</td></tr>
              <tr><td>Menos: deuda por créditos</td><td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)', color: 'var(--rojo)' }}>−{money(deudaCreditos)}</td></tr>
              {deudaAguinaldos > 0 && (
                <tr><td>Menos: aguinaldos a pagar</td><td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)', color: 'var(--rojo)' }}>−{money(deudaAguinaldos)}</td></tr>
              )}
              <tr style={{ fontWeight: 700 }}><td>Patrimonio neto</td><td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)' }}>{money(Math.round(patrimonioTotal))}</td></tr>
            </tbody>
          </table>
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
        <div className="section-title">📈 {verTodo ? 'Historial de meses' : 'Últimos meses'}</div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <button type="button" className="btn secundario sm" onClick={() => setVerTodo((v) => !v)}>
            {verTodo ? 'Ver últimos 12' : 'Ver todo el historial'}
          </button>
          {puede('ajustes') && (
            <button type="button" className="btn secundario sm" onClick={() => setImportando(true)}>
              Importar historial
            </button>
          )}
        </div>
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
              {meses.map((m) => {
                const res = m.ingresos - m.egresos;
                return (
                  <tr key={m.clave} className={m.enCurso ? 'prioridad-alta' : undefined}>
                    <td><strong>{m.mes}</strong></td>
                    <td>{m.anio}</td>
                    <td style={m.ingresos === 0 && m.enCurso ? { color: 'var(--rojo)' } : undefined}>
                      {m.ingresos === 0 && m.enCurso ? `${money(0)} (sin cargar)` : money(m.ingresos)}
                    </td>
                    <td>{money(m.egresos)}</td>
                    <td style={{ color: res >= 0 ? 'var(--verde-vivo)' : 'var(--rojo)', fontWeight: 600 }}>
                      {res >= 0 ? '+' : ''}{money(res)}
                    </td>
                    <td>
                      <span className={`badge ${m.enCurso ? 'pendiente' : 'ok'}`}>
                        {m.enCurso ? 'En curso' : '✓ Cerrado'}
                      </span>
                    </td>
                  </tr>
                );
              })}
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
                    {' '}({dif > 0 ? 'el saldo supera al libro' : 'el libro supera al saldo'})
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {importando && (
        <ModalImportarHistorial actuales={data?.settings?.mesesHistoricos ?? []} onCerrar={() => setImportando(false)} />
      )}
    </>
  );
}
