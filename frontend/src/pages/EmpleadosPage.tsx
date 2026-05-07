import { useState } from 'react';
import { mesClaveRef } from '@/lib/j2local';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';

export function EmpleadosPage() {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const [nombre, setNombre] = useState('');
  const mc = mesClaveRef();

  function agregar() {
    const n = nombre.trim();
    if (!n) { toast('⚠ Ingresá un nombre'); return; }
    if (j2.empleados.some((e) => e.nombre.toLowerCase() === n.toLowerCase())) {
      toast('⚠ Ya existe ese empleado'); return;
    }
    j2.addEmpleado(n);
    setNombre('');
    toast('✓ Empleado agregado');
  }

  const sueldosMes = j2.egresos.filter((e) => e.tipo === 'sueldo' && e.fecha.startsWith(mc));

  return (
    <>
      <div className="section-header">
        <div className="section-title">Empleados <small>Equipo y pagos</small></div>
      </div>

      <div className="tabla-wrap" style={{ padding: 20, marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12, fontSize: 15 }}>➕ Agregar empleado</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 2, minWidth: 180 }}>
            <label>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
          </div>
          <button type="button" className="btn" onClick={agregar}>Agregar</button>
        </div>
      </div>

      <div className="section-title" style={{ marginBottom: 12 }}>👷 Lista de empleados</div>
      {j2.empleados.length === 0 ? (
        <p style={{ color: '#bbb', padding: 12 }}>Sin empleados</p>
      ) : (
        j2.empleados.map((emp) => (
          <div
            key={emp.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              background: 'var(--bg-card)', borderRadius: 10, marginBottom: 8,
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 20 }}>{emp.activo ? '✅' : '⛔'}</span>
            <span style={{ fontWeight: 600, flex: 1 }}>{emp.nombre}</span>
            <span className={`badge ${emp.activo ? 'ok' : 'gris'}`}>{emp.activo ? 'Activo' : 'Inactivo'}</span>
            <button type="button" className="btn secundario sm" onClick={() => j2.toggleEmpleado(emp.id)}>
              {emp.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        ))
      )}

      <div className="section-title" style={{ margin: '24px 0 12px' }}>💸 Pagos este mes</div>
      <div className="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Pagos este mes</th>
              <th>Total pagado</th>
              <th>Último pago</th>
            </tr>
          </thead>
          <tbody>
            {j2.empleados.map((emp) => {
              const pagos = sueldosMes.filter((e) => e.categoria === emp.nombre);
              const total = pagos.reduce((s, e) => s + e.monto, 0);
              const todos = j2.egresos.filter((e) => e.tipo === 'sueldo' && e.categoria === emp.nombre);
              const ultimo = [...todos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
              return (
                <tr key={emp.id}>
                  <td>
                    <strong>{emp.nombre}</strong>{' '}
                    <span className={`badge ${emp.activo ? 'ok' : 'gris'}`} style={{ fontSize: 10 }}>
                      {emp.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{pagos.length}</td>
                  <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: 'var(--rojo)' }}>
                    {total ? `$${total.toLocaleString('es-AR')}` : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: '#888' }}>{ultimo?.fecha || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
