import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
import { money } from '@/lib/format';
import { ETIQUETA_PAGO } from '@/lib/presentismo';
import type { J2Empleado, J2Horario } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones } from '@/components/Modal';

export function describirHorario(h?: J2Horario) {
  if (!h) return '';
  const base = `${ETIQUETA_PAGO[h.pago]} ${money(h.monto)}`;
  const pres = h.presentismo > 0 ? ` + presentismo ${money(h.presentismo)}` : '';
  return `${base}${pres} · entra ${h.horaEntrada} (${h.toleranciaMin} min de tolerancia) · ${h.dias === 6 ? 'lunes a sábado' : 'lunes a viernes'}`;
}

/** Forma de pago, horario de entrada y presentismo de un empleado. */
export function ModalHorarioEmpleado({ emp, onCerrar }: { emp: J2Empleado; onCerrar: () => void }) {
  const j2 = useJ2Local();
  const { toast } = useToast();
  const h = emp.horario;
  const [pago, setPago] = useState<J2Horario['pago']>(h?.pago ?? 'mensual');
  const [monto, setMonto] = useState(h ? String(h.monto) : '');
  const [presentismo, setPresentismo] = useState(h ? String(h.presentismo) : '0');
  const [horaEntrada, setHoraEntrada] = useState(h?.horaEntrada ?? '08:00');
  const [tolerancia, setTolerancia] = useState(h ? String(h.toleranciaMin) : '10');
  const [dias, setDias] = useState<5 | 6>(h?.dias ?? 5);
  const [usuarioId, setUsuarioId] = useState(h?.usuarioId ?? '');
  const [hasta, setHasta] = useState(h?.temporadaHasta ?? '');

  // Los usuarios de la app, para cruzar con las horas que marca cada uno.
  const { data: personas = [] } = useQuery({
    queryKey: ['jornadas-personas'],
    queryFn: () => getJson<{ id: string; nombre: string }[]>('/api/jornadas/personas'),
    retry: false,
  });

  function guardar(e: FormEvent) {
    e.preventDefault();
    const m = Number(monto) || 0;
    if (m <= 0) { toast('Ingresá cuánto se le paga', { tono: 'error' }); return; }
    j2.configurarHorario(emp.id, {
      pago,
      monto: m,
      presentismo: Math.max(0, Number(presentismo) || 0),
      horaEntrada,
      toleranciaMin: Math.max(0, Number(tolerancia) || 0),
      dias,
      ...(usuarioId ? { usuarioId } : {}),
      ...(pago === 'temporada' && hasta ? { temporadaHasta: hasta } : {}),
    });
    toast(`Horario de ${emp.nombre} guardado`, { tono: 'exito' });
    onCerrar();
  }

  return (
    <Modal titulo={`Pago y horario — ${emp.nombre}`} descripcion="Se usa para el presentismo y para el costo de cada hora." onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="hor-pago">Se le paga</label>
            <select id="hor-pago" value={pago} onChange={(e) => setPago(e.target.value as J2Horario['pago'])}>
              {(Object.keys(ETIQUETA_PAGO) as J2Horario['pago'][]).map((k) => <option key={k} value={k}>{ETIQUETA_PAGO[k]}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="hor-monto">{pago === 'semanal' ? 'Monto por semana' : pago === 'jornada' ? 'Monto por jornada' : 'Monto por mes'}</label>
            <input id="hor-monto" type="number" inputMode="numeric" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
          {pago === 'temporada' && (
            <div className="form-group">
              <label htmlFor="hor-hasta">Temporada hasta</label>
              <input id="hor-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="hor-pres">Presentismo por mes</label>
            <input id="hor-pres" type="number" inputMode="numeric" min="0" value={presentismo} onChange={(e) => setPresentismo(e.target.value)} />
            <p className="form-ayuda">0 si no tiene. Se pierde con una llegada tarde o un día sin marcar la entrada.</p>
          </div>
          <div className="form-group">
            <label htmlFor="hor-entrada">Hora de entrada</label>
            <input id="hor-entrada" type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="hor-tol">Tolerancia (minutos)</label>
            <input id="hor-tol" type="number" inputMode="numeric" min="0" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="hor-dias">Días que trabaja</label>
            <select id="hor-dias" value={dias} onChange={(e) => setDias(Number(e.target.value) as 5 | 6)}>
              <option value={5}>Lunes a viernes</option>
              <option value={6}>Lunes a sábado</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="hor-usuario">Su usuario en la app</label>
            <select id="hor-usuario" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
              <option value="">Buscar por nombre</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <p className="form-ayuda">Con qué usuario marca la entrada y la salida.</p>
          </div>
        </div>
        <ModalAcciones onCancelar={onCerrar} textoConfirmar="Guardar" />
      </form>
    </Modal>
  );
}
