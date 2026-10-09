import { describe, expect, it } from 'vitest';
import {
  j2Reducer,
  normalizarInversiones,
  totalesDelLog,
  type J2Accion,
  type J2Datos,
  type J2Estado,
} from './j2reducer';

const VACIO: J2Datos = {
  cuentas: { mp: 0, banco: 0, efectivo: 100_000 },
  inversiones: {
    items: [{ id: 'inv_fci', nombre: 'Fondo MP', saldo: 0, activa: true }],
    usd: { cantidad: 0, precio: 0 },
    creditos: [],
    capital: [],
  },
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

  it('al anularlo devuelve la plata y lo deja visible como anulado, con el motivo', () => {
    const paso1 = correr([egreso(15_000)]);
    const id = paso1.datos.egresos[0].id;
    const { datos } = correr([{ tipo: 'anularEgreso', id, motivo: 'Cargado dos veces' }], paso1.datos);

    expect(datos.cuentas.efectivo).toBe(100_000);
    expect(datos.egresos).toHaveLength(1);
    expect(datos.egresos[0].anulado?.motivo).toBe('Cargado dos veces');
    expect(datos.movlog[0].tipo).toBe('egreso_anulado');
  });

  it('anular dos veces el mismo egreso no devuelve la plata dos veces', () => {
    const paso1 = correr([egreso(15_000)]);
    const id = paso1.datos.egresos[0].id;
    const { datos } = correr(
      [
        { tipo: 'anularEgreso', id, motivo: '' },
        { tipo: 'anularEgreso', id, motivo: '' },
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
    const { datos } = correr([{ tipo: 'anularEgreso', id, motivo: 'error' }], paso1.datos);
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
    const { datos } = correr([{ tipo: 'anularIngreso', id, motivo: 'Era un crédito, no un cobro' }], paso1.datos);
    expect(datos.cuentas.efectivo).toBe(100_000);
    expect(datos.ingresos[0].anulado?.motivo).toBe('Era un crédito, no un cobro');
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

describe('inversiones', () => {
  it('invertir es una transferencia: sale de caja y entra a la inversión', () => {
    const { datos } = correr([
      { tipo: 'transferencia', payload: { de: 'efectivo', para: 'inv_fci', monto: 30_000, fecha: '2026-10-09', nota: '' } },
    ]);
    expect(datos.cuentas.efectivo).toBe(70_000);
    expect(datos.inversiones.items[0].saldo).toBe(30_000);
  });

  it('el rendimiento suma a la inversión sin tocar la caja', () => {
    const { datos } = correr([{ tipo: 'rendimientoInversion', id: 'inv_fci', monto: 1_200, fecha: '2026-10-09' }]);
    expect(datos.inversiones.items[0].saldo).toBe(1_200);
    expect(datos.cuentas.efectivo).toBe(100_000);
  });

  it('no deja archivar una inversión con plata adentro', () => {
    const paso1 = correr([{ tipo: 'rendimientoInversion', id: 'inv_fci', monto: 500, fecha: '2026-10-09' }]);
    const { datos } = correr([{ tipo: 'toggleInversion', id: 'inv_fci' }], paso1.datos);
    expect(datos.inversiones.items[0].activa).toBe(true);
  });

  it('convierte el formato viejo (cocos/servente) sin perder saldos', () => {
    const n = normalizarInversiones({ cocos: 250_000, servente: 0, usd: { cantidad: 10, precio: 1_400 } });
    expect(n.items.map((i) => [i.id, i.saldo])).toEqual([['cocos', 250_000], ['servente', 0]]);
    expect(n.usd.cantidad).toBe(10);
    expect(n.creditos).toEqual([]);
  });
});

describe('capital del socio', () => {
  it('el aporte entra a caja pero no cuenta como ingreso', () => {
    const { datos } = correr([
      { tipo: 'movCapital', payload: { fecha: '2026-10-09', tipo: 'aporte', socio: 'Carlos', monto: 200_000, cuenta: 'banco' } },
    ]);
    expect(datos.cuentas.banco).toBe(200_000);
    expect(datos.ingresos).toHaveLength(0);
    expect(datos.inversiones.capital).toHaveLength(1);
  });

  it('el retiro puede salir de una inversión y no cuenta como gasto', () => {
    const paso1 = correr([{ tipo: 'rendimientoInversion', id: 'inv_fci', monto: 50_000, fecha: '2026-10-09' }]);
    const { datos } = correr(
      [{ tipo: 'movCapital', payload: { fecha: '2026-10-09', tipo: 'retiro', socio: 'Carlos', monto: 50_000, cuenta: 'inv_fci' } }],
      paso1.datos
    );
    expect(datos.inversiones.items[0].saldo).toBe(0);
    expect(datos.egresos).toHaveLength(0);
  });

  it('anular devuelve la caja al saldo anterior y deja el registro como anulado', () => {
    const paso1 = correr([
      { tipo: 'movCapital', payload: { fecha: '2026-10-09', tipo: 'aporte', socio: 'Carlos', monto: 200_000, cuenta: 'banco' } },
    ]);
    const id = paso1.datos.inversiones.capital[0].id;
    const { datos } = correr([{ tipo: 'anularCapital', id, motivo: 'Era un crédito' }], paso1.datos);
    expect(datos.cuentas.banco).toBe(0);
    expect(datos.inversiones.capital[0].anulado?.motivo).toBe('Era un crédito');
  });
});

describe('créditos', () => {
  const recibir: J2Accion = {
    tipo: 'recibirCredito',
    payload: { fecha: '2026-10-09', entidad: 'Banco Nación', monto: 500_000, cuenta: 'banco', cuotas: 36 },
  };
  const cuota = (creditoId: string, total: number, interes: number): J2Accion => ({
    tipo: 'pagarCuotaCredito',
    creditoId,
    total,
    interes,
    cuenta: 'banco',
    fecha: '2026-11-09',
  });

  it('la plata del crédito entra a caja y queda como deuda, no como ingreso', () => {
    const { datos } = correr([recibir]);
    expect(datos.cuentas.banco).toBe(500_000);
    expect(datos.inversiones.creditos[0].saldo).toBe(500_000);
    expect(datos.ingresos).toHaveLength(0);
  });

  it('la cuota baja la deuda por el capital y manda sólo el interés a egresos', () => {
    const paso1 = correr([recibir]);
    const creditoId = paso1.datos.inversiones.creditos[0].id;
    const { datos } = correr([cuota(creditoId, 55_000, 15_000)], paso1.datos);
    expect(datos.cuentas.banco).toBe(445_000);
    expect(datos.inversiones.creditos[0].saldo).toBe(460_000);
    expect(datos.inversiones.creditos[0].pagos).toHaveLength(1);
    expect(datos.egresos).toHaveLength(1);
    expect(datos.egresos[0].monto).toBe(15_000);
    expect(totalesDelLog(datos.movlog).banco).toBe(datos.cuentas.banco);
  });

  it('anular una cuota devuelve capital, interés y deuda a como estaban', () => {
    const paso1 = correr([recibir]);
    const creditoId = paso1.datos.inversiones.creditos[0].id;
    const paso2 = correr([cuota(creditoId, 55_000, 15_000)], paso1.datos);
    const pagoId = paso2.datos.inversiones.creditos[0].pagos[0].id;
    const { datos } = correr([{ tipo: 'anularCuotaCredito', creditoId, pagoId, motivo: 'Monto equivocado' }], paso2.datos);
    expect(datos.cuentas.banco).toBe(500_000);
    expect(datos.inversiones.creditos[0].saldo).toBe(500_000);
    expect(datos.egresos[0].anulado).toBeDefined();
    expect(totalesDelLog(datos.movlog).banco).toBe(datos.cuentas.banco);
  });

  it('el interés de una cuota no se puede anular suelto desde egresos', () => {
    const paso1 = correr([recibir]);
    const creditoId = paso1.datos.inversiones.creditos[0].id;
    const paso2 = correr([cuota(creditoId, 55_000, 15_000)], paso1.datos);
    const id = paso2.datos.egresos[0].id;
    const { datos } = correr([{ tipo: 'anularEgreso', id, motivo: 'x' }], paso2.datos);
    expect(datos.egresos[0].anulado).toBeUndefined();
    expect(datos.cuentas.banco).toBe(445_000);
  });

  it('ajustar la deuda corrige el saldo sin mover la caja', () => {
    const paso1 = correr([recibir]);
    const creditoId = paso1.datos.inversiones.creditos[0].id;
    const { datos } = correr([{ tipo: 'ajustarCredito', creditoId, nuevoSaldo: 480_000, motivo: 'Según resumen del banco' }], paso1.datos);
    expect(datos.inversiones.creditos[0].saldo).toBe(480_000);
    expect(datos.inversiones.creditos[0].ajustes).toHaveLength(1);
    expect(datos.cuentas.banco).toBe(500_000);
  });

  it('no deja anular un crédito con cuotas vigentes', () => {
    const paso1 = correr([recibir]);
    const creditoId = paso1.datos.inversiones.creditos[0].id;
    const paso2 = correr([cuota(creditoId, 40_000, 0)], paso1.datos);
    const { datos } = correr([{ tipo: 'anularCredito', id: creditoId, motivo: 'x' }], paso2.datos);
    expect(datos.inversiones.creditos[0].anulado).toBeUndefined();
  });

  it('un crédito sin cuotas se anula y saca la plata de la cuenta', () => {
    const paso1 = correr([recibir]);
    const creditoId = paso1.datos.inversiones.creditos[0].id;
    const { datos } = correr([{ tipo: 'anularCredito', id: creditoId, motivo: 'Cargado dos veces' }], paso1.datos);
    expect(datos.cuentas.banco).toBe(0);
    expect(datos.inversiones.creditos[0].anulado?.motivo).toBe('Cargado dos veces');
    expect(datos.inversiones.creditos[0].saldo).toBe(0);
  });
});

describe('compra de activos', () => {
  it('sale de caja pero no es un egreso', () => {
    const { datos } = correr([{ tipo: 'compraActivo', nombre: 'Desmalezadora', monto: 300_000, cuenta: 'efectivo', fecha: '2026-10-09' }]);
    expect(datos.cuentas.efectivo).toBe(-200_000);
    expect(datos.egresos).toHaveLength(0);
  });
});

describe('liquidación de sueldo', () => {
  it('egresa bruto menos adelanto; la mutual no se descuenta dos veces', () => {
    const conAdelanto = correr([{ tipo: 'registrarAdelanto', empleadoId: 'emp_1', monto: 20_000, cuenta: 'efectivo' }]);
    const conMutual = correr([{ tipo: 'registrarMutual', empleado: 'Carlos', monto: 5_000, cuenta: 'efectivo' }], conAdelanto.datos);
    const { datos } = correr(
      [{ tipo: 'liquidarSueldo', empleadoId: 'emp_1', bruto: 60_000, mutual: 5_000, adelanto: 20_000, cuenta: 'efectivo', fecha: '2026-10-09' }],
      conMutual.datos
    );
    // 100.000 − 20.000 adelanto + 5.000 mutual − 40.000 liquidación = 45.000 (salió en total bruto − mutual)
    expect(datos.cuentas.efectivo).toBe(45_000);
    expect(datos.egresos[0].monto).toBe(40_000);
    expect(datos.empleados[0].adelanto).toBe(0);

    // Anular la liquidación devuelve la plata y vuelve a dejar el adelanto pendiente.
    const anulada = correr([{ tipo: 'anularEgreso', id: datos.egresos[0].id, motivo: 'Bruto mal cargado' }], datos);
    expect(anulada.datos.cuentas.efectivo).toBe(85_000);
    expect(anulada.datos.empleados[0].adelanto).toBe(20_000);
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
