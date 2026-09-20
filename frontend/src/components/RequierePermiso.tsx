import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { primeraRutaDisponible, type Permiso } from '@/lib/permisos';

/**
 * Muestra la pantalla sólo si el usuario tiene el permiso.
 * Es una comodidad de navegación: el control que vale es el del backend,
 * que rechaza igual cualquier request sin permiso.
 */
export function RequierePermiso({ permiso, children }: { permiso: Permiso; children: ReactNode }) {
  const { puede, usuario } = useAuth();

  if (puede(permiso)) return <>{children}</>;

  const destino = primeraRutaDisponible(usuario?.permisos ?? []);

  return (
    <div className="empty-state" role="alert">
      <div className="ee-icono" aria-hidden="true">
        🔒
      </div>
      <p className="ee-titulo">Esta sección no está habilitada para vos</p>
      <p className="ee-texto">
        Si necesitás acceder, pedile a un administrador que te habilite el permiso
        correspondiente desde <strong>Usuarios</strong>.
      </p>
      <Link className="btn secundario" to={destino}>
        Volver a lo mío
      </Link>
    </div>
  );
}

/** Para usuarios activos que se quedaron sin ninguna sección habilitada. */
export function SinAcceso() {
  const { usuario, logout } = useAuth();
  return (
    <div className="empty-state" role="alert">
      <div className="ee-icono" aria-hidden="true">
        🌱
      </div>
      <p className="ee-titulo">Tu usuario todavía no tiene secciones asignadas</p>
      <p className="ee-texto">
        {usuario?.nombre}, un administrador tiene que habilitarte al menos una pantalla desde
        Usuarios para que puedas empezar.
      </p>
      <button type="button" className="btn secundario" onClick={() => void logout()}>
        Cerrar sesión
      </button>
    </div>
  );
}
