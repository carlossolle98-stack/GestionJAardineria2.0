import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  J2Cuentas,
  J2Egreso,
  J2EgresoTipo,
  J2Inversiones,
  J2ListaEspera,
  J2Transferencia,
} from '@/types';
import {
  loadJ2Cuentas,
  loadJ2Egresos,
  loadJ2Inversiones,
  loadJ2ListaEspera,
  loadJ2Transferencias,
  medioACuenta,
} from '@/lib/j2local';

type J2Ctx = {
  listaEspera: J2ListaEspera[];
  egresos: J2Egreso[];
  transferencias: J2Transferencia[];
  cuentas: J2Cuentas;
  inversiones: J2Inversiones;
  addListaEspera: (p: Omit<J2ListaEspera, 'id'>) => void;
  removeListaEspera: (id: string) => void;
  addEgreso: (p: {
    fecha: string;
    tipo: J2EgresoTipo;
    categoria: string;
    concepto: string;
    monto: number;
    cuenta: keyof J2Cuentas;
  }) => void;
  removeEgreso: (id: string) => void;
  setCuentaSaldo: (k: keyof J2Cuentas, monto: number) => void;
  registrarTransferencia: (p: { de: string; para: string; monto: number; fecha: string; nota: string }) => void;
  removeTransferencia: (id: string) => void;
  setUsd: (precio: number, cantidad: number) => void;
  movInversion: (cual: 'cocos' | 'servente', tipo: 'entrada' | 'salida', monto: number) => void;
  ingresarPorMedio: (medioEtiqueta: string, monto: number) => void;
};

const Ctx = createContext<J2Ctx | null>(null);

export function J2LocalProvider({ children }: { children: ReactNode }) {
  const [listaEspera, setListaEspera] = useState(loadJ2ListaEspera);
  const [egresos, setEgresos] = useState(loadJ2Egresos);
  const [transferencias, setTransferencias] = useState(loadJ2Transferencias);
  const [cuentas, setCuentas] = useState(loadJ2Cuentas);
  const [inversiones, setInversiones] = useState(loadJ2Inversiones);

  useEffect(() => {
    localStorage.setItem('j2_listaespera', JSON.stringify(listaEspera));
  }, [listaEspera]);
  useEffect(() => {
    localStorage.setItem('j2_egresos', JSON.stringify(egresos));
  }, [egresos]);
  useEffect(() => {
    localStorage.setItem('j2_transferencias', JSON.stringify(transferencias));
  }, [transferencias]);
  useEffect(() => {
    localStorage.setItem('j2_cuentas', JSON.stringify(cuentas));
  }, [cuentas]);
  useEffect(() => {
    localStorage.setItem('j2_inversiones', JSON.stringify(inversiones));
  }, [inversiones]);

  const addListaEspera = useCallback((p: Omit<J2ListaEspera, 'id'>) => {
    setListaEspera((s) => [...s, { ...p, id: 'esp_' + Date.now() }]);
  }, []);

  const removeListaEspera = useCallback((id: string) => {
    setListaEspera((s) => s.filter((x) => x.id !== id));
  }, []);

  const addEgreso = useCallback(
    (p: {
      fecha: string;
      tipo: J2EgresoTipo;
      categoria: string;
      concepto: string;
      monto: number;
      cuenta: keyof J2Cuentas;
    }) => {
      const row: J2Egreso = {
        id: 'eg_' + Date.now(),
        fecha: p.fecha,
        tipo: p.tipo,
        categoria: p.categoria,
        concepto: p.concepto || p.categoria,
        monto: p.monto,
        cuenta: p.cuenta,
      };
      setEgresos((s) => [...s, row]);
      setCuentas((c) => {
        const k = p.cuenta;
        if (c[k] === undefined) return c;
        return { ...c, [k]: Math.max(0, (c[k] || 0) - p.monto) };
      });
    },
    []
  );

  const removeEgreso = useCallback((id: string) => {
    let removed: J2Egreso | undefined;
    setEgresos((s) => {
      removed = s.find((x) => x.id === id);
      return s.filter((x) => x.id !== id);
    });
    if (removed && (removed.cuenta === 'mp' || removed.cuenta === 'banco' || removed.cuenta === 'efectivo')) {
      const k = removed.cuenta;
      setCuentas((c) => ({ ...c, [k]: (c[k] || 0) + removed.monto }));
    }
  }, []);

  const setCuentaSaldo = useCallback((k: keyof J2Cuentas, monto: number) => {
    setCuentas((c) => ({ ...c, [k]: monto }));
  }, []);

  const registrarTransferencia = useCallback(
    (p: { de: string; para: string; monto: number; fecha: string; nota: string }) => {
      const { de, para, monto, fecha, nota } = p;
      setCuentas((c) => {
        const next = { ...c };
        if (de === 'mp' || de === 'banco' || de === 'efectivo') {
          next[de] = Math.max(0, (next[de] || 0) - monto);
        }
        if (para === 'mp' || para === 'banco' || para === 'efectivo') {
          next[para] = (next[para] || 0) + monto;
        }
        return next;
      });
      setInversiones((inv) => {
        const n = { ...inv, cocos: inv.cocos || 0, servente: inv.servente || 0 };
        if (de === 'cocos') n.cocos = Math.max(0, n.cocos - monto);
        if (de === 'servente') n.servente = Math.max(0, n.servente - monto);
        if (para === 'cocos') n.cocos += monto;
        if (para === 'servente') n.servente += monto;
        return n;
      });
      setTransferencias((s) => [...s, { id: 'tr_' + Date.now(), fecha, de, para, monto, nota }]);
    },
    []
  );

  const removeTransferencia = useCallback((id: string) => {
    setTransferencias((s) => s.filter((t) => t.id !== id));
  }, []);

  const setUsd = useCallback((precio: number, cantidad: number) => {
    setInversiones((inv) => ({ ...inv, usd: { precio, cantidad } }));
  }, []);

  const movInversion = useCallback((cual: 'cocos' | 'servente', tipo: 'entrada' | 'salida', monto: number) => {
    setInversiones((inv) => {
      const cur = inv[cual] || 0;
      const v = tipo === 'entrada' ? cur + monto : Math.max(0, cur - monto);
      return { ...inv, [cual]: v };
    });
  }, []);

  const ingresarPorMedio = useCallback((medioEtiqueta: string, monto: number) => {
    const k = medioACuenta(medioEtiqueta);
    setCuentas((c) => ({ ...c, [k]: (c[k] || 0) + monto }));
  }, []);

  const value = useMemo<J2Ctx>(
    () => ({
      listaEspera,
      egresos,
      transferencias,
      cuentas,
      inversiones,
      addListaEspera,
      removeListaEspera,
      addEgreso,
      removeEgreso,
      setCuentaSaldo,
      registrarTransferencia,
      removeTransferencia,
      setUsd,
      movInversion,
      ingresarPorMedio,
    }),
    [
      listaEspera,
      egresos,
      transferencias,
      cuentas,
      inversiones,
      addListaEspera,
      removeListaEspera,
      addEgreso,
      removeEgreso,
      setCuentaSaldo,
      registrarTransferencia,
      removeTransferencia,
      setUsd,
      movInversion,
      ingresarPorMedio,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJ2Local() {
  const x = useContext(Ctx);
  if (!x) throw new Error('useJ2Local fuera de J2LocalProvider');
  return x;
}
