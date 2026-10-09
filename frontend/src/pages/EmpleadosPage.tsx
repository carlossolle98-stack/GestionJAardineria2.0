import { useState, type FormEvent } from 'react';
import { money } from '@/lib/format';
import { hoyLocal } from '@/lib/j2reducer';
import { mesClaveRef } from '@/lib/j2local';
import type { J2Empleado } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import { Vacio } from '@/components/Estados';

/** Las cinco operaciones que se hacen sobre la ficha de un empleado. */
type Operacion = 'mutual' | 'aguinaldo' | 'intereses' | 'ajuste' | 'adelanto' | 'liquidar';

const TITULOS: Record<Operacion, { titulo: string; descripcion: string; confirmar: string }> = {
  mutual: {
    titulo: 'Registrar descuento mutual',
    descripcion: 'Lo retenido entra a la caja y se paga más adelante como egreso.',
    confirmar: 'Registrar mutual',
  },
  aguinaldo: {
    titulo: 'Registrar descuento de aguinaldo',
    descripcion: 'Se guarda en la inversión que elijas hasta que se paga.',
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
  liquidar: {
    titulo: 'Liquidar sueldo del mes',
    descripcion: 'Calculá el neto a pagar: bruto menos mutual ya retenida y adelantos entregados.',
    confirmar: 'Registrar liquidación',
  },
};

function FilaDetalle({
  label,
  valor,
  color,
  grande,
}: {
  label: string;
  valor: number;
  color?: string;
  grande?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 'var(--sp-2) 0',
        borderBottom: 'var(--borde)',
        fontSize: grande ? 'var(--txt-lg)' : 'var(--txt-base)',
      }}
    >
      <span style={{ color: grande ? 'var(--texto)' : 'var(--texto-2)' }}>{label}</span>
      <strong style={{ fontFamily: 'DM Mono,monospace', color: color ?? 'var(--texto)' }}>
        {money(valor)}
      </strong>
    </div>
  );
}

function FichaEmpleado({ emp }: { emp: J2Empleado }) {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const mc = mesClaveRef();

  const [operacion, setOperacion] = useState<Operacion | null>(null);
  const [monto, setMonto] = useState('');
  const [cuenta, setCuenta] = useState<'mp' | 'banco' | 'efectivo'>('efectivo');
  const inversionesActivas = j2.inversiones.items.filter((i) => i.activa);
  const [destino, setDestino] = useState(inversionesActivas[0]?.id ?? '');

  // Estado de liquidación
  const [lBruto, setLBruto] = useState('');
  const [lFecha, setLFecha] = useState(hoyLocal());
  const [lCuenta, setLCuenta] = useState<'mp' | 'banco' | 'efectivo'>('banco');
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const saldoPendiente = (emp.aguinaldo || 0) + (emp.adelanto || 0);

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

  const lBrutoNum = Number(lBruto) || 0;
  const lAdelanto = Math.min(emp.adelanto || 0, lBrutoNum);
  const lEgreso = lBrutoNum - lAdelanto;
  const lNeto = Math.max(0, lEgreso - mutualMes);

  function abrir(op: Operacion) {
    setOperacion(op);
    if (op === 'ajuste') setMonto(String(emp.aguinaldo || 0));
    else if (op === 'liquidar') { setLBruto(''); setLFecha(hoyLocal()); }
    else setMonto('');
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
      case 'aguinaldo': {
        const dest = inversionesActivas.find((i) => i.id === destino) ?? inversionesActivas[0];
        if (!dest) {
          toast('Primero creá una inversión en Finanzas para guardar el aguinaldo', { tono: 'error' });
          return;
        }
        j2.registrarAguinaldo(emp.id, m, dest.id);
        toast(`Aguinaldo de ${emp.nombre} · ${money(m)} a ${dest.nombre}`, { tono: 'exito' });
        break;
      }
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

  function guardarLiquidacion(e: FormEvent) {
    e.preventDefault();
    if (lBrutoNum <= 0) {
      toast('Ingresá el sueldo bruto', { tono: 'error' });
      return;
    }
    j2.liquidarSueldo({
      empleadoId: emp.id,
      bruto: lBrutoNum,
      mutual: mutualMes,
      adelanto: lAdelanto,
      cuenta: lCuenta,
      fecha: lFecha,
    });
    toast(`Liquidación de ${emp.nombre} registrada · a entregar ${money(lNeto)}`, { tono: 'exito' });
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
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          {emp.activo && (
            <button type="button" className="btn sm" onClick={() => abrir('liquidar')}>
              💰 Liquidar sueldo
            </button>
          )}
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
          <button
            type="button"
            className="btn secundario sm"
            style={{ color: 'var(--rojo)' }}
            onClick={() => {
              if (saldoPendiente > 0) {
                toast(
                  `${emp.nombre} tiene ${money(saldoPendiente)} entre aguinaldo y adelanto. Saldalo antes de eliminarlo, o desactivalo.`,
                  { tono: 'error' }
                );
                return;
              }
              setConfirmarBorrar(true);
            }}
          >
            🗑 Eliminar
          </button>
        </div>
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
          <div className="card-label">🏦 Aguinaldo acumulado</div>
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

      {operacion && operacion !== 'liquidar' && (
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

            {operacion === 'aguinaldo' && (
              <div className="form-group">
                <label htmlFor={`emp-destino-${emp.id}`}>Se guarda en</label>
                {inversionesActivas.length === 0 ? (
                  <p className="form-ayuda">No hay inversiones activas. Creá una en Finanzas → Inversiones.</p>
                ) : (
                  <select
                    id={`emp-destino-${emp.id}`}
                    value={inversionesActivas.some((i) => i.id === destino) ? destino : inversionesActivas[0].id}
                    onChange={(e) => setDestino(e.target.value)}
                  >
                    {inversionesActivas.map((i) => (
                      <option key={i.id} value={i.id}>{i.nombre}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

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

      {confirmarBorrar && (
        <ModalConfirmar
          titulo="Eliminar empleado"
          peligro
          textoConfirmar="Eliminar"
          mensaje={
            <>
              Se elimina a <strong>{emp.nombre}</strong> de la lista. Los sueldos ya registrados
              quedan en Egresos. Si trabajó con vos y dejó de hacerlo, mejor usá{' '}
              <strong>Desactivar</strong>.
            </>
          }
          onConfirmar={() => {
            j2.removeEmpleado(emp.id);
            setConfirmarBorrar(false);
            toast(`${emp.nombre} eliminado`, { tono: 'exito' });
          }}
          onCerrar={() => setConfirmarBorrar(false)}
        />
      )}

      {operacion === 'liquidar' && (
        <Modal
          titulo={`${TITULOS.liquidar.titulo} — ${emp.nombre}`}
          descripcion={TITULOS.liquidar.descripcion}
          onCerrar={cerrar}
        >
          <form onSubmit={guardarLiquidacion} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor={`liq-bruto-${emp.id}`}>Sueldo bruto</label>
                <input
                  id={`liq-bruto-${emp.id}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={lBruto}
                  onChange={(e) => setLBruto(e.target.value)}
                  placeholder="Ej: 450000"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor={`liq-fecha-${emp.id}`}>Fecha de pago</label>
                <input
                  id={`liq-fecha-${emp.id}`}
                  type="date"
                  value={lFecha}
                  onChange={(e) => setLFecha(e.target.value)}
                  required
                />
              </div>
            </div>

            {sueldosMes.length > 0 && (
              <div className="alerta aviso" role="alert">
                Este mes ya hay {money(totalSueldo)} registrados como sueldo de {emp.nombre}.
                Revisá que no estés liquidando dos veces.
              </div>
            )}

            <div
              style={{
                background: 'var(--superficie-2)',
                borderRadius: 'var(--r-md)',
                padding: 'var(--sp-4)',
              }}
            >
              <FilaDetalle label="Sueldo bruto" valor={lBrutoNum} />
              <FilaDetalle
                label="− Mutual retenida este mes"
                valor={mutualMes}
                color={mutualMes > 0 ? 'var(--rojo)' : undefined}
              />
              <FilaDetalle
                label="− Adelanto ya entregado"
                valor={lAdelanto}
                color={lAdelanto > 0 ? 'var(--rojo)' : undefined}
              />
              <div
                style={{
                  borderTop: '2px solid var(--linea-fuerte)',
                  marginTop: 'var(--sp-2)',
                  paddingTop: 'var(--sp-2)',
                }}
              >
                <FilaDetalle
                  label="= A entregar al empleado"
                  valor={lNeto}
                  color="var(--verde-vivo)"
                  grande
                />
              </div>
            </div>

            <p className="form-ayuda" style={{ marginTop: 0 }}>
              Se registra un egreso de sueldo por {money(lEgreso)} (bruto menos adelanto). La
              mutual ya figura en caja como retención.
              {lAdelanto > 0 && ` El adelanto de ${money(lAdelanto)} queda saldado.`}
            </p>

            <div className="form-group">
              <label htmlFor={`liq-cuenta-${emp.id}`}>Cuenta de pago</label>
              <select
                id={`liq-cuenta-${emp.id}`}
                value={lCuenta}
                onChange={(e) => setLCuenta(e.target.value as 'mp' | 'banco' | 'efectivo')}
              >
                <option value="banco">Banco</option>
                <option value="efectivo">Efectivo</option>
                <option value="mp">Mercado Pago</option>
              </select>
            </div>

            <ModalAcciones onCancelar={cerrar} textoConfirmar={TITULOS.liquidar.confirmar} />
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
