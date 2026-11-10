import { describe, expect, it } from 'vitest';
import { j2Reducer, type J2Accion, type J2Datos, type J2Estado } from './j2reducer';
import {
  cuadra,
  cuentaDeEgreso,
  cuentaDeIngreso,
  estadoDeResultados,
  generarLibros,
  mayor,
  situacionPatrimonial,
  sumasYSaldos,
} from './contabilidad';

const VACIO: J2Datos = {
  cuentas: { mp: 0, banco: 0, efectivo: 100_000 },
  inversiones: { items: [{ id: 'inv_fci', nombre: 'Fondo MP', saldo: 0, activa: true }], monedas: [], creditos: [], capital: [] },
  egresos: [],
  ingresos: [],
  transferencias: [],
  empleados: [{ id: 'emp_1', nombre: 'Aylén', activo: true, aguinaldo: 0, adelanto: 0 }],
  deudasClientes: [],
  listaEspera: [],
  movlog: [],
};

function correr(acciones: J2Accion[], inicial: J2Datos = VACIO) {
  let e: J2Estado = { datos: inicial, pasado: [] };
  for (const a of acciones) e = j2Reducer(e, a);
  return e.datos;
}

const MES: J2Accion[] = [
  { tipo: 'addIngreso', payload: { fecha: '2026-10-03', cliente: 'Pérez', concepto: 'Cobro de trabajo', monto: 72_000, medio: 'Transferencia bancaria' } },
  { tipo: 'addIngreso', payload: { fecha: '2026-10-05', cliente: 'El Sol', concepto: 'Comisión de vivero', monto: 15_000, medio: 'Efectivo' } },
  { tipo: 'addEgreso', payload: { fecha: '2026-10-06', tipo: 'fijo', categoria: 'Monotributo', concepto: '', monto: 19_000, cuenta: 'banco' } },
  { tipo: 'addEgreso', payload: { fecha: '2026-10-07', tipo: 'varios', categoria: 'Nafta', concepto: 'Moto', monto: 8_000, cuenta: 'efectivo' } },
  { tipo: 'transferencia', payload: { de: 'banco', para: 'inv_fci', monto: 30_000, fecha: '2026-10-08', nota: '' } },
  { tipo: 'rendimientoInversion', id: 'inv_fci', monto: 900, fecha: '2026-10-31' },
  { tipo: 'movCapital', payload: { fecha: '2026-10-10', tipo: 'aporte', socio: 'Carlos', monto: 50_000, cuenta: 'mp' } },
  { tipo: 'compraMercaderia', detalle: '10 cebos', monto: 3_850, cuenta: 'efectivo', fecha: '2026-10-11' },
  { tipo: 'addEgreso', payload: { fecha: '2026-10-12', tipo: 'costo_mercaderia', categoria: 'Costo de lo vendido', concepto: '2 cebos', monto: 770, cuenta: 'efectivo' } },
  { tipo: 'recibirCredito', payload: { fecha: '2026-10-01', entidad: 'Banco', monto: 200_000, cuenta: 'banco', cuotas: 10 } },
];

describe('contabilidad de partida doble', () => {
  const datos = correr(MES);
  const libros = generarLibros(datos, { mercaderia: 3_080, hoy: '2026-11-03' });

  it('todos los asientos cuadran', () => {
    expect(libros.asientos.length).toBeGreaterThan(5);
    for (const a of libros.asientos) expect(cuadra(a)).toBe(true);
  });

  it('el estado de resultados separa cada tipo de ingreso y gasto', () => {
    const er = estadoDeResultados(libros, '2026-10-01', '2026-10-31');
    const imp = (codigo: string) => [...er.ingresos, ...er.gastos].find((f) => f.codigo === codigo)?.importe;
    expect(imp('4.1')).toBe(72_000);
    expect(imp('4.4')).toBe(15_000);
    expect(imp('4.7')).toBe(900);
    expect(imp('5.11')).toBe(19_000);
    expect(imp('5.4')).toBe(8_000);
    expect(imp('5.1')).toBe(770);
    // El aporte, el crédito y la compra de mercadería no son resultado.
    expect(er.resultado).toBe(72_000 + 15_000 + 900 - 19_000 - 8_000 - 770);
  });

  it('el balance cierra: Activo = Pasivo + Patrimonio', () => {
    const sp = situacionPatrimonial(libros, '2026-10-31');
    expect(sp.diferencia).toBe(0);
    const imp = (lista: { codigo: string; importe: number }[], c: string) => lista.find((f) => f.codigo === c)?.importe;
    expect(imp(sp.pasivo, '2.3.1')).toBe(200_000);
    expect(imp(sp.patrimonio, '3.1.1')).toBe(50_000);
    expect(imp(sp.activo, '1.5.1')).toBe(3_080);
    expect(imp(sp.activo, '1.2.inv_fci')).toBe(30_900);
  });

  it('los saldos de caja de los libros coinciden con los de la app', () => {
    const sp = situacionPatrimonial(libros, '2026-11-03');
    const caja = (c: string) => sp.activo.find((f) => f.codigo === c)?.importe ?? 0;
    expect(caja('1.1.1')).toBe(datos.cuentas.efectivo);
    expect(caja('1.1.2')).toBe(datos.cuentas.mp);
    expect(caja('1.1.3')).toBe(datos.cuentas.banco);
    // Los 100.000 de efectivo con los que se arrancó son el único saldo sin explicar.
    expect(libros.diferencias.map((d) => [d.cuenta, d.diferencia])).toEqual([['1.1.1', 100_000]]);
  });

  it('una anulación genera el contraasiento y deja el resultado como si no hubiera pasado', () => {
    const conError = correr([{ tipo: 'addEgreso', payload: { fecha: '2026-10-20', tipo: 'varios', categoria: 'Nafta', concepto: '', monto: 5_000, cuenta: 'efectivo' } }], datos);
    const id = conError.egresos.at(-1)!.id;
    const anulado = correr([{ tipo: 'anularEgreso', id, motivo: 'cargado dos veces' }], conError);
    const l2 = generarLibros(anulado, { mercaderia: 3_080, hoy: '2026-11-03' });
    expect(l2.asientos.some((a) => a.id === `eg:${id}~anul`)).toBe(true);
    expect(estadoDeResultados(l2, '2026-01-01', '2026-12-31').resultado).toBe(estadoDeResultados(libros, '2026-01-01', '2026-12-31').resultado);
  });

  it('un movimiento cargado tarde cae en su mes, aunque el mes ya haya pasado', () => {
    const tarde = correr([{ tipo: 'addIngreso', payload: { fecha: '2026-12-31', cliente: 'Gómez', concepto: 'Cobro de trabajo', monto: 40_000, medio: 'Efectivo' } }], datos);
    const l = generarLibros(tarde, { mercaderia: 3_080, hoy: '2027-01-05' });
    expect(estadoDeResultados(l, '2026-12-01', '2026-12-31').totalIngresos).toBe(40_000);
    // Al 31/12 el resultado del año pasa al balance; en 2027 queda en Resultados acumulados.
    const enero = situacionPatrimonial(l, '2027-01-05');
    expect(enero.patrimonio.find((f) => f.codigo === '3.4.1')?.importe).toBe(estadoDeResultados(l, '2026-01-01', '2026-12-31').resultado);
    expect(enero.diferencia).toBe(0);
  });

  it('el mayor arrastra el saldo anterior', () => {
    const m = mayor(libros, '1.1.3', '2026-10-05', '2026-10-31');
    expect(m.saldoInicial).toBe(72_000 + 200_000);
    expect(m.saldoFinal).toBe(datos.cuentas.banco);
  });

  it('el balance de sumas y saldos suma lo mismo en el Debe que en el Haber', () => {
    const filas = sumasYSaldos(libros, '2000-01-01', '2026-12-31');
    const debe = filas.reduce((t, f) => t + f.debe, 0);
    const haber = filas.reduce((t, f) => t + f.haber, 0);
    expect(Math.round(debe)).toBe(Math.round(haber));
  });
});

describe('a qué cuenta va cada movimiento', () => {
  it('ingresos según el tipo de cobro', () => {
    expect(cuentaDeIngreso({ concepto: 'Venta vivero — Rosales', cliente: 'X' })).toBe('4.3');
    expect(cuentaDeIngreso({ concepto: 'Comisión de vivero', cliente: 'Marquez' })).toBe('4.4');
    expect(cuentaDeIngreso({ concepto: '3% de Aylén', cliente: 'Descuento por mutual', egresoId: 'eg_1' })).toBe('4.9');
    expect(cuentaDeIngreso({ concepto: 'Cobro deuda anterior', cliente: 'X' })).toBe('4.1');
  });

  it('gastos según el tipo y las palabras de la categoría', () => {
    const e = (tipo: 'fijo' | 'varios', categoria: string) => cuentaDeEgreso({ tipo, categoria, concepto: '' });
    expect(e('fijo', 'Claude')).toBe('5.8');
    expect(e('fijo', 'Obra Social')).toBe('5.11');
    expect(e('fijo', 'Marketing')).toBe('5.9');
    expect(e('varios', 'Nafta')).toBe('5.4');
    expect(e('varios', 'Algo raro')).toBe('5.12');
    expect(cuentaDeEgreso({ tipo: 'costo_mercaderia', categoria: 'Uso en trabajo', concepto: '' })).toBe('5.2');
  });
});

describe('compras financiadas, tarjeta y cuentas por cobrar', () => {
  // El caso real: una máquina pagada con un crédito de Mercado Pago, 56.000 del
  // banco, 50.000 de Mercado Pago y 700.000 en 6 cuotas sin interés con tarjeta.
  const base: J2Datos = { ...VACIO, cuentas: { mp: 300_000, banco: 300_000, efectivo: 0 } };
  const compra = correr(
    [
      {
        tipo: 'comprarBien',
        nombre: 'Tractorcito',
        fecha: '2026-11-05',
        pagos: [
          { cuenta: 'banco', monto: 56_000 },
          { cuenta: 'mp', monto: 50_000 },
        ],
        financiaciones: [
          { entidad: 'Mercado Pago', tipoCredito: 'prestamo', monto: 400_000, cuotas: 1, totalADevolver: 460_000 },
          { entidad: 'Visa', tipoCredito: 'tarjeta', monto: 700_000, cuotas: 6 },
        ],
      },
    ],
    base
  );
  const activos = [{ nombre: 'Tractorcito', valorCompra: 1_206_000, fechaCompra: '2026-11-05', vidaUtilAnios: 10, estado: 'Activo' }];

  it('baja las cuentas que pagaron, crea las dos deudas y no toca resultados', () => {
    expect(compra.cuentas.banco).toBe(244_000);
    expect(compra.cuentas.mp).toBe(250_000);
    expect(compra.inversiones.creditos.map((c) => [c.entidad, c.saldo, c.tipoCredito])).toEqual([
      ['Mercado Pago', 400_000, 'prestamo'],
      ['Visa', 700_000, 'tarjeta'],
    ]);
    const l = generarLibros(compra, { hoy: '2026-11-05', activos });
    const sp = situacionPatrimonial(l, '2026-11-05');
    expect(sp.diferencia).toBe(0);
    expect(sp.activo.find((f) => f.codigo === '1.6.1')?.importe).toBe(1_206_000);
    expect(sp.pasivo.find((f) => f.codigo === '2.2.1')?.importe).toBe(700_000);
    expect(sp.pasivo.find((f) => f.codigo === '2.3.1')?.importe).toBe(400_000);
    // La máquina entera queda explicada por la compra: nada va a saldos iniciales.
    expect(l.diferencias.filter((d) => d.cuenta === '1.6.1')).toEqual([]);
  });

  it('el interés sale solo de lo pedido y lo que se devuelve, pagando desde dos cuentas', () => {
    const mp = compra.inversiones.creditos[0];
    const pagado = correr(
      [{ tipo: 'pagarCuotaCredito', creditoId: mp.id, total: 460_000, pagos: [{ cuenta: 'mp', monto: 250_000 }, { cuenta: 'banco', monto: 210_000 }], fecha: '2026-12-05' }],
      compra
    );
    const cr = pagado.inversiones.creditos[0];
    expect(cr.saldo).toBe(0);
    expect(cr.pagos[0]).toMatchObject({ capital: 400_000, interes: 60_000 });
    expect(pagado.cuentas.mp).toBe(0);
    expect(pagado.cuentas.banco).toBe(34_000);
    const l = generarLibros(pagado, { hoy: '2026-12-05', activos });
    const er = estadoDeResultados(l, '2026-12-01', '2026-12-31');
    expect(er.gastos.find((f) => f.codigo === '6.2')?.importe).toBe(60_000);
    expect(situacionPatrimonial(l, '2026-12-31').diferencia).toBe(0);
    // Lo único sin explicar son los 300.000 de cada cuenta con los que arrancó el ejemplo.
    expect(l.diferencias.filter((d) => d.contra === '3.6.2').map((d) => d.diferencia)).toEqual([300_000, 300_000]);
  });

  it('la tarjeta sin interés: cada cuota es todo capital', () => {
    const visa = compra.inversiones.creditos[1];
    const una = correr([{ tipo: 'pagarCuotaCredito', creditoId: visa.id, total: 116_667, pagos: [{ cuenta: 'banco', monto: 116_667 }], fecha: '2026-12-10' }], compra);
    expect(una.inversiones.creditos[1].pagos[0]).toMatchObject({ capital: 116_667, interes: 0 });
  });

  it('con interés en cuotas, cada pago lleva su parte proporcional y el último cierra exacto', () => {
    const conCredito = correr([{ tipo: 'recibirCredito', payload: { fecha: '2026-11-01', entidad: 'Banco', monto: 300_000, cuenta: 'banco', cuotas: 3, totalADevolver: 360_000 } }], base);
    const id = conCredito.inversiones.creditos[0].id;
    const pago = (fecha: string): J2Accion => ({ tipo: 'pagarCuotaCredito', creditoId: id, total: 120_000, pagos: [{ cuenta: 'banco', monto: 120_000 }], fecha });
    const fin = correr([pago('2026-12-01'), pago('2027-01-01'), pago('2027-02-01')], conCredito);
    const cr = fin.inversiones.creditos[0];
    expect(cr.pagos.map((p) => p.interes)).toEqual([20_000, 20_000, 20_000]);
    expect(cr.saldo).toBe(0);
  });

  it('lo que falta cobrar figura en el activo y pasa a resultados recién al cobrarlo', () => {
    const conDeuda = correr([{ tipo: 'addDeudaCliente', payload: { nombreCliente: 'Pérez', concepto: 'Poda', monto: 80_000, fecha: '2026-11-03' } }], base);
    const l1 = generarLibros(conDeuda, { hoy: '2026-11-03' });
    const sp1 = situacionPatrimonial(l1, '2026-11-30');
    expect(sp1.activo.find((f) => f.codigo === '1.3.1')?.importe).toBe(80_000);
    expect(estadoDeResultados(l1, '2026-11-01', '2026-11-30').totalIngresos).toBe(0);
    expect(sp1.diferencia).toBe(0);

    const id = conDeuda.deudasClientes[0].id;
    const cobrado = correr([{ tipo: 'pagarDeudaCliente', id, cuenta: 'banco', fecha: '2026-11-20' }], conDeuda);
    const l2 = generarLibros(cobrado, { hoy: '2026-11-20' });
    const sp2 = situacionPatrimonial(l2, '2026-11-30');
    expect(sp2.activo.find((f) => f.codigo === '1.3.1')).toBeUndefined();
    expect(estadoDeResultados(l2, '2026-11-01', '2026-11-30').totalIngresos).toBe(80_000);
    expect(sp2.diferencia).toBe(0);
  });
});

