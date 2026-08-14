/**
 * rol.ts — Control de acceso por variable de entorno
 *
 * VITE_APP_ROLE=empleado  →  modo equipo (secciones financieras ocultas)
 * VITE_APP_ROLE=admin     →  acceso completo (valor por defecto)
 */
export const esAdmin = import.meta.env.VITE_APP_ROLE !== 'empleado';
