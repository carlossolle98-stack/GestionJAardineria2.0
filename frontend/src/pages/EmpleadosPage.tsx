import { useState } from 'react';
import { money } from '@/lib/format';
import { mesClaveRef } from '@/lib/j2local';
import type { J2Empleado } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';

function FichaEmpleado({ emp }: { emp: J2Empleado }) {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const mc = mesClaveRef();

  const [mutualMonto, setMutualMonto] = useState('');
  const [mutualCuenta, setMutualCuenta] = useState<'mp' | 'banco' | 'efectivo'>('efectivo');
  const [aguinaldoMonto, setAguinaldoMonto] = useState('');
  const [interesesMonto, setInteresesMonto] = useState('');
  const [ajusteManual, setAjusteManual] = useState('');
  const [showMutual, setShowMutual] = useState(false);
  const [showAguinaldo, setShowAguinaldo] = useState(false);
  const [showIntereses, setShowIntereses] = useState(false);
  const [showAjuste, setShowAjuste] = useState(false);

  const sueldosMes = j2.egresos.filter((e) => e.tipo === 'sueldo' && e.categoria === emp.nombre && e.fecha.startsWith(mc));
  const totalSueldo = sueldosMes.reduce((s, e) => s + e.monto, 0);

  function guardarMutual() {
    const m = parseInt(mutualMonto, 10);
    if (!m || m <= 0) { toast('⚠ Ingresá un monto válido'); return; }
    j2.registrarMutual(emp.nombre, m, mutualCuenta);
    setMutualMonto(''); setShowMutual(false);
    toast('✓ Mutual registrada — suma a caja líquida');
  }

  function guardarAguinaldo() {
    const m = parseInt(aguinaldoMonto, 10);
    if (!m || m <= 0) { toast('⚠ Ingresá un monto válido'); return; }
    j2.registrarAguinaldo(emp.id, m);
    setAguinaldoMonto(''); setShowAguinaldo(false);
    toast('✓ Aguinaldo registrado');
  }

  function guardarIntereses() {
    const m = parseInt(interesesMonto, 10);
    if (!m) { toast('⚠ Ingresá un monto'); return; }
    j2.ajustarInteresesAguinaldo(emp.id, m);
    setInteresesMonto(''); setShowIntereses(false);
    toast('✓ Intereses ajustados');
  }

  function guardarAjusteManual() {
    const m = parseInt(ajusteManual, 10);
    if (Number.isNaN(m)) { toast('⚠ Ingresá un monto'); return; }
    const diff = m - (emp.aguinaldo || 0);
    j2.ajustarInteresesAguinaldo(emp.id, diff);
    setAjusteManual(''); setShowAjuste(false);
    toast('✓ Saldo ajustado manualmente');
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>{emp.activo ? '✅' : '⛔'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{emp.nombre}</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            Sueldo este mes: <strong style={{ color: 'var(--rojo)' }}>{totalSueldo ? money(totalSueldo) : '—'}</strong>
          </div>
        </div>
        <button type="button" className="btn secundario sm" onClick={() => j2.toggleEmpleado(emp.id)}>
          {emp.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>

      {/* Cards internas */}
      <div className="cards-grid" style={{ marginBottom: 12 }}>
        {/* Mutual */}
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="card-label">💊 Mutual retenida este mes</div>
          <div className="card-valor" style={{ fontSize: 20 }}>
            {money(j2.movlog
              .filter((m) => m.tipo === 'mutual' && m.concepto === `Mutual — ${emp.nombre}` && m.fecha.startsWith(mc))
              .reduce((s, m) => s + m.monto, 0))}
          </div>
          <div className="card-sub">Ingresa a caja · se paga con egreso futuro</div>
          <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => setShowMutual(!showMutual)}>
            + Registrar descuento
          </button>
        </div>

        {/* Aguinaldo */}
        <div className="card azul" style={{ padding: '12px 16px' }}>
          <div className="card-label">🏦 Aguinaldo en COCOS</div>
          <div className="card-valor" style={{ fontSize: 20 }}>{money(emp.aguinaldo || 0)}</div>
          <div className="card-sub">Acumula descuentos + intereses</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm" onClick={() => setShowAguinaldo(!showAguinaldo)}>+ Descontar</button>
            <button type="button" className="btn secundario sm" onClick={() => setShowIntereses(!showIntereses)}>+ Intereses</button>
            <button type="button" className="btn secundario sm" onClick={() => { setAjusteManual(String(emp.aguinaldo || 0)); setShowAjuste(!showAjuste); }}>✏ Ajustar</button>
          </div>
        </div>
      </div>

      {/* Form Mutual */}
      {showMutual && (
        <div style={{ background: 'rgba(26,46,26,0.04)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>💊 Registrar descuento mutual</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 140 }}>
              <label>Monto retenido</label>
              <input type="number" value={mutualMonto} onChange={(e) => setMutualMonto(e.target.value)} placeholder="Ej: 15000" />
            </div>
            <div className="form-group" style={{ minWidth: 140 }}>
              <label>Cuenta que recibe</label>
              <select value={mutualCuenta} onChange={(e) => setMutualCuenta(e.target.value as 'mp' | 'banco' | 'efectivo')}>
                <option value="efectivo">Efectivo</option>
                <option value="banco">Banco</option>
                <option value="mp">Mercado Pago</option>
              </select>
            </div>
            <button type="button" className="btn" onClick={guardarMutual}>Guardar</button>
            <button type="button" className="btn secundario" onClick={() => setShowMutual(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Form Aguinaldo */}
      {showAguinaldo && (
        <div style={{ background: 'rgba(26,46,26,0.04)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>🏦 Registrar descuento aguinaldo</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 140 }}>
              <label>Monto descontado</label>
              <input type="number" value={aguinaldoMonto} onChange={(e) => setAguinaldoMonto(e.target.value)} placeholder="Ej: 20000" />
            </div>
            <button type="button" className="btn" onClick={guardarAguinaldo}>Guardar</button>
            <button type="button" className="btn secundario" onClick={() => setShowAguinaldo(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Form Intereses */}
      {showIntereses && (
        <div style={{ background: 'rgba(26,46,26,0.04)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>📈 Agregar intereses generados</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 140 }}>
              <label>Intereses (ARS)</label>
              <input type="number" value={interesesMonto} onChange={(e) => setInteresesMonto(e.target.value)} placeholder="Ej: 3500" />
            </div>
            <button type="button" className="btn" onClick={guardarIntereses}>Guardar</button>
            <button type="button" className="btn secundario" onClick={() => setShowIntereses(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Ajuste manual */}
      {showAjuste && (
        <div style={{ background: 'rgba(26,46,26,0.04)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>✏ Ajuste manual de saldo</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label>Nuevo saldo total</label>
              <input type="number" value={ajusteManual} onChange={(e) => setAjusteManual(e.target.value)} />
            </div>
            <button type="button" className="btn" onClick={guardarAjusteManual}>Guardar</button>
            <button type="button" className="btn secundario" onClick={() => setShowAjuste(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmpleadosPage() {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const [nombre, setNombre] = useState('');

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

  return (
    <>
      <div className="section-header">
        <div className="section-title">Empleados <small>Equipo, sueldos y retenciones</small></div>
      </div>

      <div className="tabla-wrap" style={{ padding: 20, marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 12, fontSize: 15 }}>➕ Agregar empleado</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 2, minWidth: 180 }}>
            <label>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
          </div>
          <button type="button" className="btn" onClick={agregar}>Agregar</button>
        </div>
      </div>

      <div className="section-title" style={{ marginBottom: 12 }}>👷 Fichas de empleados</div>
      {j2.empleados.length === 0 ? (
        <p style={{ color: '#bbb', padding: 12 }}>Sin empleados registrados</p>
      ) : (
        j2.empleados.map((emp) => <FichaEmpleado key={emp.id} emp={emp} />)
      )}
    </>
  );
}
