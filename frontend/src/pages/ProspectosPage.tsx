import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJson, sendJson } from '@/lib/api';
import { mensajeWa, copiar } from '@/lib/whatsapp';
import type { Prospecto } from '@/types';
import { useToast } from '@/context/ToastContext';

export function ProspectosPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const nav = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ['prospectos'],
    queryFn: () => getJson<Prospecto[]>('/api/prospectos'),
  });

  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    zona: '',
    tipoTrabajo: '',
    frecuencia: '',
    disponibilidad: '',
    estado: 'Presupuesto pendiente',
    notas: '',
  });

  const mut = useMutation({
    mutationFn: () => sendJson<Prospecto>('/api/prospectos', 'POST', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospectos'] });
      setShow(false);
      setForm({
        nombre: '',
        zona: '',
        tipoTrabajo: '',
        frecuencia: '',
        disponibilidad: '',
        estado: 'Presupuesto pendiente',
        notas: '',
      });
      toast('✓ Prospecto guardado');
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Prospectos <small>Pipeline</small>
        </div>
        <button type="button" className="btn" onClick={() => setShow(true)}>
          + Nuevo prospecto
        </button>
      </div>

      {show && (
        <>
          <div className="section-title" style={{ marginBottom: 12, fontSize: 16 }}>
            Registrar prospecto
          </div>
          <div className="tabla-wrap" style={{ padding: 20, marginBottom: 20 }}>
            <div className="form-grid">
              <div className="form-group">
                <label>Nombre</label>
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Zona</label>
                <input value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Tipo trabajo</label>
                <select value={form.tipoTrabajo} onChange={(e) => setForm({ ...form, tipoTrabajo: e.target.value })}>
                  <option value="">Seleccionar…</option>
                  <option>Mantenimiento mensual</option>
                  <option>Poda</option>
                  <option>Desmalezado</option>
                  <option>Diseño de jardín</option>
                  <option>Vivero / venta</option>
                  <option>Otro</option>
                </select>
              </div>
              <div className="form-group">
                <label>Frecuencia</label>
                <select value={form.frecuencia} onChange={(e) => setForm({ ...form, frecuencia: e.target.value })}>
                  <option value="">Sin definir</option>
                  <option>Mensual</option>
                  <option>Quincenal</option>
                  <option>Semanal</option>
                  <option>Una sola vez</option>
                </select>
              </div>
              <div className="form-group">
                <label>Disponibilidad</label>
                <input
                  value={form.disponibilidad}
                  onChange={(e) => setForm({ ...form, disponibilidad: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                  <option>Presupuesto pendiente</option>
                  <option>A confirmar</option>
                  <option>Espera / sin lugar</option>
                  <option>En negociación</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Notas</label>
              <textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn" onClick={() => mut.mutate()} disabled={mut.isPending}>
                Guardar
              </button>
              <button type="button" className="btn secundario" onClick={() => setShow(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Zona</th>
                <th>Tipo</th>
                <th>Frecuencia</th>
                <th>Estado</th>
                <th>Urgencia</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">🌱 No hay prospectos</div>
                  </td>
                </tr>
              ) : (
                data.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <strong>{p.nombre}</strong>
                    </td>
                    <td>{p.zona}</td>
                    <td>{p.tipoTrabajo || '—'}</td>
                    <td>{p.frecuencia}</td>
                    <td>
                      <span className={`badge ${p.estado.includes('Presupuesto') ? 'pendiente' : 'info'}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td>
                      <span className="badge pendiente">A gestionar</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => {
                          void copiar(mensajeWa('prospecto', p.nombre), toast);
                          nav('/whatsapp');
                        }}
                      >
                        💬 WA
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sep" />
      <div className="alerta info">
        <div>📌</div>
        <div>
          <strong>Datos mínimos para presupuestar:</strong>
          Zona exacta · Tipo de trabajo · m² o fotos · Frecuencia · Disponibilidad · Acceso moto/camioneta
        </div>
      </div>
    </>
  );
}
