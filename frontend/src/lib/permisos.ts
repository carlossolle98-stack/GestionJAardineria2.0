/**
 * permisos.ts — Espejo del catálogo del backend.
 *
 * La verdad la tiene el servidor (config/permisos.js): el front lo usa para
 * decidir qué mostrar, pero cada endpoint valida igual del lado del servidor.
 */

export type Permiso =
  | 'agenda'
  | 'clientes'
  | 'prospectos'
  | 'espera'
  | 'whatsapp'
  | 'cargar'
  | 'resumen'
  | 'cobros'
  | 'egresos'
  | 'movimientos'
  | 'finanzas'
  | 'empleados'
  | 'usuarios'
  | 'ajustes';

export type Rol = 'admin' | 'empleado';

export type Usuario = {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  permisos: Permiso[];
  permisosAsignados: Permiso[];
  activo: boolean;
  ultimoAcceso: string | null;
  creadoEn?: string;
};

export type PermisoMeta = {
  clave: Permiso;
  label: string;
  grupo: string;
  descripcion: string;
};

/** Ruta que le corresponde a cada permiso, para redirigir al entrar. */
export const RUTA_POR_PERMISO: Record<Permiso, string> = {
  resumen: '/',
  clientes: '/clientes',
  prospectos: '/prospectos',
  agenda: '/agenda',
  cobros: '/cobros',
  whatsapp: '/whatsapp',
  cargar: '/cargar',
  movimientos: '/movimientos',
  espera: '/espera',
  egresos: '/egresos',
  finanzas: '/finanzas',
  empleados: '/empleados',
  usuarios: '/usuarios',
  ajustes: '/ajustes',
};

/** Orden en que se busca la primera pantalla disponible para el usuario. */
const PRIORIDAD: Permiso[] = [
  'resumen',
  'agenda',
  'clientes',
  'cobros',
  'prospectos',
  'espera',
  'cargar',
  'whatsapp',
  'egresos',
  'movimientos',
  'finanzas',
  'empleados',
  'usuarios',
];

export function primeraRutaDisponible(permisos: Permiso[]): string {
  const p = PRIORIDAD.find((x) => permisos.includes(x));
  return p ? RUTA_POR_PERMISO[p] : '/sin-acceso';
}

export function tienePermiso(usuario: Usuario | null, permiso: Permiso): boolean {
  return Boolean(usuario?.permisos.includes(permiso));
}
