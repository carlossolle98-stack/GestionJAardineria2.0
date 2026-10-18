import { describe, expect, it } from 'vitest';
import { totalesMensuales } from './historialMensual';
import type { J2Egreso, J2Ingreso } from '@/types';

const ing = (fecha: string, monto: number): J2Ingreso => ({ id: fecha + monto, fecha, cliente: 'X', concepto: '', monto, medio: 'Efectivo' });
const egr = (fecha: string, monto: number): J2Egreso => ({ id: fecha + monto, fecha, tipo: 'varios', categoria: 'X', concepto: '', monto, cuenta: 'efectivo' });

describe('totales por mes para Resumen y Gráficos', () => {
  const historial = [
    { mes: 'Agosto', anio: 2026, ingresos: 3_823_525, egresos: 3_309_369, estado: 'Cerrado' },
    { mes: 'Septiembre', anio: 2026, ingresos: 3_644_037, egresos: 3_904_555, estado: 'Cerrado' },
  ];

  it('en un mes cerrado de la planilla manda la planilla, aunque la app tenga datos parciales', () => {
    const t = totalesMensuales(historial, [ing('2026-09-20', 500_000)], [], '2026-10');
    expect(t.get('2026-09')).toEqual({ ingresos: 3_644_037, egresos: 3_904_555, fuente: 'planilla' });
  });

  it('el mes en curso sale siempre de la app', () => {
    const t = totalesMensuales(
      [...historial, { mes: 'Octubre', anio: 2026, ingresos: 1, egresos: 1, estado: 'Cerrado' }],
      [ing('2026-10-05', 200_000)],
      [egr('2026-10-06', 50_000)],
      '2026-10'
    );
    expect(t.get('2026-10')).toEqual({ ingresos: 200_000, egresos: 50_000, fuente: 'app' });
  });

  it('los meses sin planilla salen de la app y el mes actual aparece aunque esté vacío', () => {
    const t = totalesMensuales([], [ing('2026-11-02', 10)], [], '2026-12');
    expect(t.get('2026-11')?.fuente).toBe('app');
    expect(t.get('2026-12')).toEqual({ ingresos: 0, egresos: 0, fuente: 'app' });
  });
});
