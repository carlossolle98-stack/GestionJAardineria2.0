import type { Activo } from '@/types';

function aniosDesde(fecha: string): number {
  return (Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

/** Valor libro con depreciación lineal. */
export function valorLibros(a: Activo): number {
  if (a.vidaUtilAnios <= 0) return a.valorCompra;
  const dep = (a.valorCompra / a.vidaUtilAnios) * aniosDesde(a.fechaCompra);
  return Math.max(0, a.valorCompra - dep);
}

/** Valor libro de los bienes que siguen en uso. */
export function totalBienesDeUso(activos: Activo[]): number {
  return activos.filter((a) => a.estado !== 'Dado de baja').reduce((s, a) => s + valorLibros(a), 0);
}
