import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import { valorStock } from '@/lib/inventario';
import { NOMBRES_MES } from '@/lib/historial';
import {
  estadoDeResultados,
  generarLibros,
  mayor,
  situacionPatrimonial,
  sumasYSaldos,
  type FilaInforme,
} from '@/lib/contabilidad';
import type { J2Datos } from '@/lib/j2reducer';
import type { Activo, ItemInventario } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useAuth } from '@/context/AuthContext';
import { Vacio } from '@/components/Estados';

type Vista = 'balance' | 'resultados' | 'diario' | 'mayor' | 'sumas' | 'ajustes';

const VISTAS: { id: Vista; label: string }[] = [
  { id: 'balance', label: 'Situación patrimonial' },
  { id: 'resultados', label: 'Estado de resultados' },
  { id: 'diario', label: 'Libro diario' },
  { id: 'mayor', label: 'Mayor' },
  { id: 'sumas', label: 'Sumas y saldos' },
  { id: 'ajustes', label: 'Sin justificar' },
];

const num = { textAlign: 'right' as const, fontFamily: 'var(--fuente-mono)', whiteSpace: 'nowrap' as const };

function importe(n: number) {
  return n < 0 ? `−${money(Math.round(-n))}` : money(Math.round(n));
}

function finDeMes(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;
}

export function ContabilidadPage() {
  const j2 = useJ2Local();
  const { puede } = useAuth();
  const hoy = todayISO();
  const [vista, setVista] = useState<Vista>('balance');
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  /** 0 = todo el ejercicio. */
  const [mes, setMes] = useState(Number(hoy.slice(5, 7)));
  const [cuentaMayor, setCuentaMayor] = useState('1.1.3');

  const { data: inventario, isError: sinInventario } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => getJson<ItemInventario[]>('/api/inventario'),
    enabled: puede('inventario'),
    retry: false,
  });
  const { data: activos, isError: sinActivos } = useQuery({
    queryKey: ['activos'],
    queryFn: () => getJson<Activo[]>('/api/activos'),
    retry: false,
  });

  const libros = useMemo(() => {
    // El contexto entrega los anulados aparte: para los libros van todos, con su contraasiento.
    const datos: J2Datos = {
      cuentas: j2.cuentas,
      inversiones: j2.inversiones,
      egresos: [...j2.egresos, ...j2.egresosAnulados],
      ingresos: [...j2.ingresos, ...j2.ingresosAnulados],
      transferencias: j2.transferencias,
      empleados: j2.empleados,
      deudasClientes: j2.deudasClientes,
      listaEspera: j2.listaEspera,
      movlog: j2.movlog,
    };
    return generarLibros(datos, {
      hoy,
      mercaderia: inventario ? valorStock(inventario) : undefined,
      activos: activos ?? undefined,
    });
  }, [j2, inventario, activos, hoy]);

  const desde = mes ? `${anio}-${String(mes).padStart(2, '0')}-01` : `${anio}-01-01`;
  const hasta = mes ? finDeMes(anio, mes) : `${anio}-12-31`;
  const etiquetaPeriodo = mes ? `${NOMBRES_MES[mes - 1]} ${anio}` : `Ejercicio ${anio}`;

  const anios = useMemo(() => {
    const desdeAnio = Number((libros.asientos[0]?.fecha ?? hoy).slice(0, 4));
    const lista: number[] = [];
    for (let a = Number(hoy.slice(0, 4)); a >= desdeAnio; a--) lista.push(a);
    return lista;
  }, [libros, hoy]);

  const sp = useMemo(() => situacionPatrimonial(libros, hasta), [libros, hasta]);
  const er = useMemo(() => estadoDeResultados(libros, desde, hasta), [libros, desde, hasta]);
  const sumas = useMemo(() => sumasYSaldos(libros, desde, hasta), [libros, desde, hasta]);
  const diario = useMemo(() => libros.asientos.filter((a) => a.fecha >= desde && a.fecha <= hasta), [libros, desde, hasta]);
  const cuentasConMovimiento = useMemo(
    () => [...new Set(libros.asientos.flatMap((a) => a.lineas.map((l) => l.cuenta)))].sort(),
    [libros]
  );
  const mov = useMemo(() => mayor(libros, cuentaMayor, desde, hasta), [libros, cuentaMayor, desde, hasta]);
  const nombre = (c: string) => libros.plan.get(c)?.nombre ?? c;
  const totalSinJustificar = libros.diferencias.reduce((t, d) => t + d.diferencia, 0);

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Contabilidad <small>Partida doble · ejercicio al 31 de diciembre</small>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <select id="cont-anio" aria-label="Año" className="campo" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <select id="cont-mes" aria-label="Mes" className="campo" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              <option value={0}>Todo el ejercicio</option>
              {NOMBRES_MES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="alerta info">
        <span aria-hidden="true">📒</span>
        <span>
          Los asientos salen de lo que ya cargás en la app; no hay que cargar nada dos veces. Todo se ordena por la
          fecha de cada operación: si registrás algo de diciembre en enero, cae en diciembre y en su ejercicio.
          {(sinInventario || sinActivos) && ' No se pudo leer Inventario o Activos: esas cuentas no están completas.'}
        </span>
      </div>

      {sp.diferencia !== 0 && (
        <div className="alerta urgente" role="alert">El balance no cierra por {importe(sp.diferencia)}. Avisale a quien mantiene la app.</div>
      )}

      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Activo al {hasta.split('-').reverse().join('/')}</div>
          <div className="card-valor">{importe(sp.totalActivo)}</div>
          <div className="card-sub">Lo que tiene la empresa</div>
        </div>
        <div className="card rojo">
          <div className="card-label">Pasivo</div>
          <div className="card-valor">{importe(sp.totalPasivo)}</div>
          <div className="card-sub">Lo que debe</div>
        </div>
        <div className="card azul">
          <div className="card-label">Patrimonio neto</div>
          <div className="card-valor">{importe(sp.totalPatrimonio)}</div>
          <div className="card-sub">Activo − Pasivo</div>
        </div>
        <div className={`card ${er.resultado < 0 ? 'rojo' : 'amarillo'}`}>
          <div className="card-label">Resultado · {etiquetaPeriodo}</div>
          <div className="card-valor">{importe(er.resultado)}</div>
          <div className="card-sub">Ingresos {money(Math.round(er.totalIngresos))} · Gastos {money(Math.round(er.totalGastos))}</div>
        </div>
      </div>

      <div role="tablist" aria-label="Informes contables" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={vista === v.id}
            className={`btn sm ${vista === v.id ? '' : 'secundario'}`}
            onClick={() => setVista(v.id)}
          >
            {v.label}
            {v.id === 'ajustes' && libros.diferencias.length > 0 && ` (${libros.diferencias.length})`}
          </button>
        ))}
      </div>

      {vista === 'balance' && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <Informe titulo="Activo" filas={sp.activo} total={sp.totalActivo} />
          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <Informe titulo="Pasivo" filas={sp.pasivo} total={sp.totalPasivo} />
            <Informe titulo="Patrimonio neto" filas={sp.patrimonio} total={sp.totalPatrimonio} />
          </div>
        </div>
      )}

      {vista === 'resultados' && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <Informe titulo={`Ingresos · ${etiquetaPeriodo}`} filas={er.ingresos} total={er.totalIngresos} />
          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <Informe titulo="Costos y gastos" filas={er.gastos} total={er.totalGastos} />
            <div className="tabla-wrap" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>{er.resultado >= 0 ? 'Ganancia' : 'Pérdida'} del período</span>
              <span style={{ ...num, color: er.resultado < 0 ? 'var(--rojo)' : 'var(--verde-vivo)' }}>{importe(er.resultado)}</span>
            </div>
          </div>
        </div>
      )}

      {vista === 'diario' && (
        diario.length === 0 ? (
          <Vacio icono="📒" titulo={`Sin asientos en ${etiquetaPeriodo}`} />
        ) : (
          <div className="tabla-wrap">
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr><th>Fecha</th><th>Cuenta</th><th style={num}>Debe</th><th style={num}>Haber</th></tr>
                </thead>
                <tbody>
                  {diario.map((a) => (
                    <Fragment key={a.id}>
                      <tr style={{ background: 'var(--fondo)' }}>
                        <td style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{a.fecha}</td>
                        <td colSpan={3} style={{ fontWeight: 600 }}>{a.concepto}</td>
                      </tr>
                      {a.lineas.map((l, i) => (
                        <tr key={`${a.id}-${i}`}>
                          <td />
                          <td style={{ paddingLeft: l.haber ? 32 : 12, color: 'var(--texto-2)' }}>
                            <span style={{ fontFamily: 'var(--fuente-mono)', fontSize: 11, marginRight: 6 }}>{l.cuenta.startsWith('1.2.') ? '1.2' : l.cuenta}</span>
                            {nombre(l.cuenta)}
                          </td>
                          <td style={num}>{l.debe ? money(Math.round(l.debe)) : ''}</td>
                          <td style={num}>{l.haber ? money(Math.round(l.haber)) : ''}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {vista === 'mayor' && (
        <>
          <div className="form-group" style={{ maxWidth: 420, marginBottom: 12 }}>
            <label htmlFor="cont-cuenta">Cuenta</label>
            <select id="cont-cuenta" value={cuentaMayor} onChange={(e) => setCuentaMayor(e.target.value)}>
              {cuentasConMovimiento.map((c) => <option key={c} value={c}>{c.startsWith('1.2.') ? '1.2' : c} · {nombre(c)}</option>)}
            </select>
          </div>
          <div className="tabla-wrap">
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr><th>Fecha</th><th>Concepto</th><th style={num}>Debe</th><th style={num}>Haber</th><th style={num}>Saldo</th></tr>
                </thead>
                <tbody>
                  <tr style={{ background: 'var(--fondo)' }}>
                    <td colSpan={4}>Saldo al empezar el período</td>
                    <td style={num}>{importe(mov.saldoInicial)}</td>
                  </tr>
                  {mov.movimientos.map((m, i) => (
                    <tr key={`${m.asientoId}-${i}`}>
                      <td style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{m.fecha}</td>
                      <td>{m.concepto}</td>
                      <td style={num}>{m.debe ? money(Math.round(m.debe)) : ''}</td>
                      <td style={num}>{m.haber ? money(Math.round(m.haber)) : ''}</td>
                      <td style={num}>{importe(m.saldo)}</td>
                    </tr>
                  ))}
                  {mov.movimientos.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--texto-2)' }}>Sin movimientos en {etiquetaPeriodo}.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {vista === 'sumas' && (
        <div className="tabla-wrap">
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Cuenta</th><th style={num}>Debe</th><th style={num}>Haber</th><th style={num}>Saldo</th></tr>
              </thead>
              <tbody>
                {sumas.map((f) => (
                  <tr key={f.cuenta.codigo}>
                    <td>
                      <span style={{ fontFamily: 'var(--fuente-mono)', fontSize: 11, marginRight: 6, color: 'var(--texto-2)' }}>
                        {f.cuenta.codigo.startsWith('1.2.') ? '1.2' : f.cuenta.codigo}
                      </span>
                      {f.cuenta.nombre}
                    </td>
                    <td style={num}>{money(Math.round(f.debe))}</td>
                    <td style={num}>{money(Math.round(f.haber))}</td>
                    <td style={num}>{importe(f.saldo)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td>Totales</td>
                  <td style={num}>{money(Math.round(sumas.reduce((t, f) => t + f.debe, 0)))}</td>
                  <td style={num}>{money(Math.round(sumas.reduce((t, f) => t + f.haber, 0)))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vista === 'ajustes' && (
        <>
          <p style={{ maxWidth: '68ch', color: 'var(--texto-2)', marginBottom: 12 }}>
            Saldos que la app tiene pero que no se explican con operaciones cargadas: la plata con la que se empezó a usar la
            app, correcciones de saldo, stock importado, movimientos muy viejos que quedaron resumidos o registros que
            se perdieron. Van al asiento de apertura contra "Saldos iniciales y ajustes sin justificar", para que el balance
            cierre y se vea cuánto es. Lo ideal es que, con el tiempo, cada diferencia tenga su operación.
          </p>
          {libros.diferencias.length === 0 ? (
            <Vacio icono="✅" titulo="Todo está explicado por operaciones" />
          ) : (
            <div className="tabla-wrap">
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr><th>Cuenta</th><th style={num}>Según operaciones</th><th style={num}>Saldo real</th><th style={num}>Sin justificar</th></tr>
                  </thead>
                  <tbody>
                    {libros.diferencias.map((d) => (
                      <tr key={d.cuenta}>
                        <td>{d.nombre}</td>
                        <td style={num}>{importe(d.libros)}</td>
                        <td style={num}>{importe(d.real)}</td>
                        <td style={{ ...num, fontWeight: 700 }}>{importe(d.diferencia)}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700 }}>
                      <td colSpan={3}>Total en "Saldos iniciales y ajustes sin justificar"</td>
                      <td style={num}>{importe(totalSinJustificar)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Informe({ titulo, filas, total }: { titulo: string; filas: FilaInforme[]; total: number }) {
  return (
    <div className="tabla-wrap">
      <table>
        <thead>
          <tr><th>{titulo}</th><th style={num}>Importe</th></tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr><td colSpan={2} style={{ color: 'var(--texto-2)' }}>Sin saldos</td></tr>
          )}
          {filas.map((f) => (
            <tr key={f.codigo}>
              <td>
                <span style={{ fontFamily: 'var(--fuente-mono)', fontSize: 11, marginRight: 6, color: 'var(--texto-2)' }}>
                  {f.codigo.startsWith('1.2.') ? '1.2' : f.codigo}
                </span>
                {f.nombre}
              </td>
              <td style={{ ...num, color: f.importe < 0 ? 'var(--rojo)' : undefined }}>{importe(f.importe)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td>Total</td>
            <td style={num}>{importe(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
