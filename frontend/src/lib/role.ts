/**
 * role.ts — Control de acceso por PIN en runtime
 *
 * VITE_ADMIN_PIN=1234  →  secciones privadas bloqueadas hasta ingresar el PIN
 * Sin VITE_ADMIN_PIN   →  todo libre (desarrollo local)
 * VITE_APP_ROLE=empleado → modo equipo por variable de build (segundo sitio Netlify)
 */

const PIN = import.meta.env.VITE_ADMIN_PIN ?? '';
const SESSION_KEY = 'j2_pin_ok';

/** ¿Hay PIN configurado? */
export const HAY_PIN = Boolean(PIN);

/** ¿Está desbloqueado en esta sesión? */
export function adminUnlocked(): boolean {
  if (!PIN) return true;
  return sessionStorage.getItem(SESSION_KEY) === PIN;
}

/** Intenta desbloquear con el PIN ingresado. Devuelve true si es correcto. */
export function tryPin(input: string): boolean {
  if (input.trim() === PIN) {
    sessionStorage.setItem(SESSION_KEY, PIN);
    return true;
  }
  return false;
}

/** Modo empleado por variable de build (segundo sitio) */
export const esAdmin = import.meta.env.VITE_APP_ROLE !== 'empleado';
