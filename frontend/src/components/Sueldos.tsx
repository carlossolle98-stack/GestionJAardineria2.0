import { useState, type FormEvent } from 'react';
import { money } from '@/lib/format';
import { calcularSueldo, hoyLocal } from '@/lib/j2reducer';
import type { J2Egreso, J2Empleado, J2Modalidad, J2Pago } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones } from '@/components/Modal';

type Cuenta = J2Pago['cuenta'];
const CUENTAS: { valor: Cuenta; label: string }[] = [
  { valor: 'banco', label: 'Banco' },
  { valor: 'efectivo', label: 'Efectivo' },
  { valor: 'mp', label: 'Mercado Pago' },
];

/* ------------------------------------------------------------------ *
 * Pagar desde una o dos cuentas
 * ------------------------------------------------------------------ */

export function useReparto(inicial: Cuenta = 'banco') {
  const [cuenta1, setCuenta1] = useState<Cuenta>(inicial);
  const [dos, setDos] = useState(false);
  const [cuenta2, setCuenta2] = useState<Cuenta>(inicial === 'efectivo' ? 'banco' : 'efectivo');
  const [monto2, setMonto2] = useState('');

  function pagos(total: number): J2Pago[] {
    const m2 = Number(monto2) || 0;
    return dos ? [{ cuenta: cuenta1, monto: total - m2 }, { cuenta: cuenta2, monto: m2 }] : [{ cuenta: cuenta1, monto: total }];
  }

  /** Devuelve el problema a mostrar, o null si el reparto es válido. */
  function error(total: number): string | null {
    if (!dos) return null;
    const m2 = Number(monto2) || 0;
    if (cuenta1 === cuenta2) return 'Elegí dos cuentas distintas';
    if (m2 <= 0 || m2 >= total) return `Lo que sale de la segunda cuenta tiene que estar entre $0 y ${money(total)}`;
    return null;
  }

  return { cuenta1, setCuenta1, dos, setDos, cuenta2, setCuenta2, monto2, setMonto2, pagos, error };
}

export function CamposReparto({
  r,
  total,
  idBase,
  etiqueta = 'Sale de',
}: {
  r: ReturnType<typeof useReparto>;
  total: number;
  idBase: string;
  etiqueta?: string;
}) {
  const m2 = Number(r.monto2) || 0;
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor={`${idBase}-c1`}>{r.dos ? 'Primera cuenta' : etiqueta}</label>
          <select id={`${idBase}-c1`} value={r.cuenta1} onChange={(e) => r.setCuenta1(e.target.value as Cuenta)}>
            {CUENTAS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
          </select>
          {r.dos && <p className="form-ayuda">Sale {money(Math.max(0, total - m2))}</p>}
        </div>
        {r.dos && (
          <>
            <div className="form-group">
              <label htmlFor={`${idBase}-c2`}>Segunda cuenta</label>
              <select id={`${idBase}-c2`} value={r.cuenta2} onChange={(e) => r.setCuenta2(e.target.value as Cuenta)}>
                {CUENTAS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`${idBase}-m2`}>Monto de la segunda</label>
              <input id={`${idBase}-m2`} type="number" inputMode="numeric" min="0" value={r.monto2} onChange={(e) => r.setMonto2(e.target.value)} placeholder="Ej: 50000" />
            </div>
          </>
        )}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--txt-md)' }}>
        <input type="checkbox" checked={r.dos} onChange={(e) => { r.setDos(e.target.checked); if (!e.target.checked) r.setMonto2(''); }} />
        Pagar desde dos cuentas
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Aguinaldo: se paga en julio (lo de enero a junio) y en enero (lo de julio a diciembre)
 * ------------------------------------------------------------------ */

export function proximoPagoAguinaldo(fecha = new Date()) {
  return fecha.getMonth() < 6 ? 'julio' : 'enero';
}

function inicioSemestre(fecha = new Date()) {
  return `${fecha.getFullYear()}-${fecha.getMonth() < 6 ? '01' : '07'}-01`;
}

/** Lo cobrado como sueldo en el semestre, según lo cargado en la app. */
export function sueldosDelSemestre(egresos: J2Egreso[], emp: J2Empleado) {
  const desde = inicioSemestre();
  return egresos
    .filter((e) => e.tipo === 'sueldo' && e.categoria === emp.nombre && e.fecha >= desde && e.origen?.tipo !== 'aguinaldo')
    .reduce((s, e) => s + e.monto, 0);
}

export function describirModalidad(emp: J2Empleado) {
  if (!emp.modalidad) return 'Sin configurar';
  if (emp.modalidad === 'sinDescuentos') return `Sin descuentos · aguinaldo ${emp.aguinaldoPct ?? 0}% a pagar`;
  const partes = [`mutual ${emp.mutualPct ?? 0}%`];
  if (emp.aguinaldoPct) partes.push(`aguinaldo ${emp.aguinaldoPct}% aparte`);
  return `En relación de dependencia · ${partes.join(' · ')}`;
}

/* ------------------------------------------------------------------ */

function Fila({ label, valor, signo = '', fuerte, color }: { label: string; valor: number; signo?: string; fuerte?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)', padding: 'var(--sp-2) 0', borderBottom: 'var(--borde)', fontSize: fuerte ? 'var(--txt-lg)' : 'var(--txt-base)' }}>
      <span style={{ color: fuerte ? 'var(--texto)' : 'var(--texto-2)' }}>{label}</span>
      <strong style={{ fontFamily: 'var(--fuente-mono)', color: color ?? 'var(--texto)', whiteSpace: 'nowrap' }}>
        {signo}{money(valor)}
      </strong>
    </div>
  );
}

export function ModalPagarSueldo({ emp, onCerrar }: { emp: J2Empleado; onCerrar: () => void }) {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const [bruto, setBruto] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const reparto = useReparto(emp.mutualCuenta ?? 'banco');

  const b = Number(bruto) || 0;
  const c = calcularSueldo(emp, b);
  const mesFecha = fecha.slice(0, 7);
  const yaPagado = j2.egresos
    .filter((e) => e.tipo === 'sueldo' && e.categoria === emp.nombre && e.fecha.startsWith(mesFecha))
    .reduce((s, e) => s + e.monto, 0);
  const cuentaMutual = CUENTAS.find((x) => x.valor === (emp.mutualCuenta ?? 'banco'))?.label;

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (b <= 0) { toast('Ingresá el sueldo', { tono: 'error' }); return; }
    const err = reparto.error(c.aTransferir);
    if (c.aTransferir > 0 && err) { toast(err, { tono: 'error' }); return; }
    j2.pagarSueldo({ empleadoId: emp.id, bruto: b, fecha, pagos: reparto.pagos(c.aTransferir) });
    toast(`Sueldo de ${emp.nombre} registrado · se transfirieron ${money(c.aTransferir)}`, { tono: 'exito' });
    onCerrar();
  }

  return (
    <Modal titulo={`Pagar sueldo — ${emp.nombre}`} descripcion={describirModalidad(emp)} onCerrar={onCerrar}>
      <form onSubmit={guardar} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor={`ps-bruto-${emp.id}`}>Sueldo</label>
            <input id={`ps-bruto-${emp.id}`} type="number" inputMode="numeric" min="0" value={bruto} onChange={(e) => setBruto(e.target.value)} placeholder="Ej: 250000" required />
            <p className="form-ayuda">El monto completo, antes de descuentos.</p>
          </div>
          <div className="form-group">
            <label htmlFor={`ps-fecha-${emp.id}`}>Fecha</label>
            <input id={`ps-fecha-${emp.id}`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
        </div>

        {yaPagado > 0 && (
          <div className="alerta aviso" role="alert">
            Ese mes ya hay {money(yaPagado)} pagados a {emp.nombre}. Revisá que no sea un pago repetido.
          </div>
        )}

        <div style={{ background: 'var(--superficie-2)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)' }}>
          <Fila label="Sueldo (lo que cuesta)" valor={b} />
          {c.mutual > 0 && <Fila label={`− Mutual ${emp.mutualPct}% (queda en ${cuentaMutual} como descuento)`} valor={c.mutual} signo="−" color="var(--rojo)" />}
          {c.adelanto > 0 && <Fila label="− Adelanto ya entregado" valor={c.adelanto} signo="−" color="var(--rojo)" />}
          <Fila label="= Se transfiere" valor={c.aTransferir} fuerte color="var(--verde-vivo)" />
          {c.aguinaldo > 0 && (
            <p className="form-ayuda" style={{ marginTop: 'var(--sp-2)' }}>
              De eso, {money(c.aguinaldo)} ({emp.aguinaldoPct}%) van a su cuenta de aguinaldo. Se anota como acumulado de {emp.nombre}; no es plata del negocio.
            </p>
          )}
          {c.devengado > 0 && (
            <p className="form-ayuda" style={{ marginTop: 'var(--sp-2)' }}>
              Se suman {money(c.devengado)} ({emp.aguinaldoPct}%) a su aguinaldo a pagar en {proximoPagoAguinaldo(new Date(fecha + 'T12:00:00'))}.
            </p>
          )}
        </div>

        {c.aTransferir > 0 && <CamposReparto r={reparto} total={c.aTransferir} idBase={`ps-${emp.id}`} />}

        <ModalAcciones onCancelar={onCerrar} textoConfirmar="Registrar pago" />
      </form>
    </Modal>
  );
}

export function ModalPagarAguinaldo({ emp, onCerrar }: { emp: J2Empleado; onCerrar: () => void }) {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const pendiente = Math.max(0, emp.aguinaldoDevengado || 0);
  const [monto, setMonto] = useState(pendiente ? String(pendiente) : '');
  const [fecha, setFecha] = useState(hoyLocal());
  const reparto = useReparto('efectivo');
  const m = Number(monto) || 0;

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (m <= 0) { toast('Ingresá el monto', { tono: 'error' }); return; }
    const err = reparto.error(m);
    if (err) { toast(err, { tono: 'error' }); return; }
    j2.pagarAguinaldo({ empleadoId: emp.id, monto: m, fecha, pagos: reparto.pagos(m) });
    toast(`Aguinaldo de ${emp.nombre} pagado · ${money(m)}`, { tono: 'exito' });
    onCerrar();
  }

  return (
    <Modal titulo={`Pagar aguinaldo — ${emp.nombre}`} descripcion={`Tiene acumulados ${money(pendiente)}. Podés pagarlo entero o en partes.`} onCerrar={onCerrar} ancho="chico">
      <form onSubmit={guardar} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor={`pa-monto-${emp.id}`}>Monto</label>
            <input id={`pa-monto-${emp.id}`} type="number" inputMode="numeric" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor={`pa-fecha-${emp.id}`}>Fecha</label>
            <input id={`pa-fecha-${emp.id}`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
        </div>
        {m > pendiente && pendiente > 0 && (
          <p className="form-ayuda" style={{ margin: 0 }}>Es más que lo acumulado: la diferencia se registra igual como pago.</p>
        )}
        <CamposReparto r={reparto} total={m} idBase={`pa-${emp.id}`} />
        <ModalAcciones onCancelar={onCerrar} textoConfirmar="Registrar pago" />
      </form>
    </Modal>
  );
}

export function ModalConfigurarEmpleado({ emp, onCerrar }: { emp: J2Empleado; onCerrar: () => void }) {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const [modalidad, setModalidad] = useState<J2Modalidad>(emp.modalidad ?? 'dependencia');
  const [mutualPct, setMutualPct] = useState(emp.mutualPct != null ? String(emp.mutualPct) : '');
  const [aguinaldoPct, setAguinaldoPct] = useState(emp.aguinaldoPct != null ? String(emp.aguinaldoPct) : '');
  const [mutualCuenta, setMutualCuenta] = useState<Cuenta>(emp.mutualCuenta ?? 'banco');
  const [devengado, setDevengado] = useState(String(emp.aguinaldoDevengado ?? 0));

  const pctAg = Number(aguinaldoPct) || 0;
  const cobradoSemestre = sueldosDelSemestre(j2.egresos, emp);
  const sugerido = Math.round((cobradoSemestre * pctAg) / 100);

  function guardar(e: FormEvent) {
    e.preventDefault();
    const mp = Number(mutualPct) || 0;
    const ap = Number(aguinaldoPct) || 0;
    const dv = Number(devengado) || 0;
    if (mp < 0 || mp > 50 || ap < 0 || ap > 50) { toast('Revisá los porcentajes', { tono: 'error' }); return; }
    j2.configurarEmpleado({
      id: emp.id,
      modalidad,
      mutualPct: mp,
      aguinaldoPct: ap,
      mutualCuenta,
      aguinaldoDevengado: modalidad === 'sinDescuentos' ? dv : undefined,
    });
    toast(`Datos de pago de ${emp.nombre} guardados`, { tono: 'exito' });
    onCerrar();
  }

  return (
    <Modal titulo={`Cómo se le paga — ${emp.nombre}`} descripcion="Los porcentajes los ponés vos y los podés cambiar cuando quieras." onCerrar={onCerrar}>
      <form onSubmit={guardar} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <div className="form-group">
          <label htmlFor={`cfg-mod-${emp.id}`}>Modalidad</label>
          <select id={`cfg-mod-${emp.id}`} value={modalidad} onChange={(e) => setModalidad(e.target.value as J2Modalidad)}>
            <option value="dependencia">Con descuentos (mutual y/o aguinaldo aparte)</option>
            <option value="sinDescuentos">Sin descuentos (se le paga limpio)</option>
          </select>
        </div>

        {modalidad === 'dependencia' ? (
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor={`cfg-mut-${emp.id}`}>Descuento por mutual (%)</label>
              <input id={`cfg-mut-${emp.id}`} type="number" step="0.01" min="0" value={mutualPct} onChange={(e) => setMutualPct(e.target.value)} placeholder="Ej: 3" />
              <p className="form-ayuda">Se le descuenta y queda para el negocio, como ingreso.</p>
            </div>
            <div className="form-group">
              <label htmlFor={`cfg-mcta-${emp.id}`}>Ese descuento queda en</label>
              <select id={`cfg-mcta-${emp.id}`} value={mutualCuenta} onChange={(e) => setMutualCuenta(e.target.value as Cuenta)}>
                {CUENTAS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`cfg-ag-${emp.id}`}>Aguinaldo que se le separa (%)</label>
              <input id={`cfg-ag-${emp.id}`} type="number" step="0.01" min="0" value={aguinaldoPct} onChange={(e) => setAguinaldoPct(e.target.value)} placeholder="Ej: 10, o 0 si no" />
              <p className="form-ayuda">Se le transfiere a su cuenta aparte. Solo se anota cuánto lleva acumulado.</p>
            </div>
          </div>
        ) : (
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor={`cfg-ag2-${emp.id}`}>Aguinaldo a acumular (%)</label>
              <input id={`cfg-ag2-${emp.id}`} type="number" step="0.01" min="0" value={aguinaldoPct} onChange={(e) => setAguinaldoPct(e.target.value)} placeholder="Ej: 8.33" />
              <p className="form-ayuda">8,33% equivale al aguinaldo legal (medio sueldo por semestre). Se paga en julio y en enero.</p>
            </div>
            <div className="form-group">
              <label htmlFor={`cfg-dev-${emp.id}`}>Aguinaldo acumulado hasta hoy</label>
              <input id={`cfg-dev-${emp.id}`} type="number" min="0" value={devengado} onChange={(e) => setDevengado(e.target.value)} />
              {cobradoSemestre > 0 && pctAg > 0 && (
                <p className="form-ayuda">
                  Según los sueldos cargados este semestre ({money(cobradoSemestre)}) le corresponden {money(sugerido)}.{' '}
                  <button type="button" className="btn fantasma sm" onClick={() => setDevengado(String(sugerido))}>Usar ese monto</button>
                </p>
              )}
            </div>
          </div>
        )}

        <ModalAcciones onCancelar={onCerrar} textoConfirmar="Guardar" />
      </form>
    </Modal>
  );
}
