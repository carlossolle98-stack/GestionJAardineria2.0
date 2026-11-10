import { horaAR, sumarDias, type Jornada } from '@/lib/jornadas';
import type { J2Empleado, J2Horario } from '@/types';

export type Presentismo = {
  /** Días de trabajo del mes transcurridos (sin contar hoy si todavía no marcó). */
  esperados: number;
  marcados: number;
  tardes: { fecha: string; hora: string }[];
  sinMarcar: string[];
  /** Lo cobra si no llegó tarde ni dejó días sin marcar. */
  gana: boolean;
};

function minutosDe(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Lunes = 1 … Domingo = 7. */
function diaSemana(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/**
 * Presentismo del mes según el registro de llegada: se pierde con una llegada
 * después de la hora de entrada más la tolerancia, o con un día de trabajo sin
 * marcar. Los feriados o faltas justificadas se resuelven cargando la jornada
 * a mano o decidiendo al pagar.
 */
export function evaluarPresentismo(jornadas: Jornada[], mes: string, horario: J2Horario, hoy: string): Presentismo {
  const delMes = jornadas.filter((j) => j.fecha.startsWith(mes));
  const primeraPorDia = new Map<string, Jornada>();
  for (const j of delMes) {
    const previa = primeraPorDia.get(j.fecha);
    if (!previa || j.entrada < previa.entrada) primeraPorDia.set(j.fecha, j);
  }
  const limite = minutosDe(horario.horaEntrada || '08:00') + (horario.toleranciaMin || 0);
  const tardes = [...primeraPorDia.values()]
    .map((j) => ({ fecha: j.fecha, hora: horaAR(j.entrada) }))
    .filter((t) => t.hora && minutosDe(t.hora) > limite)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const sinMarcar: string[] = [];
  let esperados = 0;
  for (let f = `${mes}-01`; f.startsWith(mes) && f <= hoy; f = sumarDias(f, 1)) {
    if (diaSemana(f) > horario.dias) continue;
    // Hoy sólo cuenta si ya marcó: todavía puede llegar.
    if (f === hoy && !primeraPorDia.has(f)) continue;
    esperados += 1;
    if (!primeraPorDia.has(f)) sinMarcar.push(f);
  }
  return { esperados, marcados: primeraPorDia.size, tardes, sinMarcar, gana: tardes.length === 0 && sinMarcar.length === 0 };
}

/** Las jornadas de un empleado: por su usuario vinculado o, si no, por el nombre. */
export function jornadasDe(emp: J2Empleado, jornadas: Jornada[]) {
  const uid = emp.horario?.usuarioId;
  if (uid) return jornadas.filter((j) => j.usuarioId === uid);
  const nombre = emp.nombre.trim().toLowerCase();
  const primero = nombre.split(' ')[0];
  return jornadas.filter((j) => {
    const n = j.nombre.trim().toLowerCase();
    return n === nombre || n.split(' ')[0] === primero;
  });
}

export const ETIQUETA_PAGO: Record<J2Horario['pago'], string> = {
  semanal: 'Por semana',
  mensual: 'Por mes',
  jornada: 'Por jornada',
  temporada: 'Por temporada (mensual)',
};
