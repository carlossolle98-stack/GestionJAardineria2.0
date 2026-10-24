import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { hoyLocal } from '@/lib/j2reducer';
import { describirRepeticion, etiquetaVence, filtrarVista, sugerencias, type Sugerencia, type Vista } from '@/lib/tareas';
import type { ItemInventario, RepetirTarea, Tarea, TipoTarea } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import { ErrorCarga, Vacio } from '@/components/Estados';

type Responsable = { _id: string; nombre: string };
type Pestania = Vista | 'hechas';

const REPETICIONES: { valor: string; label: string; r: RepetirTarea }[] = [
  { valor: '', label: 'No se repite', r: { cada: '', n: 1 } },
  { valor: 'dia', label: 'Todos los días', r: { cada: 'dia', n: 1 } },
  { valor: 'semana', label: 'Todas las semanas', r: { cada: 'semana', n: 1 } },
  { valor: 'mes', label: 'Todos los meses', r: { cada: 'mes', n: 1 } },
  { valor: 'dias', label: 'Cada tantos días…', r: { cada: 'dias', n: 15 } },
];

type Borrador = {
  titulo: string;
  notas: string;
  tipo: TipoTarea;
  prioridad: 'normal' | 'urgente';
  vence: string;
  hora: string;
  responsableId: string;
  repetir: RepetirTarea;
  checklist: string;
  origen?: string;
};

function borradorDe(t?: Tarea, tipo: TipoTarea = 'operativa'): Borrador {
  return {
    titulo: t?.titulo ?? '',
    notas: t?.notas ?? '',
    tipo: t?.tipo ?? tipo,
    prioridad: t?.prioridad ?? 'normal',
    vence: t?.vence ?? hoyLocal(),
    hora: t?.hora ?? '',
    responsableId: t?.responsableId ?? '',
    repetir: t?.repetir ?? { cada: '', n: 1 },
    checklist: (t?.checklist ?? []).map((i) => i.texto).join('\n'),
  };
}

export function TareasPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { usuario, puede, esAdmin } = useAuth();
  const j2 = useJ2Local();
  const hoy = hoyLocal();

  const tipos: TipoTarea[] = [
    ...(puede('tareas') ? (['operativa'] as const) : []),
    ...(puede('tareas_admin') ? (['administrativa'] as const) : []),
  ];
  const administra = esAdmin || puede('tareas_admin');

  const [pestania, setPestania] = useState<Pestania>('hoy');
  const [filtroTipo, setFiltroTipo] = useState<'todas' | TipoTarea>('todas');
  const [filtroResp, setFiltroResp] = useState<string>('todos');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [rapida, setRapida] = useState('');
  const [rapidaTipo, setRapidaTipo] = useState<TipoTarea>(tipos[0] ?? 'operativa');
  const [rapidaVence, setRapidaVence] = useState(hoy);
  const [editando, setEditando] = useState<{ tarea?: Tarea; borrador: Borrador } | null>(null);
  const [borrar, setBorrar] = useState<Tarea | null>(null);
  const [comentario, setComentario] = useState('');
  const [verSugerencias, setVerSugerencias] = useState(true);

  const pendientesQ = useQuery({
    queryKey: ['tareas', 'pendiente'],
    queryFn: () => getJson<Tarea[]>('/api/tareas?estado=pendiente'),
  });
  const hechasQ = useQuery({
    queryKey: ['tareas', 'hecha'],
    queryFn: () => getJson<Tarea[]>('/api/tareas?estado=hecha'),
    enabled: pestania === 'hechas',
  });
  const { data: responsables = [] } = useQuery({
    queryKey: ['tareas', 'responsables'],
    queryFn: () => getJson<Responsable[]>('/api/tareas/responsables'),
  });
  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => getJson<ItemInventario[]>('/api/inventario'),
    enabled: puede('inventario'),
    retry: false,
  });

  const refrescar = () => void qc.invalidateQueries({ queryKey: ['tareas'] });
  const alError = (e: Error) => toast(e.message, { tono: 'error' });

  const crear = useMutation({
    mutationFn: (b: Borrador) =>
      sendJson<Tarea>('/api/tareas', 'POST', {
        ...b,
        checklist: b.checklist.split('\n').map((texto) => ({ texto })).filter((i) => i.texto.trim()),
      }),
    onSuccess: () => { refrescar(); toast('Tarea creada', { tono: 'exito' }); },
    onError: alError,
  });
  const editar = useMutation({
    mutationFn: ({ id, b, previa }: { id: string; b: Borrador; previa: Tarea }) => {
      // Conserva lo tildado de los pasos que siguen igual.
      const hechos = new Map(previa.checklist.map((i) => [i.texto, i]));
      const checklist = b.checklist
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((texto) => ({ texto, hecho: hechos.get(texto)?.hecho ?? false, hechoPor: hechos.get(texto)?.hechoPor ?? '' }));
      return sendJson<Tarea>(`/api/tareas/${id}`, 'PATCH', { ...b, checklist });
    },
    onSuccess: () => { refrescar(); toast('Tarea actualizada', { tono: 'exito' }); },
    onError: alError,
  });
  const completar = useMutation({
    mutationFn: ({ id, hecha }: { id: string; hecha: boolean }) =>
      sendJson<{ tarea: Tarea; siguiente: Tarea | null }>(`/api/tareas/${id}/completar`, 'POST', { hecha }),
    onSuccess: (r) => {
      refrescar();
      if (r.tarea.estado === 'hecha') {
        toast(r.siguiente ? `Hecha. La próxima queda para el ${r.siguiente.vence.split('-').reverse().join('/')}` : 'Tarea hecha', { tono: 'exito' });
      }
    },
    onError: alError,
  });
  const marcarItem = useMutation({
    mutationFn: ({ id, itemId, hecho }: { id: string; itemId: string; hecho: boolean }) =>
      sendJson<Tarea>(`/api/tareas/${id}/checklist/${itemId}`, 'POST', { hecho }),
    onSuccess: refrescar,
    onError: alError,
  });
  const comentar = useMutation({
    mutationFn: ({ id, texto }: { id: string; texto: string }) => sendJson<Tarea>(`/api/tareas/${id}/comentarios`, 'POST', { texto }),
    onSuccess: () => { refrescar(); setComentario(''); },
    onError: alError,
  });
  const asignar = useMutation({
    mutationFn: ({ id, responsableId }: { id: string; responsableId: string }) => sendJson<Tarea>(`/api/tareas/${id}`, 'PATCH', { responsableId }),
    onSuccess: () => { refrescar(); toast('Responsable actualizado', { tono: 'exito' }); },
    onError: alError,
  });
  const eliminar = useMutation({
    mutationFn: (id: string) => sendJson(`/api/tareas/${id}`, 'DELETE'),
    onSuccess: () => { refrescar(); toast('Tarea borrada', { tono: 'exito' }); },
    onError: alError,
  });

  const pendientes = pendientesQ.data ?? [];
  const origenesPendientes = new Set(pendientes.map((t) => t.origen).filter(Boolean));
  const propuestas = useMemo(
    () =>
      sugerencias({ hoy, listaEspera: j2.listaEspera, inventario, empleados: j2.empleados, tiposPermitidos: tipos }).filter(
        (s) => !origenesPendientes.has(s.origen)
      ),
    [hoy, j2.listaEspera, inventario, j2.empleados, tipos.join(), pendientes]
  );

  const aplicarFiltros = (lista: Tarea[]) =>
    lista.filter((t) => {
      if (filtroTipo !== 'todas' && t.tipo !== filtroTipo) return false;
      if (filtroResp === 'mias') return t.responsableId === usuario?.id;
      if (filtroResp === 'sin') return !t.responsableId;
      if (filtroResp !== 'todos') return t.responsableId === filtroResp;
      return true;
    });

  const lista = pestania === 'hechas' ? aplicarFiltros(hechasQ.data ?? []) : aplicarFiltros(filtrarVista(pendientes, pestania, hoy));
  const cuenta = (v: Vista) => aplicarFiltros(filtrarVista(pendientes, v, hoy)).length;
  const vencidas = aplicarFiltros(pendientes).filter((t) => t.vence && t.vence < hoy).length;

  function agregarRapida(e: FormEvent) {
    e.preventDefault();
    if (!rapida.trim()) return;
    crear.mutate({ ...borradorDe(undefined, rapidaTipo), titulo: rapida.trim(), vence: rapidaVence });
    setRapida('');
  }

  function crearDesdeSugerencia(s: Sugerencia) {
    crear.mutate({ ...borradorDe(undefined, s.tipo), titulo: s.titulo, notas: s.notas, vence: s.vence, origen: s.origen });
  }

  function guardarEdicion(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const b = editando.borrador;
    if (!b.titulo.trim()) { toast('Escribí qué hay que hacer', { tono: 'error' }); return; }
    if (editando.tarea) editar.mutate({ id: editando.tarea._id, b, previa: editando.tarea });
    else crear.mutate(b);
    setEditando(null);
  }

  const cambiarBorrador = (p: Partial<Borrador>) => setEditando((x) => (x ? { ...x, borrador: { ...x.borrador, ...p } } : x));

  if (pendientesQ.error) {
    return (
      <>
        <div className="section-header"><div className="section-title">Tareas</div></div>
        <ErrorCarga mensaje={`No se pudieron cargar las tareas: ${(pendientesQ.error as Error).message}`} onReintentar={() => void pendientesQ.refetch()} />
      </>
    );
  }

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Tareas <small>{vencidas > 0 ? `${vencidas} vencida${vencidas === 1 ? '' : 's'}` : 'Al día'}</small>
        </div>
        <button type="button" className="btn" onClick={() => setEditando({ borrador: borradorDe(undefined, tipos[0]) })}>
          + Nueva tarea
        </button>
      </div>

      <form onSubmit={agregarRapida} className="tabla-wrap" style={{ padding: 'var(--sp-3)', marginBottom: 'var(--sp-4)', display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          id="tarea-rapida"
          aria-label="Tarea rápida"
          value={rapida}
          onChange={(e) => setRapida(e.target.value)}
          placeholder="Escribí una tarea y apretá Enter…"
          style={{ flex: 1, minWidth: 220 }}
        />
        <input type="date" aria-label="Vence" value={rapidaVence} onChange={(e) => setRapidaVence(e.target.value)} style={{ width: 'auto' }} />
        {tipos.length > 1 && (
          <select aria-label="Tipo" value={rapidaTipo} onChange={(e) => setRapidaTipo(e.target.value as TipoTarea)} style={{ width: 'auto' }}>
            <option value="operativa">Operativa</option>
            <option value="administrativa">Administrativa</option>
          </select>
        )}
        <button type="submit" className="btn" disabled={!rapida.trim()}>Agregar</button>
      </form>

      {propuestas.length > 0 && (
        <div className="alerta info" style={{ display: 'block', marginBottom: 'var(--sp-4)' }}>
          <button type="button" className="btn fantasma sm" onClick={() => setVerSugerencias((v) => !v)} style={{ marginBottom: verSugerencias ? 8 : 0 }}>
            {verSugerencias ? '▾' : '▸'} La app sugiere {propuestas.length} tarea{propuestas.length === 1 ? '' : 's'}
          </button>
          {verSugerencias && (
            <div style={{ display: 'grid', gap: 6 }}>
              {propuestas.map((s) => (
                <div key={s.origen} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200 }}><strong>{s.titulo}</strong> <span style={{ color: 'var(--texto-2)', fontSize: 13 }}>{s.notas}</span></span>
                  <button type="button" className="btn sm" onClick={() => crearDesdeSugerencia(s)}>Crear tarea</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
        {([
          ['hoy', `Hoy (${cuenta('hoy')})`],
          ['semana', `Esta semana (${cuenta('semana')})`],
          ['todas', `Todas (${cuenta('todas')})`],
          ['hechas', 'Hechas'],
        ] as [Pestania, string][]).map(([v, label]) => (
          <button key={v} type="button" className={`btn sm ${pestania === v ? '' : 'secundario'}`} onClick={() => setPestania(v)}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
        {tipos.length > 1 && (
          <select aria-label="Filtrar por tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as 'todas' | TipoTarea)} style={{ width: 'auto' }}>
            <option value="todas">Todos los tipos</option>
            <option value="operativa">Operativas</option>
            <option value="administrativa">Administrativas</option>
          </select>
        )}
        <select aria-label="Filtrar por responsable" value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)} style={{ width: 'auto' }}>
          <option value="todos">Todos</option>
          <option value="mias">Mías</option>
          <option value="sin">Sin asignar</option>
          {responsables.filter((r) => r._id !== usuario?.id).map((r) => <option key={r._id} value={r._id}>{r.nombre}</option>)}
        </select>
      </div>

      {pendientesQ.isLoading ? (
        <p style={{ padding: 16 }}>Cargando…</p>
      ) : lista.length === 0 ? (
        <Vacio
          icono={pestania === 'hechas' ? '📋' : '✅'}
          titulo={pestania === 'hechas' ? 'Todavía no hay tareas hechas' : pestania === 'hoy' ? 'Nada pendiente para hoy' : 'No hay tareas pendientes'}
          texto={pestania === 'hechas' ? undefined : 'Cargá una arriba, o mirá "Esta semana".'}
        />
      ) : (
        <div className="tabla-wrap">
          {lista.map((t) => {
            const v = etiquetaVence(t.vence, hoy);
            const hechos = t.checklist.filter((i) => i.hecho).length;
            const expandida = abierta === t._id;
            const hecha = t.estado === 'hecha';
            return (
              <div key={t._id} style={{ borderTop: 'var(--borde)', padding: 'var(--sp-3) var(--sp-4)' }}>
                <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    aria-label={hecha ? `Marcar "${t.titulo}" como pendiente` : `Marcar "${t.titulo}" como hecha`}
                    checked={hecha}
                    onChange={() => completar.mutate({ id: t._id, hecha: !hecha })}
                    style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <button
                    type="button"
                    onClick={() => setAbierta(expandida ? null : t._id)}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}
                    aria-expanded={expandida}
                  >
                    <div style={{ fontWeight: 600, textDecoration: hecha ? 'line-through' : undefined, color: hecha ? 'var(--texto-3)' : undefined }}>
                      {t.prioridad === 'urgente' && !hecha && '🔴 '}{t.titulo}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, fontSize: 12 }}>
                      {hecha ? (
                        <span className="badge ok">Hecha{t.hechaPor ? ` por ${t.hechaPor}` : ''}</span>
                      ) : (
                        <span className={`badge ${v.tono}`}>{v.texto}{t.hora ? ` · ${t.hora}` : ''}</span>
                      )}
                      {tipos.length > 1 && <span className="badge info">{t.tipo === 'administrativa' ? 'Administrativa' : 'Operativa'}</span>}
                      <span style={{ color: 'var(--texto-2)' }}>{t.responsableNombre || 'Sin asignar'}</span>
                      {t.repetir?.cada && <span style={{ color: 'var(--texto-2)' }}>🔁 {describirRepeticion(t.repetir)}</span>}
                      {t.checklist.length > 0 && <span style={{ color: 'var(--texto-2)' }}>☑ {hechos}/{t.checklist.length}</span>}
                      {t.comentarios.length > 0 && <span style={{ color: 'var(--texto-2)' }}>💬 {t.comentarios.length}</span>}
                    </div>
                  </button>
                </div>

                {expandida && (
                  <div style={{ marginTop: 'var(--sp-3)', marginLeft: 34, display: 'grid', gap: 'var(--sp-3)' }}>
                    {t.notas && <p style={{ whiteSpace: 'pre-wrap', color: 'var(--texto-2)' }}>{t.notas}</p>}

                    {t.checklist.length > 0 && (
                      <div style={{ display: 'grid', gap: 4 }}>
                        {t.checklist.map((i) => (
                          <label key={i._id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                            <input type="checkbox" checked={i.hecho} onChange={() => marcarItem.mutate({ id: t._id, itemId: i._id, hecho: !i.hecho })} />
                            <span style={{ textDecoration: i.hecho ? 'line-through' : undefined, color: i.hecho ? 'var(--texto-3)' : undefined }}>{i.texto}</span>
                            {i.hecho && i.hechoPor && <span style={{ fontSize: 11, color: 'var(--texto-3)' }}>({i.hechoPor})</span>}
                          </label>
                        ))}
                      </div>
                    )}

                    {t.comentarios.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {t.comentarios.map((c) => (
                          <div key={c._id} style={{ fontSize: 13, background: 'var(--superficie-2)', borderRadius: 'var(--r-sm)', padding: '6px 10px' }}>
                            <strong>{c.autor}</strong> <span style={{ color: 'var(--texto-3)', fontSize: 11 }}>{new Date(c.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{c.texto}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <form
                      onSubmit={(e) => { e.preventDefault(); if (comentario.trim()) comentar.mutate({ id: t._id, texto: comentario.trim() }); }}
                      style={{ display: 'flex', gap: 'var(--sp-2)' }}
                    >
                      <input aria-label="Comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Agregar un comentario o novedad…" style={{ flex: 1 }} />
                      <button type="submit" className="btn secundario sm" disabled={!comentario.trim()}>Comentar</button>
                    </form>

                    <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                      {!hecha && <button type="button" className="btn secundario sm" onClick={() => setEditando({ tarea: t, borrador: borradorDe(t) })}>✏️ Editar</button>}
                      {!hecha && !t.responsableId && usuario && (
                        <button type="button" className="btn secundario sm" onClick={() => asignar.mutate({ id: t._id, responsableId: usuario.id })}>Me la quedo</button>
                      )}
                      {(administra || t.creadaPor === usuario?.nombre) && (
                        <button type="button" className="btn fantasma sm" style={{ color: 'var(--rojo)' }} onClick={() => setBorrar(t)}>Borrar</button>
                      )}
                      <span style={{ fontSize: 12, color: 'var(--texto-3)', alignSelf: 'center' }}>Creada por {t.creadaPor || '—'}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editando && (
        <Modal titulo={editando.tarea ? 'Editar tarea' : 'Nueva tarea'} onCerrar={() => setEditando(null)}>
          <form onSubmit={guardarEdicion} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-group">
              <label htmlFor="tarea-titulo">Qué hay que hacer</label>
              <input id="tarea-titulo" value={editando.borrador.titulo} onChange={(e) => cambiarBorrador({ titulo: e.target.value })} placeholder="Ej: Pagar monotributo" required />
            </div>
            <div className="form-grid">
              {tipos.length > 1 && (
                <div className="form-group">
                  <label htmlFor="tarea-tipo">Tipo</label>
                  <select id="tarea-tipo" value={editando.borrador.tipo} onChange={(e) => cambiarBorrador({ tipo: e.target.value as TipoTarea })}>
                    <option value="operativa">Operativa</option>
                    <option value="administrativa">Administrativa</option>
                  </select>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="tarea-prioridad">Prioridad</label>
                <select id="tarea-prioridad" value={editando.borrador.prioridad} onChange={(e) => cambiarBorrador({ prioridad: e.target.value as 'normal' | 'urgente' })}>
                  <option value="normal">Normal</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="tarea-vence">Vence</label>
                <input id="tarea-vence" type="date" value={editando.borrador.vence} onChange={(e) => cambiarBorrador({ vence: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="tarea-hora">Hora (opcional)</label>
                <input id="tarea-hora" type="time" value={editando.borrador.hora} onChange={(e) => cambiarBorrador({ hora: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="tarea-resp">Responsable</label>
                <select
                  id="tarea-resp"
                  value={editando.borrador.responsableId}
                  onChange={(e) => cambiarBorrador({ responsableId: e.target.value })}
                  disabled={!administra && Boolean(editando.tarea?.responsableId)}
                >
                  <option value="">Sin asignar</option>
                  {responsables
                    .filter((r) => administra || r._id === usuario?.id || r._id === editando.borrador.responsableId)
                    .map((r) => <option key={r._id} value={r._id}>{r.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="tarea-repetir">Se repite</label>
                <select
                  id="tarea-repetir"
                  value={editando.borrador.repetir.cada}
                  onChange={(e) => cambiarBorrador({ repetir: REPETICIONES.find((x) => x.valor === e.target.value)?.r ?? { cada: '', n: 1 } })}
                >
                  {REPETICIONES.map((x) => <option key={x.valor} value={x.valor}>{x.label}</option>)}
                </select>
              </div>
              {editando.borrador.repetir.cada === 'dias' && (
                <div className="form-group">
                  <label htmlFor="tarea-n">Cada cuántos días</label>
                  <input id="tarea-n" type="number" min="1" max="365" value={editando.borrador.repetir.n} onChange={(e) => cambiarBorrador({ repetir: { cada: 'dias', n: Number(e.target.value) || 1 } })} />
                </div>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="tarea-check">Pasos (uno por línea, opcional)</label>
              <textarea id="tarea-check" rows={4} value={editando.borrador.checklist} onChange={(e) => cambiarBorrador({ checklist: e.target.value })} placeholder={'Nafta y mezcla 2T\nAfilar cadena\nCargar bordeadora'} />
            </div>
            <div className="form-group">
              <label htmlFor="tarea-notas">Notas</label>
              <textarea id="tarea-notas" rows={3} value={editando.borrador.notas} onChange={(e) => cambiarBorrador({ notas: e.target.value })} />
            </div>
            {editando.borrador.repetir.cada && (
              <p className="form-ayuda" style={{ margin: 0 }}>Al marcarla hecha, se crea sola la próxima con los pasos sin tildar.</p>
            )}
            <ModalAcciones onCancelar={() => setEditando(null)} textoConfirmar={editando.tarea ? 'Guardar' : 'Crear tarea'} />
          </form>
        </Modal>
      )}

      {borrar && (
        <ModalConfirmar
          titulo="Borrar tarea"
          peligro
          textoConfirmar="Borrar"
          mensaje={<>Se borra <strong>{borrar.titulo}</strong>. Si se repetía, las próximas ya creadas no se tocan.</>}
          onConfirmar={() => eliminar.mutate(borrar._id)}
          onCerrar={() => setBorrar(null)}
        />
      )}
    </>
  );
}
