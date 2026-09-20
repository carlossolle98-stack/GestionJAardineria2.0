import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Sin esto, un error de render deja la pantalla en blanco y el usuario no
 * sabe si perdió lo que estaba cargando.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de render:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="empty-state" role="alert" style={{ minHeight: '60vh' }}>
        <div className="ee-icono" aria-hidden="true">
          🪴
        </div>
        <p className="ee-titulo">Se rompió esta pantalla</p>
        <p className="ee-texto">
          Los datos que ya habías guardado están a salvo. Podés volver a cargar la app; si vuelve a
          pasar, anotá qué estabas haciendo.
        </p>
        <pre
          style={{
            fontSize: 'var(--txt-sm)',
            color: 'var(--texto-2)',
            maxWidth: '100%',
            overflowX: 'auto',
            fontFamily: 'var(--fuente-mono)',
          }}
        >
          {this.state.error.message}
        </pre>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Recargar la app
        </button>
      </div>
    );
  }
}
