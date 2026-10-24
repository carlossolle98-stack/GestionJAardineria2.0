/** Monedas sugeridas. Se puede cargar cualquier otra con su código. */
export const CATALOGO_MONEDAS: { codigo: string; nombre: string }[] = [
  { codigo: 'USD', nombre: 'Dólar' },
  { codigo: 'EUR', nombre: 'Euro' },
  { codigo: 'BRL', nombre: 'Real' },
  { codigo: 'USDT', nombre: 'USDT (cripto)' },
  { codigo: 'UYU', nombre: 'Peso uruguayo' },
  { codigo: 'CLP', nombre: 'Peso chileno' },
  { codigo: 'GBP', nombre: 'Libra' },
];

export function nombreMoneda(codigo: string) {
  return CATALOGO_MONEDAS.find((m) => m.codigo === codigo)?.nombre ?? codigo;
}

export function formatoCantidad(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}
