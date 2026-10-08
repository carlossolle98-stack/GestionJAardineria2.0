import { useState, type FormEvent } from 'react';
import { money } from '@/lib/format';
import { mesClaveRef } from '@/lib/j2local';
import type { J2Empleado } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones } from '@/components/Modal';
import { Vacio } from '@/components/Estados';

/** Las cinco operaciones que se hacen sobre la ficha de un empleado. */
type Operacion = 'mutual' | 'aguinaldo' | 'intereses' | 'ajuste' | 'adelanto';

const TITULOS: Record<Operacion, { titulo: string; descripcion: string; confirmar: string }> = {
  mutual: {
    titulo: 'Registrar descuento mutual',
    descripcion: 'Lo retenido entra a la caja y se paga más adelante como egreso.',
    confirmar: 'Registrar mutual',
  },
  aguinaldo: {
    titulo: 'Registrar descuento de aguinaldo',
    descripcion: 'Se acumula en la cuenta de COCOS hasta que se paga.',
    confirmar: 'Registrar aguinaldo',
  },
  intereses: {
    titulo: 'Agregar intereses generados',
    descripcion: 'Suma el rendimiento al aguinaldo acumulado, sin mover la caja.',
    confirmar: 'Agregar intereses',
  },
  ajuste: {
    titulo: 'Ajuste manual del saldo',
    descripcion: 'Corrige el total acumulado cuando no coincide con el resumen real.',
    confirmar: 'Ajustar saldo',
  },
  adelanto: {
    titulo: 'Registrar adelanto de sueldo',
    descripcion: 'El dinero sale de caja ahora y queda pendiente de descuento en el próximo sueldo.',
    confirmar: 'Registrar adelanto',
  },
};

function FichaEmpleado({ emp }: { emp: J2Empleado }) {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const mc = mesClaveRef();

  const [operacion, setOperacion] = useState<Operacion | null>(null);
  const [monto, setMonto] = useState('');
  const [cuenta, setCuenta] = useState<'mp' | 'banco' | 'efectivo'>('efectivo');

  const sueldosMes = j2.egresos.filter(
    (e) => e.tipo === 'sueldo' && e.categoria === emp.nombre && e.fecha.startsWith(mc)
  );
  const totalSueldo = sueldosMes.reduce((s, e) => s + e.monto, 0);

  const mutualMes = j2.movlog
    .filter(
      (m) =>
        m.tipo === 'mutual' && m.concepto === `Mutual — ${emp.nombre}` && m.fecha.startsWith(mc)
    )
    .reduce((s, m) => s + m.monto, 0);

  function abrir(op: Operacion) {
    setOperacion(op);
    // El ajuste arranca con el saldo actual para que se vea qué se está corrigiendo.
    setMonto(op === 'ajuste' ? String(emp.aguinaldo || 0) : '');
  }

  function cerrar() {
    setOperacion(null);
    setMonto('');
  }

  function guardar(e: FormEvent) {
    e.preventDefault();
    const m = Number(monto);

    if (!Number.isFinite(m) || (operacion !== 'ajuste' && m <= 0)) {
      toast('Ingresá un monto válido', { tono: 'error' });
      return;
    }

    switch (operacion) {
      case 'mutual':
        j2.registrarMutual(emp.nombre, m, cuenta);
        toast(`Mutual de ${emp.nombre} registrada · ${money(m)} a caja`, { tono: 'exito' });
        break;
      case 'aguinaldo':
        j2.registrarAguinaldo(emp.id, m);
        toast(`Aguinaldo de ${emp.nombre} · ${money(m)}`, { tono: 'exito' });
        break;
      case 'adelanto':
        j2.registrarAdelanto(emp.id, m, cuenta);
        toast(`Adelanto entregado a ${emp.nombre} · ${money(m)}`, { tono: 'exito' });
        break;
      case 'intereses':
        j2.ajustarInteresesAguinaldo(emp.id, m);
        toast(`Intereses agregados · ${money(m)}`, { tono: 'exito' });
        break;
      case 'ajuste': {
        const diferencia = m - (emp.aguinaldo || 0);
        if (diferencia === 0) {
          toast('El saldo ya estaba en ese valor');
          cerrar();
          return;
        }
        j2.ajustarInteresesAguinaldo(emp.id, diferencia);
        toast(`Saldo ajustado a ${money(m)}`, { tono: 'exito' });
        break;
      }
      default:
        return;
    }
    cerrar();
  }

  return (
    <div
      style={{
        background: 'var(--superficie)',
        border: 'var(--borde)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-5)',
        marginBottom: 'var(--sp-4)',
        boxShadow: 'var(--sombra)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          marginBottom: 'var(--sp-4)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 22 }} aria-hidden="true">
          {emp.activo ? '✅' : '⛔'}
        </span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--txt-lg)' }}>{emp.nombre}</div>
          <div style={{ fontSize: 'var(--txt-sm)', color: 'var(--texto-2)' }}>
            Sueldo este mes:{' '}
            <strong style={{ color: 'var(--rojo)' }}>
              {totalSueldo ? money(totalSueldo) : '—'}
            </strong>
            {!emp.activo && ' · inactivo'}
          </div>
        </div>
        <button
          type="button"
          className="btn secundario sm"
          onClick={() => {
            j2.toggleEmpleado(emp.id);
            toast(`${emp.nombre} quedó ${emp.activo ? 'inactivo' : 'activo'}`, { tono: 'exito' });
          }}
        >
          {emp.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>

      <div className="cards-grid" style={{ marginBottom: 0 }}>
        <div className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="card-label">💊 Mutual retenida este mes</div>
          <div className="card-valor" style={{ fontSize: 20 }}>
            {money(mutualMes)}
          </div>
          <div className="card-sub">Entra a caja y se paga con un egreso futuro</div>
          <button
            type="button"
            className="btn sm"
            style={{ marginTop: 'var(--sp-2)' }}
            onClick={() => abrir('mutual')}
          >
            Registrar descuento
          </button>
        </div>

        <div className="card amarillo" style={{ padding: 'var(--sp-4)' }}>
          <div className="card-label">💵 Adelanto pendiente</div>
          <div className="card-valor" style={{ fontSize: 20 }}>
            {money(emp.adelanto || 0)}
          </div>
          <div className="card-sub">
            {(emp.adelanto || 0) > 0
              ? 'A descontar del próximo sueldo'
              : 'Sin adelantos pendientes'}
          </div>
          <button
            type="button"
            className="btn sm"
            style={{ marginTop: 'var(--sp-2)' }}
            onClick={() => abrir('adelanto')}
          >
            Registrar adelanto
          </button>
        </div>

        <div className="card azul" style={{ padding: 'var(--sp-4)' }}>
          <div className="card-label">🏦 Aguinaldo en COCOS</div>
          <div className="card-valor" style={{ fontSize: 20 }}>
            {money(emp.aguinaldo || 0)}
          </div>
          <div className="card-sub">Acumula descuentos más intereses</div>
          <div
            style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}
          >
            <button type="button" className="btn sm" onClick={() => abrir('aguinaldo')}>
              Descontar
            </button>
            <button type="button" className="btn secundario sm" onClick={() => abrir('intereses')}>
              Intereses
            </button>
            <button type="button" className="btn secundario sm" onClick={() => abrir('ajuste')}>
              Ajustar
            </button>
          </div>
        </div>
      </div>

      {operacion && (
        <Modal
          titulo={`${TITULOS[operacion].titulo} — ${emp.nombre}`}
          descripcion={TITULOS[operacion].descripcion}
          onCerrar={cerrar}
          ancho="chico"
        >
          <form onSubmit={guardar} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-group">
              <label htmlFor={`emp-monto-${emp.id}`}>
                {operacion === 'ajuste' ? 'Nuevo saldo total' : 'Monto'}
              </label>
              <input
                id={`emp-monto-${emp.id}`}
                type="number"
                inputMode="numeric"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="Ej: 15000"
                required
              />
              {operacion === 'ajuste' && (
                <p className="form-ayuda">Saldo actual: {money(emp.aguinaldo || 0)}</p>
              )}
            </div>

            {(operacion === 'mutual' || operacion === 'adelanto') && (
              <div className="form-group">
                <label htmlFor={`emp-cuenta-${emp.id}`}>
                  {operacion === 'mutual' ? 'Cuenta que recibe' : 'Cuenta de salida'}
                </label>
                <select
                  id={`emp-cuenta-${emp.id}`}
                  value={cuenta}
                  onChange={(e) => setCuenta(e.target.value as 'mp' | 'banco' | 'efectivo')}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="banco">Banco</option>
                  <option value="mp">Mercado Pago</option>
                </select>
              </div>
            )}

            <ModalAcciones onCancelar={cerrar} textoConfirmar={TITULOS[operacion].confirmar} />
          </form>
        </Modal>
      )}
    </div>
  );
}

export function EmpleadosPage() {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nombre, setNombre] = useState('');

  function agregar(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) {
      toast('Ingresá un nombre', { tono: 'error' });
      return;
    }
    if (j2.empleados.some((emp) => emp.nombre.toLowerCase() === n.toLowerCase())) {
      toast(`${n} ya está en la lista`, { tono: 'error' });
      return;
    }
    j2.addEmpleado(n);
    setNombre('');
    setModalAbierto(false);
    toast(`${n} agregado al equipo`, { tono: 'exito' });
  }

  const activos = j2.empleados.filter((e) => e.activo).length;

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          Empleados
          <small>
            {activos} {activos === 1 ? 'activo' : 'activos'} de {j2.empleados.length}
          </small>
        </h2>
        <button type="button" className="btn" onClick={() => setModalAbierto(true)}>
          ➕ Agregar empleado
        </button>
      </div>

      {j2.empleados.length === 0 ? (
        <Vacio
          icono="👷"
          titulo="Todavía no cargaste empleados"
          texto="Agregá a quien trabaja con vos para poder registrarle sueldos, mutual y aguinaldo."
          accion={
            <button type="button" className="btn" onClick={() => setModalAbierto(true)}>
              Agregar empleado
            </button>
          }
        />
      ) : (
        j2.empleados.map((emp) => <FichaEmpleado key={emp.id} emp={emp} />)
      )}

      {modalAbierto && (
        <Modal titulo="Agregar empleado" onCerrar={() => setModalAbierto(false)} ancho="chico">
          <form onSubmit={agregar} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-group">
              <label htmlFor="empleado-nombre">Nombre</label>
              <input
                id="empleado-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre y apellido"
                required
              />
            </div>
            <ModalAcciones
              onCancelar={() => setModalAbierto(false)}
              textoConfirmar="Agregar al equipo"
            />
          </form>
        </Modal>
      )}
    </>
  );
}
