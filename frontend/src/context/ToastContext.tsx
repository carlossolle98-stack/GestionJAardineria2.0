import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Tono = 'neutro' | 'exito' | 'error';

type Opciones = {
  tono?: Tono;
  /** Milisegundos en pantalla. Con `deshacer` el mínimo cómodo son 8 s. */
  duracion?: number;
  /** Si se pasa, el aviso muestra el botón Deshacer. */
  deshacer?: () => void;
};

type Aviso = {
  id: number;
  texto: string;
  tono: Tono;
  deshacer?: () => void;
};

type Ctx = {
  toast: (texto: string, opts?: Opciones) => void;
  /** Atajo para acciones reversibles: muestra el aviso con Deshacer. */
  toastDeshacer: (texto: string, deshacer: () => void) => void;
};

const ToastContext = createContext<Ctx | null>(null);

let contador = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const timers = useRef(new Map<number, number>());

  const cerrar = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setAvisos((s) => s.filter((a) => a.id !== id));
  }, []);

  const toast = useCallback(
    (texto: string, opts: Opciones = {}) => {
      const id = ++contador;
      const duracion = opts.duracion ?? (opts.deshacer ? 8000 : 2800);
      setAvisos((s) => [...s.slice(-2), { id, texto, tono: opts.tono ?? 'neutro', deshacer: opts.deshacer }]);
      timers.current.set(id, window.setTimeout(() => cerrar(id), duracion));
    },
    [cerrar]
  );

  const toastDeshacer = useCallback(
    (texto: string, deshacer: () => void) => toast(texto, { deshacer }),
    [toast]
  );

  useEffect(() => {
    const pendientes = timers.current;
    return () => pendientes.forEach((t) => window.clearTimeout(t));
  }, []);

  const v = useMemo(() => ({ toast, toastDeshacer }), [toast, toastDeshacer]);

  return (
    <ToastContext.Provider value={v}>
      {children}
      <div className="toast-zona" aria-live="polite" aria-atomic="false">
        {avisos.map((a) => (
          <div key={a.id} className={`toast ${a.tono === 'neutro' ? '' : a.tono}`} role="status">
            <span style={{ flex: 1 }}>{a.texto}</span>
            {a.deshacer && (
              <button
                type="button"
                className="toast-deshacer"
                onClick={() => {
                  a.deshacer?.();
                  cerrar(a.id);
                }}
              >
                Deshacer
              </button>
            )}
            <button
              type="button"
              className="toast-deshacer"
              aria-label="Cerrar aviso"
              onClick={() => cerrar(a.id)}
              style={{ background: 'none', border: 'none', fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const c = useContext(ToastContext);
  if (!c) throw new Error('useToast fuera de ToastProvider');
  return c;
}
