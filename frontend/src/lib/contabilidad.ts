/**
 * contabilidad.ts — Partida doble a partir de lo que ya registra la app.
 *
 * Cada operación (ingreso, egreso, transferencia, crédito, aporte…) se traduce
 * a un asiento con Debe = Haber sobre un plan de cuentas fijo. De los asientos
 * salen el libro diario, el mayor, el balance de sumas y saldos, el estado de
 * resultados y el estado de situación patrimonial.
 *
 * Todo se calcula por fecha, así que un movimiento cargado días después del
 * cierre cae igual en su mes y en su ejercicio: no hay nada que "tomar" el 31.
 *
 * Lo que la app no puede explicar con operaciones va al asiento de apertura:
 * los bienes, el stock y las deudas que ya existían a 3.6.1 "Saldos iniciales";
 * las diferencias de caja e inversiones (saldos con los que se arrancó,
 * correcciones manuales, movimientos perdidos) a 3.6.2, para que se vea cuánto es.
 *
 * Criterio de ingresos: lo percibido (al cobrar). Lo que se trabajó y falta
 * cobrar figura como activo (1.3.1) contra 3.7.1 hasta que se cobra; recién ahí
 * pasa a resultados.
 */
import type { Activo, J2Egreso, J2Ingreso } from '@/types';
import { medioACuenta, mueveCaja, repartir, salidasDe, type J2Datos } from '@/lib/j2reducer';

export type Rubro = 'activo' | 'pasivo' | 'pn' | 'ingreso' | 'gasto';

export type Cuenta = { codigo: string; nombre: string; rubro: Rubro };

export const PLAN: Cuenta[] = [
  { codigo: '1.1.1', nombre: 'Efectivo', rubro: 'activo' },
  { codigo: '1.1.2', nombre: 'Mercado Pago', rubro: 'activo' },
  { codigo: '1.1.3', nombre: 'Banco', rubro: 'activo' },
  { codigo: '1.1.9', nombre: 'Otras cuentas', rubro: 'activo' },
  { codigo: '1.3.1', nombre: 'Clientes: trabajos y ventas a cobrar', rubro: 'activo' },
  { codigo: '1.4.1', nombre: 'Adelantos al personal', rubro: 'activo' },
  { codigo: '1.5.1', nombre: 'Mercadería', rubro: 'activo' },
  { codigo: '1.6.1', nombre: 'Bienes de uso (valor de origen)', rubro: 'activo' },
  { codigo: '1.6.9', nombre: 'Amortizaciones acumuladas', rubro: 'activo' },

  { codigo: '2.2.1', nombre: 'Tarjetas de crédito a pagar', rubro: 'pasivo' },
  { codigo: '2.3.1', nombre: 'Préstamos y deudas financieras', rubro: 'pasivo' },
  { codigo: '2.4.1', nombre: 'Aguinaldos a pagar', rubro: 'pasivo' },

  { codigo: '3.1.1', nombre: 'Capital (aportes)', rubro: 'pn' },
  { codigo: '3.3.1', nombre: 'Retiros de socios', rubro: 'pn' },
  { codigo: '3.4.1', nombre: 'Resultados acumulados', rubro: 'pn' },
  { codigo: '3.6.1', nombre: 'Saldos iniciales (bienes, stock y deudas que ya existían)', rubro: 'pn' },
  { codigo: '3.6.2', nombre: 'Diferencias de caja e inversiones sin justificar', rubro: 'pn' },
  { codigo: '3.7.1', nombre: 'Cobros pendientes (resultado a realizar)', rubro: 'pn' },

  { codigo: '4.1', nombre: 'Servicios de jardinería', rubro: 'ingreso' },
  { codigo: '4.3', nombre: 'Venta de mercadería', rubro: 'ingreso' },
  { codigo: '4.4', nombre: 'Comisiones de viveros', rubro: 'ingreso' },
  { codigo: '4.5', nombre: 'Productos digitales', rubro: 'ingreso' },
  { codigo: '4.7', nombre: 'Rendimientos de inversiones', rubro: 'ingreso' },
  { codigo: '4.8', nombre: 'Diferencia de cambio positiva', rubro: 'ingreso' },
  { codigo: '4.9', nombre: 'Otros ingresos', rubro: 'ingreso' },

  { codigo: '5.1', nombre: 'Costo de mercadería vendida', rubro: 'gasto' },
  { codigo: '5.2', nombre: 'Insumos usados en trabajos', rubro: 'gasto' },
  { codigo: '5.3', nombre: 'Sueldos, jornales y aguinaldos', rubro: 'gasto' },
  { codigo: '5.4', nombre: 'Combustible', rubro: 'gasto' },
  { codigo: '5.5', nombre: 'Mantenimiento de vehículos y máquinas', rubro: 'gasto' },
  { codigo: '5.6', nombre: 'Amortizaciones', rubro: 'gasto' },
  { codigo: '5.7', nombre: 'Alquileres y servicios', rubro: 'gasto' },
  { codigo: '5.8', nombre: 'Software y suscripciones', rubro: 'gasto' },
  { codigo: '5.9', nombre: 'Publicidad y marketing', rubro: 'gasto' },
  { codigo: '5.10', nombre: 'Seguros', rubro: 'gasto' },
  { codigo: '5.11', nombre: 'Monotributo e impuestos', rubro: 'gasto' },
  { codigo: '5.12', nombre: 'Gastos varios', rubro: 'gasto' },
  { codigo: '6.1', nombre: 'Comisiones y gastos bancarios', rubro: 'gasto' },
  { codigo: '6.2', nombre: 'Intereses perdidos', rubro: 'gasto' },
  { codigo: '6.3', nombre: 'Diferencia de cambio negativa', rubro: 'gasto' },
  { codigo: '6.4', nombre: 'Faltantes y mermas de inventario', rubro: 'gasto' },
  { codigo: '6.6', nombre: 'Otros gastos', rubro: 'gasto' },
];

export type Linea = { cuenta: string; debe: number; haber: number };

export type Asiento = {
  id: string;
  fecha: string;
  concepto: string;
  /** De qué registro sale, para poder ir a verlo. */
  origen: string;
  lineas: Linea[];
};

/* ------------------------------------------------------------------ *
 * Cuentas
 * ------------------------------------------------------------------ */

const CAJA: Record<string, string> = { efectivo: '1.1.1', mp: '1.1.2', banco: '1.1.3' };

/** Cuenta contable de una cuenta de la app (caja, inversión o moneda). */
function cuentaDeCaja(id: string, d: J2Datos): string {
  if (CAJA[id]) return CAJA[id];
  if (d.inversiones.items.some((i) => i.id === id)) return `1.2.${id}`;
  if (d.inversiones.monedas.some((m) => m.codigo === id)) return `1.2.ME.${id}`;
  return '1.1.9';
}

/** El plan fijo más una subcuenta por cada inversión y cada moneda extranjera. */
export function planCompleto(d: J2Datos): Map<string, Cuenta> {
  const plan = new Map(PLAN.map((c) => [c.codigo, c]));
  for (const i of d.inversiones.items) {
    plan.set(`1.2.${i.id}`, { codigo: `1.2.${i.id}`, nombre: `Inversión: ${i.nombre}`, rubro: 'activo' });
  }
  for (const m of d.inversiones.monedas) {
    plan.set(`1.2.ME.${m.codigo}`, { codigo: `1.2.ME.${m.codigo}`, nombre: `Moneda extranjera: ${m.nombre}`, rubro: 'activo' });
  }
  return plan;
}

function sinTildes(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** A qué cuenta de ingresos va un cobro, según el tipo elegido al cargarlo. */
export function cuentaDeIngreso(i: Pick<J2Ingreso, 'concepto' | 'cliente' | 'egresoId'>): string {
  if (i.egresoId || i.cliente === 'Descuento por mutual') return '4.9';
  const c = sinTildes(i.concepto || '');
  if (c.startsWith('comision de vivero')) return '4.4';
  if (c.startsWith('venta producto digital')) return '4.5';
  if (c.startsWith('venta vivero') || c.startsWith('venta')) return '4.3';
  return '4.1';
}

const PALABRAS_GASTO: [RegExp, string][] = [
  [/monotributo|afip|arca|ingresos brutos|iibb|obra social|impuesto|tasa municipal|rentas/, '5.11'],
  [/nafta|combustible|gasoil|diesel|gnc|surtidor|ypf|shell|axion/, '5.4'],
  [/service|repuesto|taller|mecanic|cubierta|aceite|mantenimiento|reparacion|afilado/, '5.5'],
  [/alquiler|luz|electricidad|internet|telefono|celular|agua|gas\b|expensas/, '5.7'],
  [/claude|chatgpt|openai|suscrip|software|google|canva|netflix|spotify|app\b|dominio|hosting/, '5.8'],
  [/marketing|publicidad|meta|instagram|facebook|anuncio|folleto|imprenta|carteleria/, '5.9'],
  [/seguro/, '5.10'],
  [/comision|mantenimiento de cuenta|gasto bancario/, '6.1'],
  [/interes/, '6.2'],
];

/** A qué cuenta de gastos va un egreso. */
export function cuentaDeEgreso(e: Pick<J2Egreso, 'tipo' | 'categoria' | 'concepto' | 'origen'>): string {
  if (e.origen?.tipo === 'credito') return '6.2';
  const texto = sinTildes(`${e.categoria} ${e.concepto}`);
  switch (e.tipo) {
    case 'sueldo':
      return '5.3';
    case 'costo_mercaderia':
      if (texto.includes('uso en trabajo')) return '5.2';
      if (texto.includes('merma') || texto.includes('diferencia de inventario') || texto.includes('faltante')) return '6.4';
      return '5.1';
    case 'inventario':
      return '6.4';
    case 'mercaderia':
      // Compras registradas como gasto antes de existir Inventario.
      return '5.1';
    case 'bancario':
      return /interes/.test(texto) ? '6.2' : '6.1';
    default: {
      for (const [re, cuenta] of PALABRAS_GASTO) if (re.test(texto)) return cuenta;
      return e.tipo === 'varios' ? '5.12' : '6.6';
    }
  }
}

/* ------------------------------------------------------------------ *
 * Asientos
 * ------------------------------------------------------------------ */

const redondo = (n: number) => Math.round(n * 100) / 100;

function asiento(id: string, fecha: string, concepto: string, origen: string, lineas: Linea[]): Asiento {
  const limpias = lineas
    .map((l) => ({ ...l, debe: redondo(l.debe), haber: redondo(l.haber) }))
    .filter((l) => l.debe !== 0 || l.haber !== 0)
    // Un importe negativo en el Debe es un Haber (y al revés).
    .map((l) => {
      const neto = l.debe - l.haber;
      return { cuenta: l.cuenta, debe: neto > 0 ? neto : 0, haber: neto < 0 ? -neto : 0 };
    });
  return { id, fecha, concepto, origen, lineas: limpias };
}

const D = (cuenta: string, monto: number): Linea => ({ cuenta, debe: monto, haber: 0 });
const H = (cuenta: string, monto: number): Linea => ({ cuenta, debe: 0, haber: monto });

/** El mismo asiento con Debe y Haber invertidos: así se anula sin borrar. */
function contra(a: Asiento, fecha: string, motivo: string): Asiento {
  return {
    id: `${a.id}~anul`,
    fecha,
    concepto: `Anulación: ${a.concepto}${motivo ? ` (${motivo})` : ''}`,
    origen: a.origen,
    lineas: a.lineas.map((l) => ({ cuenta: l.cuenta, debe: l.haber, haber: l.debe })),
  };
}

function conAnulacion(a: Asiento, anulado?: { fecha: string; motivo: string }): Asiento[] {
  return anulado ? [a, contra(a, anulado.fecha, anulado.motivo)] : [a];
}

function asientosDeIngresos(d: J2Datos): Asiento[] {
  return d.ingresos.flatMap((i) =>
    conAnulacion(
      asiento(`ing:${i.id}`, i.fecha, `${i.concepto || 'Cobro'}${i.cliente ? ` — ${i.cliente}` : ''}`, `ingreso:${i.id}`, [
        D(CAJA[medioACuenta(i.medio)], i.monto),
        H(cuentaDeIngreso(i), i.monto),
      ]),
      i.anulado
    )
  );
}

function asientosDeEgresos(d: J2Datos): Asiento[] {
  return d.egresos.flatMap((e) => {
    const gasto = cuentaDeEgreso(e);
    const lineas: Linea[] = [];
    const o = e.origen;

    if (o?.tipo === 'aguinaldo' && o.descontado > 0) {
      // Lo que ya estaba devengado cancela la deuda; sólo el resto es gasto del mes.
      lineas.push(D('2.4.1', o.descontado), D(gasto, e.monto - o.descontado));
    } else {
      lineas.push(D(gasto, e.monto));
    }

    if (e.moneda) {
      lineas.push(H(`1.2.ME.${e.moneda.codigo}`, e.monto));
    } else if (!mueveCaja(e.tipo)) {
      // Costo de lo vendido, usado o perdido: sale de la mercadería, no de la caja.
      lineas.push(H('1.5.1', e.monto));
    } else {
      const salidas = salidasDe(e);
      for (const s of salidas) lineas.push(H(cuentaDeCaja(s.cuenta, d), s.monto));
      const faltante = e.monto - salidas.reduce((t, s) => t + s.monto, 0);
      if (Math.abs(faltante) > 0.004) {
        // En un sueldo, la parte que no salió de caja es el adelanto ya entregado.
        const esSueldo = o?.tipo === 'sueldo' || o?.tipo === 'liquidacion';
        lineas.push(H(esSueldo ? '1.4.1' : '3.6.2', faltante));
      }
    }
    if (o?.tipo === 'sueldo' && o.devengado > 0) {
      lineas.push(D('5.3', o.devengado), H('2.4.1', o.devengado));
    }
    return conAnulacion(asiento(`eg:${e.id}`, e.fecha, e.concepto || e.categoria, `egreso:${e.id}`, lineas), e.anulado);
  });
}

function asientosDeTransferencias(d: J2Datos): Asiento[] {
  return d.transferencias.map((t) =>
    asiento(`tr:${t.id}`, t.fecha, `Transferencia${t.nota ? ` — ${t.nota}` : ''}`, `transferencia:${t.id}`, [
      D(cuentaDeCaja(t.para, d), t.monto),
      H(cuentaDeCaja(t.de, d), t.monto),
    ])
  );
}

function asientosDeCapital(d: J2Datos): Asiento[] {
  return d.inversiones.capital.flatMap((c) => {
    const caja = cuentaDeCaja(c.cuenta, d);
    const lineas = c.tipo === 'aporte' ? [D(caja, c.monto), H('3.1.1', c.monto)] : [D('3.3.1', c.monto), H(caja, c.monto)];
    const nombre = c.tipo === 'aporte' ? 'Aporte de capital' : 'Retiro de socio';
    return conAnulacion(asiento(`cap:${c.id}`, c.fecha, `${nombre} — ${c.socio}`, `capital:${c.id}`, lineas), c.anulado);
  });
}

function cuentaDeCredito(cr: { tipoCredito?: string }) {
  return cr.tipoCredito === 'tarjeta' ? '2.2.1' : '2.3.1';
}

/**
 * Lo trabajado o vendido sin cobrar: queda como crédito contra 3.7.1 y pasa a
 * resultados recién al cobrarlo (el cobro genera su propio ingreso).
 */
function asientosDeCobrosPendientes(d: J2Datos): Asiento[] {
  return d.deudasClientes.flatMap((dc) => {
    const alta = asiento(`dc:${dc.id}`, dc.fecha, `A cobrar: ${dc.concepto} — ${dc.nombreCliente}`, `deuda:${dc.id}`, [
      D('1.3.1', dc.monto),
      H('3.7.1', dc.monto),
    ]);
    if (dc.estado !== 'pagado') return [alta];
    const fecha = dc.fechaPago || dc.fecha;
    return [
      alta,
      asiento(`dc:${dc.id}~cobro`, fecha, `Cobrado: ${dc.concepto} — ${dc.nombreCliente}`, `deuda:${dc.id}`, [
        D('3.7.1', dc.monto),
        H('1.3.1', dc.monto),
      ]),
    ];
  });
}

function asientosDeCreditos(d: J2Datos): Asiento[] {
  return d.inversiones.creditos.flatMap((cr) => {
    const pasivo = cuentaDeCredito(cr);
    // Un crédito que pagó directo un bien no trajo plata: entra el bien. Una deuda
    // que ya existía al empezar se reconoce contra los saldos iniciales.
    const debe = cr.bien ? '1.6.1' : cr.previo ? '3.6.1' : cuentaDeCaja(cr.cuenta, d);
    const nombre = cr.bien
      ? `${cr.tipoCredito === 'tarjeta' ? 'Compra con tarjeta' : 'Compra financiada'}: ${cr.bien} — ${cr.entidad}`
      : `${cr.previo ? 'Deuda que ya venía' : 'Crédito recibido'} — ${cr.entidad}`;
    const alta = asiento(`cred:${cr.id}`, cr.fecha, nombre, `credito:${cr.id}`, [D(debe, cr.monto), H(pasivo, cr.monto)]);
    const cuotas = cr.pagos.flatMap((p) => {
      if (p.capital <= 0) return [];
      const partes = p.partes?.length ? p.partes : [{ cuenta: p.cuenta as 'mp' | 'banco' | 'efectivo', monto: p.capital + p.interes }];
      return conAnulacion(
        asiento(`cuota:${p.id}`, p.fecha, `Cuota (capital) — ${cr.entidad}`, `credito:${cr.id}`, [
          D(pasivo, p.capital),
          ...repartir(p.capital, partes).map((s) => H(cuentaDeCaja(s.cuenta, d), s.monto)),
        ]),
        p.anulado
      );
    });
    const ajustes = cr.ajustes.map((aj) =>
      asiento(`credaj:${aj.id}`, aj.fecha, `Ajuste de deuda — ${cr.entidad} (${aj.motivo})`, `credito:${cr.id}`, [
        D('3.6.2', aj.diferencia),
        H(pasivo, aj.diferencia),
      ])
    );
    return [...conAnulacion(alta, cr.anulado), ...cuotas, ...ajustes];
  });
}

const MONEDA_EN_CONCEPTO = /(Compra|Venta) [\d.,]+ ([A-Z]{2,6}) a \$/;

/** Operaciones que sólo quedan en el libro de movimientos (no tienen lista propia). */
function asientosDelLibro(d: J2Datos): Asiento[] {
  const out: Asiento[] = [];
  for (const m of d.movlog) {
    const caja = cuentaDeCaja(m.cuenta, d);
    const id = `ml:${m.id}`;
    const origen = `movimiento:${m.id}`;
    const detalle = m.detalle ? ` — ${m.detalle}` : '';
    switch (m.tipo) {
      case 'rendimiento':
        out.push(asiento(id, m.fecha, `${m.concepto}${detalle}`, origen, m.monto >= 0 ? [D(caja, m.monto), H('4.7', m.monto)] : [D('6.6', -m.monto), H(caja, -m.monto)]));
        break;
      case 'compra_activo':
        out.push(asiento(id, m.fecha, `${m.concepto}${detalle}`, origen, [D('1.6.1', -m.monto), H(caja, -m.monto)]));
        break;
      case 'compra_mercaderia':
        out.push(asiento(id, m.fecha, `${m.concepto}${detalle}`, origen, [D('1.5.1', -m.monto), H(caja, -m.monto)]));
        break;
      case 'adelanto':
        out.push(asiento(id, m.fecha, m.concepto, origen, [D('1.4.1', -m.monto), H(caja, -m.monto)]));
        break;
      case 'correccion':
        out.push(asiento(id, m.fecha, `${m.concepto}${detalle}`, origen, [D(caja, m.monto), H('3.6.2', m.monto)]));
        break;
      case 'moneda_compra':
      case 'moneda_venta': {
        const codigo = MONEDA_EN_CONCEPTO.exec(m.concepto)?.[2];
        const me = codigo ? `1.2.ME.${codigo}` : '1.1.9';
        out.push(asiento(id, m.fecha, `${m.concepto}${detalle}`, origen, [D(caja, m.monto), H(me, m.monto)]));
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export type Contexto = {
  /** Valor de la mercadería al costo (Inventario), si se pudo leer. */
  mercaderia?: number;
  /** Bienes de uso (Activos), si se pudieron leer: dan el valor de origen y la amortización. */
  activos?: Pick<Activo, 'nombre' | 'valorCompra' | 'fechaCompra' | 'vidaUtilAnios' | 'estado'>[];
  /** Fecha del corte (por defecto, hoy). */
  hoy?: string;
};

export type Diferencia = { cuenta: string; nombre: string; libros: number; real: number; diferencia: number; contra: '3.6.1' | '3.6.2' };

/**
 * Compara lo que dicen los asientos con los saldos reales de la app y arma el
 * asiento de apertura con la diferencia de cada cuenta.
 */
function apertura(d: J2Datos, asientos: Asiento[], ctx: Contexto, plan: Map<string, Cuenta>) {
  const saldos = saldosPorCuenta(asientos);
  const reales = new Map<string, number>();
  reales.set('1.1.1', d.cuentas.efectivo || 0);
  reales.set('1.1.2', d.cuentas.mp || 0);
  reales.set('1.1.3', d.cuentas.banco || 0);
  for (const i of d.inversiones.items) reales.set(`1.2.${i.id}`, i.saldo || 0);
  for (const m of d.inversiones.monedas) reales.set(`1.2.ME.${m.codigo}`, Math.round(m.cantidad * m.precio));
  reales.set('1.4.1', d.empleados.reduce((s, e) => s + Math.max(0, e.adelanto || 0), 0));
  // En el pasivo el saldo real es lo que se debe: en los libros, Haber menos Debe.
  const vigentes = d.inversiones.creditos.filter((c) => !c.anulado);
  reales.set('2.3.1', -vigentes.filter((c) => cuentaDeCredito(c) === '2.3.1').reduce((s, c) => s + c.saldo, 0));
  reales.set('2.2.1', -vigentes.filter((c) => cuentaDeCredito(c) === '2.2.1').reduce((s, c) => s + c.saldo, 0));
  reales.set('1.3.1', d.deudasClientes.filter((x) => x.estado === 'pendiente').reduce((s, x) => s + x.monto, 0));
  reales.set('2.4.1', -d.empleados.reduce((s, e) => s + Math.max(0, e.aguinaldoDevengado || 0), 0));
  if (ctx.mercaderia !== undefined) reales.set('1.5.1', ctx.mercaderia);
  if (ctx.activos) {
    reales.set('1.6.1', ctx.activos.filter((a) => a.estado !== 'Dado de baja').reduce((s, a) => s + a.valorCompra, 0));
  }

  const diferencias: Diferencia[] = [];
  const lineas: Linea[] = [];
  for (const [cuenta, real] of reales) {
    const libros = saldos.get(cuenta) ?? 0;
    const dif = redondo(real - libros);
    if (Math.abs(dif) < 1) continue;
    // Caja e inversiones sin explicar son una alerta; bienes, stock y deudas viejas, saldos iniciales.
    const contra = cuenta.startsWith('1.1.') || (cuenta.startsWith('1.2.') && !cuenta.startsWith('1.2.ME.')) ? '3.6.2' : '3.6.1';
    diferencias.push({ cuenta, nombre: plan.get(cuenta)?.nombre ?? cuenta, libros, real, diferencia: dif, contra });
    lineas.push(D(cuenta, dif), H(contra, dif));
  }
  const primera = asientos.reduce((min, a) => (a.fecha < min ? a.fecha : min), ctx.hoy ?? '9999-12-31');
  const fecha = primera === '9999-12-31' ? (ctx.hoy ?? '2000-01-01') : `${primera.slice(0, 7)}-01`;
  const asientoApertura = lineas.length
    ? asiento('apertura', fecha, 'Apertura: saldos iniciales y diferencias que la app no puede explicar', 'apertura', lineas)
    : null;
  return { asientoApertura, diferencias };
}

function finDeMes(clave: string) {
  const [y, m] = clave.split('-').map(Number);
  return `${clave}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

function sumarMes(clave: string) {
  const [y, m] = clave.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Amortización lineal, un asiento por mes desde el mes de compra hasta el mes
 * del corte (o hasta que el bien termina su vida útil).
 */
function asientosDeAmortizacion(ctx: Contexto): Asiento[] {
  if (!ctx.activos) return [];
  const corte = (ctx.hoy ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
  const porMes = new Map<string, { monto: number; bienes: string[] }>();
  for (const a of ctx.activos) {
    if (a.estado === 'Dado de baja' || !(a.vidaUtilAnios > 0) || !(a.valorCompra > 0) || !a.fechaCompra) continue;
    const meses = Math.round(a.vidaUtilAnios * 12);
    const cuota = a.valorCompra / meses;
    let mes = a.fechaCompra.slice(0, 7);
    for (let i = 0; i < meses && mes <= corte; i++, mes = sumarMes(mes)) {
      const fila = porMes.get(mes) ?? { monto: 0, bienes: [] };
      fila.monto += cuota;
      fila.bienes.push(a.nombre);
      porMes.set(mes, fila);
    }
  }
  return [...porMes.entries()].map(([mes, f]) =>
    asiento(`amort:${mes}`, finDeMes(mes), `Amortización del mes (${f.bienes.length} bienes)`, 'amortizacion', [
      D('5.6', f.monto),
      H('1.6.9', f.monto),
    ])
  );
}

export type Libros = {
  asientos: Asiento[];
  plan: Map<string, Cuenta>;
  /** Cuentas cuyo saldo real no se explica con las operaciones cargadas. */
  diferencias: Diferencia[];
};

export function generarLibros(d: J2Datos, ctx: Contexto = {}): Libros {
  const plan = planCompleto(d);
  const base = [
    ...asientosDeIngresos(d),
    ...asientosDeEgresos(d),
    ...asientosDeTransferencias(d),
    ...asientosDeCapital(d),
    ...asientosDeCreditos(d),
    ...asientosDeCobrosPendientes(d),
    ...asientosDelLibro(d),
    ...asientosDeAmortizacion(ctx),
  ].filter((a) => a.lineas.length > 0);
  const { asientoApertura, diferencias } = apertura(d, base, ctx, plan);
  const asientos = (asientoApertura ? [asientoApertura, ...base] : base).sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || (a.id === 'apertura' ? -1 : b.id === 'apertura' ? 1 : 0)
  );
  return { asientos, plan, diferencias };
}

/* ------------------------------------------------------------------ *
 * Informes
 * ------------------------------------------------------------------ */

/** Saldo deudor (Debe − Haber) de cada cuenta, hasta una fecha inclusive. */
export function saldosPorCuenta(asientos: Asiento[], hasta?: string, desde?: string): Map<string, number> {
  const s = new Map<string, number>();
  for (const a of asientos) {
    if (hasta && a.fecha > hasta) continue;
    if (desde && a.fecha < desde) continue;
    for (const l of a.lineas) s.set(l.cuenta, redondo((s.get(l.cuenta) ?? 0) + l.debe - l.haber));
  }
  return s;
}

export function cuadra(a: Asiento) {
  const debe = a.lineas.reduce((t, l) => t + l.debe, 0);
  const haber = a.lineas.reduce((t, l) => t + l.haber, 0);
  return Math.abs(debe - haber) < 0.01;
}

export type FilaSumas = { cuenta: Cuenta; debe: number; haber: number; saldo: number };

export function sumasYSaldos(libros: Libros, desde: string, hasta: string): FilaSumas[] {
  const filas = new Map<string, FilaSumas>();
  for (const a of libros.asientos) {
    if (a.fecha < desde || a.fecha > hasta) continue;
    for (const l of a.lineas) {
      const cuenta = libros.plan.get(l.cuenta) ?? { codigo: l.cuenta, nombre: l.cuenta, rubro: 'activo' as Rubro };
      const f = filas.get(l.cuenta) ?? { cuenta, debe: 0, haber: 0, saldo: 0 };
      f.debe = redondo(f.debe + l.debe);
      f.haber = redondo(f.haber + l.haber);
      f.saldo = redondo(f.debe - f.haber);
      filas.set(l.cuenta, f);
    }
  }
  return [...filas.values()].sort((a, b) => compararCodigo(a.cuenta.codigo, b.cuenta.codigo));
}

export function compararCodigo(a: string, b: string) {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    const nx = Number(x);
    const ny = Number(y);
    const c = Number.isFinite(nx) && Number.isFinite(ny) && x !== '' && y !== '' ? nx - ny : x.localeCompare(y);
    if (c !== 0) return c;
  }
  return 0;
}

export type FilaInforme = { codigo: string; nombre: string; importe: number };

export type EstadoResultados = {
  ingresos: FilaInforme[];
  gastos: FilaInforme[];
  totalIngresos: number;
  totalGastos: number;
  resultado: number;
};

export function estadoDeResultados(libros: Libros, desde: string, hasta: string): EstadoResultados {
  const s = saldosPorCuenta(libros.asientos, hasta, desde);
  const ingresos: FilaInforme[] = [];
  const gastos: FilaInforme[] = [];
  for (const [codigo, saldo] of s) {
    const c = libros.plan.get(codigo);
    if (!c || Math.abs(saldo) < 0.5) continue;
    if (c.rubro === 'ingreso') ingresos.push({ codigo, nombre: c.nombre, importe: -saldo });
    if (c.rubro === 'gasto') gastos.push({ codigo, nombre: c.nombre, importe: saldo });
  }
  const orden = (a: FilaInforme, b: FilaInforme) => compararCodigo(a.codigo, b.codigo);
  ingresos.sort(orden);
  gastos.sort(orden);
  const totalIngresos = redondo(ingresos.reduce((t, f) => t + f.importe, 0));
  const totalGastos = redondo(gastos.reduce((t, f) => t + f.importe, 0));
  return { ingresos, gastos, totalIngresos, totalGastos, resultado: redondo(totalIngresos - totalGastos) };
}

export type SituacionPatrimonial = {
  activo: FilaInforme[];
  pasivo: FilaInforme[];
  patrimonio: FilaInforme[];
  totalActivo: number;
  totalPasivo: number;
  totalPatrimonio: number;
  /** Activo − Pasivo − Patrimonio: tiene que dar 0. */
  diferencia: number;
};

/**
 * Situación al cierre de `hasta`. Los resultados de ejercicios anteriores pasan
 * a Resultados acumulados (el ejercicio cierra el 31 de diciembre) y los del
 * año en curso se muestran como Resultado del ejercicio.
 */
export function situacionPatrimonial(libros: Libros, hasta: string): SituacionPatrimonial {
  const inicioEjercicio = `${hasta.slice(0, 4)}-01-01`;
  const s = saldosPorCuenta(libros.asientos, hasta);
  const activo: FilaInforme[] = [];
  const pasivo: FilaInforme[] = [];
  const patrimonio: FilaInforme[] = [];
  let resultadosTotales = 0;
  for (const [codigo, saldo] of s) {
    const c = libros.plan.get(codigo);
    if (!c) continue;
    if (c.rubro === 'ingreso' || c.rubro === 'gasto') {
      resultadosTotales -= saldo;
      continue;
    }
    if (Math.abs(saldo) < 0.5) continue;
    if (c.rubro === 'activo') activo.push({ codigo, nombre: c.nombre, importe: saldo });
    if (c.rubro === 'pasivo') pasivo.push({ codigo, nombre: c.nombre, importe: -saldo });
    if (c.rubro === 'pn') patrimonio.push({ codigo, nombre: c.nombre, importe: -saldo });
  }
  const delEjercicio = estadoDeResultados(libros, inicioEjercicio, hasta).resultado;
  const anteriores = redondo(resultadosTotales - delEjercicio);
  if (Math.abs(anteriores) >= 0.5) {
    const previo = patrimonio.find((f) => f.codigo === '3.4.1');
    if (previo) previo.importe = redondo(previo.importe + anteriores);
    else patrimonio.push({ codigo: '3.4.1', nombre: 'Resultados acumulados', importe: anteriores });
  }
  patrimonio.push({ codigo: '3.5.1', nombre: `Resultado del ejercicio ${hasta.slice(0, 4)}`, importe: delEjercicio });
  const orden = (a: FilaInforme, b: FilaInforme) => compararCodigo(a.codigo, b.codigo);
  activo.sort(orden);
  pasivo.sort(orden);
  patrimonio.sort(orden);
  const totalActivo = redondo(activo.reduce((t, f) => t + f.importe, 0));
  const totalPasivo = redondo(pasivo.reduce((t, f) => t + f.importe, 0));
  const totalPatrimonio = redondo(patrimonio.reduce((t, f) => t + f.importe, 0));
  return {
    activo,
    pasivo,
    patrimonio,
    totalActivo,
    totalPasivo,
    totalPatrimonio,
    diferencia: redondo(totalActivo - totalPasivo - totalPatrimonio),
  };
}

export type MovimientoMayor = { fecha: string; concepto: string; debe: number; haber: number; saldo: number; asientoId: string };

/** Mayor de una cuenta en un período, con el saldo que traía al empezar. */
export function mayor(libros: Libros, cuenta: string, desde: string, hasta: string) {
  let saldo = 0;
  const movimientos: MovimientoMayor[] = [];
  for (const a of libros.asientos) {
    if (a.fecha > hasta) break;
    for (const l of a.lineas) {
      if (l.cuenta !== cuenta) continue;
      saldo = redondo(saldo + l.debe - l.haber);
      if (a.fecha >= desde) movimientos.push({ fecha: a.fecha, concepto: a.concepto, debe: l.debe, haber: l.haber, saldo, asientoId: a.id });
    }
  }
  const saldoInicial = movimientos.length ? redondo(movimientos[0].saldo - movimientos[0].debe + movimientos[0].haber) : saldo;
  return { saldoInicial, movimientos, saldoFinal: saldo };
}
