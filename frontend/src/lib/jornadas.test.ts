import { describe, expect, it } from 'vitest';
import { grillaSemana, horasTexto, lunesDe, sumarDias, totalesMes, type Jornada } from './jornadas';

const j = (usuarioId: string, nombre: string, fecha: string, minutos: number | null): Jornada => ({
  _id: `${usuarioId}${fecha}${minutos}`,
  usuarioId,
  nombre,
  fecha,
  entrada: `${fecha}T11:00:00.000Z`,
  salida: minutos === null ? null : 'x',
  pausaMin: 0,
  nota: '',
  origen: 'app',
  aprobada: false,
  aprobadaPor: '',
  editadaPor: '',
  minutos,
});

describe('horas trabajadas', () => {
  it('ubica el lunes de la semana, también desde un domingo', () => {
    expect(lunesDe('2026-11-10')).toBe('2026-11-09');
    expect(lunesDe('2026-11-15')).toBe('2026-11-09');
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('suma por persona y por día, y cuenta las jornadas sin salida', () => {
    const dias = Array.from({ length: 7 }, (_, i) => sumarDias('2026-11-09', i));
    const g = grillaSemana(
      [j('c', 'Cristian', '2026-11-09', 480), j('c', 'Cristian', '2026-11-10', 450), j('a', 'Aylén', '2026-11-09', 240), j('a', 'Aylén', '2026-11-10', null)],
      dias
    );
    expect(g.map((f) => [f.nombre, f.total, f.abiertas])).toEqual([
      ['Aylén', 240, 1],
      ['Cristian', 930, 0],
    ]);
    expect(g[1].porDia['2026-11-10']).toBe(450);
  });

  it('arma el mes por semanas', () => {
    const m = totalesMes([j('c', 'Cristian', '2026-11-02', 480), j('c', 'Cristian', '2026-11-10', 300), j('c', 'Cristian', '2026-10-31', 300)], '2026-11');
    expect(m.get('c')?.total).toBe(780);
    expect([...m.get('c')!.semanas.entries()]).toEqual([
      ['2026-11-02', 480],
      ['2026-11-09', 300],
    ]);
  });

  it('muestra las horas legibles', () => {
    expect(horasTexto(450)).toBe('7 h 30');
    expect(horasTexto(480)).toBe('8 h');
  });
});
