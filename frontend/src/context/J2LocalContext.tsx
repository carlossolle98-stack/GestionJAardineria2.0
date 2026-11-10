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
import { getJson, sendJson, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  conSemillas,
  j2Reducer,
  medioACuenta,
  nombreCuenta,
  normalizarInversiones,
  totalesDelLog,
  type J2Accion,
  type J2Datos,
  type Financiacion,
  type NuevoCredito,
} from '@/lib/j2reducer';
import type {
  J2Cuentas,
  J2DeudaCliente,
  J2Egreso,
  J2EgresoTipo,
  J2Ingreso,
  J2ListaEspera,
  J2Modalidad,
  J2MovCapital,
  J2Horario,
  J2Pago,
} from '@/types';
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
  /** `egresos` e `ingresos` llegan sin los anulados; éstos quedan aparte para mostrarlos. */
  egresosAnulados: J2Egreso[];
  ingresosAnulados: J2Ingreso[];

  addListaEspera: (p: Omit<J2ListaEspera, 'id'>) => void;
  removeListaEspera: (id: string) => void;
  addEgreso: (p: {
    fecha: string;
    tipo: J2EgresoTipo;
    categoria: string;
    concepto: string;
    monto: number;
    cuenta: keyof J2Cuentas;
    partes?: J2Pago[];
  }) => void;
  anularEgreso: (id: string, motivo: string) => void;
  configurarEmpleado: (p: {
    id: string;
    modalidad: J2Modalidad;
    mutualPct: number;
    aguinaldoPct: number;
    mutualCuenta: keyof J2Cuentas;
    aguinaldoDevengado?: number;
  }) => void;
  pagarSueldo: (p: { empleadoId: string; bruto: number; fecha: string; pagos: J2Pago[] }) => void;
  pagarAguinaldo: (p: { empleadoId: string; monto: number; fecha: string; pagos: J2Pago[] }) => void;
  addIngreso: (p: Omit<J2Ingreso, 'id'>) => void;
  anularIngreso: (id: string, motivo: string) => void;
  setCuentaSaldo: (k: keyof J2Cuentas, monto: number, motivo: string) => void;
  registrarTransferencia: (p: {
    de: string;
    para: string;
    monto: number;
    fecha: string;
    nota: string;
  }) => void;
  removeTransferencia: (id: string) => void;
  operarMoneda: (p: {
    codigo: string;
    nombre: string;
    operacion: 'compra' | 'venta';
    cantidad: number;
    precio: number;
    cuenta: keyof J2Cuentas;
    motivo: string;
  }) => void;
  actualizarPrecioMoneda: (codigo: string, precio: number) => void;
  pagarConMoneda: (p: {
    codigo: string;
    cantidad: number;
    precio: number;
    fecha: string;
    egresoTipo: J2EgresoTipo;
    categoria: string;
    concepto: string;
  }) => void;
  addInversion: (nombre: string) => void;
  toggleInversion: (id: string) => void;
  rendimientoInversion: (id: string, monto: number, fecha: string) => void;
  corregirInversion: (id: string, nuevoSaldo: number, motivo: string) => void;
  movCapital: (p: Omit<J2MovCapital, 'id' | 'anulado'>) => void;
  anularCapital: (id: string, motivo: string) => void;
  recibirCredito: (p: NuevoCredito) => void;
  anularCredito: (id: string, motivo: string) => void;
  pagarCuotaCredito: (p: {
    creditoId: string;
    total: number;
    interes?: number;
    pagos: J2Pago[];
    fecha: string;
  }) => void;
  configurarCredito: (creditoId: string, datos: { totalADevolver?: number; cuotas?: number }) => void;
  comprarBien: (p: { nombre: string; fecha: string; pagos: J2Pago[]; financiaciones: Financiacion[] }) => void;
  anularCuotaCredito: (creditoId: string, pagoId: string, motivo: string) => void;
  ajustarCredito: (creditoId: string, nuevoSaldo: number, motivo: string) => void;
  compraActivo: (p: { nombre: string; monto: number; cuenta: keyof J2Cuentas; fecha: string }) => void;
  compraMercaderia: (p: { detalle: string; monto: number; cuenta: keyof J2Cuentas; fecha: string }) => void;
  ingresarPorMedio: (medioEtiqueta: string, monto: number) => void;
  addEmpleado: (nombre: string) => void;
  configurarHorario: (id: string, horario: J2Horario) => void;
  toggleEmpleado: (id: string) => void;
  removeEmpleado: (id: string) => void;
  ajustarInteresesAguinaldo: (empId: string, intereses: number) => void;
  registrarAdelanto: (empId: string, monto: number, cuenta: keyof J2Cuentas) => void;
  moverListaEspera: (id: string, direccion: 'arriba' | 'abajo') => void;
  addDeudaCliente: (p: Omit<J2DeudaCliente, 'id' | 'estado'>) => void;
  pagarDeudaCliente: (id: string, cuenta: keyof J2Cuentas, fecha?: string) => void;
  removeDeudaCliente: (id: string) => void;
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
  const [estado, dispatch] = useReducer(j2Reducer, null, () => {
    // La caché local sólo acelera el primer pintado; el servidor manda.
    const datos = { ...DATOS_INICIALES, ...leerCache() };
    datos.inversiones = normalizarInversiones(datos.inversiones);
    return { datos, pasado: [] };
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
  /**
   * Acciones hechas en este equipo que el servidor todavía no confirmó. Si otro
   * usuario (u otra pestaña) guardó antes, se toman sus datos y se vuelven a
   * aplicar éstas encima: antes el guardado se rechazaba y, al recargar, lo
   * cargado se perdía. Quedan también en el equipo por si se cierra la página.
   */
  const pendientes = useRef<J2Accion[]>([]);
  /** Cuántas de `pendientes` ya están reflejadas en `datosRef`. */
  const pendientesEnDatos = useRef(0);
  const enVuelo = useRef(false);
  const conflictos = useRef(0);
  const seccionesRef = useRef<Seccion[]>([]);
  datosRef.current = datos;
  pendientesEnDatos.current = pendientes.current.length;
  seccionesRef.current = sync.secciones;

  const clavePendientes = usuario?.id ? `j2_pendientes_${usuario.id}` : null;
  const clavePendientesRef = useRef(clavePendientes);
  clavePendientesRef.current = clavePendientes;

  const persistirPendientes = useCallback(() => {
    const clave = clavePendientesRef.current;
    if (!clave) return;
    try {
      if (pendientes.current.length) localStorage.setItem(clave, JSON.stringify(pendientes.current));
      else localStorage.removeItem(clave);
    } catch {
      // Sin almacenamiento local se sigue igual; sólo se pierde el respaldo.
    }
  }, []);

  /** Sólo se envían las secciones que este usuario puede escribir. */
  const armarPayload = useCallback((d: J2Datos) => {
    const cuerpo: Record<string, unknown> = {};
    for (const s of seccionesRef.current) cuerpo[s] = d[s];
    return cuerpo;
  }, []);

  /** Lee el documento del servidor y devuelve lo que este usuario puede ver. */
  const leerServidor = useCallback(async () => {
    const d = await getJson<Record<string, unknown>>('/api/j2data');
    const secciones = (d.secciones as Seccion[]) ?? [];
    const parcial: Partial<J2Datos> = {};
    for (const s of secciones) {
      if (d[s] !== undefined) (parcial as Record<string, unknown>)[s] = d[s];
    }
    // Firma de lo recibido: sin esto, la propia carga se veía como un cambio
    // y disparaba un guardado inútil.
    const recibido: Record<string, unknown> = {};
    for (const sec of secciones) recibido[sec] = parcial[sec] ?? d[sec];
    return { rev: Number(d.rev) || 0, secciones, parcial, firma: JSON.stringify(recibido) };
  }, []);

  /* ---------------- Carga inicial ---------------- */

  useEffect(() => {
    let cancelado = false;
    listo.current = false;

    leerServidor()
      .then((r) => {
        if (cancelado) return;
        rev.current = r.rev;
        seccionesRef.current = r.secciones;

        let guardadas: J2Accion[] = [];
        try {
          const crudo = clavePendientes ? localStorage.getItem(clavePendientes) : null;
          if (crudo) guardadas = JSON.parse(crudo) as J2Accion[];
        } catch {
          guardadas = [];
        }
        if (guardadas.length) {
          // Quedaron cambios sin guardar de la vez anterior: van encima de lo del servidor.
          pendientes.current = guardadas;
          dispatch({ tipo: 'rebasar', datos: r.parcial, acciones: guardadas });
        } else {
          pendientes.current = [];
          dispatch({ tipo: 'hidratar', datos: r.parcial });
        }
        ultimoEnviado.current = r.firma;

        setSync((s) => ({
          ...s,
          secciones: r.secciones,
          estado: r.secciones.length ? 'al-dia' : 'inactivo',
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

  const guardarRef = useRef<() => Promise<void>>(async () => {});

  const programarGuardado = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void guardarRef.current();
    }, ms);
  }, []);

  const guardar = useCallback(async () => {
    if (enVuelo.current) {
      programarGuardado(RETARDO_GUARDADO);
      return;
    }
    const cuerpo = armarPayload(datosRef.current);
    const firma = JSON.stringify(cuerpo);
    if (firma === ultimoEnviado.current) {
      setSync((s) => (s.estado === 'guardando' ? { ...s, estado: 'al-dia' } : s));
      return;
    }
    const incluidas = pendientesEnDatos.current;
    enVuelo.current = true;
    try {
      const r = await sendJson<{ rev: number }>('/api/j2data', 'PUT', { ...cuerpo, rev: rev.current });
      rev.current = r.rev;
      ultimoEnviado.current = firma;
      pendientes.current = pendientes.current.slice(incluidas);
      pendientesEnDatos.current = Math.max(0, pendientesEnDatos.current - incluidas);
      persistirPendientes();
      conflictos.current = 0;
      setSync((s) => ({ ...s, estado: 'al-dia', ultimoGuardado: new Date(), error: null }));
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'CONFLICTO_REV' && conflictos.current < 5) {
        conflictos.current += 1;
        try {
          const srv = await leerServidor();
          rev.current = srv.rev;
          ultimoEnviado.current = srv.firma;
          // El cambio de datos vuelve a programar el guardado.
          dispatch({ tipo: 'rebasar', datos: srv.parcial, acciones: [...pendientes.current] });
        } catch (e2) {
          setSync((s) => ({ ...s, estado: 'error', error: (e2 as Error).message }));
          programarGuardado(15000);
        }
      } else {
        conflictos.current = 0;
        setSync((s) => ({
          ...s,
          estado: 'error',
          error: `${err.message}. Lo cargado queda guardado en este equipo y se vuelve a intentar.`,
        }));
        programarGuardado(15000);
      }
    } finally {
      enVuelo.current = false;
    }
  }, [armarPayload, leerServidor, persistirPendientes, programarGuardado]);
  guardarRef.current = guardar;

  useEffect(() => {
    if (!listo.current || sync.secciones.length === 0) return;
    if (JSON.stringify(armarPayload(datos)) === ultimoEnviado.current) return;

    escribirCache(datos);
    setSync((s) => (s.estado === 'guardando' ? s : { ...s, estado: 'guardando' }));
    programarGuardado(enVuelo.current ? RETARDO_GUARDADO * 2 : RETARDO_GUARDADO);
  }, [datos, sync.secciones, armarPayload, programarGuardado]);

  // Al volver a la pestaña se traen los cambios de los demás, si no hay nada
  // propio pendiente: así una pestaña vieja no trabaja sobre datos atrasados.
  useEffect(() => {
    if (sync.secciones.length === 0) return;
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendientes.current.length || enVuelo.current || timer.current) return;
      leerServidor()
        .then((srv) => {
          if (pendientes.current.length || srv.rev === rev.current) return;
          rev.current = srv.rev;
          ultimoEnviado.current = srv.firma;
          dispatch({ tipo: 'hidratar', datos: srv.parcial });
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [leerServidor, sync.secciones.length]);

  /* ---------------- Acciones ---------------- */

  const envia = useCallback(
    (a: J2Accion) => {
      const accion = conSemillas(a);
      pendientes.current = [...pendientes.current, accion];
      persistirPendientes();
      dispatch(accion);
    },
    [persistirPendientes]
  );

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
        partes?: J2Pago[];
      }) => envia({ tipo: 'addEgreso', payload: p }),
      anularEgreso: (id: string, motivo: string) => envia({ tipo: 'anularEgreso', id, motivo }),
      configurarEmpleado: (p: {
        id: string;
        modalidad: J2Modalidad;
        mutualPct: number;
        aguinaldoPct: number;
        mutualCuenta: keyof J2Cuentas;
        aguinaldoDevengado?: number;
      }) => envia({ tipo: 'configurarEmpleado', ...p }),
      pagarSueldo: (p: { empleadoId: string; bruto: number; fecha: string; pagos: J2Pago[] }) =>
        envia({ tipo: 'pagarSueldo', ...p }),
      pagarAguinaldo: (p: { empleadoId: string; monto: number; fecha: string; pagos: J2Pago[] }) =>
        envia({ tipo: 'pagarAguinaldo', ...p }),
      addIngreso: (p: Omit<J2Ingreso, 'id'>) => envia({ tipo: 'addIngreso', payload: p }),
      anularIngreso: (id: string, motivo: string) => envia({ tipo: 'anularIngreso', id, motivo }),
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
      operarMoneda: (p: {
        codigo: string;
        nombre: string;
        operacion: 'compra' | 'venta';
        cantidad: number;
        precio: number;
        cuenta: keyof J2Cuentas;
        motivo: string;
      }) => envia({ tipo: 'moneda', ...p }),
      actualizarPrecioMoneda: (codigo: string, precio: number) => envia({ tipo: 'precioMoneda', codigo, precio }),
      pagarConMoneda: (p: {
        codigo: string;
        cantidad: number;
        precio: number;
        fecha: string;
        egresoTipo: J2EgresoTipo;
        categoria: string;
        concepto: string;
      }) => envia({ tipo: 'pagarConMoneda', ...p }),
      addInversion: (nombre: string) => envia({ tipo: 'addInversion', nombre }),
      toggleInversion: (id: string) => envia({ tipo: 'toggleInversion', id }),
      rendimientoInversion: (id: string, monto: number, fecha: string) =>
        envia({ tipo: 'rendimientoInversion', id, monto, fecha }),
      corregirInversion: (id: string, nuevoSaldo: number, motivo: string) =>
        envia({ tipo: 'corregirInversion', id, nuevoSaldo, motivo }),
      movCapital: (p: Omit<J2MovCapital, 'id' | 'anulado'>) => envia({ tipo: 'movCapital', payload: p }),
      anularCapital: (id: string, motivo: string) => envia({ tipo: 'anularCapital', id, motivo }),
      recibirCredito: (p: NuevoCredito) => envia({ tipo: 'recibirCredito', payload: p }),
      anularCredito: (id: string, motivo: string) => envia({ tipo: 'anularCredito', id, motivo }),
      pagarCuotaCredito: (p: { creditoId: string; total: number; interes?: number; pagos: J2Pago[]; fecha: string }) =>
        envia({ tipo: 'pagarCuotaCredito', ...p }),
      configurarCredito: (creditoId: string, datos: { totalADevolver?: number; cuotas?: number }) =>
        envia({ tipo: 'configurarCredito', creditoId, ...datos }),
      comprarBien: (p: { nombre: string; fecha: string; pagos: J2Pago[]; financiaciones: Financiacion[] }) =>
        envia({ tipo: 'comprarBien', ...p }),
      anularCuotaCredito: (creditoId: string, pagoId: string, motivo: string) =>
        envia({ tipo: 'anularCuotaCredito', creditoId, pagoId, motivo }),
      ajustarCredito: (creditoId: string, nuevoSaldo: number, motivo: string) =>
        envia({ tipo: 'ajustarCredito', creditoId, nuevoSaldo, motivo }),
      compraActivo: (p: { nombre: string; monto: number; cuenta: keyof J2Cuentas; fecha: string }) =>
        envia({ tipo: 'compraActivo', ...p }),
      compraMercaderia: (p: { detalle: string; monto: number; cuenta: keyof J2Cuentas; fecha: string }) =>
        envia({ tipo: 'compraMercaderia', ...p }),
      ingresarPorMedio: (medioEtiqueta: string, monto: number) =>
        envia({
          tipo: 'ingresarPorMedio',
          cuenta: medioACuenta(medioEtiqueta),
          monto,
          concepto: `Ingreso ${nombreCuenta(medioACuenta(medioEtiqueta))}`,
        }),
      addEmpleado: (nombre: string) => envia({ tipo: 'addEmpleado', nombre }),
      configurarHorario: (id: string, horario: J2Horario) => envia({ tipo: 'configurarHorario', id, horario }),
      toggleEmpleado: (id: string) => envia({ tipo: 'toggleEmpleado', id }),
      removeEmpleado: (id: string) => envia({ tipo: 'removeEmpleado', id }),
      ajustarInteresesAguinaldo: (empId: string, intereses: number) =>
        envia({ tipo: 'interesesAguinaldo', empleadoId: empId, intereses }),
      registrarAdelanto: (empId: string, monto: number, cuenta: keyof J2Cuentas) =>
        envia({ tipo: 'registrarAdelanto', empleadoId: empId, monto, cuenta }),
      moverListaEspera: (id: string, direccion: 'arriba' | 'abajo') =>
        envia({ tipo: 'moverListaEspera', id, direccion }),
      addDeudaCliente: (p: Omit<J2DeudaCliente, 'id' | 'estado'>) =>
        envia({ tipo: 'addDeudaCliente', payload: p }),
      pagarDeudaCliente: (id: string, cuenta: keyof J2Cuentas, fecha?: string) =>
        envia({ tipo: 'pagarDeudaCliente', id, cuenta, fecha }),
      removeDeudaCliente: (id: string) => envia({ tipo: 'removeDeudaCliente', id }),
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
      egresos: datos.egresos.filter((e) => !e.anulado),
      ingresos: datos.ingresos.filter((i) => !i.anulado),
      egresosAnulados: datos.egresos.filter((e) => e.anulado),
      ingresosAnulados: datos.ingresos.filter((i) => i.anulado),
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
