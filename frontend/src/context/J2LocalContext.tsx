import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  J2Cuentas,
  J2Egreso,
  J2EgresoTipo,
  J2Empleado,
  J2Inversiones,
  J2ListaEspera,
  J2MovLog,
  J2Transferencia,
} from '@/types';
import {
  EMPLEADOS_DEFAULT,
  loadJ2Cuentas,
  loadJ2Egresos,
  loadJ2Empleados,
  loadJ2Inversiones,
  loadJ2ListaEspera,
  loadJ2MovLog,
  loadJ2Transferencias,
  medioACuenta,
  NOMBRES_CUENTA,
} from '@/lib/j2local';

type J2Ctx = {
  listaEspera: J2ListaEspera[];
  egresos: J2Egreso[];
  transferencias: J2Transferencia[];
  cuentas: J2Cuentas;
  inversiones: J2Inversiones;
  empleados: J2Empleado[];
  movlog: J2MovLog[];
  addListaEspera: (p: Omit<J2ListaEspera, 'id'>) => void;
  removeListaEspera: (id: string) => void;
  addEgreso: (p: { fecha: string; tipo: J2EgresoTipo; categoria: string; concepto: string; monto: number; cuenta: keyof J2Cuentas }) => void;
  removeEgreso: (id: string) => void;
  setCuentaSaldo: (k: keyof J2Cuentas, monto: number, motivo: string) => void;
  registrarTransferencia: (p: { de: string; para: string; monto: number; fecha: string; nota: string }) => void;
  removeTransferencia: (id: string) => void;
  comprarUsd: (cantidad: number, precio: number, cuenta: keyof J2Cuentas, motivo: string) => void;
  venderUsd: (cantidad: number, precio: number, cuenta: keyof J2Cuentas, motivo: string) => void;
  actualizarPrecioUsd: (precio: number) => void;
  movInversion: (cual: 'cocos' | 'servente', tipo: 'entrada' | 'salida', monto: number) => void;
  ingresarPorMedio: (medioEtiqueta: string, monto: number) => void;
  addEmpleado: (nombre: string) => void;
  toggleEmpleado: (id: string) => void;
};

const Ctx = createContext<J2Ctx | null>(null);

export function J2LocalProvider({ children }: { children: ReactNode }) {
  const [listaEspera, setListaEspera] = useState(loadJ2ListaEspera);
  const [egresos, setEgresos] = useState(loadJ2Egresos);
  const [transferencias, setTransferencias] = useState(loadJ2Transferencias);
  const [cuentas, setCuentas] = useState(loadJ2Cuentas);
  const [inversiones, setInversiones] = useState(loadJ2Inversiones);
  const [empleados, setEmpleados] = useState<J2Empleado[]>(() => {
    try {
      const s = localStorage.getItem('j2_empleados');
      return s ? JSON.parse(s) : [...EMPLEADOS_DEFAULT];
    } catch { return [...EMPLEADOS_DEFAULT]; }
  });
  const [movlog, setMovlog] = useState(loadJ2MovLog);

  useEffect(() => { localStorage.setItem('j2_listaespera', JSON.stringify(listaEspera)); }, [listaEspera]);
  useEffect(() => { localStorage.setItem('j2_egresos', JSON.stringify(egresos)); }, [egresos]);
  useEffect(() => { localStorage.setItem('j2_transferencias', JSON.stringify(transferencias)); }, [transferencias]);
  useEffect(() => { localStorage.setItem('j2_cuentas', JSON.stringify(cuentas)); }, [cuentas]);
  useEffect(() => { localStorage.setItem('j2_inversiones', JSON.stringify(inversiones)); }, [inversiones]);
  useEffect(() => { localStorage.setItem('j2_empleados', JSON.stringify(empleados)); }, [empleados]);
  useEffect(() => { localStorage.setItem('j2_movlog', JSON.stringify(movlog)); }, [movlog]);

  function logMov(tipo: string, concepto: string, detalle: string, monto: number, cuenta: string) {
    const fecha = new Date().toISOString().split('T')[0];
    setMovlog((s) => [{ id: 'ml_' + Date.now(), fecha, tipo, concepto, detalle, monto, cuenta }, ...s].slice(0, 500));
  }

  const addListaEspera = useCallback((p: Omit<J2ListaEspera, 'id'>) => {
    setListaEspera((s) => [...s, { ...p, id: 'esp_' + Date.now() }]);
  }, []);

  const removeListaEspera = useCallback((id: string) => {
    setListaEspera((s) => s.filter((x) => x.id !== id));
  }, []);

  const addEgreso = useCallback((p: { fecha: string; tipo: J2EgresoTipo; categoria: string; concepto: string; monto: number; cuenta: keyof J2Cuentas }) => {
    const row: J2Egreso = { id: 'eg_' + Date.now(), ...p, concepto: p.concepto || p.categoria };
    setEgresos((s) => [...s, row]);
    setCuentas((c) => ({ ...c, [p.cuenta]: Math.max(0, (c[p.cuenta] || 0) - p.monto) }));
    logMov('egreso', p.categoria, p.concepto, -p.monto, p.cuenta);
  }, []);

  const removeEgreso = useCallback((id: string) => {
    let removed: J2Egreso | undefined;
    setEgresos((s) => { removed = s.find((x) => x.id === id); return s.filter((x) => x.id !== id); });
    if (removed) {
      setCuentas((c) => ({ ...c, [removed!.cuenta]: (c[removed!.cuenta] || 0) + removed!.monto }));
    }
  }, []);

  const setCuentaSaldo = useCallback((k: keyof J2Cuentas, monto: number, motivo: string) => {
    setCuentas((c) => {
      const diff = monto - (c[k] || 0);
      logMov('correccion', 'Corrección de cuenta', motivo, diff, k);
      return { ...c, [k]: monto };
    });
  }, []);

  const registrarTransferencia = useCallback((p: { de: string; para: string; monto: number; fecha: string; nota: string }) => {
    const { de, para, monto, fecha, nota } = p;
    setCuentas((c) => {
      const next = { ...c };
      if (de === 'mp' || de === 'banco' || de === 'efectivo') next[de] = Math.max(0, (next[de] || 0) - monto);
      if (para === 'mp' || para === 'banco' || para === 'efectivo') next[para] = (next[para] || 0) + monto;
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
    logMov('transferencia', `${NOMBRES_CUENTA[de] || de} → ${NOMBRES_CUENTA[para] || para}`, nota, monto, de);
  }, []);

  const removeTransferencia = useCallback((id: string) => {
    setTransferencias((s) => s.filter((t) => t.id !== id));
  }, []);

  const comprarUsd = useCallback((cantidad: number, precio: number, cuenta: keyof J2Cuentas, motivo: string) => {
    const arsTotal = Math.round(cantidad * precio);
    setInversiones((inv) => ({ ...inv, usd: { cantidad: (inv.usd?.cantidad || 0) + cantidad, precio } }));
    setCuentas((c) => ({ ...c, [cuenta]: Math.max(0, (c[cuenta] || 0) - arsTotal) }));
    logMov('usd_compra', `Compra ${cantidad} USD a $${precio}`, motivo, -arsTotal, cuenta);
  }, []);

  const venderUsd = useCallback((cantidad: number, precio: number, cuenta: keyof J2Cuentas, motivo: string) => {
    const arsTotal = Math.round(cantidad * precio);
    setInversiones((inv) => ({ ...inv, usd: { cantidad: Math.max(0, (inv.usd?.cantidad || 0) - cantidad), precio } }));
    setCuentas((c) => ({ ...c, [cuenta]: (c[cuenta] || 0) + arsTotal }));
    logMov('usd_venta', `Venta ${cantidad} USD a $${precio}`, motivo, arsTotal, cuenta);
  }, []);

  const actualizarPrecioUsd = useCallback((precio: number) => {
    setInversiones((inv) => ({ ...inv, usd: { ...(inv.usd || { cantidad: 0 }), precio } }));
    logMov('usd_precio', 'Actualización precio USD', '', 0, '');
  }, []);

  const movInversion = useCallback((cual: 'cocos' | 'servente', tipo: 'entrada' | 'salida', monto: number) => {
    setInversiones((inv) => {
      const cur = inv[cual] || 0;
      const v = tipo === 'entrada' ? cur + monto : Math.max(0, cur - monto);
      return { ...inv, [cual]: v };
    });
    logMov('inversion', cual === 'cocos' ? 'COCOS Capital' : 'Servente & Cía', tipo, tipo === 'entrada' ? monto : -monto, cual);
  }, []);

  const ingresarPorMedio = useCallback((medioEtiqueta: string, monto: number) => {
    const k = medioACuenta(medioEtiqueta);
    setCuentas((c) => ({ ...c, [k]: (c[k] || 0) + monto }));
  }, []);

  const addEmpleado = useCallback((nombre: string) => {
    setEmpleados((s) => [...s, { id: 'emp_' + Date.now(), nombre, activo: true }]);
  }, []);

  const toggleEmpleado = useCallback((id: string) => {
    setEmpleados((s) => s.map((e) => e.id === id ? { ...e, activo: !e.activo } : e));
  }, []);

  const value = useMemo<J2Ctx>(() => ({
    listaEspera, egresos, transferencias, cuentas, inversiones, empleados, movlog,
    addListaEspera, removeListaEspera, addEgreso, removeEgreso, setCuentaSaldo,
    registrarTransferencia, removeTransferencia, comprarUsd, venderUsd, actualizarPrecioUsd,
    movInversion, ingresarPorMedio, addEmpleado, toggleEmpleado,
  }), [listaEspera, egresos, transferencias, cuentas, inversiones, empleados, movlog,
    addListaEspera, removeListaEspera, addEgreso, removeEgreso, setCuentaSaldo,
    registrarTransferencia, removeTransferencia, comprarUsd, venderUsd, actualizarPrecioUsd,
    movInversion, ingresarPorMedio, addEmpleado, toggleEmpleado]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJ2Local() {
  const x = useContext(Ctx);
  if (!x) throw new Error('useJ2Local fuera de J2LocalProvider');
  return x;
}
