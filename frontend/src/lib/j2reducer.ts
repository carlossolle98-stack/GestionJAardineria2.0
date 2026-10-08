/**
 * j2reducer.ts — Toda la lógica de plata, en transiciones puras y atómicas.
 *
 * Por qué un reducer y no varios useState:
 *
 * 1. Antes, borrar un egreso hacía `setEgresos(...)` y leía el elemento borrado
 *    FUERA del updater para revertir la caja. React no garantiza el orden, así
 *    que el movimiento se borraba y el saldo podía quedar sin revertir. Acá cada
 *    acción es una sola transición: o pasa entera o no pasa.
 *
 * 2. Ninguna acción toca `cuentas` sin registrar el movimiento en `movlog`:
 *    ambas cosas salen de `aplicar()`. Deja de ser posible mover plata sin rastro.
 *
 * 3. Al ser funciones puras se pueden testear sin montar React, que es lo que
 *    faltaba en la parte del código donde un error cuesta dinero.
 */

import type {
  J2Cuentas,
  J2DeudaCliente,
  J2Egreso,
  J2EgresoTipo,
  J2Empleado,
  J2Ingreso,
  J2Inversiones,
  J2ListaEspera,
  J2MovLog,
  J2Transferencia,
} from '@/types';

export type J2Datos = {
  cuentas: J2Cuentas;
  inversiones: J2Inversiones;
  egresos: J2Egreso[];
  ingresos: J2Ingreso[];
  transferencias: J2Transferencia[];
  empleados: J2Empleado[];
  deudasClientes: J2DeudaCliente[];
  listaEspera: J2ListaEspera[];
  movlog: J2MovLog[];
};

export type J2Estado = {
  datos: J2Datos;
  /** Snapshots para Deshacer. Sólo en memoria: no se guardan en el servidor. */
  pasado: J2Datos[];
};

/** Tope del historial de movimientos que viaja al servidor en cada guardado. */
export const TOPE_MOVLOG = 2000;
const TOPE_UNDO = 25;

export const CUENTAS_LIQUIDAS: (keyof J2Cuentas)[] = ['mp', 'banco', 'efectivo'];

export function nuevoId(prefijo: string) {
  const azar =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefijo}_${Date.now().toString(36)}_${azar}`;
}

/** Fecha de hoy en hora local. `toISOString()` devuelve UTC y después de las 21 adelanta un día. */
export function hoyLocal() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function esCuentaLiquida(c: string): c is keyof J2Cuentas {
  return (CUENTAS_LIQUIDAS as string[]).includes(c);
}

/* ------------------------------------------------------------------ *
 * Helpers internos
 * ------------------------------------------------------------------ */

type Movimiento = {
  tipo: string;
  concepto: string;
  detalle?: string;
  /** Firmado: negativo sale de la cuenta, positivo entra. */
  monto: number;
  cuenta: string;
  /** false cuando el movimiento es informativo y no mueve saldo (ej. inventario). */
  afectaSaldo?: boolean;
  fecha?: string;
};

/**
 * Única vía para mover dinero: ajusta el saldo y deja el asiento en el log.
 * No recorta en cero: un saldo negativo es un dato real que hay que ver, y
 * recortarlo hacía que al revertir el movimiento la caja quedara inflada.
 */
function aplicar(d: J2Datos, mov: Movimiento): J2Datos {
  const { monto, cuenta, afectaSaldo = true } = mov;

  let cuentas = d.cuentas;
  let inversiones = d.inversiones;

  if (afectaSaldo && monto !== 0) {
    if (esCuentaLiquida(cuenta)) {
      cuentas = { ...cuentas, [cuenta]: (cuentas[cuenta] || 0) + monto };
    } else if (cuenta === 'cocos' || cuenta === 'servente') {
      inversiones = { ...inversiones, [cuenta]: (inversiones[cuenta] || 0) + monto };
    }
  }

  const asiento: J2MovLog = {
    id: nuevoId('ml'),
    fecha: mov.fecha || hoyLocal(),
    tipo: mov.tipo,
    concepto: mov.concepto,
    detalle: mov.detalle || '',
    monto,
    cuenta,
  };

  return {
    ...d,
    cuentas,
    inversiones,
    movlog: [asiento, ...d.movlog].slice(0, TOPE_MOVLOG),
  };
}

/* ------------------------------------------------------------------ *
 * Acciones
 * ------------------------------------------------------------------ */

export type J2Accion =
  | { tipo: 'hidratar'; datos: Partial<J2Datos> }
  | { tipo: 'deshacer' }
  | { tipo: 'addListaEspera'; payload: Omit<J2ListaEspera, 'id'> }
  | { tipo: 'removeListaEspera'; id: string }
  | {
      tipo: 'addEgreso';
      payload: {
        fecha: string;
        tipo: J2EgresoTipo;
        categoria: string;
        concepto: string;
        monto: number;
        cuenta: keyof J2Cuentas;
      };
    }
  | { tipo: 'removeEgreso'; id: string }
  | { tipo: 'addIngreso'; payload: Omit<J2Ingreso, 'id'> }
  | { tipo: 'removeIngreso'; id: string }
  | { tipo: 'setCuentaSaldo'; cuenta: keyof J2Cuentas; monto: number; motivo: string }
  | {
      tipo: 'transferencia';
      payload: { de: string; para: string; monto: number; fecha: string; nota: string };
    }
  | { tipo: 'removeTransferencia'; id: string }
  | {
      tipo: 'usd';
      operacion: 'compra' | 'venta';
      cantidad: number;
      precio: number;
      cuenta: keyof J2Cuentas;
      motivo: string;
    }
  | { tipo: 'precioUsd'; precio: number }
  | { tipo: 'movInversion'; cual: 'cocos' | 'servente'; operacion: 'entrada' | 'salida'; monto: number }
  | { tipo: 'ingresarPorMedio'; cuenta: keyof J2Cuentas; monto: number; concepto: string }
  | { tipo: 'addEmpleado'; nombre: string }
  | { tipo: 'toggleEmpleado'; id: string }
  | { tipo: 'registrarMutual'; empleado: string; monto: number; cuenta: keyof J2Cuentas }
  | { tipo: 'registrarAguinaldo'; empleadoId: string; monto: number }
  | { tipo: 'interesesAguinaldo'; empleadoId: string; intereses: number }
  | { tipo: 'registrarAdelanto'; empleadoId: string; monto: number; cuenta: keyof J2Cuentas }
  | { tipo: 'addDeudaCliente'; payload: Omit<J2DeudaCliente, 'id' | 'estado'> }
  | { tipo: 'pagarDeudaCliente'; id: string; cuenta: keyof J2Cuentas }
  | { tipo: 'removeDeudaCliente'; id: string }
  | { tipo: 'moverListaEspera'; id: string; direccion: 'arriba' | 'abajo' }
  | { tipo: 'reiniciarPeriodo' };

/** Acciones que no tiene sentido deshacer (carga inicial, el propio deshacer). */
const SIN_UNDO = new Set(['hidratar', 'deshacer', 'precioUsd']);

export function j2Reducer(estado: J2Estado, accion: J2Accion): J2Estado {
  if (accion.tipo === 'deshacer') {
    const [anterior, ...resto] = estado.pasado;
    if (!anterior) return estado;
    return { datos: anterior, pasado: resto };
  }

  if (accion.tipo === 'hidratar') {
    return { ...estado, datos: { ...estado.datos, ...limpiar(accion.datos) } };
  }

  const datos = transicion(estado.datos, accion);
  if (datos === estado.datos) return estado;

  const pasado = SIN_UNDO.has(accion.tipo)
    ? estado.pasado
    : [estado.datos, ...estado.pasado].slice(0, TOPE_UNDO);

  return { datos, pasado };
}

/** Descarta claves desconocidas o nulas que puedan venir del servidor. */
function limpiar(parcial: Partial<J2Datos>): Partial<J2Datos> {
  const salida: Partial<J2Datos> = {};
  for (const [k, v] of Object.entries(parcial)) {
    if (v === null || v === undefined) continue;
    (salida as Record<string, unknown>)[k] = v;
  }
  return salida;
}

function transicion(d: J2Datos, a: J2Accion): J2Datos {
  switch (a.tipo) {
    /* — Lista de espera — */
    case 'addListaEspera':
      return { ...d, listaEspera: [...d.listaEspera, { ...a.payload, id: nuevoId('esp') }] };

    case 'removeListaEspera':
      return { ...d, listaEspera: d.listaEspera.filter((x) => x.id !== a.id) };

    case 'moverListaEspera': {
      const lista = [...d.listaEspera];
      const idx = lista.findIndex((x) => x.id === a.id);
      const dest = a.direccion === 'arriba' ? idx - 1 : idx + 1;
      if (idx < 0 || dest < 0 || dest >= lista.length) return d;
      [lista[idx], lista[dest]] = [lista[dest], lista[idx]];
      return { ...d, listaEspera: lista };
    }

    /* — Egresos — */
    case 'addEgreso': {
      const row: J2Egreso = {
        id: nuevoId('eg'),
        ...a.payload,
        concepto: a.payload.concepto || a.payload.categoria,
      };
      const conEgreso = { ...d, egresos: [...d.egresos, row] };
      return aplicar(conEgreso, {
        tipo: 'egreso',
        concepto: row.categoria,
        detalle: row.concepto,
        monto: -row.monto,
        cuenta: row.cuenta,
        fecha: row.fecha,
        // Una diferencia de inventario es un ajuste contable, no sale plata.
        afectaSaldo: row.tipo !== 'inventario',
      });
    }

    case 'removeEgreso': {
      const row = d.egresos.find((x) => x.id === a.id);
      if (!row) return d;
      const sinEgreso = { ...d, egresos: d.egresos.filter((x) => x.id !== a.id) };
      return aplicar(sinEgreso, {
        tipo: 'egreso_anulado',
        concepto: `Anulación — ${row.categoria}`,
        detalle: row.concepto,
        monto: row.monto,
        cuenta: row.cuenta,
        afectaSaldo: row.tipo !== 'inventario',
      });
    }

    /* — Ingresos — */
    case 'addIngreso': {
      const row: J2Ingreso = { ...a.payload, id: nuevoId('ing') };
      const cuenta = medioACuenta(row.medio);
      const conIngreso = { ...d, ingresos: [...d.ingresos, row] };
      return aplicar(conIngreso, {
        tipo: 'ingreso',
        concepto: row.cliente || 'Cobro',
        detalle: row.concepto,
        monto: row.monto,
        cuenta,
        fecha: row.fecha,
      });
    }

    case 'removeIngreso': {
      const row = d.ingresos.find((x) => x.id === a.id);
      if (!row) return d;
      const sinIngreso = { ...d, ingresos: d.ingresos.filter((x) => x.id !== a.id) };
      return aplicar(sinIngreso, {
        tipo: 'ingreso_anulado',
        concepto: `Anulación — ${row.cliente || 'Cobro'}`,
        detalle: row.concepto,
        monto: -row.monto,
        cuenta: medioACuenta(row.medio),
      });
    }

    /* — Corrección manual de saldo — */
    case 'setCuentaSaldo': {
      const actual = d.cuentas[a.cuenta] || 0;
      const diferencia = a.monto - actual;
      if (diferencia === 0) return d;
      return aplicar(d, {
        tipo: 'correccion',
        concepto: 'Corrección de saldo',
        detalle: a.motivo,
        monto: diferencia,
        cuenta: a.cuenta,
      });
    }

    /* — Transferencias entre cuentas propias — */
    case 'transferencia': {
      const { de, para, monto, fecha, nota } = a.payload;
      const salida = aplicar(d, {
        tipo: 'transferencia',
        concepto: `Sale → ${nombreCuenta(para)}`,
        detalle: nota,
        monto: -monto,
        cuenta: de,
        fecha,
      });
      const entrada = aplicar(salida, {
        tipo: 'transferencia',
        concepto: `Entra ← ${nombreCuenta(de)}`,
        detalle: nota,
        monto,
        cuenta: para,
        fecha,
      });
      return {
        ...entrada,
        transferencias: [...entrada.transferencias, { id: nuevoId('tr'), fecha, de, para, monto, nota }],
      };
    }

    case 'removeTransferencia': {
      const row = d.transferencias.find((x) => x.id === a.id);
      if (!row) return d;
      const paso1 = aplicar(
        { ...d, transferencias: d.transferencias.filter((x) => x.id !== a.id) },
        {
          tipo: 'transferencia_anulada',
          concepto: `Anulación transferencia ${nombreCuenta(row.de)} → ${nombreCuenta(row.para)}`,
          monto: row.monto,
          cuenta: row.de,
        }
      );
      return aplicar(paso1, {
        tipo: 'transferencia_anulada',
        concepto: `Anulación transferencia ${nombreCuenta(row.de)} → ${nombreCuenta(row.para)}`,
        monto: -row.monto,
        cuenta: row.para,
      });
    }

    /* — Dólares — */
    case 'usd': {
      const total = Math.round(a.cantidad * a.precio);
      const compra = a.operacion === 'compra';
      const usdActual = d.inversiones.usd?.cantidad || 0;
      const conUsd: J2Datos = {
        ...d,
        inversiones: {
          ...d.inversiones,
          usd: {
            cantidad: compra ? usdActual + a.cantidad : usdActual - a.cantidad,
            precio: a.precio,
          },
        },
      };
      return aplicar(conUsd, {
        tipo: compra ? 'usd_compra' : 'usd_venta',
        concepto: `${compra ? 'Compra' : 'Venta'} ${a.cantidad} USD a $${a.precio}`,
        detalle: a.motivo,
        monto: compra ? -total : total,
        cuenta: a.cuenta,
      });
    }

    case 'precioUsd':
      return {
        ...d,
        inversiones: {
          ...d.inversiones,
          usd: { cantidad: d.inversiones.usd?.cantidad || 0, precio: a.precio },
        },
      };

    /* — Inversiones — */
    case 'movInversion':
      return aplicar(d, {
        tipo: 'inversion',
        concepto: nombreCuenta(a.cual),
        detalle: a.operacion,
        monto: a.operacion === 'entrada' ? a.monto : -a.monto,
        cuenta: a.cual,
      });

    case 'ingresarPorMedio':
      return aplicar(d, {
        tipo: 'ingreso',
        concepto: a.concepto || 'Ingreso',
        monto: a.monto,
        cuenta: a.cuenta,
      });

    /* — Empleados — */
    case 'addEmpleado':
      return {
        ...d,
        empleados: [
          ...d.empleados,
          { id: nuevoId('emp'), nombre: a.nombre, activo: true, aguinaldo: 0, adelanto: 0 },
        ],
      };

    case 'toggleEmpleado':
      return {
        ...d,
        empleados: d.empleados.map((e) => (e.id === a.id ? { ...e, activo: !e.activo } : e)),
      };

    case 'registrarMutual':
      return aplicar(d, {
        tipo: 'mutual',
        concepto: `Mutual — ${a.empleado}`,
        detalle: 'Descuento mutual retenido',
        monto: a.monto,
        cuenta: a.cuenta,
      });

    case 'registrarAguinaldo': {
      const conAguinaldo: J2Datos = {
        ...d,
        empleados: d.empleados.map((e) =>
          e.id === a.empleadoId ? { ...e, aguinaldo: (e.aguinaldo || 0) + a.monto } : e
        ),
      };
      const emp = d.empleados.find((e) => e.id === a.empleadoId);
      return aplicar(conAguinaldo, {
        tipo: 'aguinaldo',
        concepto: `Aguinaldo retenido — ${emp?.nombre ?? a.empleadoId}`,
        monto: a.monto,
        cuenta: 'cocos',
      });
    }

    case 'registrarAdelanto': {
      const emp = d.empleados.find((e) => e.id === a.empleadoId);
      const conAdelanto: J2Datos = {
        ...d,
        empleados: d.empleados.map((e) =>
          e.id === a.empleadoId ? { ...e, adelanto: (e.adelanto || 0) + a.monto } : e
        ),
      };
      return aplicar(conAdelanto, {
        tipo: 'adelanto',
        concepto: `Adelanto — ${emp?.nombre ?? a.empleadoId}`,
        detalle: 'Adelanto de sueldo entregado',
        monto: -a.monto,
        cuenta: a.cuenta,
      });
    }

    case 'interesesAguinaldo': {
      const emp = d.empleados.find((e) => e.id === a.empleadoId);
      const conIntereses: J2Datos = {
        ...d,
        empleados: d.empleados.map((e) =>
          e.id === a.empleadoId ? { ...e, aguinaldo: (e.aguinaldo || 0) + a.intereses } : e
        ),
      };
      return aplicar(conIntereses, {
        tipo: 'aguinaldo_int',
        concepto: `Intereses aguinaldo — ${emp?.nombre ?? a.empleadoId}`,
        monto: a.intereses,
        cuenta: 'cocos',
        afectaSaldo: false,
      });
    }

    /* — Deudas de clientes — */
    case 'addDeudaCliente': {
      const row: J2DeudaCliente = { ...a.payload, id: nuevoId('dc'), estado: 'pendiente' };
      const conDeuda = { ...d, deudasClientes: [...d.deudasClientes, row] };
      return aplicar(conDeuda, {
        tipo: 'deuda_nueva',
        concepto: row.nombreCliente,
        detalle: row.concepto,
        monto: row.monto,
        cuenta: '',
        // Todavía no entró plata: es una cuenta por cobrar.
        afectaSaldo: false,
        fecha: row.fecha,
      });
    }

    case 'pagarDeudaCliente': {
      const row = d.deudasClientes.find((x) => x.id === a.id);
      if (!row || row.estado === 'pagado') return d;
      const fechaPago = hoyLocal();

      const conPago: J2Datos = {
        ...d,
        deudasClientes: d.deudasClientes.map((x) =>
          x.id === a.id ? { ...x, estado: 'pagado' as const, fechaPago, cuentaCobro: a.cuenta } : x
        ),
        ingresos: [
          ...d.ingresos,
          {
            id: nuevoId('ing'),
            fecha: fechaPago,
            cliente: row.nombreCliente,
            concepto: row.concepto,
            monto: row.monto,
            medio: a.cuenta,
          },
        ],
      };

      // Un solo asiento: antes se sumaba la caja y además se registraba el
      // ingreso por otra vía, con riesgo de contar el cobro dos veces.
      return aplicar(conPago, {
        tipo: 'cobro_deuda',
        concepto: row.nombreCliente,
        detalle: row.concepto,
        monto: row.monto,
        cuenta: a.cuenta,
        fecha: fechaPago,
      });
    }

    case 'removeDeudaCliente': {
      const row = d.deudasClientes.find((x) => x.id === a.id);
      if (!row) return d;
      const sinDeuda = { ...d, deudasClientes: d.deudasClientes.filter((x) => x.id !== a.id) };
      // Si ya estaba cobrada, hay que devolver la plata que había entrado.
      if (row.estado === 'pagado' && row.cuentaCobro) {
        return aplicar(sinDeuda, {
          tipo: 'deuda_anulada',
          concepto: `Anulación cobro — ${row.nombreCliente}`,
          detalle: row.concepto,
          monto: -row.monto,
          cuenta: row.cuentaCobro,
        });
      }
      return sinDeuda;
    }

    case 'reiniciarPeriodo':
      return {
        ...d,
        egresos: [],
        ingresos: [],
        transferencias: [],
        deudasClientes: [],
        listaEspera: [],
        movlog: [],
      };

    default:
      return d;
  }
}

/* ------------------------------------------------------------------ *
 * Derivados — sirven para controlar que el saldo cierre
 * ------------------------------------------------------------------ */

/** Suma de los movimientos registrados por cuenta. */
export function totalesDelLog(movlog: J2MovLog[]) {
  const acc: Record<string, number> = {};
  for (const m of movlog) acc[m.cuenta] = (acc[m.cuenta] || 0) + m.monto;
  return acc;
}

const NOMBRES: Record<string, string> = {
  mp: 'Mercado Pago',
  banco: 'Banco',
  efectivo: 'Efectivo',
  cocos: 'COCOS Capital',
  servente: 'Servente & Cía',
};

export function nombreCuenta(c: string) {
  return NOMBRES[c] || c;
}

export function medioACuenta(medio: string): keyof J2Cuentas {
  if (!medio) return 'efectivo';
  const m = medio.toLowerCase();
  if (m.includes('mercado') || m === 'mp') return 'mp';
  if (m.includes('banco') || m.includes('transfer')) return 'banco';
  return 'efectivo';
}
