import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getJson, sendJson, sendJsonKeepalive, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  j2Reducer,
  medioACuenta,
  nombreCuenta,
  totalesDelLog,
  type J2Accion,
  type J2Datos,
} from '@/lib/j2reducer';
import type { J2Cuentas, J2DeudaCliente, J2EgresoTipo, J2Ingreso, J2ListaEspera } from '@/types';
import {
  CUENTAS_DEFAULT,
  EMPLEADOS_DEFAULT,
  INVERSIONES_DEFAULT,
  leerCache,
  escribirCache,
} from '@/lib/j2local';

/** Secciones que el backend entrega según los permisos del usuario. */
const SECCIONES = [
  'cuentas',
  'inversiones',
  'transferencias',
  'egresos',
  'ingresos',
  'deudasClientes',
  'empleados',
  'listaEspera',
  'movlog',
] as const;
type Seccion = (typeof SECCIONES)[number];

type EstadoSync = {
  estado: 'inactivo' | 'al-dia' | 'guardando' | 'error';
  ultimoGuardado: Date | null;
  error: string | null;
  /** Secciones que este usuario tiene permitido leer y escribir. */
  secciones: Seccion[];
};

type J2Ctx = J2Datos & {
  sync: EstadoSync;
  puedeDeshacer: boolean;
  deshacer: () => void;
  /** Total líquido, para no repetir la suma en cada pantalla. */
  totalLiquido: number;
  /** Diferencia entre el saldo guardado y la suma del libro de movimientos. */
  descuadre: Record<string, number>;

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
  addIngreso: (p: Omit<J2Ingreso, 'id'>) => void;
  removeIngreso: (id: string) => void;
  setCuentaSaldo: (k: keyof J2Cuentas, monto: number, motivo: string) => void;
  registrarTransferencia: (p: {
    de: string;
    para: string;
    monto: number;
    fecha: string;
    nota: string;
  }) => void;
  removeTransferencia: (id: string) => void;
  comprarUsd: (cantidad: number, precio: number, cuenta: keyof J2Cuentas, motivo: string) => void;
  venderUsd: (cantidad: number, precio: number, cuenta: keyof J2Cuentas, motivo: string) => void;
  actualizarPrecioUsd: (precio: number) => void;
  movInversion: (cual: 'cocos' | 'servente', tipo: 'entrada' | 'salida', monto: number) => void;
  ingresarPorMedio: (medioEtiqueta: string, monto: number) => void;
  addEmpleado: (nombre: string) => void;
  toggleEmpleado: (id: string) => void;
  registrarMutual: (empNombre: string, monto: number, cuenta: keyof J2Cuentas) => void;
  registrarAguinaldo: (empId: string, monto: number) => void;
  ajustarInteresesAguinaldo: (empId: string, intereses: number) => void;
  addDeudaCliente: (p: Omit<J2DeudaCliente, 'id' | 'estado'>) => void;
  pagarDeudaCliente: (id: string, cuenta: keyof J2Cuentas) => void;
  removeDeudaCliente: (id: string) => void;
  resetLocalData: () => void;
};

const Ctx = createContext<J2Ctx | null>(null);

const DATOS_INICIALES: J2Datos = {
  cuentas: { ...CUENTAS_DEFAULT },
  inversiones: { ...INVERSIONES_DEFAULT },
  egresos: [],
  ingresos: [],
  transferencias: [],
  empleados: [...EMPLEADOS_DEFAULT],
  deudasClientes: [],
  listaEspera: [],
  movlog: [],
};

const RETARDO_GUARDADO = 800;

export function J2LocalProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [estado, dispatch] = useReducer(j2Reducer, {
    // La caché local sólo acelera el primer pintado; el servidor manda.
    datos: { ...DATOS_INICIALES, ...leerCache() },
    pasado: [],
  });
  const { datos } = estado;

  const [sync, setSync] = useState<EstadoSync>({
    estado: 'inactivo',
    ultimoGuardado: null,
    error: null,
    secciones: [],
  });

  const rev = useRef(0);
  const listo = useRef(false);
  const ultimoEnviado = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const datosRef = useRef(datos);
  datosRef.current = datos;

  /* ---------------- Carga inicial ---------------- */

  useEffect(() => {
    let cancelado = false;
    listo.current = false;

    getJson<Record<string, unknown>>('/api/j2data')
      .then((d) => {
        if (cancelado || !d) return;
        const secciones = (d.secciones as Seccion[]) ?? [];
        rev.current = Number(d.rev) || 0;

        const parcial: Partial<J2Datos> = {};
        for (const s of secciones) {
          if (d[s] !== undefined) (parcial as Record<string, unknown>)[s] = d[s];
        }
        dispatch({ tipo: 'hidratar', datos: parcial });

        // Se registra la firma de lo que acaba de llegar: sin esto, la propia
        // carga inicial se veía como un cambio y disparaba un guardado inútil.
        const recibido: Record<string, unknown> = {};
        for (const sec of secciones) recibido[sec] = parcial[sec] ?? d[sec];
        ultimoEnviado.current = JSON.stringify(recibido);

        setSync((s) => ({
          ...s,
          secciones,
          estado: secciones.length ? 'al-dia' : 'inactivo',
          error: null,
        }));
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setSync((s) => ({
          ...s,
          estado: 'error',
          error: e instanceof ApiError ? e.message : 'No se pudieron cargar los datos',
        }));
      })
      .finally(() => {
        if (!cancelado) listo.current = true;
      });

    return () => {
      cancelado = true;
    };
    // Se recarga si cambia el usuario: sus permisos definen qué recibe.
  }, [usuario?.id]);

  /* ---------------- Guardado ---------------- */

  /** Sólo se envían las secciones que este usuario puede escribir. */
  const armarPayload = useCallback(
    (d: J2Datos) => {
      const cuerpo: Record<string, unknown> = {};
      for (const s of sync.secciones) cuerpo[s] = d[s];
      return cuerpo;
    },
    [sync.secciones]
  );

  useEffect(() => {
    if (!listo.current || sync.secciones.length === 0) return;

    const cuerpo = armarPayload(datos);
    const firma = JSON.stringify(cuerpo);

    // Sin cambios reales no se escribe: antes un refetch bastaba para disparar
    // un PUT de todo el documento cada pocos segundos.
    if (firma === ultimoEnviado.current) return;

    escribirCache(datos);

    if (timer.current) clearTimeout(timer.current);
    setSync((s) => (s.estado === 'guardando' ? s : { ...s, estado: 'guardando' }));

    timer.current = setTimeout(async () => {
      try {
        const r = await sendJson<{ rev: number }>('/api/j2data', 'PUT', {
          ...cuerpo,
          rev: rev.current,
        });
        rev.current = r.rev;
        ultimoEnviado.current = firma;
        setSync((s) => ({ ...s, estado: 'al-dia', ultimoGuardado: new Date(), error: null }));
      } catch (e) {
        const err = e as ApiError;
        setSync((s) => ({
          ...s,
          estado: 'error',
          error:
            err.code === 'CONFLICTO_REV'
              ? 'Otro usuario guardó cambios. Recargá la página para ver la versión actual.'
              : err.message,
        }));
      }
    }, RETARDO_GUARDADO);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [datos, sync.secciones, armarPayload]);

  // Al cerrar o esconder la pestaña se manda lo pendiente con keepalive,
  // que es lo único que el navegador garantiza terminar.
  useEffect(() => {
    if (sync.secciones.length === 0) return;

    const volcar = () => {
      const cuerpo = armarPayload(datosRef.current);
      if (JSON.stringify(cuerpo) === ultimoEnviado.current) return;
      if (timer.current) clearTimeout(timer.current);
      void sendJsonKeepalive('/api/j2data', { ...cuerpo, rev: rev.current });
    };

    const alOcultar = () => {
      if (document.visibilityState === 'hidden') volcar();
    };

    document.addEventListener('visibilitychange', alOcultar);
    window.addEventListener('pagehide', volcar);
    return () => {
      document.removeEventListener('visibilitychange', alOcultar);
      window.removeEventListener('pagehide', volcar);
    };
  }, [armarPayload, sync.secciones.length]);

  /* ---------------- Acciones ---------------- */

  const envia = useCallback((a: J2Accion) => dispatch(a), []);

  const acciones = useMemo(
    () => ({
      deshacer: () => envia({ tipo: 'deshacer' }),
      addListaEspera: (p: Omit<J2ListaEspera, 'id'>) =>
        envia({ tipo: 'addListaEspera', payload: p }),
      removeListaEspera: (id: string) => envia({ tipo: 'removeListaEspera', id }),
      addEgreso: (p: {
        fecha: string;
        tipo: J2EgresoTipo;
        categoria: string;
        concepto: string;
        monto: number;
        cuenta: keyof J2Cuentas;
      }) => envia({ tipo: 'addEgreso', payload: p }),
      removeEgreso: (id: string) => envia({ tipo: 'removeEgreso', id }),
      addIngreso: (p: Omit<J2Ingreso, 'id'>) => envia({ tipo: 'addIngreso', payload: p }),
      removeIngreso: (id: string) => envia({ tipo: 'removeIngreso', id }),
      setCuentaSaldo: (k: keyof J2Cuentas, monto: number, motivo: string) =>
        envia({ tipo: 'setCuentaSaldo', cuenta: k, monto, motivo }),
      registrarTransferencia: (p: {
        de: string;
        para: string;
        monto: number;
        fecha: string;
        nota: string;
      }) => envia({ tipo: 'transferencia', payload: p }),
      removeTransferencia: (id: string) => envia({ tipo: 'removeTransferencia', id }),
      comprarUsd: (cantidad: number, precio: number, cuenta: keyof J2Cuentas, motivo: string) =>
        envia({ tipo: 'usd', operacion: 'compra', cantidad, precio, cuenta, motivo }),
      venderUsd: (cantidad: number, precio: number, cuenta: keyof J2Cuentas, motivo: string) =>
        envia({ tipo: 'usd', operacion: 'venta', cantidad, precio, cuenta, motivo }),
      actualizarPrecioUsd: (precio: number) => envia({ tipo: 'precioUsd', precio }),
      movInversion: (cual: 'cocos' | 'servente', tipo: 'entrada' | 'salida', monto: number) =>
        envia({ tipo: 'movInversion', cual, operacion: tipo, monto }),
      ingresarPorMedio: (medioEtiqueta: string, monto: number) =>
        envia({
          tipo: 'ingresarPorMedio',
          cuenta: medioACuenta(medioEtiqueta),
          monto,
          concepto: `Ingreso ${nombreCuenta(medioACuenta(medioEtiqueta))}`,
        }),
      addEmpleado: (nombre: string) => envia({ tipo: 'addEmpleado', nombre }),
      toggleEmpleado: (id: string) => envia({ tipo: 'toggleEmpleado', id }),
      registrarMutual: (empNombre: string, monto: number, cuenta: keyof J2Cuentas) =>
        envia({ tipo: 'registrarMutual', empleado: empNombre, monto, cuenta }),
      registrarAguinaldo: (empId: string, monto: number) =>
        envia({ tipo: 'registrarAguinaldo', empleadoId: empId, monto }),
      ajustarInteresesAguinaldo: (empId: string, intereses: number) =>
        envia({ tipo: 'interesesAguinaldo', empleadoId: empId, intereses }),
      addDeudaCliente: (p: Omit<J2DeudaCliente, 'id' | 'estado'>) =>
        envia({ tipo: 'addDeudaCliente', payload: p }),
      pagarDeudaCliente: (id: string, cuenta: keyof J2Cuentas) =>
        envia({ tipo: 'pagarDeudaCliente', id, cuenta }),
      removeDeudaCliente: (id: string) => envia({ tipo: 'removeDeudaCliente', id }),
      resetLocalData: () => envia({ tipo: 'reiniciarPeriodo' }),
    }),
    [envia]
  );

  const totalLiquido =
    (datos.cuentas.mp || 0) + (datos.cuentas.banco || 0) + (datos.cuentas.efectivo || 0);

  // Control de consistencia: si el libro no explica el saldo, algo se cargó mal.
  const descuadre = useMemo(() => {
    const delLog = totalesDelLog(datos.movlog);
    const salida: Record<string, number> = {};
    for (const c of ['mp', 'banco', 'efectivo'] as const) {
      const dif = (datos.cuentas[c] || 0) - (delLog[c] || 0);
      if (Math.abs(dif) > 0.5) salida[c] = dif;
    }
    return salida;
  }, [datos.cuentas, datos.movlog]);

  const value = useMemo<J2Ctx>(
    () => ({
      ...datos,
      sync,
      puedeDeshacer: estado.pasado.length > 0,
      totalLiquido,
      descuadre,
      ...acciones,
    }),
    [datos, sync, estado.pasado.length, totalLiquido, descuadre, acciones]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJ2Local() {
  const x = useContext(Ctx);
  if (!x) throw new Error('useJ2Local fuera de J2LocalProvider');
  return x;
}
