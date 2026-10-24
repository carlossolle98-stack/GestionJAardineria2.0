import type { ItemInventario, J2Empleado, J2ListaEspera, RepetirTarea, Tarea, TipoTarea } from '@/types';

function dias(desde: string, hasta: string) {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Cómo mostrar el vencimiento respecto de hoy. */
export function etiquetaVence(vence: string, hoy: string): { texto: string; tono: 'urgente' | 'pendiente' | 'info' | 'ok' } {
  if (!vence) return { texto: 'Sin fecha', tono: 'info' };
  const d = dias(hoy, vence);
  if (d < 0) return { texto: d === -1 ? 'Venció ayer' : `Venció hace ${-d} días`, tono: 'urgente' };
  if (d === 0) return { texto: 'Hoy', tono: 'pendiente' };
  if (d === 1) return { texto: 'Mañana', tono: 'info' };
  if (d < 7) return { texto: `En ${d} días`, tono: 'info' };
  return { texto: vence.split('-').reverse().join('/'), tono: 'ok' };
}

export function describirRepeticion(r: RepetirTarea | undefined) {
  if (!r?.cada) return '';
  const n = r.n || 1;
  if (r.cada === 'dia') return 'Todos los días';
  if (r.cada === 'dias') return `Cada ${n} días`;
  if (r.cada === 'semana') return n === 1 ? 'Todas las semanas' : `Cada ${n} semanas`;
  return n === 1 ? 'Todos los meses' : `Cada ${n} meses`;
}

export type Vista = 'hoy' | 'semana' | 'todas';

/** Pendientes de la vista elegida, ordenadas: vencidas, urgentes, por fecha. */
export function filtrarVista(tareas: Tarea[], vista: Vista, hoy: string): Tarea[] {
  const pendientes = tareas.filter((t) => t.estado === 'pendiente');
  const dentro = pendientes.filter((t) => {
    if (vista === 'todas') return true;
    if (!t.vence) return vista === 'hoy';
    const d = dias(hoy, t.vence);
    return vista === 'hoy' ? d <= 0 : d <= 6;
  });
  return dentro.sort((a, b) => {
    const va = a.vence || '9999', vb = b.vence || '9999';
    if (va !== vb) return va.localeCompare(vb);
    if (a.prioridad !== b.prioridad) return a.prioridad === 'urgente' ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export type Sugerencia = { origen: string; titulo: string; tipo: TipoTarea; notas: string; vence: string };

/**
 * Cosas que la app detecta sola y propone convertir en tarea. La clave `origen`
 * evita proponer de nuevo lo que ya tiene una tarea pendiente.
 */
export function sugerencias(p: {
  hoy: string;
  listaEspera: J2ListaEspera[];
  inventario: ItemInventario[];
  empleados: J2Empleado[];
  tiposPermitidos: TipoTarea[];
}): Sugerencia[] {
  const out: Sugerencia[] = [];
  for (const e of p.listaEspera) {
    const d = e.fechaAgregado ? dias(e.fechaAgregado, p.hoy) : 0;
    if (d >= 10) {
      out.push({
        origen: `espera:${e.id}`,
        titulo: `Darle fecha a ${e.nombreCliente}`,
        tipo: 'operativa',
        notas: `Lleva ${d} días en la lista de espera. Trabajo: ${e.trabajo || 'sin detalle'}.`,
        vence: p.hoy,
      });
    }
  }
  for (const i of p.inventario) {
    if (i.stock <= i.stockMinimo) {
      out.push({
        origen: `stock:${i._id}`,
        titulo: i.stock <= 0 ? `Reponer ${i.nombre} (sin stock)` : `Reponer ${i.nombre} (quedan ${i.stock} ${i.unidad})`,
        tipo: 'administrativa',
        notas: `Stock mínimo: ${i.stockMinimo} ${i.unidad}.`,
        vence: p.hoy,
      });
    }
  }
  const mes = Number(p.hoy.slice(5, 7));
  if (mes === 6 || mes === 7 || mes === 12 || mes === 1) {
    for (const e of p.empleados) {
      if (e.activo && e.modalidad === 'sinDescuentos' && (e.aguinaldoDevengado || 0) > 0) {
        out.push({
          origen: `aguinaldo:${e.id}:${p.hoy.slice(0, 7)}`,
          titulo: `Pagar aguinaldo a ${e.nombre}`,
          tipo: 'administrativa',
          notas: `Acumulado: $${Math.round(e.aguinaldoDevengado || 0).toLocaleString('es-AR')}.`,
          vence: p.hoy,
        });
      }
    }
  }
  return out.filter((s) => p.tiposPermitidos.includes(s.tipo));
}
