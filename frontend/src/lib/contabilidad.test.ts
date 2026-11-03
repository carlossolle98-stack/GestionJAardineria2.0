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
