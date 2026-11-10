import { describe, expect, it } from 'vitest';
import { CATALOGO_INICIAL, PLANTILLAS_INICIALES, aBajar, controlesPendientes, enUso, itemsDePlantilla, type Herramienta, type Salida } from './carga';

const h = (id: string, nombre: string, cantidad = 1, extra: Partial<Herramienta> = {}): Herramienta => ({
  _id: id, nombre, categoria: 'x', cantidad, controles: [], seSuelePerder: false, activo: true, orden: 0, ...extra,
});

describe('checklist de carga', () => {
  const catalogo = [
    h('mg', 'Motoguadaña', 3),
    h('so', 'Sopladora a batería', 1, { controles: [{ texto: 'Lleva la batería cargada', momento: 'salida' }, { texto: 'Poner la batería a cargar', momento: 'vuelta' }] }),
    h('gu', 'Guantes', 2, { seSuelePerder: true }),
  ];

  it('arma la salida de la plantilla y suma siempre lo que se suele perder', () => {
    const items = itemsDePlantilla({ _id: 'p', nombre: 'Mantenimiento', items: [{ herramientaId: 'mg', cantidad: 5 }, { herramientaId: 'so', cantidad: 1 }] }, catalogo);
    expect(items.map((x) => [x.nombre, x.cantidad])).toEqual([['Motoguadaña', 3], ['Sopladora a batería', 1], ['Guantes', 2]]);
  });

  it('cuenta lo que tiene el otro equipo y lo que quedó en clientes', () => {
    const salida = (id: string, equipo: string, cargados: number, quedo = 0): Salida => ({
      _id: id, fecha: '2026-11-12', equipoId: id, equipoNombre: equipo, plantilla: '', estado: 'abierta', paradas: [], creadaPor: '', cerradaPor: '',
      items: [{ herramientaId: 'mg', nombre: 'Motoguadaña', cantidad: 3, cargados, devueltos: 0, controlesHechos: [],
        quedoEn: quedo ? [{ cliente: 'Pérez', cantidad: quedo, fecha: '2026-11-12', retirado: false, retiradoEn: '' }] : [] }],
    });
    const uso = enUso([salida('a', 'Equipo 1', 1), salida('b', 'Equipo 2', 2, 1)], 'a');
    // Del equipo 2: 1 en la camioneta y 1 en lo de Pérez.
    expect(uso.get('mg')).toEqual({ cantidad: 2, donde: ['Equipo 2', 'en lo de Pérez'] });
  });

  it('al volver baja lo cargado menos lo que quedó, y pide los controles de vuelta', () => {
    const item = { herramientaId: 'so', nombre: 'Sopladora a batería', cantidad: 1, cargados: 1, devueltos: 0, controlesHechos: ['salida:Lleva la batería cargada'], quedoEn: [] };
    expect(aBajar(item)).toBe(1);
    expect(controlesPendientes(item, catalogo[1], 'salida')).toEqual([]);
    expect(controlesPendientes(item, catalogo[1], 'vuelta').map((c) => c.texto)).toEqual(['Poner la batería a cargar']);
  });

  it('las plantillas iniciales sólo nombran herramientas del catálogo', () => {
    const nombres = new Set(CATALOGO_INICIAL.map((x) => x.nombre));
    for (const p of PLANTILLAS_INICIALES) for (const it of p.items) expect(nombres.has(it.nombre)).toBe(true);
  });
});
