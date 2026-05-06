import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Ctx = { toast: (msg: string) => void };

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    window.setTimeout(() => setShow(false), 2400);
  }, []);

  const v = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={v}>
      {children}
      <div id="toast" className={show ? 'show' : ''}>
        {msg}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const c = useContext(ToastContext);
  if (!c) throw new Error('ToastProvider');
  return c;
}
