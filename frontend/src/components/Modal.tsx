import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLES =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

type Ancho = 'chico' | 'normal' | 'ancho';

const ANCHOS: Record<Ancho, string> = {
  chico: '420px',
  normal: '520px',
  ancho: '780px',
};

/**
 * Modal accesible y único de la app.
 *
 * - Cierra con Escape o clic en el fondo.
 * - Atrapa el tabulador adentro y devuelve el foco al abrir/cerrar.
 * - Bloquea el scroll del fondo mientras está abierto.
 */
export function Modal({
  titulo,
  descripcion,
  children,
  onCerrar,
  ancho = 'normal',
  cerrarAlTocarFondo = true,
}: {
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  onCerrar: () => void;
  ancho?: Ancho;
  cerrarAlTocarFondo?: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);

  useEffect(() => {
    focoPrevio.current = document.activeElement as HTMLElement;
    caja.current?.querySelector<HTMLElement>(FOCUSABLES)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCerrar();
        return;
      }
      if (e.key !== 'Tab' || !caja.current) return;

      const focos = [...caja.current.querySelectorAll<HTMLElement>(FOCUSABLES)];
      if (!focos.length) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];

      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowPrevio;
      focoPrevio.current?.focus();
    };
  }, [onCerrar]);

  return (
    <div
      className="dialogo-fondo"
      onMouseDown={(e) => {
        if (cerrarAlTocarFondo && e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        style={{ maxWidth: ANCHOS[ancho] }}
        ref={caja}
      >
        <div className="dialogo-encabezado">
          <div>
            <h2 className="dialogo-titulo">{titulo}</h2>
            {descripcion && <p className="dialogo-descripcion">{descripcion}</p>}
          </div>
          <button type="button" className="btn fantasma sm" aria-label="Cerrar" onClick={onCerrar}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Pie estándar de un modal con formulario. */
export function ModalAcciones({
  onCancelar,
  textoConfirmar = 'Guardar',
  confirmarDisabled = false,
  enviando = false,
  peligro = false,
  tipo = 'submit',
  onConfirmar,
}: {
  onCancelar: () => void;
  textoConfirmar?: string;
  confirmarDisabled?: boolean;
  enviando?: boolean;
  peligro?: boolean;
  tipo?: 'submit' | 'button';
  onConfirmar?: () => void;
}) {
  return (
    <div className="dialogo-acciones">
      <button type="button" className="btn secundario" onClick={onCancelar}>
        Cancelar
      </button>
      <button
        type={tipo}
        className={`btn ${peligro ? 'peligro' : ''}`}
        disabled={confirmarDisabled || enviando}
        onClick={onConfirmar}
      >
        {enviando ? 'Guardando…' : textoConfirmar}
      </button>
    </div>
  );
}

/** Confirmación para acciones destructivas o difíciles de revertir. */
export function ModalConfirmar({
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  peligro = false,
  onConfirmar,
  onCerrar,
}: {
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar?: string;
  peligro?: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <Modal titulo={titulo} onCerrar={onCerrar} ancho="chico">
      <div style={{ fontSize: 'var(--txt-md)', color: 'var(--texto-2)' }}>{mensaje}</div>
      <ModalAcciones
        tipo="button"
        onCancelar={onCerrar}
        peligro={peligro}
        textoConfirmar={textoConfirmar}
        onConfirmar={() => {
          onConfirmar();
          onCerrar();
        }}
      />
    </Modal>
  );
}

// Nombres anteriores, para no romper lo que ya los importaba.
export { Modal as Dialogo, ModalConfirmar as ConfirmarDialogo };
