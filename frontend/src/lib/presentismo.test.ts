import { describe, expect, it } from 'vitest';
import { evaluarPresentismo, jornadasDe } from './presentismo';
import type { Jornada } from './jornadas';
import type { J2Empleado, J2Horario } from '@/types';

// Las horas van en UTC: 11:00Z son las 08:00 en Argentina.
const jor = (fecha: string, horaUtc: string, usuarioId = 'u1', nombre = 'Cristian'): Jornada => ({
  _id: fecha + horaUtc, usuarioId, nombre, fecha, entrada: `${fecha}T${horaUtc}:00.000Z`, salida: 'x', pausaMin: 0,
  nota: '', origen: 'app', aprobada: false, aprobadaPor: '', editadaPor: '', minutos: 480,
});

const horario: J2Horario = { pago: 'mensual', monto: 600_000, presentismo: 50_000, horaEntrada: '08:00', toleranciaMin: 10, dias: 5 };

describe('presentismo por registro de llegada', () => {
  it('lo gana si marcó todos los días a horario (dentro de la tolerancia)', () => {
    // Lunes 2 a miércoles 4 de noviembre de 2026, consultado el jueves 5 antes de marcar.
    const r = evaluarPresentismo([jor('2026-11-02', '11:05'), jor('2026-11-03', '11:10'), jor('2026-11-04', '10:55')], '2026-11', horario, '2026-11-05');
    expect(r).toMatchObject({ esperados: 3, marcados: 3, tardes: [], sinMarcar: [], gana: true });
  });

  it('lo pierde con una llegada tarde o un día sin marcar; el fin de semana no cuenta', () => {
    const r = evaluarPresentismo([jor('2026-11-02', '11:25'), jor('2026-11-04', '11:00')], '2026-11', horario, '2026-11-09');
    expect(r.tardes).toEqual([{ fecha: '2026-11-02', hora: '08:25' }]);
    expect(r.sinMarcar).toEqual(['2026-11-03', '2026-11-05', '2026-11-06']);
    expect(r.gana).toBe(false);
  });

  it('cruza al empleado con sus horas por el usuario vinculado o por el nombre', () => {
    const emp: J2Empleado = { id: 'e', nombre: 'Cristian López', activo: true, aguinaldo: 0 };
    const todas = [jor('2026-11-02', '11:00'), jor('2026-11-02', '11:00', 'u2', 'Sebastián')];
    expect(jornadasDe(emp, todas).map((j) => j.nombre)).toEqual(['Cristian']);
    expect(jornadasDe({ ...emp, horario: { ...horario, usuarioId: 'u2' } }, todas).map((j) => j.nombre)).toEqual(['Sebastián']);
  });
});
