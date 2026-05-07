import type { J2Cuentas, J2DeudaCliente, J2Egreso, J2EgresoTipo, J2Empleado, J2Ingreso, J2Inversiones, J2ListaEspera, J2MovLog, J2Transferencia } from '@/types';

export const EMPLEADOS_DEFAULT: J2Empleado[] = [
  { id: 'emp_angel', nombre: 'Ángel', activo: false, aguinaldo: 0 },
  { id: 'emp_carlos', nombre: 'Carlos', activo: true, aguinaldo: 0 },
];

export const CUENTAS_DEFAULT: J2Cuentas = { mp: 568600, banco: 7910, efectivo: 512300 };
export const INVERSIONES_DEFAULT: J2Inversiones = {
  cocos: 0,
  servente: 0,
  usd: { cantidad: 200, precio: 0 },
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

export function medioACuenta(medio: string): keyof J2Cuentas {
  if (!medio) return 'efectivo';
  const m = medio.toLowerCase();
  if (m.includes('mercado') || m.includes('mp')) return 'mp';
  if (m.includes('banco') || m.includes('transfer')) return 'banco';
  return 'efectivo';
}

export function semaforoEspera(fechaAgregado: string) {
  const dias = diasDesde(fechaAgregado);
  if (dias <= 5) return { clase: 'verde' as const, icono: '🟢', texto: `${dias}d — OK` };
  if (dias <= 10) return { clase: 'amarillo' as const, icono: '🟡', texto: `${dias}d — Atender pronto` };
  return { clase: 'rojo' as const, icono: '🔴', texto: `${dias}d — URGENTE` };
}

export function loadJ2ListaEspera(): J2ListaEspera[] {
  try {
    return JSON.parse(localStorage.getItem('j2_listaespera') || '[]');
  } catch {
    return [];
  }
}

export function loadJ2Egresos(): J2Egreso[] {
  try {
    return JSON.parse(localStorage.getItem('j2_egresos') || '[]');
  } catch {
    return [];
  }
}

export function loadJ2Transferencias(): J2Transferencia[] {
  try {
    return JSON.parse(localStorage.getItem('j2_transferencias') || '[]');
  } catch {
    return [];
  }
}

export function loadJ2Cuentas(): J2Cuentas {
  try {
    const s = localStorage.getItem('j2_cuentas');
    return s ? JSON.parse(s) : { ...CUENTAS_DEFAULT };
  } catch {
    return { ...CUENTAS_DEFAULT };
  }
}

export function loadJ2Inversiones(): J2Inversiones {
  try {
    const s = localStorage.getItem('j2_inversiones');
    return s ? JSON.parse(s) : { ...INVERSIONES_DEFAULT };
  } catch {
    return { ...INVERSIONES_DEFAULT };
  }
}

export function loadJ2Empleados(): J2Empleado[] {
  try {
    const s = localStorage.getItem('j2_empleados');
    return s ? JSON.parse(s) : [...EMPLEADOS_DEFAULT];
  } catch {
    return [...EMPLEADOS_DEFAULT];
  }
}

export function loadJ2Ingresos(): J2Ingreso[] {
  try {
    return JSON.parse(localStorage.getItem('j2_ingresos') || '[]');
  } catch {
    return [];
  }
}

export function loadJ2DeudasClientes(): J2DeudaCliente[] {
  try {
    return JSON.parse(localStorage.getItem('j2_deudas_clientes') || '[]');
  } catch {
    return [];
  }
}

export function loadJ2MovLog(): J2MovLog[] {
  try {
    return JSON.parse(localStorage.getItem('j2_movlog') || '[]');
  } catch {
    return [];
  }
}

export function csvEscape(v: unknown) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
