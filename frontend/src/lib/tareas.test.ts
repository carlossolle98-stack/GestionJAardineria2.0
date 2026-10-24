import { describe, expect, it } from 'vitest';
import { describirRepeticion, etiquetaVence, filtrarVista, sugerencias } from './tareas';
import type { Tarea } from '@/types';

const tarea = (p: Partial<Tarea>): Tarea => ({
  _id: Math.random().toString(36),
  titulo: 'x',
  notas: '',
  tipo: 'operativa',
  prioridad: 'normal',
  vence: '',
  hora: '',
  responsableId: null,
  responsableNombre: '',
  repetir: { cada: '', n: 1 },
  checklist: [],
  vinculo: { tipo: '', id: '', nombre: '' },
  estado: 'pendiente',
  hechaEn: null,
  hechaPor: '',
  comentarios: [],
  creadaPor: '',
  origen: '',
  createdAt: '2026-10-01T10:00:00Z',
  ...p,
});

describe('tareas', () => {
  const hoy = '2026-10-24';

  it('etiqueta el vencimiento respecto de hoy', () => {
    expect(etiquetaVence('2026-10-21', hoy)).toEqual({ texto: 'Venció hace 3 días', tono: 'urgente' });
    expect(etiquetaVence('2026-10-24', hoy).texto).toBe('Hoy');
    expect(etiquetaVence('2026-10-25', hoy).texto).toBe('Mañana');
    expect(etiquetaVence('', hoy).texto).toBe('Sin fecha');
  });

  it('"Hoy" muestra vencidas, las de hoy y las sin fecha; deja afuera las futuras y las hechas', () => {
    const lista = [
      tarea({ titulo: 'futura', vence: '2026-10-28' }),
      tarea({ titulo: 'vencida', vence: '2026-10-20' }),
      tarea({ titulo: 'hoy urgente', vence: hoy, prioridad: 'urgente' }),
      tarea({ titulo: 'hoy', vence: hoy }),
      tarea({ titulo: 'sin fecha' }),
      tarea({ titulo: 'hecha', vence: hoy, estado: 'hecha' }),
    ];
    expect(filtrarVista(lista, 'hoy', hoy).map((t) => t.titulo)).toEqual(['vencida', 'hoy urgente', 'hoy', 'sin fecha']);
    expect(filtrarVista(lista, 'semana', hoy).map((t) => t.titulo)).toContain('futura');
  });

  it('describe la repetición', () => {
    expect(describirRepeticion({ cada: 'mes', n: 1 })).toBe('Todos los meses');
    expect(describirRepeticion({ cada: 'dias', n: 30 })).toBe('Cada 30 días');
    expect(describirRepeticion({ cada: '', n: 1 })).toBe('');
  });

  it('sugiere tareas por lista de espera y stock bajo, según los tipos que el usuario puede ver', () => {
    const base = {
      hoy,
      listaEspera: [{ id: 'e1', clienteId: '', nombreCliente: 'Norma', trabajo: 'Poda', notas: '', fechaAgregado: '2026-10-10' }],
      inventario: [{ _id: 'p1', nombre: 'Urea', categoria: '', stock: 1, unidad: 'u', stockMinimo: 2, movimientos: [] }],
      empleados: [],
    };
    expect(sugerencias({ ...base, tiposPermitidos: ['operativa', 'administrativa'] }).map((s) => s.origen)).toEqual(['espera:e1', 'stock:p1']);
    expect(sugerencias({ ...base, tiposPermitidos: ['operativa'] }).map((s) => s.origen)).toEqual(['espera:e1']);
  });
});
