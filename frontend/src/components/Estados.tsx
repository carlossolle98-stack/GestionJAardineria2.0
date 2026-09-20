import type { ReactNode } from 'react';

/** Pantalla vacía que además dice qué hacer, en vez de quedar en blanco. */
export function Vacio({
  icono = '🌿',
  titulo,
  texto,
  accion,
}: {
  icono?: string;
  titulo: string;
  texto?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="ee-icono" aria-hidden="true">
        {icono}
      </div>
      <p className="ee-titulo">{titulo}</p>
      {texto && <p className="ee-texto">{texto}</p>}
      {accion}
    </div>
  );
}

/** Esqueleto de carga: mantiene el layout en lugar de un "Cargando…" suelto. */
export function CargandoCards({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div className="cards-grid" aria-busy="true" aria-label="Cargando datos">
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

export function CargandoTabla({ filas = 5 }: { filas?: number }) {
  return (
    <div className="tabla-wrap" style={{ padding: 'var(--sp-5)' }} aria-busy="true">
      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          className="skeleton skeleton-linea"
          style={{ width: `${90 - i * 8}%`, height: 16 }}
        />
      ))}
    </div>
  );
}

/** Error recuperable, con acción de reintento. */
export function ErrorCarga({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <div className="alerta urgente" role="alert" style={{ alignItems: 'center' }}>
      <span aria-hidden="true">⚠️</span>
      <span style={{ flex: 1 }}>{mensaje}</span>
      {onReintentar && (
        <button type="button" className="btn secundario sm" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}
