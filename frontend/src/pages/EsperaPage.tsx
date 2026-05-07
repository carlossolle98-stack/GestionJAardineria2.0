import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJson } from '@/lib/api';
import { toYMD } from '@/lib/agenda';
import { diasDesde, semaforoEspera } from '@/lib/j2local';
import type { Cliente } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';

export function EsperaPage() {
  const { toast } = useToast();
  const nav = useNavigate();
  const j2 = useJ2Local();
  const [showForm, setShowForm] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [trabajo, setTrabajo] = useState('');
  const [notas, setNotas] = useState('');

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
  });

  const ordenados = useMemo(
    () => [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [clientes]
  );

  const listaOrd = useMemo(
    () =>
      [...j2.listaEspera].sort((a, b) => diasDesde(b.fechaAgregado) - diasDesde(a.fechaAgregado)),
    [j2.listaEspera]
  );

  function guardar() {
    if (!clienteId) {
      toast('⚠ Seleccioná un cliente');
      return;
    }
    const c = clientes.find((x) => x._id === clienteId);
    j2.addListaEspera({
      clienteId,
      nombreCliente: c?.nombre || '',
      trabajo: trabajo.trim(),
      notas: notas.trim(),
      fechaAgregado: toYMD(new Date()),
    });
    setTrabajo('');
    setNotas('');
    setShowForm(false);
    toast('✓ Cliente agregado a la lista de espera');
  }

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          En espera <small>Clientes sin fecha asignada aún</small>
        </div>
        <button type="button" className="btn" onClick={() => setShowForm((v) => !v)}>
          + Agregar a la lista
        </button>
      </div>

      <div className="alerta info">
        <div>⏳</div>
        <div>
          <strong>Semáforo de tiempo de espera:</strong> 🟢 Menos de 5 días · 🟡 Más de 5 días · 🔴 Más de 10 días
          (tratar con urgencia)
        </div>
      </div>

      {showForm && (
        <div className="tabla-wrap" style={{ padding: 20, marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 14, fontSize: 16 }}>
            Agregar cliente a la lista de espera
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Cliente</label>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">— Seleccioná un cliente —</option>
                {ordenados.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Tipo de trabajo</label>
              <input value={trabajo} onChange={(e) => setTrabajo(e.target.value)} placeholder="Ej: poda…" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Notas / contexto</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn" onClick={guardar}>
              Guardar en lista
            </button>
            <button type="button" className="btn secundario" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {listaOrd.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <p>No hay clientes en lista de espera</p>
        </div>
      ) : (
        listaOrd.map((e) => {
          const s = semaforoEspera(e.fechaAgregado);
          return (
            <div key={e.id} className="espera-card">
              <span className={`semaforo ${s.clase}`}>
                {s.icono} {s.texto}
              </span>
              <div className="ec-nombre">{e.nombreCliente}</div>
              <div className="ec-nota">
                {e.trabajo ? <strong>{e.trabajo}</strong> : null}
                {e.trabajo && e.notas ? ' · ' : null}
                {e.notas || '—'}
              </div>
              <div className="ec-acciones">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    nav('/agenda', { state: { prefillCliente: e.nombreCliente } });
                    j2.removeListaEspera(e.id);
                    toast('✓ Abrí la agenda para asignarle fecha');
                  }}
                >
                  📅 Agendar
                </button>
                <button type="button" className="btn secundario sm" onClick={() => j2.removeListaEspera(e.id)}>
                  ✕
                </button>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
