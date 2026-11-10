/**
 * rendimiento.ts — Horas del equipo contra lo que se "levantó" (el trabajo
 * generado), por semana y por mes.
 *
 * Lo levantado cuenta cada trabajo una sola vez, en la semana en que se hizo:
 * - los cobros de trabajos de esa semana, y
 * - las deudas de clientes cargadas esa semana (trabajo hecho, sin cobrar).
 * No entra el cobro de una deuda ya registrada (ese trabajo se contó cuando se
 * cargó la deuda), ni ventas del vivero, comisiones, mutual o rendimientos,
 * que no son trabajo del equipo. Es información de control, no contable.
 */
import { lunesDe, sumarDias, type Jornada } from '@/lib/jornadas';
import type { J2DeudaCliente, J2Egreso, J2Ingreso } from '@/types';

export type PagoConHoras = { fecha: string; monto: number; horas: number };

function sinTildes(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const NO_ES_TRABAJO = ['venta', 'comision de vivero', 'cobro deuda anterior'];

/** Un ingreso que es trabajo del equipo cobrado en el momento. */
export function esCobroDeTrabajo(i: J2Ingreso, deudas: J2DeudaCliente[]) {
  if (i.anulado || i.egresoId || i.cliente === 'Descuento por mutual') return false;
  const c = sinTildes(i.concepto || '');
  if (NO_ES_TRABAJO.some((p) => c.startsWith(p))) return false;
  // El cobro de una deuda registrada en la app ya se contó cuando se cargó la deuda.
  const deDeuda = deudas.some(
    (d) => d.estado === 'pagado' && d.fechaPago === i.fecha && d.monto === i.monto && d.nombreCliente === i.cliente && d.concepto === i.concepto
  );
  return !deDeuda;
}

/** Una deuda que corresponde a un trabajo (no a una venta a cuenta). */
export function esDeudaDeTrabajo(d: J2DeudaCliente) {
  return !sinTildes(d.concepto || '').startsWith('venta');
}

export type Periodo = {
  /** Lunes de la semana (AAAA-MM-DD) o mes (AAAA-MM). */
  clave: string;
  /** Minutos trabajados por persona (fichaje). */
  minutosPorPersona: Map<string, number>;
  minutos: number;
  /** Horas cobradas a clientes (lo que se carga al registrar el cobro). */
  horasCobradas: number;
  cobrado: number;
  aCobrar: number;
  levantado: number;
  /** Sueldos y aguinaldos registrados en el período. */
  costoPersonal: number;
};

function vacio(clave: string): Periodo {
  return { clave, minutosPorPersona: new Map(), minutos: 0, horasCobradas: 0, cobrado: 0, aCobrar: 0, levantado: 0, costoPersonal: 0 };
}

type Datos = {
  jornadas: Jornada[];
  ingresos: J2Ingreso[];
  deudas: J2DeudaCliente[];
  egresos: J2Egreso[];
  pagosClientes: PagoConHoras[];
};

function agrupar(d: Datos, claveDe: (fecha: string) => string | null, claves: string[]): Periodo[] {
  const por = new Map(claves.map((c) => [c, vacio(c)]));
  const en = (fecha: string) => {
    const c = claveDe(fecha);
    return c ? por.get(c) : undefined;
  };
  for (const j of d.jornadas) {
    const p = en(j.fecha);
    if (!p || j.minutos === null) continue;
    p.minutosPorPersona.set(j.nombre, (p.minutosPorPersona.get(j.nombre) ?? 0) + j.minutos);
    p.minutos += j.minutos;
  }
  for (const i of d.ingresos) {
    const p = en(i.fecha);
    if (p && esCobroDeTrabajo(i, d.deudas)) p.cobrado += i.monto;
  }
  for (const x of d.deudas) {
    const p = en(x.fecha);
    if (p && esDeudaDeTrabajo(x)) p.aCobrar += x.monto;
  }
  for (const e of d.egresos) {
    const p = en(e.fecha);
    if (p && !e.anulado && e.tipo === 'sueldo') p.costoPersonal += e.monto;
  }
  for (const pc of d.pagosClientes) {
    const p = en(pc.fecha);
    if (p && pc.horas > 0) p.horasCobradas += pc.horas;
  }
  for (const p of por.values()) p.levantado = p.cobrado + p.aCobrar;
  return claves.map((c) => por.get(c)!);
}

/** Las últimas `n` semanas hasta la de `hoy`, de la más vieja a la más nueva. */
export function ultimasSemanas(hoy: string, n: number) {
  const actual = lunesDe(hoy);
  return Array.from({ length: n }, (_, i) => sumarDias(actual, -7 * (n - 1 - i)));
}

export function porSemana(d: Datos, semanas: string[]): Periodo[] {
  const set = new Set(semanas);
  return agrupar(d, (f) => (set.has(lunesDe(f)) ? lunesDe(f) : null), semanas);
}

export function porMes(d: Datos, meses: string[]): Periodo[] {
  const set = new Set(meses);
  return agrupar(d, (f) => (set.has(f.slice(0, 7)) ? f.slice(0, 7) : null), meses);
}

/** Lo levantado por cada hora trabajada del equipo. */
export function porHoraHombre(p: Periodo) {
  return p.minutos > 0 ? p.levantado / (p.minutos / 60) : null;
}
