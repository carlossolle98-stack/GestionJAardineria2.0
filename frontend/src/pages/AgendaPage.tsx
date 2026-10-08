import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { diasLaborablesSemana, labelSemana, toYMD, weekRangeFromOffset } from '@/lib/agenda';
import type { Turno } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useOrden, BarraFiltros, coincideAlguno } from '@/components/Tabla';
import { Modal, ModalAcciones } from '@/components/Modal';
import { Vacio } from '@/components/Estados';

const DURACIONES = ['1 hora', '1.5 horas', '2 horas', '3 horas', 'Medio día', 'Día completo'];
const TIPOS = ['Cliente fijo', 'Prospecto confirmado', 'Reprogramado'];

type ColTurno = 'hora' | 'cliente' | 'tipo';

export function AgendaPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const loc = useLocation();
  const nav = useNavigate();
  const [offset, setOffset] = useState(0);
  const { lunes, desde, hasta } = useMemo(() => weekRangeFromOffset(offset), [offset]);

  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['turnos', desde, hasta],
    queryFn: () => getJson<Turno[]>(`/api/turnos?desde=${desde}&hasta=${hasta}`),
  });

  // ── Alta de turno (modal) ───────────────────────────────────
  const [abrirAlta, setAbrirAlta] = useState(false);
  const [tCliente, setTCliente] = useState('');
  const [tFecha, setTFecha] = useState(todayISO());
  const [tHora, setTHora] = useState('');
  const [tDur, setTDur] = useState('1 hora');
  const [tTipo, setTTipo] = useState('Cliente fijo');

  // ── Edición de turno ────────────────────────────────────────
  const [editT, setEditT] = useState<Turno | null>(null);
  const [etCliente, setEtCliente] = useState('');
  const [etFecha, setEtFecha] = useState('');
  const [etHora, setEtHora] = useState('');
  const [etDur, setEtDur] = useState('1 hora');
  const [etTipo, setEtTipo] = useState('Cliente fijo');

  // ── Filtros de la semana mostrada ───────────────────────────
  const [busqueda, setBusqueda] = useState('');
  const [filEstado, setFilEstado] = useState('');
  const [filTipo, setFilTipo] = useState('');

  useEffect(() => {
    const st = loc.state as { prefillCliente?: string } | null;
    if (st?.prefillCliente) {
      setTCliente(st.prefillCliente);
      setAbrirAlta(true);
      nav(loc.pathname, { replace: true, state: {} });
    }
  }, [loc.state, loc.pathname, nav]);

  function cerrarAlta() {
    setAbrirAlta(false);
    setTCliente('');
    setTHora('');
  }

  const addMut = useMutation({
    mutationFn: () =>
      sendJson<Turno>('/api/turnos', 'POST', {
        cliente: tCliente.trim(),
        fecha: tFecha,
        hora: tHora,
        duracion: tDur,
        tipo: tTipo,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['turnos'] });
      qc.invalidateQueries({ queryKey: ['turnos-all'] });
      cerrarAlta();
      toast('✓ Turno agregado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => sendJson(`/api/turnos/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['turnos'] });
      qc.invalidateQueries({ queryKey: ['turnos-all'] });
      toast('Turno eliminado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const editMutT = useMutation({
    mutationFn: () =>
      sendJson<Turno>(`/api/turnos/${editT?._id}`, 'PATCH', {
        cliente: etCliente.trim(),
        fecha: etFecha,
        hora: etHora,
        duracion: etDur,
        tipo: etTipo,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['turnos'] });
      qc.invalidateQueries({ queryKey: ['turnos-all'] });
      setEditT(null);
      toast('Turno actualizado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const toggleMut = useMutation({
    mutationFn: (p: { id: string; realizado: boolean }) =>
      sendJson(`/api/turnos/${p.id}`, 'PATCH', { realizado: p.realizado }),
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ['turnos'] });
      qc.invalidateQueries({ queryKey: ['turnos-all'] });
      toast(p.realizado ? '✓ Turno marcado como hecho' : 'Turno marcado como pendiente', {
        tono: 'exito',
      });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  /** Tipos realmente presentes en la semana, más los fijos del alta. */
  const tiposDisponibles = useMemo(
    () => [...new Set([...TIPOS, ...turnos.map((t) => t.tipo).filter(Boolean)])],
    [turnos]
  );

  const filtrados = useMemo(
    () =>
      turnos.filter((t) => {
        if (!coincideAlguno([t.cliente], busqueda)) return false;
        if (filEstado === 'realizado' && !t.realizado) return false;
        if (filEstado === 'pendiente' && t.realizado) return false;
        if (filTipo && t.tipo !== filTipo) return false;
        return true;
      }),
    [turnos, busqueda, filEstado, filTipo]
  );

  const valoresTurno = useMemo(
    () => ({
      hora: (t: Turno) => t.hora,
      cliente: (t: Turno) => t.cliente,
      tipo: (t: Turno) => t.tipo,
    }),
    []
  );
  const { filas: ordenados, orden, setOrden } = useOrden(filtrados, valoresTurno, {
    campo: 'hora' as ColTurno,
    direccion: 'asc',
  });

  const hayFiltros = Boolean(busqueda || filEstado || filTipo);
  function limpiarFiltros() {
    setBusqueda('');
    setFilEstado('');
    setFilTipo('');
  }

  /** Agrupa por día respetando el orden elegido. */
  const porDia = useMemo(() => {
    const map = new Map<string, Turno[]>();
    for (const t of ordenados) {
      const arr = map.get(t.fecha) || [];
      arr.push(t);
      map.set(t.fecha, arr);
    }
    return map;
  }, [ordenados]);

  function exportar() {
    const lines = turnos
      .filter((t) => t.fecha >= desde && t.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '').localeCompare(b.hora || ''))
      .map((t) => `• ${t.fecha} ${t.hora || ''} — ${t.cliente} (${t.duracion})`);
    const txt = `📅 AGENDA — Semana del ${labelSemana(lunes)}\n\n${lines.length ? lines.join('\n') : '(sin turnos)'}`;
    navigator.clipboard.writeText(txt).then(
      () => toast('✓ Copiado', { tono: 'exito' }),
      () => toast('No se pudo copiar al portapapeles', { tono: 'error' })
    );
  }

  function agregarTurno() {
    if (!tCliente.trim()) { toast('⚠ Ingresá el nombre del cliente', { tono: 'error' }); return; }
    if (!tFecha) { toast('⚠ Elegí una fecha', { tono: 'error' }); return; }
    if (!tHora) { toast('⚠ Elegí una hora', { tono: 'error' }); return; }
    addMut.mutate();
  }

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  const hoyYmd = toYMD(new Date());

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Agenda <small>Semana del {labelSemana(lunes)}</small>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn secundario" onClick={() => setOffset((o) => o - 1)}>
            ← Anterior
          </button>
          <button type="button" className="btn secundario" onClick={() => setOffset(0)}>
            Hoy
          </button>
          <button type="button" className="btn secundario" onClick={() => setOffset((o) => o + 1)}>
            Siguiente →
          </button>
          <button type="button" className="btn secundario" onClick={exportar}>
            📋 Copiar WA
          </button>
          <button type="button" className="btn" onClick={() => setAbrirAlta(true)}>
            ➕ Agregar turno
          </button>
        </div>
      </div>

      <div className="alerta aviso">
        <div>💡</div>
        <div>
          <strong>Reglas:</strong> clientes fijos primero · máx 3 turnos/día · lluvia: reprogramar sin acumular pendientes
        </div>
      </div>

      <BarraFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por cliente…"
        filtros={[
          {
            id: 'agenda-estado',
            label: 'Estado',
            valor: filEstado,
            opciones: [
              { valor: '', label: 'Todos' },
              { valor: 'pendiente', label: 'Pendientes' },
              { valor: 'realizado', label: 'Realizados' },
            ],
            onCambio: setFilEstado,
          },
          {
            id: 'agenda-tipo',
            label: 'Tipo',
            valor: filTipo,
            opciones: [
              { valor: '', label: 'Todos' },
              ...tiposDisponibles.map((t) => ({ valor: t, label: t })),
            ],
            onCambio: setFilTipo,
          },
        ]}
        resultados={ordenados.length}
        total={turnos.length}
        hayFiltros={hayFiltros}
        onLimpiar={limpiarFiltros}
        orden={{
          actual: orden.campo,
          columnas: [
            { valor: 'hora', label: 'Hora' },
            { valor: 'cliente', label: 'Cliente' },
            { valor: 'tipo', label: 'Tipo' },
          ],
          direccion: orden.direccion,
          onCampo: (campo) => setOrden((o) => ({ ...o, campo: campo as ColTurno })),
          onDireccion: () =>
            setOrden((o) => ({ ...o, direccion: o.direccion === 'asc' ? 'desc' : 'asc' })),
        }}
      />

      {ordenados.length === 0 && hayFiltros ? (
        <Vacio
          icono="🔍"
          titulo="Ningún turno coincide con los filtros"
          texto="Esta semana no hay turnos con esa búsqueda, estado o tipo."
          accion={
            <button type="button" className="btn secundario sm" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          }
        />
      ) : turnos.length === 0 ? (
        <Vacio
          icono="📅"
          titulo="Semana sin turnos"
          texto="Todavía no cargaste ningún turno para esta semana."
          accion={
            <button type="button" className="btn sm" onClick={() => setAbrirAlta(true)}>
              ➕ Agregar turno
            </button>
          }
        />
      ) : (
        diasLaborablesSemana(lunes).map(({ nombre, fecha, ymd }) => {
          const lista = porDia.get(ymd) || [];
          const esHoy = ymd === hoyYmd;
          return (
            <div
              key={ymd}
              className="agenda-dia"
              style={esHoy ? { borderLeft: '4px solid var(--verde-vivo)' } : undefined}
            >
              <div className="agenda-fecha">
                <div className="dia-num">{fecha.getDate()}</div>
                <div className="dia-texto">{nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--texto-2)', marginTop: 4 }}>
                  {fecha.toLocaleDateString('es-AR', { month: 'short' })}
                </div>
                {esHoy && (
                  <div style={{ fontSize: 10, color: 'var(--verde-vivo)', fontWeight: 600, marginTop: 2 }}>HOY</div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                {lista.length === 0 ? (
                  <div style={{ color: 'var(--texto-2)', fontSize: 13, padding: '8px 0' }}>
                    {hayFiltros ? 'Sin turnos con esos filtros' : 'Sin turnos'}
                  </div>
                ) : (
                  lista.map((t) => (
                    <div key={t._id} className="turno-item" style={{ opacity: t.realizado ? 0.55 : 1 }}>
                      <div className="turno-hora">{t.hora || '—'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, textDecoration: t.realizado ? 'line-through' : undefined }}>
                          {t.cliente}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>
                          {t.duracion} · {t.tipo}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn secundario sm"
                        onClick={() => toggleMut.mutate({ id: t._id, realizado: !t.realizado })}
                        disabled={toggleMut.isPending}
                      >
                        {t.realizado ? '✓ Hecho' : '○ Pendiente'}
                      </button>
                      <button
                        type="button"
                        className="btn secundario sm"
                        aria-label={`Editar turno de ${t.cliente}`}
                        onClick={() => {
                          setEditT(t);
                          setEtCliente(t.cliente);
                          setEtFecha(t.fecha);
                          setEtHora(t.hora);
                          setEtDur(t.duracion);
                          setEtTipo(t.tipo);
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => delMut.mutate(t._id)}
                        aria-label={`Eliminar turno de ${t.cliente}`}
                        style={{ opacity: 0.5, border: 'none', background: 'none', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div>
                <span className={`badge ${lista.length >= 3 ? 'urgente' : lista.length ? 'pendiente' : 'ok'}`}>
                  {lista.length}/3 turnos
                </span>
              </div>
            </div>
          );
        })
      )}

      {/* ── Modal: editar turno ── */}
      {editT && (
        <Modal titulo="Editar turno" onCerrar={() => setEditT(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!etCliente.trim()) { toast('⚠ Ingresá el nombre del cliente', { tono: 'error' }); return; }
              editMutT.mutate();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="et-cliente">Cliente</label>
                <input id="et-cliente" value={etCliente} onChange={(e) => setEtCliente(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="et-fecha">Fecha</label>
                <input id="et-fecha" type="date" value={etFecha} onChange={(e) => setEtFecha(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="et-hora">Hora</label>
                <input id="et-hora" type="time" value={etHora} onChange={(e) => setEtHora(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="et-dur">Duración</label>
                <select id="et-dur" value={etDur} onChange={(e) => setEtDur(e.target.value)}>
                  {DURACIONES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="et-tipo">Tipo</label>
                <select id="et-tipo" value={etTipo} onChange={(e) => setEtTipo(e.target.value)}>
                  {TIPOS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <ModalAcciones onCancelar={() => setEditT(null)} textoConfirmar="Guardar cambios" enviando={editMutT.isPending} />
          </form>
        </Modal>
      )}

      {/* ── Modal: alta de turno ── */}
      {abrirAlta && (
        <Modal
          titulo="Agregar turno"
          descripcion="Cargá un turno nuevo en la agenda."
          onCerrar={cerrarAlta}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              agregarTurno();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="agenda-cliente-1">Cliente</label>
                <input id="agenda-cliente-1" value={tCliente} onChange={(e) => setTCliente(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="agenda-fecha-2">Fecha</label>
                <input id="agenda-fecha-2" type="date" value={tFecha} onChange={(e) => setTFecha(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="agenda-hora-3">Hora</label>
                <input id="agenda-hora-3" type="time" value={tHora} onChange={(e) => setTHora(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="agenda-duracion-4">Duración</label>
                <select id="agenda-duracion-4" value={tDur} onChange={(e) => setTDur(e.target.value)}>
                  {DURACIONES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="agenda-tipo-5">Tipo</label>
                <select id="agenda-tipo-5" value={tTipo} onChange={(e) => setTTipo(e.target.value)}>
                  {TIPOS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <ModalAcciones onCancelar={cerrarAlta} textoConfirmar="Agregar turno" enviando={addMut.isPending} />
          </form>
        </Modal>
      )}
    </>
  );
}
