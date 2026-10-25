import { describe, expect, it } from 'vitest';
import { alertasProducto, estadoStock, margen, parsearProductos, signoMov, valorStock } from './inventario';
import type { ItemInventario } from '@/types';

function item(p: Partial<ItemInventario>): ItemInventario {
  return { _id: 'x', nombre: 'Algo', categoria: 'Otro', stock: 5, unidad: 'unidades', stockMinimo: 0, movimientos: [], ...p };
}

describe('inventario', () => {
  it('clasifica el estado del stock', () => {
    expect(estadoStock(item({ stock: -1 }))).toBe('negativo');
    expect(estadoStock(item({ stock: 0 }))).toBe('sin');
    expect(estadoStock(item({ stock: 0, origen: 'pedido' }))).toBe('pedido');
    expect(estadoStock(item({ stock: 2, stockMinimo: 2 }))).toBe('bajo');
    expect(estadoStock(item({ stock: 3, stockMinimo: 2 }))).toBe('ok');
  });

  it('avisa cuando se vende por debajo del costo, sólo a quien ve costos', () => {
    const rastrillo = item({ costo: 3501.6, precioVenta: 3500 });
    expect(margen(rastrillo)).toBeLessThan(0);
    expect(alertasProducto(rastrillo, true).map((a) => a.tipo)).toEqual(['bajoCosto']);
    expect(alertasProducto(rastrillo, false)).toEqual([]);
    expect(margen(item({ costo: 0, precioVenta: 100 }))).toBeNull();
  });

  it('valúa el stock al costo sin restar los negativos ni los dados de baja', () => {
    const v = valorStock([
      item({ stock: 2, costo: 100 }),
      item({ stock: -3, costo: 100 }),
      item({ stock: 10, costo: 50, activo: false }),
    ]);
    expect(v).toBe(200);
  });

  it('suma o resta según el tipo de movimiento', () => {
    expect(signoMov('compra', 3)).toBe(3);
    expect(signoMov('venta', 3)).toBe(-3);
    expect(signoMov('ajuste', -2)).toBe(-2);
  });

  it('lee el CSV de la planilla con formato argentino', () => {
    const { productos, errores } = parsearProductos(
      '﻿codigo;nombre;categoria;unidad;stock;costo;precioVenta\r\n' +
        'P-002;Tela antihelada x metro;Accesorios;metros;63;139,85;1000\r\n' +
        'P-010;Palo verde  triple 15;Fertilizantes y sustratos;unidades;-1;3.102,10;5500\r\n' +
        ';;Otro;;;;\r\n'
    );
    expect(productos).toEqual([
      { codigo: 'P-002', nombre: 'Tela antihelada x metro', categoria: 'Accesorios', unidad: 'metros', stock: 63, costo: 139.85, precioVenta: 1000 },
      { codigo: 'P-010', nombre: 'Palo verde triple 15', categoria: 'Fertilizantes y sustratos', unidad: 'unidades', stock: -1, costo: 3102.1, precioVenta: 5500 },
    ]);
    expect(errores).toHaveLength(1);
  });

  it('reconoce los encabezados de la planilla original', () => {
    const { productos } = parsearProductos('Codigo\tArtículo\tPrecio costo\tPrecio de venta\n1\tCebo hormigas\t385\t2500');
    expect(productos[0]).toEqual({ codigo: '1', nombre: 'Cebo hormigas', costo: 385, precioVenta: 2500 });
  });
});
