import type { AppSettings, J2Egreso, J2Ingreso } from '@/types';
import { NOMBRES_MES } from '@/lib/historial';

export type TotalMes = { ingresos: number; egresos: number; fuente: 'planilla' | 'planillaAbierta' | 'app' };

/**
 * Totales de cada mes ("AAAA-MM"). Un mes cerrado que vino de la planilla manda
 * sobre lo cargado en la app, que puede estar incompleto porque la app se empezó
 * a usar a mitad de camino. El mes en curso siempre sale de la app.
 *
 * Un mes de la planilla que vino vacío (en 0) o marcado "En curso" no pisa lo
 * cargado en la app: si no, al pasar de mes, el mes recién terminado quedaba en
 * 0 porque la planilla todavía no lo tenía cerrado.
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
    const vacio = !(m.ingresos > 0) && !(m.egresos > 0);
    const abierto = m.estado?.toLowerCase() === 'en curso';
    if (n > 0 && !vacio) {
      totales.set(`${m.anio}-${String(n).padStart(2, '0')}`, {
        ingresos: m.ingresos || 0,
        egresos: m.egresos || 0,
        fuente: abierto ? 'planillaAbierta' : 'planilla',
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
    if (clave !== mesActual && totales.get(clave)?.fuente === 'planilla') continue;
    totales.set(clave, v);
  }
  for (const [clave, v] of totales) if (v.fuente === 'planillaAbierta') totales.set(clave, { ...v, fuente: 'planilla' });
  if (!totales.has(mesActual)) totales.set(mesActual, { ingresos: 0, egresos: 0, fuente: 'app' });
  return totales;
}
