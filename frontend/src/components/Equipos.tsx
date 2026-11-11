import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import type { Equipo, Turno } from '@/types';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones } from '@/components/Modal';
import { useJ2Local } from '@/context/J2LocalContext';

export const COLORES_EQUIPO = ['#2e7d32', '#1565c0', '#e65100', '#6a1b9a', '#00838f', '#ad1457'];

type Persona = { usuarioId: string; nombre: string };

/** Horas que se agendaron, según la duración elegida. */
export function horasAgendadas(duracion: string) {
  const d = duracion.toLowerCase();
  if (d.includes('medio')) return 4;
  if (d.includes('completo')) return 8;
  const n = Number(d.replace(',', '.').match(/[\d.]+/)?.[0]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function useEquipos() {
  return useQuery({
    queryKey: ['equipos'],
    queryFn: () => getJson<Equipo[]>('/api/equipos'),
    retry: false,
  });
}

/** Personas que se pueden sumar a un equipo: los usuarios de la app (si se pueden leer) y los miembros ya cargados. */
function usePersonas(equipos: Equipo[]) {
  const { data = [] } = useQuery({
    queryKey: ['jornadas-personas'],
    queryFn: () => getJson<{ id: string; nombre: string }[]>('/api/jornadas/personas'),
    retry: false,
  });
  const j2 = useJ2Local();
  const todas = new Map<string, Persona>();
  for (const p of data) todas.set(p.nombre.toLowerCase(), { usuarioId: p.id, nombre: p.nombre });
  // Todos los empleados activos, tengan o no usuario en la app. Si coincide con un
  // usuario (por el vínculo o por el primer nombre), aparece una sola vez.
  for (const e of j2.empleados.filter((x) => x.activo)) {
    const vinculado = e.horario?.usuarioId && data.find((p) => p.id === e.horario?.usuarioId);
    const primero = e.nombre.trim().split(' ')[0].toLowerCase();
    const yaEsta = vinculado || [...todas.keys()].some((k) => k === e.nombre.toLowerCase() || k.split(' ')[0] === primero);
    if (!yaEsta) todas.set(e.nombre.toLowerCase(), { usuarioId: e.horario?.usuarioId ?? '', nombre: e.nombre });
  }
  for (const e of equipos) {
    for (const m of e.miembros) {
      const primero = m.nombre.trim().split(' ')[0].toLowerCase();
      if (![...todas.keys()].some((k) => k === m.nombre.toLowerCase() || k.split(' ')[0] === primero)) todas.set(m.nombre.toLowerCase(), m);
    }
  }
  return [...todas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={`btn sm ${activo ? '' : 'secundario'}`}
      style={{ padding: '10px 14px', fontSize: 15 }}
      onClick={onClick}
    >
      {activo ? '✓ ' : ''}{children}
    </button>
  );
}

/** Armar y cambiar los equipos. */
export function ModalEquipos({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: equipos = [], error } = useEquipos();
  const personas = usePersonas(equipos);
  const [editando, setEditando] = useState<Equipo | 'nuevo' | null>(null);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(COLORES_EQUIPO[0]);
  const [miembros, setMiembros] = useState<Persona[]>([]);
  const [otro, setOtro] = useState('');

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { nombre: nombre.trim(), color, miembros, encargado: miembros[0]?.nombre ?? '' };
      return editando === 'nuevo' ? sendJson('/api/equipos', 'POST', cuerpo) : sendJson(`/api/equipos/${(editando as Equipo)._id}`, 'PATCH', cuerpo);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['equipos'] }); setEditando(null); toast('Equipo guardado', { tono: 'exito' }); },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });
  const archivar = useMutation({
    mutationFn: (e: Equipo) => sendJson(`/api/equipos/${e._id}`, 'PATCH', { activo: !e.activo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['equipos'] }),
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  function abrir(e: Equipo | 'nuevo') {
    setEditando(e);
    setNombre(e === 'nuevo' ? `Equipo ${equipos.length + 1}` : e.nombre);
    setColor(e === 'nuevo' ? COLORES_EQUIPO[equipos.length % COLORES_EQUIPO.length] : e.color);
    setMiembros(e === 'nuevo' ? [] : e.miembros);
    setOtro('');
  }
  const esta = (p: Persona) => miembros.some((m) => m.nombre.toLowerCase() === p.nombre.toLowerCase());
  const alternar = (p: Persona) => setMiembros(esta(p) ? miembros.filter((m) => m.nombre.toLowerCase() !== p.nombre.toLowerCase()) : [...miembros, p]);

  if (editando) {
    return (
      <Modal titulo={editando === 'nuevo' ? 'Nuevo equipo' : `Editar ${editando.nombre}`} onCerrar={() => setEditando(null)}>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (!nombre.trim()) { toast('Poné un nombre', { tono: 'error' }); return; } guardar.mutate(); }} style={{ display: 'grid', gap: 14 }}>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="eq-nombre">Nombre</label>
              <input id="eq-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="form-group">
              <span style={{ fontSize: 'var(--txt-sm)', fontWeight: 600 }}>Color</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {COLORES_EQUIPO.map((c) => (
                  <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                    style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--texto)' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Quiénes salen en este equipo</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {personas.map((p) => <Chip key={p.nombre} activo={esta(p)} onClick={() => alternar(p)}>{p.nombre}</Chip>)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input className="campo" value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Otra persona (sin usuario)" aria-label="Otra persona" />
              <button type="button" className="btn secundario sm" onClick={() => { if (otro.trim()) { setMiembros([...miembros, { usuarioId: '', nombre: otro.trim() }]); setOtro(''); } }}>Sumar</button>
            </div>
            <p className="form-ayuda">El primero que marcás queda como encargado. Una persona puede estar en más de un equipo.</p>
          </div>
          <ModalAcciones onCancelar={() => setEditando(null)} textoConfirmar="Guardar equipo" enviando={guardar.isPending} />
        </form>
      </Modal>
    );
  }

  return (
    <Modal titulo="Equipos de trabajo" descripcion="Quiénes salen juntos. Después, cada turno se asigna a un equipo." onCerrar={onCerrar}>
      {error && <div className="alerta aviso" role="alert">No se pudieron leer los equipos: falta publicar el servidor.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {equipos.map((e) => (
          <div key={e._id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 10, border: 'var(--borde)', borderRadius: 10, opacity: e.activo ? 1 : 0.55 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: e.color }} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 160 }}>
              <strong>{e.nombre}</strong>
              <div style={{ fontSize: 13, color: 'var(--texto-2)' }}>{e.miembros.map((m) => m.nombre).join(', ') || 'Sin miembros'}</div>
            </div>
            <button type="button" className="btn secundario sm" onClick={() => abrir(e)}>Editar</button>
            <button type="button" className="btn secundario sm" onClick={() => archivar.mutate(e)}>{e.activo ? 'Archivar' : 'Reactivar'}</button>
          </div>
        ))}
        {equipos.length === 0 && !error && <p style={{ color: 'var(--texto-2)' }}>Todavía no hay equipos.</p>}
        <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={() => abrir('nuevo')} disabled={Boolean(error)}>+ Nuevo equipo</button>
      </div>
    </Modal>
  );
}

/**
 * Marcar un turno como hecho: quiénes fueron (con un toque) y cuánto se tardó.
 * Viene completo con el equipo del turno y la duración agendada.
 */
export function ModalTurnoHecho({
  turno,
  equipos,
  onConfirmar,
  onCerrar,
  enviando,
}: {
  turno: Turno;
  equipos: Equipo[];
  onConfirmar: (datos: { personas: Persona[]; horasReales: number }) => void;
  onCerrar: () => void;
  enviando: boolean;
}) {
  const personas = usePersonas(equipos);
  const equipo = equipos.find((e) => e._id === turno.equipoId);
  const [elegidas, setElegidas] = useState<Persona[]>(equipo?.miembros ?? []);
  const agendadas = horasAgendadas(turno.duracion);
  const [horas, setHoras] = useState(String(agendadas));
  const esta = (p: Persona) => elegidas.some((m) => m.nombre.toLowerCase() === p.nombre.toLowerCase());
  const real = Number(horas.replace(',', '.')) || 0;

  return (
    <Modal titulo={`Turno hecho — ${turno.cliente}`} descripcion={`${turno.fecha.split('-').reverse().join('/')} · agendado ${turno.duracion}`} onCerrar={onCerrar}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>¿Quiénes fueron?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {personas.map((p) => (
              <Chip key={p.nombre} activo={esta(p)} onClick={() => setElegidas(esta(p) ? elegidas.filter((m) => m.nombre.toLowerCase() !== p.nombre.toLowerCase()) : [...elegidas, p])}>
                {p.nombre}
              </Chip>
            ))}
            {personas.length === 0 && <span className="form-ayuda">Armá los equipos para elegir con un toque.</span>}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>¿Cuánto tardaron en el lugar?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[agendadas - 0.5, agendadas, agendadas + 0.5, agendadas + 1].filter((v) => v > 0).map((v) => (
              <Chip key={v} activo={real === v} onClick={() => setHoras(String(v))}>{`${String(v).replace('.', ',')} h`}</Chip>
            ))}
            <input className="campo" style={{ width: 90 }} type="number" inputMode="decimal" step="0.25" min="0" value={horas} onChange={(e) => setHoras(e.target.value)} aria-label="Horas reales" />
          </div>
          {real > 0 && real !== agendadas && (
            <p className="form-ayuda">{real > agendadas ? `${String(real - agendadas).replace('.', ',')} h más` : `${String(agendadas - real).replace('.', ',')} h menos`} de lo agendado.</p>
          )}
        </div>
        <ModalAcciones
          tipo="button"
          onCancelar={onCerrar}
          onConfirmar={() => onConfirmar({ personas: elegidas, horasReales: real })}
          textoConfirmar="✓ Marcar como hecho"
          enviando={enviando}
        />
      </div>
    </Modal>
  );
}
