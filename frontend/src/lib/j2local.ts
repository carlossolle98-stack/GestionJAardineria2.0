import type { J2Cuentas, J2EgresoTipo, J2Empleado, J2Inversiones } from '@/types';
import type { J2Datos } from '@/lib/j2reducer';

export const EMPLEADOS_DEFAULT: J2Empleado[] = [
  { id: 'emp_carlos', nombre: 'Carlos', activo: true, aguinaldo: 0 },
];

/**
 * Arrancan en cero a propósito: los saldos reales llegan del servidor.
 * Antes venían con cifras cableadas y, si la carga fallaba, la pantalla
 * mostraba una caja inventada como si fuera el saldo verdadero.
 */
export const CUENTAS_DEFAULT: J2Cuentas = { mp: 0, banco: 0, efectivo: 0 };
export const INVERSIONES_DEFAULT: J2Inversiones = {
  cocos: 0,
  servente: 0,
  usd: { cantidad: 0, precio: 0 },
};

export const NOMBRES_CUENTA: Record<string, string> = {
  mp: 'Mercado Pago',
  banco: 'Banco',
  efectivo: 'Efectivo',
  cocos: 'COCOS Capital',
  servente: 'Servente & Cía',
};

export const LABEL_EGRESO: Record<J2EgresoTipo, string> = {
  fijo: 'Fijo',
  varios: 'Varios',
  sueldo: 'Sueldo',
  mercaderia: 'Mercadería',
  inventario: 'Inv. diferencia',
  bancario: 'Mov. bancario',
};

export function mesClaveRef(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function diasDesde(fechaStr: string) {
  if (!fechaStr) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaStr + 'T00:00:00');
  return Math.floor((hoy.getTime() - f.getTime()) / 86400000);
}

export function semaforoEspera(fechaAgregado: string) {
  const dias = diasDesde(fechaAgregado);
  if (dias <= 5) return { clase: 'verde' as const, icono: '🟢', texto: `${dias}d — OK` };
  if (dias <= 10)
    return { clase: 'amarillo' as const, icono: '🟡', texto: `${dias}d — Atender pronto` };
  return { clase: 'rojo' as const, icono: '🔴', texto: `${dias}d — URGENTE` };
}

/* ------------------------------------------------------------------ *
 * Caché local
 *
 * Es sólo un acelerador del primer pintado mientras llega la respuesta del
 * servidor, que es la fuente de verdad. Va en una única clave y se pisa
 * entera: antes había nueve claves sueltas que podían quedar
 * desincronizadas entre sí después de un error a mitad de camino.
 * ------------------------------------------------------------------ */

const CLAVE_CACHE = 'j2_cache_v2';

const MAPA_VIEJO: Record<string, string> = {
  j2_listaespera: 'listaEspera',
  j2_egresos: 'egresos',
  j2_ingresos: 'ingresos',
  j2_transferencias: 'transferencias',
  j2_cuentas: 'cuentas',
  j2_inversiones: 'inversiones',
  j2_empleados: 'empleados',
  j2_movlog: 'movlog',
  j2_deudas_clientes: 'deudasClientes',
};

export function leerCache(): Partial<J2Datos> {
  try {
    const s = localStorage.getItem(CLAVE_CACHE);
    if (s) return JSON.parse(s) as Partial<J2Datos>;

    // Migración desde el formato anterior, una sola vez.
    const migrado: Record<string, unknown> = {};
    for (const [vieja, nueva] of Object.entries(MAPA_VIEJO)) {
      const v = localStorage.getItem(vieja);
      if (v) migrado[nueva] = JSON.parse(v);
      localStorage.removeItem(vieja);
    }
    return migrado as Partial<J2Datos>;
  } catch {
    return {};
  }
}

export function escribirCache(datos: J2Datos) {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(datos));
  } catch {
    // Cuota llena o modo privado: la caché es opcional, seguimos sin ella.
  }
}

/** Borra la caché: se usa al cerrar sesión para no dejar datos en el equipo. */
export function limpiarCache() {
  try {
    localStorage.removeItem(CLAVE_CACHE);
  } catch {
    /* nada que hacer */
  }
}

export function csvEscape(v: unknown) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, content: string) {
  // El BOM hace que Excel en español abra bien los acentos.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { medioACuenta } from '@/lib/j2reducer';
