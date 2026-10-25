import { numero } from '@/lib/historial';
import type { ItemInventario, TipoMovInventario } from '@/types';

export const CATEGORIAS_INVENTARIO = [
  'Fitosanitarios',
  'Fertilizantes y sustratos',
  'Macetas',
  'Semillas y siembra',
  'Plantas',
  'Herramientas',
  'Accesorios',
  'Insumos de trabajo',
  'Protección personal',
  'Otro',
];

export const UNIDADES = ['unidades', 'kg', 'litros', 'bolsas', 'metros', 'pares', 'cajas', 'dm³'];

export const LABEL_MOV: Record<TipoMovInventario, string> = {
  compra: 'Compra',
  venta: 'Venta',
  uso: 'Uso en trabajo',
  merma: 'Merma / rotura',
  ajuste: 'Ajuste por conteo',
  entrada: 'Entrada',
  salida: 'Salida',
};

/** Movimientos que suman stock; el ajuste trae la diferencia con signo. */
export function signoMov(tipo: TipoMovInventario, cantidad: number) {
  if (tipo === 'ajuste') return cantidad;
  return tipo === 'compra' || tipo === 'entrada' ? cantidad : -cantidad;
}

export type EstadoStock = 'negativo' | 'sin' | 'bajo' | 'ok' | 'pedido';

export function estadoStock(i: ItemInventario): EstadoStock {
  if (i.stock < 0) return 'negativo';
  // Lo que se consigue cuando alguien lo pide no tiene por qué estar en stock.
  if (i.origen === 'pedido' && i.stock === 0) return 'pedido';
  if (i.stock === 0) return 'sin';
  if (i.stockMinimo > 0 && i.stock <= i.stockMinimo) return 'bajo';
  return 'ok';
}

/** Ganancia sobre el precio de venta (0,4 = 40 %). null si falta algún dato. */
export function margen(i: Pick<ItemInventario, 'costo' | 'precioVenta'>) {
  const costo = i.costo ?? 0;
  const precio = i.precioVenta ?? 0;
  if (!(precio > 0) || !(costo > 0)) return null;
  return (precio - costo) / precio;
}

export type AlertaProducto = { tipo: 'negativo' | 'sin' | 'bajo' | 'bajoCosto'; texto: string };

export function alertasProducto(i: ItemInventario, conCostos: boolean): AlertaProducto[] {
  if (i.activo === false) return [];
  const out: AlertaProducto[] = [];
  const e = estadoStock(i);
  if (e === 'negativo') out.push({ tipo: 'negativo', texto: `Stock negativo (${i.stock}): falta registrar una compra o hay que contar` });
  else if (e === 'sin') out.push({ tipo: 'sin', texto: 'Sin stock' });
  else if (e === 'bajo') out.push({ tipo: 'bajo', texto: `Quedan ${i.stock} (mínimo ${i.stockMinimo})` });
  const m = margen(i);
  if (conCostos && m !== null && m < 0) out.push({ tipo: 'bajoCosto', texto: 'Se vende por debajo del costo' });
  return out;
}

/** Mercadería al costo: lo que vale el stock para el balance. El stock negativo no resta. */
export function valorStock(items: ItemInventario[]) {
  return items.reduce((s, i) => (i.activo === false ? s : s + Math.max(0, i.stock) * (i.costo ?? 0)), 0);
}

/* ------------------------------------------------------------------ *
 * Importación desde planilla
 * ------------------------------------------------------------------ */

export type ProductoImportado = {
  codigo?: string;
  nombre: string;
  categoria?: string;
  marca?: string;
  unidad?: string;
  stock?: number;
  costo?: number;
  precioVenta?: number;
  proveedor?: string;
};

const COLUMNAS: Record<string, keyof ProductoImportado> = {
  codigo: 'codigo',
  cod: 'codigo',
  nombre: 'nombre',
  articulo: 'nombre',
  producto: 'nombre',
  categoria: 'categoria',
  rubro: 'categoria',
  marca: 'marca',
  unidad: 'unidad',
  stock: 'stock',
  cantidad: 'stock',
  costo: 'costo',
  preciocosto: 'costo',
  precioventa: 'precioVenta',
  preciodeventa: 'precioVenta',
  preciodecosto: 'costo',
  venta: 'precioVenta',
  precio: 'precioVenta',
  proveedor: 'proveedor',
};

function normalizar(t: string) {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * Lee un CSV con encabezado (separado por ; o tabulación). Reconoce las
 * columnas por nombre, así sirve una exportación de la planilla sin retocarla.
 */
export function parsearProductos(texto: string): { productos: ProductoImportado[]; errores: string[] } {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { productos: [], errores: ['El archivo está vacío'] };
  const sep = lineas[0].includes('\t') ? '\t' : ';';
  const cabecera = lineas[0].split(sep).map((c) => COLUMNAS[normalizar(c)]);
  if (!cabecera.includes('nombre')) {
    return { productos: [], errores: ['Falta la columna "nombre" (o "artículo") en la primera fila'] };
  }
  const productos: ProductoImportado[] = [];
  const errores: string[] = [];
  lineas.slice(1).forEach((linea, n) => {
    const celdas = linea.split(sep);
    const p: ProductoImportado = { nombre: '' };
    cabecera.forEach((campo, i) => {
      const valor = (celdas[i] ?? '').trim();
      if (!campo || valor === '') return;
      if (campo === 'stock' || campo === 'costo' || campo === 'precioVenta') {
        const x = numero(valor);
        if (Number.isFinite(x)) p[campo] = x;
        else errores.push(`Fila ${n + 2}: "${valor}" no es un número`);
      } else {
        p[campo] = valor.replace(/\s+/g, ' ');
      }
    });
    if (!p.nombre) {
      errores.push(`Fila ${n + 2}: sin nombre, se saltea`);
      return;
    }
    productos.push(p);
  });
  return { productos, errores };
}
