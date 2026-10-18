import { describe, expect, it } from 'vitest';
import { parsearHistorial } from './historial';

describe('importar historial de meses', () => {
  it('lee el archivo exportado del Excel', () => {
    const { meses, errores } = parsearHistorial(
      '﻿Año;Mes;Ingresos;Egresos\r\n2023;Noviembre;3649205.00;670294.00\r\n2026;Septiembre;3644037.74;3904555.63\r\n'
    );
    expect(errores).toEqual([]);
    expect(meses).toEqual([
      { clave: '2023-11', anio: 2023, mes: 'Noviembre', ingresos: 3649205, egresos: 670294 },
      { clave: '2026-09', anio: 2026, mes: 'Septiembre', ingresos: 3644037.74, egresos: 3904555.63 },
    ]);
  });

  it('acepta números con formato argentino, tabulaciones y meses en número', () => {
    const { meses } = parsearHistorial('2025\t3\t$ 1.903.024,99\t1495323');
    expect(meses[0]).toMatchObject({ clave: '2025-03', mes: 'Marzo', ingresos: 1903024.99, egresos: 1495323 });
  });

  it('avisa las líneas que no entiende sin frenar el resto', () => {
    const { meses, errores } = parsearHistorial('2025;Marzo;100;50\n2025;Marzu;100;50\n2025;Abril;100');
    expect(meses).toHaveLength(1);
    expect(errores).toHaveLength(2);
  });
});
