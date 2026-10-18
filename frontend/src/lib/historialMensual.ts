import type { AppSettings, J2Egreso, J2Ingreso } from '@/types';
import { NOMBRES_MES } from '@/lib/historial';

export type TotalMes = { ingresos: number; egresos: number; fuente: 'planilla' | 'app' };

/**
 * Totales de cada mes ("AAAA-MM"). Un mes cerrado que vino de la planilla manda
 * sobre lo cargado en la app, que puede estar incompleto porque la app se empezó
 * a usar a mitad de camino. El mes en curso siempre sale de la app.
 */
export function totalesMensuales(
  mesesHistoricos: AppSettings['mesesHistoricos'],
  ingresos: J2Ingreso[],
  egresos: J2Egreso[],
  mesActual: string
): Map<string, TotalMes> {
  const totales = new Map<string, TotalMes>();
  for (const m of mesesHistoricos) {
    const n = NOMBRES_MES.findIndex((x) => x.toLowerCase() === m.mes.toLowerCase()) + 1;
    if (n > 0) {
      totales.set(`${m.anio}-${String(n).padStart(2, '0')}`, {
        ingresos: m.ingresos || 0,
        egresos: m.egresos || 0,
        fuente: 'planilla',
      });
    }
  }

  const locales = new Map<string, TotalMes>();
  const sumar = (clave: string, ing: number, egr: number) => {
    const previo = locales.get(clave) ?? { ingresos: 0, egresos: 0, fuente: 'app' as const };
    locales.set(clave, { ingresos: previo.ingresos + ing, egresos: previo.egresos + egr, fuente: 'app' });
  };
  for (const i of ingresos) sumar(i.fecha.slice(0, 7), i.monto, 0);
  for (const e of egresos) sumar(e.fecha.slice(0, 7), 0, e.monto);

  for (const [clave, v] of locales) {
    if (clave !== mesActual && totales.has(clave)) continue;
    totales.set(clave, v);
  }
  if (!totales.has(mesActual)) totales.set(mesActual, { ingresos: 0, egresos: 0, fuente: 'app' });
  return totales;
}
