import { useJ2Local } from '@/context/J2LocalContext';

/**
 * El guardado es automático y con retardo: sin esto el usuario nunca sabe
 * si lo que cargó quedó realmente en el servidor.
 */
export function EstadoGuardado() {
  const { sync } = useJ2Local();

  if (sync.estado === 'inactivo') return null;

  const texto =
    sync.estado === 'guardando'
      ? 'Guardando…'
      : sync.estado === 'error'
        ? 'Sin guardar'
        : sync.ultimoGuardado
          ? `Guardado ${sync.ultimoGuardado.toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}`
          : 'Al día';

  return (
    <span
      className={`estado-guardado ${sync.estado === 'guardando' ? 'guardando' : ''} ${
        sync.estado === 'error' ? 'error' : ''
      }`}
      title={sync.error || undefined}
      aria-live="polite"
    >
      <span className="punto" aria-hidden="true" />
      {texto}
    </span>
  );
}
