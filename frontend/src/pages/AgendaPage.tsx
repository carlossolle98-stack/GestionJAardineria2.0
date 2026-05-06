import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { diasLaborablesSemana, labelSemana, toYMD, weekRangeFromOffset } from '@/lib/agenda';
import type { Turno } from '@/types';
import { useToast } from '@/context/ToastContext';

export function AgendaPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [offset, setOffset] = useState(0);
  const { lunes, desde, hasta } = useMemo(() => weekRangeFromOffset(offset), [offset]);

  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['turnos', desde, hasta],
    queryFn: () => getJson<Turno[]>(`/api/turnos?desde=${desde}&hasta=${hasta}`),
  });

  const [tCliente, setTCliente] = useState('');
  const [tFecha, setTFecha] = useState(todayISO());
  const [tHora, setTHora] = useState('');
  const [tDur, setTDur] = useState('1 hora');
  const [tTipo, setTTipo] = useState('Cliente fijo');

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
      setTCliente('');
      setTHora('');
      toast('✓ Turno agregado');
    },
    onError: (e: Error) => toast(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => sendJson(`/api/turnos/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['turnos'] });
      toast('Turno eliminado');
    },
  });

  const porDia = useMemo(() => {
    const map = new Map<string, Turno[]>();
    for (const t of turnos) {
      const arr = map.get(t.fecha) || [];
      arr.push(t);
      map.set(t.fecha, arr);
    }
    for (const [, arr] of map) arr.sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    return map;
  }, [turnos]);

  function exportar() {
    const lines = turnos
      .filter((t) => t.fecha >= desde && t.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '').localeCompare(b.hora || ''))
      .map((t) => `• ${t.fecha} ${t.hora || ''} — ${t.cliente} (${t.duracion})`);
    const txt = `📅 AGENDA — Semana del ${labelSemana(lunes)}\n\n${lines.length ? lines.join('\n') : '(sin turnos)'}`;
    void navigator.clipboard.writeText(txt);
    toast('✓ Copiado');
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
        </div>
      </div>

      <div className="alerta aviso">
        <div>💡</div>
        <div>
          <strong>Reglas:</strong> clientes fijos primero · máx 3 turnos/día · lluvia: reprogramar sin acumular pendientes
        </div>
      </div>

      {diasLaborablesSemana(lunes).map(({ nombre, fecha, ymd }) => {
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
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                {fecha.toLocaleDateString('es-AR', { month: 'short' })}
              </div>
              {esHoy && (
                <div style={{ fontSize: 10, color: 'var(--verde-vivo)', fontWeight: 600, marginTop: 2 }}>HOY</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              {lista.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>Sin turnos</div>
              ) : (
                lista.map((t) => (
                  <div key={t._id} className="turno-item">
                    <div className="turno-hora">{t.hora || '—'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{t.cliente}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        {t.duracion} · {t.tipo}
                      </div>
                    </div>
                    <button type="button" onClick={() => delMut.mutate(t._id)} style={{ opacity: 0.5, border: 'none', background: 'none', cursor: 'pointer' }}>
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
      })}

      <div className="sep" />
      <div className="section-title" style={{ marginBottom: 12 }}>
        ➕ Agregar turno
      </div>
      <div className="tabla-wrap" style={{ padding: 20 }}>
        <div className="form-grid">
          <div className="form-group">
            <label>Cliente</label>
            <input value={tCliente} onChange={(e) => setTCliente(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Fecha</label>
            <input type="date" value={tFecha} onChange={(e) => setTFecha(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Hora</label>
            <input type="time" value={tHora} onChange={(e) => setTHora(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Duración</label>
            <select value={tDur} onChange={(e) => setTDur(e.target.value)}>
              <option>1 hora</option>
              <option>1.5 horas</option>
              <option>2 horas</option>
              <option>3 horas</option>
              <option>Medio día</option>
              <option>Día completo</option>
            </select>
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <select value={tTipo} onChange={(e) => setTTipo(e.target.value)}>
              <option>Cliente fijo</option>
              <option>Prospecto confirmado</option>
              <option>Reprogramado</option>
            </select>
          </div>
        </div>
        <button type="button" className="btn" onClick={() => addMut.mutate()} disabled={addMut.isPending}>
          Agregar
        </button>
      </div>
    </>
  );
}
