import { describe, expect, it } from 'vitest';
import { porHoraHombre, porMes, porSemana, ultimasSemanas } from './rendimiento';
import type { Jornada } from './jornadas';
import type { J2DeudaCliente, J2Ingreso } from '@/types';

const jor = (nombre: string, fecha: string, minutos: number): Jornada => ({
  _id: nombre + fecha, usuarioId: nombre, nombre, fecha, entrada: '', salida: 'x', pausaMin: 0, nota: '',
  origen: 'app', aprobada: true, aprobadaPor: '', editadaPor: '', minutos,
});
const ing = (fecha: string, monto: number, concepto = 'Cobro de trabajo', cliente = 'Pérez'): J2Ingreso => ({
  id: fecha + monto, fecha, cliente, concepto, monto, medio: 'Efectivo',
});

describe('horas del equipo contra lo levantado', () => {
  const deudas: J2DeudaCliente[] = [
    // Trabajo del lunes 9 que se cobró el lunes 16: cuenta en la semana del 9.
    { id: 'd1', nombreCliente: 'Gómez', concepto: 'Poda', monto: 100_000, fecha: '2026-11-09', estado: 'pagado', fechaPago: '2026-11-16', cuentaCobro: 'banco' },
    { id: 'd2', nombreCliente: 'Ruiz', concepto: 'Venta vivero — macetas', monto: 20_000, fecha: '2026-11-10', estado: 'pendiente' },
  ];
  const datos = {
    jornadas: [jor('Cristian', '2026-11-09', 480), jor('Aylén', '2026-11-09', 480), jor('Cristian', '2026-11-16', 240)],
    ingresos: [
      ing('2026-11-10', 72_000),
      ing('2026-11-10', 7_000, 'Venta vivero — cebo'),
      ing('2026-11-11', 15_000, 'Comisión de vivero', 'El Sol'),
      ing('2026-11-16', 100_000, 'Poda', 'Gómez'),
      ing('2026-11-17', 36_000),
    ],
    deudas,
    egresos: [],
    pagosClientes: [{ fecha: '2026-11-10', monto: 72_000, horas: 2 }],
  };

  it('cuenta cada trabajo una vez, en la semana en que se hizo', () => {
    const [s1, s2] = porSemana(datos, ['2026-11-09', '2026-11-16']);
    expect(s1).toMatchObject({ cobrado: 72_000, aCobrar: 100_000, levantado: 172_000, minutos: 960, horasCobradas: 2 });
    // El cobro de la deuda de Gómez no se vuelve a contar.
    expect(s2).toMatchObject({ cobrado: 36_000, aCobrar: 0, levantado: 36_000, minutos: 240 });
    expect(s1.minutosPorPersona.get('Cristian')).toBe(480);
    expect(porHoraHombre(s1)).toBe(172_000 / 16);
  });

  it('el mes junta los días del mes, aunque la semana empiece en el anterior', () => {
    const [nov] = porMes(datos, ['2026-11']);
    expect(nov.levantado).toBe(208_000);
    expect(nov.minutos).toBe(1200);
  });

  it('las últimas semanas terminan en la actual', () => {
    expect(ultimasSemanas('2026-11-12', 3)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
  });
});
