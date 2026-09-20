import { describe, expect, it } from 'vitest';
import { j2Reducer, totalesDelLog, type J2Accion, type J2Datos, type J2Estado } from './j2reducer';

const VACIO: J2Datos = {
  cuentas: { mp: 0, banco: 0, efectivo: 100_000 },
  inversiones: { cocos: 0, servente: 0, usd: { cantidad: 0, precio: 0 } },
  egresos: [],
  ingresos: [],
  transferencias: [],
  empleados: [{ id: 'emp_1', nombre: 'Carlos', activo: true, aguinaldo: 0 }],
  deudasClientes: [],
  listaEspera: [],
  movlog: [],
};

function correr(acciones: J2Accion[], inicial: J2Datos = VACIO) {
  let estado: J2Estado = { datos: inicial, pasado: [] };
  for (const a of acciones) estado = j2Reducer(estado, a);
  return estado;
}

const egreso = (monto: number, extra: Partial<Parameters<typeof armarEgreso>[0]> = {}) =>
  armarEgreso({ monto, ...extra });

function armarEgreso(p: {
  monto: number;
  fecha?: string;
  tipo?: J2Datos['egresos'][number]['tipo'];
  categoria?: string;
  concepto?: string;
  cuenta?: 'mp' | 'banco' | 'efectivo';
}): J2Accion {
  return {
    tipo: 'addEgreso',
    payload: {
      fecha: p.fecha ?? '2026-09-19',
      tipo: p.tipo ?? 'varios',
      categoria: p.categoria ?? 'Nafta',
      concepto: p.concepto ?? '',
      monto: p.monto,
      cuenta: p.cuenta ?? 'efectivo',
    },
  };
}

describe('egresos', () => {
  it('descuenta de la cuenta y deja el movimiento registrado', () => {
    const { datos } = correr([egreso(15_000)]);
    expect(datos.cuentas.efectivo).toBe(85_000);
    expect(datos.egresos).toHaveLength(1);
    expect(datos.movlog).toHaveLength(1);
    expect(datos.movlog[0].monto).toBe(-15_000);
  });

  it('al borrarlo devuelve exactamente lo que había descontado', () => {
    const paso1 = correr([egreso(15_000)]);
    const id = paso1.datos.egresos[0].id;
    const { datos } = correr([{ tipo: 'removeEgreso', id }], paso1.datos);

    expect(datos.cuentas.efectivo).toBe(100_000);
    expect(datos.egresos).toHaveLength(0);
  });

  it('borrar dos veces el mismo egreso no devuelve la plata dos veces', () => {
    const paso1 = correr([egreso(15_000)]);
    const id = paso1.datos.egresos[0].id;
    const { datos } = correr(
      [
        { tipo: 'removeEgreso', id },
        { tipo: 'removeEgreso', id },
      ],
      paso1.datos
    );
    expect(datos.cuentas.efectivo).toBe(100_000);
  });

  it('un egreso mayor al saldo deja la cuenta en negativo en vez de esconderlo', () => {
    // Antes se recortaba en cero y, al revertir, el saldo quedaba inflado.
    const paso1 = correr([egreso(150_000)]);
    expect(paso1.datos.cuentas.efectivo).toBe(-50_000);

    const id = paso1.datos.egresos[0].id;
    const { datos } = correr([{ tipo: 'removeEgreso', id }], paso1.datos);
    expect(datos.cuentas.efectivo).toBe(100_000);
  });

  it('una diferencia de inventario se registra pero no mueve la caja', () => {
    const { datos } = correr([egreso(5_000, { tipo: 'inventario' })]);
    expect(datos.cuentas.efectivo).toBe(100_000);
    expect(datos.egresos).toHaveLength(1);
  });

  it('dos egresos creados en el mismo instante no comparten id', () => {
    const { datos } = correr([egreso(1), egreso(2)]);
    expect(datos.egresos[0].id).not.toBe(datos.egresos[1].id);
  });
});

describe('ingresos', () => {
  it('suma a la cuenta según el medio de pago', () => {
    const { datos } = correr([
      {
        tipo: 'addIngreso',
        payload: {
          fecha: '2026-09-19',
          cliente: 'Padres',
          concepto: 'Corte',
          monto: 20_000,
          medio: 'Mercado Pago',
        },
      },
    ]);
    expect(datos.cuentas.mp).toBe(20_000);
    expect(datos.cuentas.efectivo).toBe(100_000);
  });

  it('anularlo deja la caja como estaba', () => {
    const paso1 = correr([
      {
        tipo: 'addIngreso',
        payload: { fecha: '2026-09-19', cliente: 'X', concepto: 'Y', monto: 20_000, medio: 'efectivo' },
      },
    ]);
    const id = paso1.datos.ingresos[0].id;
    const { datos } = correr([{ tipo: 'removeIngreso', id }], paso1.datos);
    expect(datos.cuentas.efectivo).toBe(100_000);
  });
});

describe('transferencias', () => {
  it('lo que sale de una cuenta entra en la otra, sin crear ni perder plata', () => {
    const antes = VACIO.cuentas.mp + VACIO.cuentas.banco + VACIO.cuentas.efectivo;
    const { datos } = correr([
      {
        tipo: 'transferencia',
        payload: { de: 'efectivo', para: 'banco', monto: 30_000, fecha: '2026-09-19', nota: '' },
      },
    ]);
    const despues = datos.cuentas.mp + datos.cuentas.banco + datos.cuentas.efectivo;

    expect(datos.cuentas.efectivo).toBe(70_000);
    expect(datos.cuentas.banco).toBe(30_000);
    expect(despues).toBe(antes);
  });

  it('anularla revierte las dos puntas', () => {
    const paso1 = correr([
      {
        tipo: 'transferencia',
        payload: { de: 'efectivo', para: 'banco', monto: 30_000, fecha: '2026-09-19', nota: '' },
      },
    ]);
    const id = paso1.datos.transferencias[0].id;
    const { datos } = correr([{ tipo: 'removeTransferencia', id }], paso1.datos);

    expect(datos.cuentas.efectivo).toBe(100_000);
    expect(datos.cuentas.banco).toBe(0);
  });
});

describe('deudas de clientes', () => {
  it('cargar una deuda no suma plata todavía', () => {
    const { datos } = correr([
      {
        tipo: 'addDeudaCliente',
        payload: { nombreCliente: 'Norma', concepto: 'Poda', monto: 50_000, fecha: '2026-09-10' },
      },
    ]);
    expect(datos.cuentas.efectivo).toBe(100_000);
    expect(datos.deudasClientes[0].estado).toBe('pendiente');
  });

  it('al cobrarla entra una sola vez, no dos', () => {
    const paso1 = correr([
      {
        tipo: 'addDeudaCliente',
        payload: { nombreCliente: 'Norma', concepto: 'Poda', monto: 50_000, fecha: '2026-09-10' },
      },
    ]);
    const id = paso1.datos.deudasClientes[0].id;
    const { datos } = correr([{ tipo: 'pagarDeudaCliente', id, cuenta: 'efectivo' }], paso1.datos);

    expect(datos.cuentas.efectivo).toBe(150_000);
    expect(datos.ingresos).toHaveLength(1);
  });

  it('cobrar dos veces la misma deuda no duplica el ingreso', () => {
    const paso1 = correr([
      {
        tipo: 'addDeudaCliente',
        payload: { nombreCliente: 'Norma', concepto: 'Poda', monto: 50_000, fecha: '2026-09-10' },
      },
    ]);
    const id = paso1.datos.deudasClientes[0].id;
    const { datos } = correr(
      [
        { tipo: 'pagarDeudaCliente', id, cuenta: 'efectivo' },
        { tipo: 'pagarDeudaCliente', id, cuenta: 'efectivo' },
      ],
      paso1.datos
    );
    expect(datos.cuentas.efectivo).toBe(150_000);
    expect(datos.ingresos).toHaveLength(1);
  });

  it('borrar una deuda ya cobrada devuelve la plata', () => {
    const paso1 = correr([
      {
        tipo: 'addDeudaCliente',
        payload: { nombreCliente: 'Norma', concepto: 'Poda', monto: 50_000, fecha: '2026-09-10' },
      },
    ]);
    const id = paso1.datos.deudasClientes[0].id;
    const paso2 = correr([{ tipo: 'pagarDeudaCliente', id, cuenta: 'efectivo' }], paso1.datos);
    const { datos } = correr([{ tipo: 'removeDeudaCliente', id }], paso2.datos);

    expect(datos.cuentas.efectivo).toBe(100_000);
  });
});

describe('dólares', () => {
  it('comprar descuenta pesos y suma dólares', () => {
    const { datos } = correr([
      { tipo: 'usd', operacion: 'compra', cantidad: 50, precio: 1_500, cuenta: 'efectivo', motivo: '' },
    ]);
    expect(datos.cuentas.efectivo).toBe(25_000);
    expect(datos.inversiones.usd.cantidad).toBe(50);
  });

  it('vender hace el camino inverso', () => {
    const paso1 = correr([
      { tipo: 'usd', operacion: 'compra', cantidad: 50, precio: 1_500, cuenta: 'efectivo', motivo: '' },
    ]);
    const { datos } = correr(
      [{ tipo: 'usd', operacion: 'venta', cantidad: 50, precio: 1_500, cuenta: 'efectivo', motivo: '' }],
      paso1.datos
    );
    expect(datos.cuentas.efectivo).toBe(100_000);
    expect(datos.inversiones.usd.cantidad).toBe(0);
  });
});

describe('correcciones de saldo', () => {
  it('registra la diferencia como un movimiento, no como un salto silencioso', () => {
    const { datos } = correr([
      { tipo: 'setCuentaSaldo', cuenta: 'efectivo', monto: 90_000, motivo: 'Arqueo del viernes' },
    ]);
    expect(datos.cuentas.efectivo).toBe(90_000);
    expect(datos.movlog[0].monto).toBe(-10_000);
    expect(datos.movlog[0].detalle).toBe('Arqueo del viernes');
  });

  it('corregir al mismo valor no genera ruido en el libro', () => {
    const { datos } = correr([
      { tipo: 'setCuentaSaldo', cuenta: 'efectivo', monto: 100_000, motivo: 'sin cambios' },
    ]);
    expect(datos.movlog).toHaveLength(0);
  });
});

describe('el libro explica el saldo', () => {
  it('la suma de movimientos coincide con el movimiento neto de cada cuenta', () => {
    const inicial: J2Datos = { ...VACIO, cuentas: { mp: 0, banco: 0, efectivo: 0 } };
    const { datos } = correr(
      [
        egreso(15_000),
        {
          tipo: 'addIngreso',
          payload: { fecha: '2026-09-19', cliente: 'A', concepto: 'B', monto: 40_000, medio: 'efectivo' },
        },
        {
          tipo: 'transferencia',
          payload: { de: 'efectivo', para: 'mp', monto: 10_000, fecha: '2026-09-19', nota: '' },
        },
      ],
      inicial
    );

    const totales = totalesDelLog(datos.movlog);
    expect(totales.efectivo).toBe(datos.cuentas.efectivo);
    expect(totales.mp).toBe(datos.cuentas.mp);
  });
});

describe('deshacer', () => {
  it('vuelve al estado anterior a la última acción', () => {
    const paso1 = correr([egreso(15_000)]);
    const despues = j2Reducer(paso1, { tipo: 'deshacer' });

    expect(despues.datos.cuentas.efectivo).toBe(100_000);
    expect(despues.datos.egresos).toHaveLength(0);
  });

  it('sin historial no hace nada', () => {
    const estado: J2Estado = { datos: VACIO, pasado: [] };
    expect(j2Reducer(estado, { tipo: 'deshacer' })).toBe(estado);
  });

  it('se pueden deshacer varias acciones seguidas', () => {
    let estado = correr([egreso(10_000), egreso(20_000), egreso(30_000)]);
    expect(estado.datos.cuentas.efectivo).toBe(40_000);

    estado = j2Reducer(estado, { tipo: 'deshacer' });
    estado = j2Reducer(estado, { tipo: 'deshacer' });
    expect(estado.datos.cuentas.efectivo).toBe(90_000);
    expect(estado.datos.egresos).toHaveLength(1);
  });
});

describe('hidratación desde el servidor', () => {
  it('sólo pisa las secciones que llegan', () => {
    const estado: J2Estado = { datos: VACIO, pasado: [] };
    const { datos } = j2Reducer(estado, {
      tipo: 'hidratar',
      datos: { listaEspera: [{ id: 'a', clienteId: '', nombreCliente: 'X', trabajo: '', notas: '', fechaAgregado: '2026-09-01' }] },
    });

    expect(datos.listaEspera).toHaveLength(1);
    expect(datos.cuentas.efectivo).toBe(100_000);
    expect(datos.empleados).toHaveLength(1);
  });

  it('ignora valores nulos en vez de borrar lo que había', () => {
    const estado: J2Estado = { datos: VACIO, pasado: [] };
    const { datos } = j2Reducer(estado, {
      tipo: 'hidratar',
      datos: { empleados: null as never, egresos: undefined },
    });
    expect(datos.empleados).toHaveLength(1);
    expect(datos.egresos).toEqual([]);
  });
});
