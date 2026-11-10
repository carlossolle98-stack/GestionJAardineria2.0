import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import { NOMBRES_MES } from '@/lib/historial';
import { horasTexto, sumarDias, type Jornada } from '@/lib/jornadas';
import { porEquipo, porHoraHombre, porMes, porSemana, ultimasSemanas, type Periodo } from '@/lib/rendimiento';
import { horasAgendadas } from '@/components/Equipos';
import type { Cliente, Turno } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useAuth } from '@/context/AuthContext';

const num = { textAlign: 'right' as const, fontFamily: 'var(--fuente-mono)', whiteSpace: 'nowrap' as const };

function ultimosMeses(hoy: string, n: number) {
  const [y, m] = hoy.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

function etiquetaSemana(lunes: string) {
  const fin = sumarDias(lunes, 6);
  return `${Number(lunes.slice(8))}/${Number(lunes.slice(5, 7))} al ${Number(fin.slice(8))}/${Number(fin.slice(5, 7))}`;
}

function etiquetaMes(clave: string) {
  return `${NOMBRES_MES[Number(clave.slice(5)) - 1]} ${clave.slice(0, 4)}`;
}

/**
 * Horas de cada uno contra lo que se levantó (trabajo cobrado + trabajo dejado
 * a cobrar), por semana y por mes.
 */
export function RendimientoEquipo() {
  const j2 = useJ2Local();
  const { puede, esAdmin } = useAuth();
  const hoy = todayISO();
  const [cantSemanas, setCantSemanas] = useState(8);
  const semanas = useMemo(() => ultimasSemanas(hoy, cantSemanas), [hoy, cantSemanas]);
  const meses = useMemo(() => ultimosMeses(hoy, 6), [hoy]);
  const desde = semanas[0] < `${meses[0]}-01` ? semanas[0] : `${meses[0]}-01`;

  const verHoras = esAdmin || puede('empleados');
  const { data: jornadas = [], isError: sinHoras } = useQuery({
    queryKey: ['jornadas', desde, hoy],
    queryFn: () => getJson<Jornada[]>(`/api/jornadas?desde=${desde}&hasta=${hoy}`),
    enabled: verHoras,
    retry: false,
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
    enabled: puede('clientes'),
  });

  const [mesEquipo, setMesEquipo] = useState(hoy.slice(0, 7));
  const { data: turnos = [] } = useQuery({
    queryKey: ['turnos', `${meses[0]}-01`, hoy],
    queryFn: () => getJson<Turno[]>(`/api/turnos?desde=${meses[0]}-01&hasta=${hoy}`),
    enabled: puede('agenda'),
  });

  const datos = useMemo(
    () => ({
      jornadas,
      ingresos: j2.ingresos,
      deudas: j2.deudasClientes,
      egresos: j2.egresos,
      pagosClientes: clientes.flatMap((c) => (c.pagos ?? []).map((p) => ({ fecha: p.fecha, monto: p.monto, horas: Number(p.horas) || 0 }))),
    }),
    [jornadas, j2.ingresos, j2.deudasClientes, j2.egresos, clientes]
  );
  const filasSemana = useMemo(() => porSemana(datos, semanas), [datos, semanas]);
  const filasMes = useMemo(() => porMes(datos, meses), [datos, meses]);
  const filasEquipo = useMemo(
    () => porEquipo({ ingresos: j2.ingresos, deudas: j2.deudasClientes }, turnos, mesEquipo, horasAgendadas),
    [j2.ingresos, j2.deudasClientes, turnos, mesEquipo]
  );
  const personas = useMemo(() => {
    const s = new Set<string>();
    for (const p of [...filasSemana, ...filasMes]) for (const n of p.minutosPorPersona.keys()) s.add(n);
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
  }, [filasSemana, filasMes]);

  const celdasPersonas = (p: Periodo) =>
    personas.map((n) => <td key={n} style={num}>{p.minutosPorPersona.get(n) ? horasTexto(p.minutosPorPersona.get(n)!) : '—'}</td>);
  const porHora = (p: Periodo) => {
    const v = porHoraHombre(p);
    return v === null ? '—' : money(Math.round(v));
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-header">
        <div className="section-title">
          Equipo: horas y lo que se levantó <small>Control semanal y mensual</small>
        </div>
        <select className="campo" aria-label="Semanas a mostrar" value={cantSemanas} onChange={(e) => setCantSemanas(Number(e.target.value))}>
          <option value={4}>Últimas 4 semanas</option>
          <option value={8}>Últimas 8 semanas</option>
          <option value={12}>Últimas 12 semanas</option>
        </select>
      </div>

      <p className="form-ayuda" style={{ maxWidth: '75ch', marginBottom: 12 }}>
        <strong>Levantado</strong> = cobros de trabajos de esa semana + deudas de clientes cargadas esa semana. Cada trabajo
        cuenta una sola vez, en la semana en que se hizo: el cobro posterior de una deuda no se vuelve a sumar. No incluye
        ventas del vivero, comisiones ni rendimientos. <strong>Horas cobradas</strong> son las que se cargan al registrar el
        cobro; <strong>horas trabajadas</strong>, las que marca cada uno en Horas.
      </p>

      {!verHoras && <div className="alerta info">Las horas de cada persona las ve quien tiene el permiso de Empleados.</div>}
      {verHoras && sinHoras && (
        <div className="alerta aviso">No se pudieron leer las horas marcadas (si recién se agregó, falta publicar el servidor). Se muestra lo levantado igual.</div>
      )}

      <div className="tabla-wrap" style={{ marginBottom: 16 }}>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Semana</th>
                {personas.map((n) => <th key={n} style={num}>{n}</th>)}
                <th style={num}>Horas equipo</th>
                <th style={num}>Horas cobradas</th>
                <th style={num}>Cobrado</th>
                <th style={num}>A cobrar</th>
                <th style={num}>Levantado</th>
                <th style={num}>Por hora trabajada</th>
              </tr>
            </thead>
            <tbody>
              {[...filasSemana].reverse().map((p) => (
                <tr key={p.clave}>
                  <td style={{ whiteSpace: 'nowrap' }}>{etiquetaSemana(p.clave)}</td>
                  {celdasPersonas(p)}
                  <td style={{ ...num, fontWeight: 600 }}>{p.minutos ? horasTexto(p.minutos) : '—'}</td>
                  <td style={num}>{p.horasCobradas ? `${Math.round(p.horasCobradas * 10) / 10} h` : '—'}</td>
                  <td style={num}>{money(Math.round(p.cobrado))}</td>
                  <td style={num}>{p.aCobrar ? money(Math.round(p.aCobrar)) : '—'}</td>
                  <td style={{ ...num, fontWeight: 700 }}>{money(Math.round(p.levantado))}</td>
                  <td style={num}>{porHora(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                {personas.map((n) => <th key={n} style={num}>{n}</th>)}
                <th style={num}>Horas equipo</th>
                <th style={num}>Levantado</th>
                <th style={num}>Por hora trabajada</th>
                <th style={num}>Sueldos pagados</th>
                <th style={num}>Levantado − sueldos</th>
              </tr>
            </thead>
            <tbody>
              {[...filasMes].reverse().map((p) => (
                <tr key={p.clave}>
                  <td style={{ whiteSpace: 'nowrap' }}>{etiquetaMes(p.clave)}</td>
                  {celdasPersonas(p)}
                  <td style={{ ...num, fontWeight: 600 }}>{p.minutos ? horasTexto(p.minutos) : '—'}</td>
                  <td style={{ ...num, fontWeight: 700 }}>{money(Math.round(p.levantado))}</td>
                  <td style={num}>{porHora(p)}</td>
                  <td style={num}>{p.costoPersonal ? money(Math.round(p.costoPersonal)) : '—'}</td>
                  <td style={{ ...num, color: p.levantado - p.costoPersonal < 0 ? 'var(--rojo)' : undefined }}>
                    {money(Math.round(p.levantado - p.costoPersonal))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {puede('agenda') && (
        <>
          <div className="section-header" style={{ marginTop: 20 }}>
            <div className="section-title">Por equipo</div>
            <select className="campo" aria-label="Mes de los equipos" value={mesEquipo} onChange={(e) => setMesEquipo(e.target.value)}>
              {[...meses].reverse().map((m) => <option key={m} value={m}>{etiquetaMes(m)}</option>)}
            </select>
          </div>
          <p className="form-ayuda" style={{ maxWidth: '75ch', marginBottom: 12 }}>
            Cada cobro o deuda va al equipo que hizo el turno de ese cliente ese día (o hasta 3 días antes). Las horas reales son
            las que se cargan al marcar el turno como hecho.
          </p>
          {filasEquipo.length === 0 ? (
            <p style={{ color: 'var(--texto-2)' }}>Sin turnos hechos en {etiquetaMes(mesEquipo)}.</p>
          ) : (
            <div className="tabla-wrap">
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Equipo</th>
                      <th style={num}>Turnos hechos</th>
                      <th style={num}>Horas agendadas</th>
                      <th style={num}>Horas reales</th>
                      <th style={num}>Levantado</th>
                      <th style={num}>Por hora real</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasEquipo.map((f) => (
                      <tr key={f.equipo}>
                        <td><strong>{f.equipo}</strong></td>
                        <td style={num}>{f.turnos}</td>
                        <td style={num}>{f.horasAgendadas ? `${String(f.horasAgendadas).replace('.', ',')} h` : '—'}</td>
                        <td style={{ ...num, color: f.horasReales > f.horasAgendadas ? 'var(--rojo)' : undefined }}>
                          {f.horasReales ? `${String(Math.round(f.horasReales * 100) / 100).replace('.', ',')} h` : '—'}
                        </td>
                        <td style={{ ...num, fontWeight: 700 }}>{money(Math.round(f.levantado))}</td>
                        <td style={num}>{f.horasReales ? money(Math.round(f.levantado / f.horasReales)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
