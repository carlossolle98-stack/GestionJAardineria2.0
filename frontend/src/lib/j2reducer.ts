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
  J2Anulacion,
  J2Credito,
  J2PagoCredito,
  J2Cuentas,
  J2DeudaCliente,
  J2Egreso,
  J2EgresoTipo,
  J2Empleado,
  J2Ingreso,
  J2Inversiones,
  J2ListaEspera,
  J2MovCapital,
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

/**
 * Lleva las inversiones al formato de lista. Antes eran dos campos fijos
 * (cocos, servente); se convierten en ítems con el mismo id para que los
 * movimientos viejos que los nombran sigan apuntando al lugar correcto.
 */
export function normalizarInversiones(raw: unknown): J2Inversiones {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let items = Array.isArray(r.items) ? (r.items as J2Inversiones['items']) : [];
  if (!Array.isArray(r.items)) {
    const legado: [string, string][] = [
      ['cocos', 'COCOS Capital'],
      ['servente', 'Servente & Cía'],
    ];
    items = legado
      .filter(([k]) => typeof r[k] === 'number')
      .map(([id, nombre]) => ({ id, nombre, saldo: r[id] as number, activa: true }));
  }
  const usd = r.usd as J2Inversiones['usd'] | undefined;
  return {
    items,
    usd: { cantidad: usd?.cantidad || 0, precio: usd?.precio || 0 },
    creditos: Array.isArray(r.creditos)
      ? (r.creditos as J2Credito[]).map((c) => ({ ...c, pagos: c.pagos ?? [], ajustes: c.ajustes ?? [] }))
      : [],
    capital: Array.isArray(r.capital) ? (r.capital as J2MovCapital[]) : [],
  };
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
    } else if (inversiones.items.some((i) => i.id === cuenta)) {
      inversiones = {
        ...inversiones,
        items: inversiones.items.map((i) => (i.id === cuenta ? { ...i, saldo: i.saldo + monto } : i)),
      };
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

function anulacion(motivo: string): J2Anulacion {
  return { fecha: hoyLocal(), motivo: motivo.trim() || 'Sin motivo' };
}

/**
 * Contraasiento de un egreso: lo marca anulado, devuelve la plata a la cuenta
 * y deshace lo que el egreso había hecho (por ejemplo, el adelanto que saldó).
 */
function contraEgreso(d: J2Datos, id: string, an: J2Anulacion): J2Datos {
  const row = d.egresos.find((x) => x.id === id);
  if (!row || row.anulado) return d;
  let paso: J2Datos = {
    ...d,
    egresos: d.egresos.map((x) => (x.id === id ? { ...x, anulado: an } : x)),
  };
  const o = row.origen;
  if (o?.tipo === 'liquidacion' && o.adelanto > 0) {
    paso = {
      ...paso,
      empleados: paso.empleados.map((e) =>
        e.id === o.empleadoId ? { ...e, adelanto: (e.adelanto || 0) + o.adelanto } : e
      ),
    };
  }
  return aplicar(paso, {
    tipo: 'egreso_anulado',
    concepto: `Anulación — ${row.categoria}`,
    detalle: an.motivo,
    monto: row.monto,
    cuenta: row.cuenta,
    fecha: an.fecha,
    afectaSaldo: row.tipo !== 'inventario',
  });
}

/* ------------------------------------------------------------------ *
 * Acciones
 * ------------------------------------------------------------------ */

export type NuevoCredito = Omit<J2Credito, 'id' | 'saldo' | 'pagos' | 'ajustes' | 'anulado'>;

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
  | { tipo: 'anularEgreso'; id: string; motivo: string }
  | { tipo: 'addIngreso'; payload: Omit<J2Ingreso, 'id'> }
  | { tipo: 'anularIngreso'; id: string; motivo: string }
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
  | { tipo: 'addInversion'; nombre: string }
  | { tipo: 'toggleInversion'; id: string }
  | { tipo: 'rendimientoInversion'; id: string; monto: number; fecha: string }
  | { tipo: 'corregirInversion'; id: string; nuevoSaldo: number; motivo: string }
  | { tipo: 'movCapital'; payload: Omit<J2MovCapital, 'id' | 'anulado'> }
  | { tipo: 'anularCapital'; id: string; motivo: string }
  | { tipo: 'recibirCredito'; payload: NuevoCredito }
  | { tipo: 'anularCredito'; id: string; motivo: string }
  | {
      tipo: 'pagarCuotaCredito';
      creditoId: string;
      total: number;
      interes: number;
      cuenta: keyof J2Cuentas;
      fecha: string;
    }
  | { tipo: 'anularCuotaCredito'; creditoId: string; pagoId: string; motivo: string }
  | { tipo: 'ajustarCredito'; creditoId: string; nuevoSaldo: number; motivo: string }
  | { tipo: 'compraActivo'; nombre: string; monto: number; cuenta: keyof J2Cuentas; fecha: string }
  | { tipo: 'ingresarPorMedio'; cuenta: keyof J2Cuentas; monto: number; concepto: string }
  | { tipo: 'addEmpleado'; nombre: string }
  | { tipo: 'toggleEmpleado'; id: string }
  | { tipo: 'removeEmpleado'; id: string }
  | { tipo: 'registrarMutual'; empleado: string; monto: number; cuenta: keyof J2Cuentas }
  | { tipo: 'registrarAguinaldo'; empleadoId: string; monto: number; destino: string }
  | { tipo: 'interesesAguinaldo'; empleadoId: string; intereses: number }
  | { tipo: 'registrarAdelanto'; empleadoId: string; monto: number; cuenta: keyof J2Cuentas }
  | {
      tipo: 'liquidarSueldo';
      empleadoId: string;
      bruto: number;
      mutual: number;
      adelanto: number;
      cuenta: keyof J2Cuentas;
      fecha: string;
    }
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
    const datos = { ...estado.datos, ...limpiar(accion.datos) };
    datos.inversiones = normalizarInversiones(datos.inversiones);
    return { ...estado, datos };
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

    case 'anularEgreso': {
      const row = d.egresos.find((x) => x.id === a.id);
      // Los intereses de un crédito se anulan junto con su cuota, desde Finanzas.
      if (!row || row.anulado || row.origen?.tipo === 'credito') return d;
      return contraEgreso(d, a.id, anulacion(a.motivo));
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

    case 'anularIngreso': {
      const row = d.ingresos.find((x) => x.id === a.id);
      if (!row || row.anulado) return d;
      const an = anulacion(a.motivo);
      const marcado = {
        ...d,
        ingresos: d.ingresos.map((x) => (x.id === a.id ? { ...x, anulado: an } : x)),
      };
      return aplicar(marcado, {
        tipo: 'ingreso_anulado',
        concepto: `Anulación — ${row.cliente || 'Cobro'}`,
        detalle: an.motivo,
        monto: -row.monto,
        cuenta: medioACuenta(row.medio),
        fecha: an.fecha,
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
        concepto: `Sale → ${nombreCuenta(para, d.inversiones)}`,
        detalle: nota,
        monto: -monto,
        cuenta: de,
        fecha,
      });
      const entrada = aplicar(salida, {
        tipo: 'transferencia',
        concepto: `Entra ← ${nombreCuenta(de, d.inversiones)}`,
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
          concepto: `Anulación transferencia ${nombreCuenta(row.de, d.inversiones)} → ${nombreCuenta(row.para, d.inversiones)}`,
          monto: row.monto,
          cuenta: row.de,
        }
      );
      return aplicar(paso1, {
        tipo: 'transferencia_anulada',
        concepto: `Anulación transferencia ${nombreCuenta(row.de, d.inversiones)} → ${nombreCuenta(row.para, d.inversiones)}`,
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
    case 'addInversion': {
      const nombre = a.nombre.trim();
      if (!nombre) return d;
      const item = { id: nuevoId('inv'), nombre, saldo: 0, activa: true };
      return { ...d, inversiones: { ...d.inversiones, items: [...d.inversiones.items, item] } };
    }

    case 'toggleInversion': {
      const item = d.inversiones.items.find((i) => i.id === a.id);
      // Con plata adentro no se archiva: primero hay que rescatarla o retirarla.
      if (!item || (item.activa && Math.abs(item.saldo) > 0.5)) return d;
      return {
        ...d,
        inversiones: {
          ...d.inversiones,
          items: d.inversiones.items.map((i) => (i.id === a.id ? { ...i, activa: !i.activa } : i)),
        },
      };
    }

    case 'rendimientoInversion': {
      const item = d.inversiones.items.find((i) => i.id === a.id);
      if (!item || a.monto === 0) return d;
      return aplicar(d, {
        tipo: 'rendimiento',
        concepto: `${a.monto > 0 ? 'Rendimiento' : 'Pérdida'} — ${item.nombre}`,
        monto: a.monto,
        cuenta: a.id,
        fecha: a.fecha,
      });
    }

    /* — Capital del socio — */
    case 'movCapital': {
      const row: J2MovCapital = { ...a.payload, id: nuevoId('cap') };
      const aporte = row.tipo === 'aporte';
      const conMov = { ...d, inversiones: { ...d.inversiones, capital: [...d.inversiones.capital, row] } };
      return aplicar(conMov, {
        tipo: aporte ? 'aporte' : 'retiro',
        concepto: `${aporte ? 'Aporte de capital' : 'Retiro de socio'} — ${row.socio}`,
        detalle: row.nota,
        monto: aporte ? row.monto : -row.monto,
        cuenta: row.cuenta,
        fecha: row.fecha,
      });
    }

    case 'anularCapital': {
      const row = d.inversiones.capital.find((x) => x.id === a.id);
      if (!row || row.anulado) return d;
      const an = anulacion(a.motivo);
      const marcado = {
        ...d,
        inversiones: {
          ...d.inversiones,
          capital: d.inversiones.capital.map((x) => (x.id === a.id ? { ...x, anulado: an } : x)),
        },
      };
      return aplicar(marcado, {
        tipo: 'capital_anulado',
        concepto: `Anulación ${row.tipo === 'aporte' ? 'aporte' : 'retiro'} — ${row.socio}`,
        detalle: an.motivo,
        monto: row.tipo === 'aporte' ? -row.monto : row.monto,
        cuenta: row.cuenta,
        fecha: an.fecha,
      });
    }

    /* — Créditos — */
    case 'recibirCredito': {
      const row: J2Credito = {
        ...a.payload,
        id: nuevoId('cred'),
        saldo: a.payload.monto,
        pagos: [],
        ajustes: [],
      };
      const conCredito = {
        ...d,
        inversiones: { ...d.inversiones, creditos: [...d.inversiones.creditos, row] },
      };
      return aplicar(conCredito, {
        tipo: 'credito',
        concepto: `Crédito recibido — ${row.entidad}`,
        detalle: row.nota,
        monto: row.monto,
        cuenta: row.cuenta,
        fecha: row.fecha,
      });
    }

    case 'anularCredito': {
      const row = d.inversiones.creditos.find((x) => x.id === a.id);
      // Con cuotas vigentes no se anula entero: primero se anulan las cuotas.
      if (!row || row.anulado || row.pagos.some((p) => !p.anulado)) return d;
      const an = anulacion(a.motivo);
      const marcado = {
        ...d,
        inversiones: {
          ...d.inversiones,
          creditos: d.inversiones.creditos.map((x) => (x.id === a.id ? { ...x, anulado: an, saldo: 0 } : x)),
        },
      };
      return aplicar(marcado, {
        tipo: 'credito_anulado',
        concepto: `Anulación crédito — ${row.entidad}`,
        detalle: an.motivo,
        monto: -row.monto,
        cuenta: row.cuenta,
        fecha: an.fecha,
      });
    }

    case 'pagarCuotaCredito': {
      const cred = d.inversiones.creditos.find((x) => x.id === a.creditoId);
      if (!cred || cred.anulado || a.interes < 0 || a.total <= 0 || a.interes > a.total) return d;
      const capital = Math.min(a.total - a.interes, cred.saldo);
      const pagoId = nuevoId('pago');
      const egresoId = a.interes > 0 ? nuevoId('eg') : undefined;
      const pago: J2PagoCredito = { id: pagoId, fecha: a.fecha, capital, interes: a.interes, cuenta: a.cuenta, egresoId };
      let paso: J2Datos = {
        ...d,
        inversiones: {
          ...d.inversiones,
          creditos: d.inversiones.creditos.map((x) =>
            x.id === cred.id ? { ...x, saldo: x.saldo - capital, pagos: [...x.pagos, pago] } : x
          ),
        },
      };
      // El capital devuelto achica la deuda: no es un gasto.
      if (capital > 0) {
        paso = aplicar(paso, {
          tipo: 'credito_cuota',
          concepto: `Cuota crédito — ${cred.entidad}`,
          detalle: 'Devolución de capital',
          monto: -capital,
          cuenta: a.cuenta,
          fecha: a.fecha,
        });
      }
      // El interés sí es un costo del negocio: va a Egresos.
      if (egresoId) {
        const eg: J2Egreso = {
          id: egresoId,
          fecha: a.fecha,
          tipo: 'bancario',
          categoria: `Intereses — ${cred.entidad}`,
          concepto: 'Intereses de crédito',
          monto: a.interes,
          cuenta: a.cuenta,
          origen: { tipo: 'credito', creditoId: cred.id, pagoId },
        };
        paso = aplicar(
          { ...paso, egresos: [...paso.egresos, eg] },
          { tipo: 'egreso', concepto: eg.categoria, detalle: eg.concepto, monto: -a.interes, cuenta: a.cuenta, fecha: a.fecha }
        );
      }
      return paso;
    }

    case 'anularCuotaCredito': {
      const cred = d.inversiones.creditos.find((x) => x.id === a.creditoId);
      const pago = cred?.pagos.find((p) => p.id === a.pagoId);
      if (!cred || !pago || pago.anulado) return d;
      const an = anulacion(a.motivo);
      let paso: J2Datos = {
        ...d,
        inversiones: {
          ...d.inversiones,
          creditos: d.inversiones.creditos.map((x) =>
            x.id === cred.id
              ? {
                  ...x,
                  saldo: x.saldo + pago.capital,
                  pagos: x.pagos.map((p) => (p.id === pago.id ? { ...p, anulado: an } : p)),
                }
              : x
          ),
        },
      };
      if (pago.capital > 0) {
        paso = aplicar(paso, {
          tipo: 'credito_cuota_anulada',
          concepto: `Anulación cuota — ${cred.entidad}`,
          detalle: an.motivo,
          monto: pago.capital,
          cuenta: pago.cuenta,
          fecha: an.fecha,
        });
      }
      if (pago.egresoId) paso = contraEgreso(paso, pago.egresoId, an);
      return paso;
    }

    case 'ajustarCredito': {
      const cred = d.inversiones.creditos.find((x) => x.id === a.creditoId);
      if (!cred || cred.anulado || a.nuevoSaldo < 0) return d;
      const diferencia = a.nuevoSaldo - cred.saldo;
      if (diferencia === 0) return d;
      const an = anulacion(a.motivo);
      const ajuste = { id: nuevoId('aj'), fecha: an.fecha, diferencia, motivo: an.motivo };
      const conAjuste = {
        ...d,
        inversiones: {
          ...d.inversiones,
          creditos: d.inversiones.creditos.map((x) =>
            x.id === cred.id ? { ...x, saldo: a.nuevoSaldo, ajustes: [...x.ajustes, ajuste] } : x
          ),
        },
      };
      // Corrige lo que se debe sin mover caja: queda asentado para que se vea.
      return aplicar(conAjuste, {
        tipo: 'credito_ajuste',
        concepto: `Ajuste deuda — ${cred.entidad}`,
        detalle: an.motivo,
        monto: diferencia,
        cuenta: 'credito',
        fecha: an.fecha,
        afectaSaldo: false,
      });
    }

    case 'corregirInversion': {
      const item = d.inversiones.items.find((i) => i.id === a.id);
      if (!item) return d;
      const diferencia = a.nuevoSaldo - item.saldo;
      if (diferencia === 0) return d;
      return aplicar(d, {
        tipo: 'correccion',
        concepto: `Corrección de saldo — ${item.nombre}`,
        detalle: a.motivo.trim() || 'Sin motivo',
        monto: diferencia,
        cuenta: a.id,
      });
    }

    /* — Compra de un bien de uso: cambia plata por un activo, no es gasto — */
    case 'compraActivo':
      if (a.monto <= 0) return d;
      return aplicar(d, {
        tipo: 'compra_activo',
        concepto: `Compra de activo — ${a.nombre}`,
        monto: -a.monto,
        cuenta: a.cuenta,
        fecha: a.fecha,
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

    case 'removeEmpleado': {
      const emp = d.empleados.find((e) => e.id === a.id);
      // Con saldo pendiente no se borra: se perdería el rastro de esa plata.
      if (!emp || (emp.aguinaldo || 0) > 0 || (emp.adelanto || 0) > 0) return d;
      return { ...d, empleados: d.empleados.filter((e) => e.id !== a.id) };
    }

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
        cuenta: a.destino,
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

    case 'liquidarSueldo': {
      const emp = d.empleados.find((e) => e.id === a.empleadoId);
      const nombre = emp?.nombre ?? a.empleadoId;
      const adelantoDescontado = Math.min(a.adelanto, a.bruto);
      // La mutual no se resta acá: registrarMutual ya la sumó a la caja como retención.
      const egresoMonto = a.bruto - adelantoDescontado;
      const egresoRow: J2Egreso = {
        id: nuevoId('eg'),
        fecha: a.fecha,
        tipo: 'sueldo',
        categoria: nombre,
        concepto: `Liquidación — ${nombre}`,
        monto: egresoMonto,
        cuenta: a.cuenta,
        origen: { tipo: 'liquidacion', empleadoId: a.empleadoId, adelanto: adelantoDescontado },
      };
      const conLiquidacion: J2Datos = {
        ...d,
        egresos: [...d.egresos, egresoRow],
        empleados: d.empleados.map((e) =>
          e.id === a.empleadoId
            ? { ...e, adelanto: Math.max(0, (e.adelanto || 0) - adelantoDescontado) }
            : e
        ),
      };
      return aplicar(conLiquidacion, {
        tipo: 'egreso',
        concepto: nombre,
        detalle: `Liquidación (bruto ${a.bruto} − adelanto ${adelantoDescontado}; mutual ${a.mutual} retenida aparte)`,
        monto: -egresoMonto,
        cuenta: a.cuenta,
        fecha: a.fecha,
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
        cuenta: 'aguinaldo',
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
  aguinaldo: 'Aguinaldo',
};

/** Nombre visible de una cuenta líquida o de una inversión. */
export function nombreCuenta(c: string, inversiones?: J2Inversiones) {
  return inversiones?.items.find((i) => i.id === c)?.nombre || NOMBRES[c] || c;
}

export function medioACuenta(medio: string): keyof J2Cuentas {
  if (!medio) return 'efectivo';
  const m = medio.toLowerCase();
  if (m.includes('mercado') || m === 'mp') return 'mp';
  if (m.includes('banco') || m.includes('transfer')) return 'banco';
  return 'efectivo';
}
