import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import { NOMBRES_MES } from '@/lib/historial';
import { grillaSemana, horaAR, horasTexto, lunesDe, sumarDias, totalesMes, type Jornada } from '@/lib/jornadas';
import { useAuth } from '@/context/AuthContext';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import { Vacio } from '@/components/Estados';

type Mia = { hoy: string; abierta: Jornada | null; jornadas: Jornada[] };

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const num = { textAlign: 'right' as const, fontFamily: 'var(--fuente-mono)', whiteSpace: 'nowrap' as const };

function minutosDesde(iso: string, ahora: number) {
  return Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60000));
}

export function HorasPage() {
  const { puede, esAdmin } = useAuth();
  const gestor = esAdmin || puede('empleados');

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Horas <small>Entrada y salida de cada jornada</small>
        </div>
      </div>
      <MiJornada />
      {gestor && <HorasDelEquipo />}
    </>
  );
}

function MiJornada() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [ahora, setAhora] = useState(Date.now());
  const [pidiendoPausa, setPidiendoPausa] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['jornada-mia'],
    queryFn: () => getJson<Mia>('/api/jornadas/mia'),
    refetchOnWindowFocus: true,
  });

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['jornada-mia'] });
    void qc.invalidateQueries({ queryKey: ['jornadas'] });
  };

  const entrar = useMutation({
    mutationFn: () => sendJson<Jornada>('/api/jornadas/entrada', 'POST', {}),
    onSuccess: (j) => { refrescar(); toast(`Entrada marcada · ${horaAR(j.entrada)}`, { tono: 'exito' }); },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });
  const salir = useMutation({
    mutationFn: (pausaMin: number) => sendJson<Jornada>('/api/jornadas/salida', 'POST', { pausaMin }),
    onSuccess: (j) => {
      refrescar();
      setPidiendoPausa(false);
      toast(`Salida marcada · ${horaAR(j.salida)} · ${horasTexto(j.minutos ?? 0)} trabajadas`, { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;
  if (error) {
    return (
      <div className="alerta aviso" role="alert">
        No se pudo leer tu jornada: {(error as Error).message}. Si dice que la ruta no existe, falta publicar el servidor.
      </div>
    );
  }

  const abierta = data?.abierta ?? null;
  const deOtroDia = abierta && abierta.fecha !== data?.hoy;
  const recientes = (data?.jornadas ?? []).slice(0, 10);
  const semana = lunesDe(data?.hoy ?? todayISO());
  const minSemana = (data?.jornadas ?? []).filter((j) => j.fecha >= semana).reduce((t, j) => t + (j.minutos ?? 0), 0);

  return (
    <div className="tabla-wrap" style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--texto-2)' }}>Mi jornada</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {abierta
              ? `Trabajando desde las ${horaAR(abierta.entrada)}${deOtroDia ? ` del ${abierta.fecha}` : ''}`
              : 'Sin marcar'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--texto-2)' }}>
            {abierta && !deOtroDia && `${horasTexto(minutosDesde(abierta.entrada, ahora))} hasta ahora · `}
            Esta semana: {horasTexto(minSemana)}
          </div>
        </div>
        {abierta ? (
          <button
            type="button"
            className="btn"
            style={{ fontSize: 18, padding: '14px 28px', background: 'var(--rojo)' }}
            onClick={() => setPidiendoPausa(true)}
            disabled={salir.isPending}
          >
            ■ Marcar salida
          </button>
        ) : (
          <button type="button" className="btn" style={{ fontSize: 18, padding: '14px 28px' }} onClick={() => entrar.mutate()} disabled={entrar.isPending}>
            ▶ Marcar entrada
          </button>
        )}
      </div>
      {deOtroDia && (
        <div className="alerta aviso">
          Quedó abierta la jornada del {abierta!.fecha}. Marcá la salida ahora y pedile a quien administra el personal que
          corrija la hora real.
        </div>
      )}

      {recientes.length > 0 && (
        <div className="tabla-scroll">
          <table style={{ fontSize: 14 }}>
            <thead>
              <tr><th>Día</th><th>Entrada</th><th>Salida</th><th style={num}>Horas</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {recientes.map((j) => (
                <tr key={j._id}>
                  <td style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12 }}>{j.fecha}</td>
                  <td>{horaAR(j.entrada)}</td>
                  <td>{j.salida ? horaAR(j.salida) : '—'}</td>
                  <td style={num}>{j.minutos === null ? '—' : horasTexto(j.minutos)}</td>
                  <td>
                    {j.aprobada ? <span className="badge ok">Aprobada</span> : j.salida ? <span className="badge pendiente">Por aprobar</span> : <span className="badge info">En curso</span>}
                    {j.origen === 'manual' && <span style={{ fontSize: 11, color: 'var(--texto-2)', marginLeft: 6 }}>corregida</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pidiendoPausa && (
        <Modal titulo="Marcar salida" descripcion="¿Cuánto tiempo paraste para comer o descansar?" onCerrar={() => setPidiendoPausa(false)} ancho="chico">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([[0, 'Sin pausa'], [15, '15 min'], [30, '30 min'], [60, '1 hora'], [90, '1 h y media']] as const).map(([m, texto]) => (
              <button key={m} type="button" className="btn" style={{ flex: '1 1 30%', padding: '14px 8px' }} onClick={() => salir.mutate(m)} disabled={salir.isPending}>
                {texto}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function HorasDelEquipo() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { puede } = useAuth();
  const j2 = useJ2Local();
  const hoy = todayISO();
  const [lunes, setLunes] = useState(lunesDe(hoy));
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)), [lunes]);
  const mes = lunes.slice(0, 7);
  const desde = `${mes}-01` < lunes ? `${mes}-01` : lunes;
  const hasta = sumarDias(lunes, 6) > `${mes}-31` ? sumarDias(lunes, 6) : `${mes}-31`;

  const { data: jornadas = [], error } = useQuery({
    queryKey: ['jornadas', desde, hasta],
    queryFn: () => getJson<Jornada[]>(`/api/jornadas?desde=${desde}&hasta=${hasta}`),
  });
  const { data: personas = [] } = useQuery({
    queryKey: ['jornadas-personas'],
    queryFn: () => getJson<{ id: string; nombre: string }[]>('/api/jornadas/personas'),
  });

  const [editar, setEditar] = useState<Jornada | 'nueva' | null>(null);
  const [borrar, setBorrar] = useState<Jornada | null>(null);
  const [fPersona, setFPersona] = useState('');
  const [fFecha, setFFecha] = useState(hoy);
  const [fEntrada, setFEntrada] = useState('08:00');
  const [fSalida, setFSalida] = useState('');
  const [fPausa, setFPausa] = useState('0');
  const [fNota, setFNota] = useState('');

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['jornadas'] });
    void qc.invalidateQueries({ queryKey: ['jornada-mia'] });
  };

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { fecha: fFecha, entrada: fEntrada, salida: fSalida || null, pausaMin: Number(fPausa) || 0, nota: fNota };
      return editar === 'nueva'
        ? sendJson('/api/jornadas', 'POST', { ...cuerpo, usuarioId: fPersona })
        : sendJson(`/api/jornadas/${(editar as Jornada)._id}`, 'PATCH', cuerpo);
    },
    onSuccess: () => { refrescar(); setEditar(null); toast('Jornada guardada', { tono: 'exito' }); },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });
  const aprobar = useMutation({
    mutationFn: (ids: string[]) => sendJson<{ aprobadas: number }>('/api/jornadas/aprobar', 'POST', { ids }),
    onSuccess: (r) => { refrescar(); toast(`${r.aprobadas} jornadas aprobadas`, { tono: 'exito' }); },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });
  const eliminar = useMutation({
    mutationFn: (id: string) => sendJson(`/api/jornadas/${id}`, 'DELETE'),
    onSuccess: () => { refrescar(); toast('Jornada eliminada', { tono: 'exito' }); },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  function abrir(j: Jornada | 'nueva') {
    setEditar(j);
    if (j === 'nueva') {
      setFPersona(personas[0]?.id ?? '');
      setFFecha(hoy); setFEntrada('08:00'); setFSalida(''); setFPausa('0'); setFNota('');
    } else {
      setFPersona(j.usuarioId);
      setFFecha(j.fecha); setFEntrada(horaAR(j.entrada)); setFSalida(horaAR(j.salida)); setFPausa(String(j.pausaMin)); setFNota(j.nota);
    }
  }

  const grilla = grillaSemana(jornadas, dias);
  const delMes = totalesMes(jornadas, mes);
  const semanasDelMes = useMemo(() => {
    const out: string[] = [];
    for (let l = lunesDe(`${mes}-01`); l.slice(0, 7) <= mes; l = sumarDias(l, 7)) out.push(l);
    return out;
  }, [mes]);
  const deLaSemana = jornadas.filter((j) => dias.includes(j.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
  const porAprobar = deLaSemana.filter((j) => j.salida && !j.aprobada);

  /** Lo pagado en el mes a cada persona (sueldos y aguinaldos cargados con su nombre en Empleados). */
  const verPagos = puede('egresos') && puede('empleados');
  const pagadoA = (nombre: string) => {
    const primero = nombre.split(' ')[0].toLowerCase();
    const emp = j2.empleados.find((e) => e.nombre.toLowerCase() === nombre.toLowerCase() || e.nombre.split(' ')[0].toLowerCase() === primero);
    if (!emp) return null;
    return j2.egresos.filter((e) => e.tipo === 'sueldo' && e.categoria === emp.nombre && e.fecha.startsWith(mes)).reduce((t, e) => t + e.monto, 0);
  };
  const [anioMes, numMes] = mes.split('-').map(Number);

  return (
    <>
      <div className="section-header" style={{ marginTop: 8 }}>
        <div className="section-title">Horas del equipo <small>Semana del {lunes.split('-').reverse().join('/')}</small></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn secundario" onClick={() => setLunes(sumarDias(lunes, -7))}>← Anterior</button>
          <button type="button" className="btn secundario" onClick={() => setLunes(lunesDe(hoy))}>Esta semana</button>
          <button type="button" className="btn secundario" onClick={() => setLunes(sumarDias(lunes, 7))}>Siguiente →</button>
          <button type="button" className="btn" onClick={() => abrir('nueva')}>+ Cargar jornada</button>
        </div>
      </div>

      {error && <div className="alerta aviso" role="alert">No se pudieron leer las horas: {(error as Error).message}</div>}

      {grilla.length === 0 ? (
        <Vacio icono="⏱️" titulo="Nadie marcó horas esta semana" texto="Cada uno marca su entrada y salida desde esta misma pantalla, en el celular." />
      ) : (
        <div className="tabla-wrap" style={{ marginBottom: 16 }}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Persona</th>
                  {dias.map((d, i) => <th key={d} style={num}>{DIAS[i]} {Number(d.slice(8))}</th>)}
                  <th style={num}>Semana</th>
                </tr>
              </thead>
              <tbody>
                {grilla.map((f) => (
                  <tr key={f.usuarioId}>
                    <td>
                      <strong>{f.nombre}</strong>
                      {f.abiertas > 0 && <div style={{ fontSize: 11, color: 'var(--rojo)' }}>{f.abiertas} sin salida</div>}
                    </td>
                    {dias.map((d) => <td key={d} style={num}>{f.porDia[d] ? horasTexto(f.porDia[d]) : '—'}</td>)}
                    <td style={{ ...num, fontWeight: 700 }}>{horasTexto(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {delMes.size > 0 && (
        <div className="tabla-wrap" style={{ marginBottom: 16 }}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>{NOMBRES_MES[numMes - 1]} {anioMes}</th>
                  {semanasDelMes.map((l, i) => <th key={l} style={num}>Semana {i + 1}</th>)}
                  <th style={num}>Mes</th>
                  {verPagos && <th style={num}>Pagado</th>}
                  {verPagos && <th style={num}>Costo por hora</th>}
                </tr>
              </thead>
              <tbody>
                {[...delMes.entries()].map(([id, p]) => {
                  const pagado = verPagos ? pagadoA(p.nombre) : null;
                  return (
                    <tr key={id}>
                      <td><strong>{p.nombre}</strong></td>
                      {semanasDelMes.map((l) => <td key={l} style={num}>{p.semanas.get(l) ? horasTexto(p.semanas.get(l)!) : '—'}</td>)}
                      <td style={{ ...num, fontWeight: 700 }}>{horasTexto(p.total)}</td>
                      {verPagos && <td style={num}>{pagado === null ? '—' : money(pagado)}</td>}
                      {verPagos && <td style={num}>{pagado && p.total ? money(Math.round(pagado / (p.total / 60))) : '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {verPagos && (
            <p className="form-ayuda" style={{ padding: '0 12px 12px' }}>
              Lo pagado sale de los sueldos y aguinaldos registrados en Empleados con el mismo nombre. Quien cobra a fin de
              mes aparece en $0 hasta que se le paga.
            </p>
          )}
        </div>
      )}

      {deLaSemana.length > 0 && (
        <div className="tabla-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, gap: 8, flexWrap: 'wrap' }}>
            <strong>Jornadas de la semana</strong>
            {porAprobar.length > 0 && (
              <button type="button" className="btn sm" onClick={() => aprobar.mutate(porAprobar.map((j) => j._id))} disabled={aprobar.isPending}>
                ✓ Aprobar {porAprobar.length}
              </button>
            )}
          </div>
          <div className="tabla-scroll">
            <table className="responsive">
              <thead>
                <tr><th>Día</th><th>Persona</th><th>Entrada</th><th>Salida</th><th style={num}>Pausa</th><th style={num}>Horas</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {deLaSemana.map((j) => (
                  <tr key={j._id}>
                    <td data-label="Día" style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12 }}>{j.fecha}</td>
                    <td data-label="Persona">{j.nombre}{j.nota && <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>{j.nota}</div>}</td>
                    <td data-label="Entrada">{horaAR(j.entrada)}</td>
                    <td data-label="Salida">{j.salida ? horaAR(j.salida) : <span style={{ color: 'var(--rojo)' }}>sin salida</span>}</td>
                    <td data-label="Pausa" style={num}>{j.pausaMin ? `${j.pausaMin} min` : '—'}</td>
                    <td data-label="Horas" style={num}>{j.minutos === null ? '—' : horasTexto(j.minutos)}</td>
                    <td data-label="Estado">
                      {j.aprobada ? <span className="badge ok">Aprobada</span> : <span className="badge pendiente">Por aprobar</span>}
                      {j.origen === 'manual' && <div style={{ fontSize: 11, color: 'var(--texto-2)' }}>cargada por {j.editadaPor}</div>}
                    </td>
                    <td data-label="Acción">
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn secundario sm" onClick={() => abrir(j)} aria-label={`Corregir jornada de ${j.nombre}`}>✏️</button>
                        <button type="button" className="btn secundario sm" onClick={() => setBorrar(j)} aria-label={`Eliminar jornada de ${j.nombre}`}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editar && (
        <Modal titulo={editar === 'nueva' ? 'Cargar jornada' : `Corregir jornada — ${editar.nombre}`} onCerrar={() => setEditar(null)} ancho="chico">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (editar === 'nueva' && !fPersona) { toast('Elegí la persona', { tono: 'error' }); return; }
              guardar.mutate();
            }}
          >
            <div className="form-grid">
              {editar === 'nueva' && (
                <div className="form-group">
                  <label htmlFor="jor-persona">Persona</label>
                  <select id="jor-persona" value={fPersona} onChange={(e) => setFPersona(e.target.value)}>
                    {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="jor-fecha">Día</label>
                <input id="jor-fecha" type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="jor-entrada">Entrada</label>
                <input id="jor-entrada" type="time" value={fEntrada} onChange={(e) => setFEntrada(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="jor-salida">Salida</label>
                <input id="jor-salida" type="time" value={fSalida} onChange={(e) => setFSalida(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="jor-pausa">Pausa (minutos)</label>
                <input id="jor-pausa" type="number" inputMode="numeric" min="0" value={fPausa} onChange={(e) => setFPausa(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="jor-nota">Nota</label>
                <input id="jor-nota" value={fNota} onChange={(e) => setFNota(e.target.value)} placeholder="Ej: se olvidó de marcar" />
              </div>
            </div>
            <ModalAcciones onCancelar={() => setEditar(null)} textoConfirmar="Guardar" enviando={guardar.isPending} />
          </form>
        </Modal>
      )}

      {borrar && (
        <ModalConfirmar
          titulo="Eliminar jornada"
          peligro
          textoConfirmar="Eliminar"
          mensaje={<>Se elimina la jornada de <strong>{borrar.nombre}</strong> del {borrar.fecha}.</>}
          onConfirmar={() => { eliminar.mutate(borrar._id); setBorrar(null); }}
          onCerrar={() => setBorrar(null)}
        />
      )}
    </>
  );
}
