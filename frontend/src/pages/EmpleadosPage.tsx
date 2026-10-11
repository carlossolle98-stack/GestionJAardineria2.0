import { useState, type FormEvent } from 'react';
import { money } from '@/lib/format';
import { mesClaveRef } from '@/lib/j2local';
import type { J2Empleado } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import { Vacio } from '@/components/Estados';
import {
  describirModalidad,
  ModalConfigurarEmpleado,
  ModalPagarAguinaldo,
  ModalPagarSueldo,
  proximoPagoAguinaldo,
} from '@/components/Sueldos';

type Operacion = 'intereses' | 'ajuste' | 'adelanto';
type Ventana = Operacion | 'sueldo' | 'aguinaldo' | 'configurar' | 'borrar';

const TITULOS: Record<Operacion, { titulo: string; descripcion: string; confirmar: string }> = {
  intereses: {
    titulo: 'Intereses del aguinaldo',
    descripcion: 'Lo que rindió su cuenta de aguinaldo. Es informativo: no mueve la caja del negocio.',
    confirmar: 'Agregar intereses',
  },
  ajuste: {
    titulo: 'Ajustar aguinaldo acumulado',
    descripcion: 'Corrige el acumulado cuando no coincide con el saldo real.',
    confirmar: 'Ajustar',
  },
  adelanto: {
    titulo: 'Registrar adelanto de sueldo',
    descripcion: 'Sale de caja ahora y se descuenta solo en el próximo pago de sueldo.',
    confirmar: 'Registrar adelanto',
  },
};

function FichaEmpleado({ emp }: { emp: J2Empleado }) {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const mc = mesClaveRef();

  const [ventana, setVentana] = useState<Ventana | null>(null);
  const [monto, setMonto] = useState('');
  const [cuenta, setCuenta] = useState<'mp' | 'banco' | 'efectivo'>('efectivo');

  const sinDescuentos = emp.modalidad === 'sinDescuentos';
  const pendienteAguinaldo = sinDescuentos ? Math.max(0, emp.aguinaldoDevengado || 0) : 0;
  const saldoPendiente = pendienteAguinaldo + (emp.adelanto || 0);

  const pagosMes = j2.egresos.filter((e) => e.tipo === 'sueldo' && e.categoria === emp.nombre && e.fecha.startsWith(mc));
  const totalSueldo = pagosMes.reduce((s, e) => s + e.monto, 0);
  const mutualMes = pagosMes.reduce((s, e) => s + (e.origen?.tipo === 'sueldo' ? e.origen.mutual : 0), 0);

  function abrir(v: Ventana) {
    setVentana(v);
    setMonto(v === 'ajuste' ? String(emp.aguinaldo || 0) : '');
  }
  const cerrar = () => setVentana(null);

  function guardar(e: FormEvent) {
    e.preventDefault();
    const m = Number(monto);
    if (!Number.isFinite(m) || (ventana !== 'ajuste' && m <= 0)) {
      toast('Ingresá un monto válido', { tono: 'error' });
      return;
    }
    if (ventana === 'adelanto') {
      j2.registrarAdelanto(emp.id, m, cuenta);
      toast(`Adelanto entregado a ${emp.nombre} · ${money(m)}`, { tono: 'exito' });
    } else if (ventana === 'intereses') {
      j2.ajustarInteresesAguinaldo(emp.id, m);
      toast(`Intereses agregados · ${money(m)}`, { tono: 'exito' });
    } else if (ventana === 'ajuste') {
      const diferencia = m - (emp.aguinaldo || 0);
      if (diferencia !== 0) j2.ajustarInteresesAguinaldo(emp.id, diferencia);
      toast(`Acumulado ajustado a ${money(m)}`, { tono: 'exito' });
    }
    cerrar();
  }

  const operacion = ventana === 'intereses' || ventana === 'ajuste' || ventana === 'adelanto' ? ventana : null;

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22 }} aria-hidden="true">{emp.activo ? '✅' : '⛔'}</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--txt-lg)' }}>{emp.nombre}</div>
          <div style={{ fontSize: 'var(--txt-sm)', color: 'var(--texto-2)' }}>
            {describirModalidad(emp)}
            {!emp.activo && ' · inactivo'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          {emp.activo && (
            <button type="button" className="btn sm" onClick={() => abrir(emp.modalidad ? 'sueldo' : 'configurar')}>
              💰 Pagar sueldo
            </button>
          )}
          <button type="button" className="btn secundario sm" onClick={() => abrir('configurar')}>⚙ Cómo se le paga</button>
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
                toast(`${emp.nombre} tiene ${money(saldoPendiente)} pendientes entre aguinaldo y adelanto. Saldalo antes de eliminarlo, o desactivalo.`, { tono: 'error' });
                return;
              }
              abrir('borrar');
            }}
          >
            🗑 Eliminar
          </button>
        </div>
      </div>

      {!emp.modalidad && (
        <div className="alerta aviso" style={{ marginBottom: 'var(--sp-3)' }}>
          <div>
            Antes del primer pago, configurá cómo se le paga: si tiene descuento por mutual, si se le separa aguinaldo o si cobra sin descuentos.{' '}
            <button type="button" className="btn sm" onClick={() => abrir('configurar')}>Configurar</button>
          </div>
        </div>
      )}

      <div className="cards-grid" style={{ marginBottom: 0 }}>
        <div className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="card-label">💸 Pagado este mes</div>
          <div className="card-valor" style={{ fontSize: 20 }}>{money(totalSueldo)}</div>
          <div className="card-sub">
            {mutualMes > 0 ? `Descuento por mutual: ${money(mutualMes)}` : pagosMes.length ? `${pagosMes.length} pago${pagosMes.length === 1 ? '' : 's'}` : 'Sin pagos este mes'}
          </div>
        </div>

        <div className="card amarillo" style={{ padding: 'var(--sp-4)' }}>
          <div className="card-label">💵 Adelanto pendiente</div>
          <div className="card-valor" style={{ fontSize: 20 }}>{money(emp.adelanto || 0)}</div>
          <div className="card-sub">{(emp.adelanto || 0) > 0 ? 'Se descuenta solo en el próximo sueldo' : 'Sin adelantos pendientes'}</div>
          <button type="button" className="btn sm" style={{ marginTop: 'var(--sp-2)' }} onClick={() => abrir('adelanto')}>
            Registrar adelanto
          </button>
        </div>

        {sinDescuentos ? (
          <div className="card azul" style={{ padding: 'var(--sp-4)' }}>
            <div className="card-label">🎁 Aguinaldo a pagar en {proximoPagoAguinaldo()}</div>
            <div className="card-valor" style={{ fontSize: 20 }}>{money(pendienteAguinaldo)}</div>
            <div className="card-sub">{emp.aguinaldoPct ?? 0}% de lo que cobra. Es plata que el negocio le debe.</div>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <button type="button" className="btn sm" onClick={() => abrir('aguinaldo')} disabled={pendienteAguinaldo <= 0}>
                Pagar aguinaldo
              </button>
              <button type="button" className="btn secundario sm" onClick={() => abrir('configurar')}>Ajustar</button>
            </div>
          </div>
        ) : (
          (emp.aguinaldoPct || emp.aguinaldo) ? (
            <div className="card azul" style={{ padding: 'var(--sp-4)' }}>
              <div className="card-label">🏦 Aguinaldo acumulado (en su cuenta)</div>
              <div className="card-valor" style={{ fontSize: 20 }}>{money(emp.aguinaldo || 0)}</div>
              <div className="card-sub">Lo que se le fue separando. Es de {emp.nombre}, no del negocio.</div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
                <button type="button" className="btn secundario sm" onClick={() => abrir('intereses')}>Intereses</button>
                <button type="button" className="btn secundario sm" onClick={() => abrir('ajuste')}>Ajustar</button>
              </div>
            </div>
          ) : null
        )}
      </div>

      {operacion && (
        <Modal titulo={`${TITULOS[operacion].titulo} — ${emp.nombre}`} descripcion={TITULOS[operacion].descripcion} onCerrar={cerrar} ancho="chico">
          <form onSubmit={guardar} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-group">
              <label htmlFor={`emp-monto-${emp.id}`}>{operacion === 'ajuste' ? 'Acumulado real' : 'Monto'}</label>
              <input id={`emp-monto-${emp.id}`} type="number" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej: 15000" required />
              {operacion === 'ajuste' && <p className="form-ayuda">Hoy figura {money(emp.aguinaldo || 0)}</p>}
            </div>
            {operacion === 'adelanto' && (
              <div className="form-group">
                <label htmlFor={`emp-cuenta-${emp.id}`}>Sale de</label>
                <select id={`emp-cuenta-${emp.id}`} value={cuenta} onChange={(e) => setCuenta(e.target.value as 'mp' | 'banco' | 'efectivo')}>
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

      {ventana === 'sueldo' && <ModalPagarSueldo emp={emp} onCerrar={cerrar} />}
      {ventana === 'aguinaldo' && <ModalPagarAguinaldo emp={emp} onCerrar={cerrar} />}
      {ventana === 'configurar' && <ModalConfigurarEmpleado emp={emp} onCerrar={cerrar} />}
      {ventana === 'borrar' && (
        <ModalConfirmar
          titulo="Eliminar empleado"
          peligro
          textoConfirmar="Eliminar"
          mensaje={
            <>
              Se elimina a <strong>{emp.nombre}</strong> de la lista. Los sueldos ya registrados quedan en Egresos. Si trabajó con vos y dejó de hacerlo, mejor usá <strong>Desactivar</strong>.
            </>
          }
          onConfirmar={() => {
            j2.removeEmpleado(emp.id);
            toast(`${emp.nombre} eliminado`, { tono: 'exito' });
          }}
          onCerrar={cerrar}
        />
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
    toast(`${n} agregado al equipo. Configurá cómo se le paga antes del primer sueldo.`, { tono: 'exito' });
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
          texto="Agregá a quien trabaja con vos para registrarle sueldos, mutual y aguinaldo."
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
              <input id="empleado-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" required />
            </div>
            <ModalAcciones onCancelar={() => setModalAbierto(false)} textoConfirmar="Agregar al equipo" />
          </form>
        </Modal>
      )}
    </>
  );
}
