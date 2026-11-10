/**
 * carga.ts — Checklist de lo que se carga y se baja de la camioneta.
 *
 * Cada equipo arma su "salida" del día desde una plantilla (mantenimiento,
 * poda, nivelado). Se toca lo que se carga; al irse de cada cliente se toca lo
 * que vuelve a subir, y lo que falta queda anotado en lo de ese cliente.
 */

export type Control = { texto: string; momento: 'salida' | 'vuelta' };

export type Herramienta = {
  _id: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  controles: Control[];
  seSuelePerder: boolean;
  activo: boolean;
  orden: number;
};

export type Plantilla = { _id: string; nombre: string; items: { herramientaId: string; cantidad: number }[] };

export type QuedoEn = { _id?: string; cliente: string; cantidad: number; fecha: string; retirado: boolean; retiradoEn: string };

export type ItemSalida = {
  herramientaId: string;
  nombre: string;
  cantidad: number;
  cargados: number;
  devueltos: number;
  controlesHechos: string[];
  quedoEn: QuedoEn[];
};

export type Salida = {
  _id: string;
  fecha: string;
  equipoId: string;
  equipoNombre: string;
  plantilla: string;
  estado: 'abierta' | 'cerrada';
  items: ItemSalida[];
  paradas: { cliente: string; hora: string }[];
  creadaPor: string;
  cerradaPor: string;
};

/** Items de una salida nueva a partir de una plantilla. */
export function itemsDePlantilla(p: Plantilla, catalogo: Herramienta[]): ItemSalida[] {
  const out: ItemSalida[] = [];
  for (const i of p.items) {
    const h = catalogo.find((x) => x._id === i.herramientaId && x.activo);
    if (!h) continue;
    out.push({ herramientaId: h._id, nombre: h.nombre, cantidad: Math.min(i.cantidad, h.cantidad), cargados: 0, devueltos: 0, controlesHechos: [], quedoEn: [] });
  }
  // Lo que se suele perder va siempre, aunque la plantilla no lo nombre.
  for (const h of catalogo) {
    if (h.activo && h.seSuelePerder && !out.some((x) => x.herramientaId === h._id)) {
      out.push({ herramientaId: h._id, nombre: h.nombre, cantidad: h.cantidad, cargados: 0, devueltos: 0, controlesHechos: [], quedoEn: [] });
    }
  }
  return out;
}

/** Lo que quedó en lo de un cliente y no se retiró todavía. */
export function sinRetirar(i: ItemSalida) {
  return i.quedoEn.filter((q) => !q.retirado).reduce((t, q) => t + q.cantidad, 0);
}

/** Lo que tiene que volver al depósito: lo cargado menos lo que quedó en clientes. */
export function aBajar(i: ItemSalida) {
  return Math.max(0, i.cargados - i.quedoEn.reduce((t, q) => t + q.cantidad, 0));
}

/**
 * Cuántas unidades de cada herramienta están afuera: en otras salidas abiertas
 * del día o olvidadas en lo de algún cliente. Sirve para avisar cuando dos
 * equipos quieren llevar más de las que hay.
 */
export function enUso(salidas: Salida[], excepto?: string): Map<string, { cantidad: number; donde: string[] }> {
  const m = new Map<string, { cantidad: number; donde: string[] }>();
  const sumar = (id: string, n: number, donde: string) => {
    if (n <= 0) return;
    const v = m.get(id) ?? { cantidad: 0, donde: [] };
    v.cantidad += n;
    if (!v.donde.includes(donde)) v.donde.push(donde);
    m.set(id, v);
  };
  for (const s of salidas) {
    for (const i of s.items) {
      if (s._id !== excepto && s.estado === 'abierta') sumar(i.herramientaId, Math.max(i.cargados, 0) - sinRetirar(i), s.equipoNombre || 'otra salida');
      for (const q of i.quedoEn) if (!q.retirado) sumar(i.herramientaId, q.cantidad, `en lo de ${q.cliente}`);
    }
  }
  return m;
}

/** Controles pendientes de un momento para un item. */
export function controlesPendientes(i: ItemSalida, h: Herramienta | undefined, momento: Control['momento']) {
  return (h?.controles ?? []).filter((c) => c.momento === momento && !i.controlesHechos.includes(`${momento}:${c.texto}`));
}

/* ------------------------------------------------------------------ *
 * Catálogo inicial (la lista de Carlos)
 * ------------------------------------------------------------------ */

const BATERIA: Control[] = [
  { texto: 'Lleva la batería cargada', momento: 'salida' },
  { texto: 'Poner la batería a cargar', momento: 'vuelta' },
];
const REVISAR: Control[] = [{ texto: 'Revisar qué se sacó y que esté todo', momento: 'vuelta' }];

type Inicial = { nombre: string; categoria: string; cantidad?: number; controles?: Control[]; seSuelePerder?: boolean };

export const CATALOGO_INICIAL: Inicial[] = [
  { nombre: 'Motoguadaña Stihl nueva', categoria: 'Máquinas' },
  { nombre: 'Motoguadaña (otras)', categoria: 'Máquinas', cantidad: 2 },
  { nombre: 'Sopladora a batería', categoria: 'Máquinas', controles: BATERIA },
  { nombre: 'Sopladora a explosión Niwa', categoria: 'Máquinas' },
  { nombre: 'Cortadora de césped nueva', categoria: 'Máquinas', controles: [{ texto: 'Con su mochila de recolección', momento: 'salida' }] },
  { nombre: 'Cortadora de césped Petri', categoria: 'Máquinas', controles: [{ texto: 'Con su mochila de recolección', momento: 'salida' }] },
  { nombre: 'Cortadora de césped (tercera)', categoria: 'Máquinas', controles: [{ texto: 'Con su mochila de recolección', momento: 'salida' }] },
  { nombre: 'Cortacerco Echo', categoria: 'Máquinas' },
  { nombre: 'Cortacerco extensible Stihl', categoria: 'Máquinas', controles: BATERIA },
  { nombre: 'Motosierra', categoria: 'Máquinas', cantidad: 2 },
  { nombre: 'Fumigador', categoria: 'Máquinas' },
  { nombre: 'Rastrillo', categoria: 'Herramientas', cantidad: 4 },
  { nombre: 'Rastrillo de acero', categoria: 'Herramientas' },
  { nombre: 'Escobillón', categoria: 'Herramientas', cantidad: 2 },
  { nombre: 'Escobillón de vereda', categoria: 'Herramientas' },
  { nombre: 'Pala Biassoni', categoria: 'Herramientas' },
  { nombre: 'Pala de punta', categoria: 'Herramientas', cantidad: 2 },
  { nombre: 'Pala ancha', categoria: 'Herramientas' },
  { nombre: 'Pico', categoria: 'Herramientas' },
  { nombre: 'Masa', categoria: 'Herramientas' },
  { nombre: 'Carretilla', categoria: 'Herramientas', cantidad: 2 },
  { nombre: 'Escalera', categoria: 'Herramientas' },
  { nombre: 'Extensión de escalera (con sogas de seguro)', categoria: 'Herramientas' },
  { nombre: 'Palita de jardinería', categoria: 'Herramientas', cantidad: 2 },
  { nombre: 'Saca yuyo rojo', categoria: 'Herramientas' },
  { nombre: 'Tijera de poda', categoria: 'Herramientas', cantidad: 2 },
  { nombre: 'Tijera de mano', categoria: 'Herramientas' },
  { nombre: 'Serrucho', categoria: 'Herramientas', cantidad: 2 },
  { nombre: 'Machete', categoria: 'Herramientas' },
  { nombre: 'Cuchilla de cortar', categoria: 'Herramientas' },
  { nombre: 'Alicate', categoria: 'Herramientas' },
  { nombre: 'Bidón 5 L nafta mezcla', categoria: 'Combustible', cantidad: 2 },
  { nombre: 'Bidón 5 L súper', categoria: 'Combustible' },
  { nombre: 'Bidón 10 L súper', categoria: 'Combustible', cantidad: 2 },
  { nombre: 'Aceite de motosierra', categoria: 'Combustible' },
  { nombre: 'Tanza', categoria: 'Insumos' },
  { nombre: 'Bolsas', categoria: 'Insumos' },
  { nombre: 'Lona para residuos', categoria: 'Insumos' },
  { nombre: 'Estacas', categoria: 'Insumos' },
  { nombre: 'Piolín', categoria: 'Insumos' },
  { nombre: 'Manguera de nivel', categoria: 'Insumos' },
  { nombre: 'Rodilleras (par)', categoria: 'Protección', cantidad: 2 },
  { nombre: 'Escaladores', categoria: 'Protección' },
  { nombre: 'Arnés', categoria: 'Protección' },
  { nombre: 'Rollo de soga amarilla', categoria: 'Protección' },
  { nombre: 'Caja blanca de herramientas varias', categoria: 'Cajas y maletines', controles: REVISAR },
  { nombre: 'Caja de herramientas negra', categoria: 'Cajas y maletines', controles: REVISAR },
  { nombre: 'Maletín de primeros auxilios para plantas', categoria: 'Cajas y maletines', controles: REVISAR },
  {
    nombre: 'Maletín de máquinas de podar',
    categoria: 'Cajas y maletines',
    controles: [{ texto: 'Batería cargada', momento: 'salida' }, ...REVISAR, { texto: 'Poner la batería a cargar', momento: 'vuelta' }],
  },
  { nombre: 'Destornillador', categoria: 'Se suelen perder', seSuelePerder: true },
  { nombre: 'T de desarme', categoria: 'Se suelen perder', seSuelePerder: true },
  { nombre: 'Traba de cabezal Stihl', categoria: 'Se suelen perder', seSuelePerder: true },
  { nombre: 'Lima', categoria: 'Se suelen perder', seSuelePerder: true },
  { nombre: 'Pinzas', categoria: 'Se suelen perder', seSuelePerder: true },
  { nombre: 'Guantes de cuero (par)', categoria: 'Se suelen perder', cantidad: 2, seSuelePerder: true },
];

const i = (nombre: string, cantidad = 1) => ({ nombre, cantidad });

export const PLANTILLAS_INICIALES: { nombre: string; items: { nombre: string; cantidad: number }[] }[] = [
  {
    nombre: 'Mantenimiento común',
    items: [
      i('Motoguadaña Stihl nueva'), i('Sopladora a batería'), i('Cortadora de césped nueva'), i('Rastrillo', 2),
      i('Escobillón'), i('Escobillón de vereda'), i('Tijera de poda'), i('Tijera de mano'), i('Alicate'),
      i('Bidón 5 L nafta mezcla'), i('Bidón 10 L súper'), i('Cortacerco Echo'), i('Pala Biassoni'), i('Pala ancha'),
      i('Escalera'), i('Rodilleras (par)', 2), i('Caja blanca de herramientas varias'), i('Palita de jardinería', 2),
      i('Bolsas'), i('Saca yuyo rojo'), i('Serrucho'), i('Machete'), i('Cuchilla de cortar'), i('Tanza'), i('Fumigador'),
      i('Cortacerco extensible Stihl'), i('Maletín de primeros auxilios para plantas'), i('Maletín de máquinas de podar'),
      i('Caja de herramientas negra'),
    ],
  },
  {
    nombre: 'Poda',
    items: [
      i('Escalera'), i('Extensión de escalera (con sogas de seguro)'), i('Cortacerco Echo'), i('Cortacerco extensible Stihl'),
      i('Rastrillo', 2), i('Escobillón', 2), i('Lona para residuos'), i('Bolsas'), i('Bidón 5 L súper'), i('Motosierra'),
      i('Aceite de motosierra'), i('Maletín de máquinas de podar'), i('Tijera de poda', 2), i('Tijera de mano'), i('Serrucho', 2),
      i('Machete'), i('Sopladora a batería'), i('Caja blanca de herramientas varias'), i('Caja de herramientas negra'),
      i('Maletín de primeros auxilios para plantas'), i('Escaladores'), i('Arnés'), i('Rollo de soga amarilla'),
    ],
  },
  {
    nombre: 'Nivelado',
    items: [
      i('Carretilla', 2), i('Pala de punta', 2), i('Pala ancha'), i('Pico'), i('Rastrillo de acero'), i('Estacas'),
      i('Piolín'), i('Manguera de nivel'), i('Rastrillo', 2), i('Escobillón', 2), i('Sopladora a batería'),
      i('Motoguadaña Stihl nueva'), i('Masa'),
    ],
  },
];
