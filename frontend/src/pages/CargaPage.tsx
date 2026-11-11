import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { todayISO } from '@/lib/format';
import {
  CATALOGO_INICIAL,
  PLANTILLAS_INICIALES,
  aBajar,
  controlesPendientes,
  enUso,
  itemsDePlantilla,
  sinRetirar,
  type Herramienta,
  type ItemSalida,
  type Plantilla,
  type Salida,
} from '@/lib/carga';
import type { Turno } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useEquipos } from '@/components/Equipos';
import { Modal, ModalAcciones } from '@/components/Modal';
import { Vacio } from '@/components/Estados';

type Paso = 'cargar' | 'cliente' | 'volver';

const fechaCorta = (f: string) => f.split('-').reverse().slice(0, 2).join('/');

/** Botón grande que se toca: muestra cuántos van de cuántos. */
function Ficha({ texto, hechos, total, aviso, onTocar }: { texto: string; hechos: number; total: number; aviso?: string; onTocar: () => void }) {
  const listo = hechos >= total;
  return (
    <button
      type="button"
      onClick={onTocar}
      aria-pressed={listo}
      style={{
        textAlign: 'left',
        padding: '12px 14px',
        minHeight: 64,
        borderRadius: 12,
        border: `2px solid ${listo ? 'var(--verde-vivo)' : 'var(--borde-color, #cfd8cc)'}`,
        background: listo ? 'rgba(46,125,50,0.12)' : 'var(--superficie, #fff)',
        color: 'var(--texto)',
        cursor: 'pointer',
        display: 'grid',
        gap: 2,
        font: 'inherit',
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 15 }}>{listo ? '✓ ' : ''}{texto}</span>
      <span style={{ fontSize: 13, color: 'var(--texto-2)' }}>
        {total > 1 ? `${hechos} de ${total}` : listo ? 'Listo' : 'Tocar'}
      </span>
      {aviso && <span style={{ fontSize: 12, color: 'var(--rojo)', fontWeight: 600 }}>{aviso}</span>}
    </button>
  );
}

const grilla = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 } as const;

export function CargaPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { puede, esAdmin } = useAuth();
  const admin = esAdmin || puede('empleados');
  const hoy = todayISO();

  const { data: catalogo = [], isLoading, error } = useQuery({
    queryKey: ['carga-herramientas'],
    queryFn: () => getJson<Herramienta[]>('/api/carga/herramientas'),
    retry: false,
  });
  const { data: plantillas = [] } = useQuery({
    queryKey: ['carga-plantillas'],
    queryFn: () => getJson<Plantilla[]>('/api/carga/plantillas'),
    retry: false,
  });
  const { data: salidasHoy = [] } = useQuery({
    queryKey: ['carga-salidas', hoy],
    queryFn: () => getJson<Salida[]>(`/api/carga/salidas?fecha=${hoy}`),
    retry: false,
    refetchInterval: 30_000,
  });
  const { data: conPendientes = [] } = useQuery({
    queryKey: ['carga-pendientes'],
    queryFn: () => getJson<Salida[]>('/api/carga/salidas/pendientes'),
    retry: false,
  });
  const { data: equiposTodos = [] } = useEquipos();
  const equipos = equiposTodos.filter((e) => e.activo);

  const [abierta, setAbierta] = useState<string | null>(null);
  const [armando, setArmando] = useState(false);
  const [verCatalogo, setVerCatalogo] = useState(false);

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['carga-salidas'] });
    void qc.invalidateQueries({ queryKey: ['carga-pendientes'] });
  };

  const importar = useMutation({
    mutationFn: () => sendJson('/api/carga/herramientas/importar', 'POST', { herramientas: CATALOGO_INICIAL, plantillas: PLANTILLAS_INICIALES }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['carga-herramientas'] });
      void qc.invalidateQueries({ queryKey: ['carga-plantillas'] });
      toast('Lista cargada: herramientas y plantillas listas', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const retirar = useMutation({
    mutationFn: ({ salida, herramientaId, quedoId }: { salida: Salida; herramientaId: string; quedoId?: string }) =>
      sendJson(`/api/carga/salidas/${salida._id}`, 'PATCH', {
        items: salida.items.map((i) =>
          i.herramientaId !== herramientaId ? i : { ...i, quedoEn: i.quedoEn.map((q) => (q._id === quedoId ? { ...q, retirado: true, retiradoEn: hoy } : q)) }
        ),
      }),
    onSuccess: () => { refrescar(); toast('Marcado como retirado', { tono: 'exito' }); },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  const olvidadas = conPendientes.flatMap((s) =>
    s.items.flatMap((i) => i.quedoEn.filter((q) => !q.retirado).map((q) => ({ salida: s, item: i, q })))
  );
  const salida = salidasHoy.find((s) => s._id === abierta) ?? null;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Carga de la camioneta <small>{fechaCorta(hoy)} · qué sale y qué vuelve</small>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {admin && catalogo.length > 0 && (
            <button type="button" className="btn secundario" onClick={() => setVerCatalogo(true)}>🧰 Herramientas y plantillas</button>
          )}
          {catalogo.length > 0 && <button type="button" className="btn" onClick={() => setArmando(true)}>+ Armar salida</button>}
        </div>
      </div>

      {error && (
        <div className="alerta aviso" role="alert">
          No se pudo leer el checklist: {(error as Error).message}. Si dice que la ruta no existe, falta publicar el servidor.
        </div>
      )}

      {olvidadas.length > 0 && (
        <div className="alerta urgente" style={{ display: 'grid', gap: 8 }}>
          <strong>Quedaron en lo de clientes</strong>
          {olvidadas.map(({ salida: s, item, q }) => (
            <div key={`${s._id}-${item.herramientaId}-${q._id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 180 }}>
                {q.cantidad > 1 ? `${q.cantidad} × ` : ''}{item.nombre} — en lo de <strong>{q.cliente}</strong> desde el {fechaCorta(q.fecha)}
                {s.equipoNombre ? ` (${s.equipoNombre})` : ''}
              </span>
              <button type="button" className="btn sm" onClick={() => retirar.mutate({ salida: s, herramientaId: item.herramientaId, quedoId: q._id })}>
                Ya la retiramos
              </button>
            </div>
          ))}
        </div>
      )}

      {!error && catalogo.length === 0 ? (
        <Vacio
          icono="🧰"
          titulo="Todavía no hay herramientas cargadas"
          texto="Se carga la lista de herramientas y las plantillas de mantenimiento, poda y nivelado. Después se ajusta lo que haga falta."
          accion={admin ? <button type="button" className="btn" onClick={() => importar.mutate()} disabled={importar.isPending}>Cargar la lista inicial</button> : undefined}
        />
      ) : salida ? (
        <VistaSalida
          key={salida._id}
          salida={salida}
          catalogo={catalogo}
          todas={salidasHoy}
          hoy={hoy}
          onVolver={() => setAbierta(null)}
          onCambio={refrescar}
        />
      ) : salidasHoy.length === 0 ? (
        !error && (
          <Vacio
            icono="🚚"
            titulo="Hoy no se armó ninguna salida"
            texto="Cada equipo arma la suya antes de salir: se elige la plantilla y se toca lo que se va cargando."
            accion={<button type="button" className="btn" onClick={() => setArmando(true)}>+ Armar salida</button>}
          />
        )
      ) : (
        <div style={grilla}>
          {salidasHoy.map((s) => {
            const total = s.items.reduce((t, i) => t + i.cantidad, 0);
            const cargados = s.items.reduce((t, i) => t + Math.min(i.cargados, i.cantidad), 0);
            return (
              <button
                key={s._id}
                type="button"
                className="tabla-wrap"
                onClick={() => setAbierta(s._id)}
                style={{ padding: 16, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 4, font: 'inherit', color: 'var(--texto)' }}
              >
                <strong style={{ fontSize: 17 }}>{s.equipoNombre || 'Salida'}</strong>
                <span style={{ fontSize: 14, color: 'var(--texto-2)' }}>{s.plantilla}</span>
                <span style={{ fontSize: 14 }}>
                  {s.estado === 'cerrada' ? '✅ Volvió y se cerró' : `${cargados} de ${total} cargados${s.paradas.length ? ` · ${s.paradas.length} clientes` : ''}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {armando && (
        <ModalArmar
          catalogo={catalogo}
          plantillas={plantillas}
          equipos={equipos}
          hoy={hoy}
          yaArmados={salidasHoy.filter((s) => s.estado === 'abierta').map((s) => s.equipoId)}
          onCerrar={() => setArmando(false)}
          onCreada={(id) => { setArmando(false); refrescar(); setAbierta(id); }}
        />
      )}
      {verCatalogo && <ModalCatalogo catalogo={catalogo} plantillas={plantillas} onCerrar={() => setVerCatalogo(false)} />}
    </>
  );
}

function ModalArmar({
  catalogo, plantillas, equipos, hoy, yaArmados, onCerrar, onCreada,
}: {
  catalogo: Herramienta[];
  plantillas: Plantilla[];
  equipos: { _id: string; nombre: string }[];
  hoy: string;
  yaArmados: string[];
  onCerrar: () => void;
  onCreada: (id: string) => void;
}) {
  const { toast } = useToast();
  const libres = equipos.filter((e) => !yaArmados.includes(e._id));
  const [equipoId, setEquipoId] = useState(libres[0]?._id ?? '');
  const [plantillaId, setPlantillaId] = useState(plantillas[0]?._id ?? '');

  const crear = useMutation({
    mutationFn: () => {
      const p = plantillas.find((x) => x._id === plantillaId) ?? { _id: '', nombre: 'Sin plantilla', items: [] };
      return sendJson<Salida>('/api/carga/salidas', 'POST', {
        fecha: hoy,
        equipoId,
        equipoNombre: equipos.find((e) => e._id === equipoId)?.nombre ?? '',
        plantilla: p.nombre,
        items: itemsDePlantilla(p, catalogo),
      });
    },
    onSuccess: (s) => onCreada(s._id),
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  return (
    <Modal titulo="Armar salida" descripcion="Elegí el equipo y el tipo de trabajo. Después se toca lo que se va cargando." onCerrar={onCerrar}>
      <div style={{ display: 'grid', gap: 16 }}>
        {equipos.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Equipo</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {equipos.map((e) => (
                <button key={e._id} type="button" className={`btn ${equipoId === e._id ? '' : 'secundario'}`} style={{ padding: '12px 16px' }} onClick={() => setEquipoId(e._id)}>
                  {e.nombre}{yaArmados.includes(e._id) ? ' (ya tiene)' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Trabajo</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {plantillas.map((p) => (
              <button key={p._id} type="button" className={`btn ${plantillaId === p._id ? '' : 'secundario'}`} style={{ padding: '12px 16px' }} onClick={() => setPlantillaId(p._id)}>
                {p.nombre}
              </button>
            ))}
          </div>
        </div>
        <ModalAcciones tipo="button" onCancelar={onCerrar} onConfirmar={() => crear.mutate()} textoConfirmar="Empezar a cargar" enviando={crear.isPending} />
      </div>
    </Modal>
  );
}

function VistaSalida({
  salida, catalogo, todas, hoy, onVolver, onCambio,
}: {
  salida: Salida;
  catalogo: Herramienta[];
  todas: Salida[];
  hoy: string;
  onVolver: () => void;
  onCambio: () => void;
}) {
  const { toast } = useToast();
  const { puede } = useAuth();
  const [items, setItems] = useState<ItemSalida[]>(salida.items);
  const [paradas, setParadas] = useState(salida.paradas);
  const [paso, setPaso] = useState<Paso>(salida.estado === 'cerrada' ? 'volver' : salida.paradas.length ? 'cliente' : 'cargar');
  const [cliente, setCliente] = useState('');
  const [subidos, setSubidos] = useState<Record<string, number>>({});
  const [confirmando, setConfirmando] = useState<null | 'cliente' | 'cierre'>(null);
  const [agregar, setAgregar] = useState('');
  const [creando, setCreando] = useState(false);
  const qc = useQueryClient();
  const { esAdmin } = useAuth();
  const puedeCatalogo = esAdmin || puede('empleados');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cerrada = salida.estado === 'cerrada';

  const { data: turnos = [] } = useQuery({
    queryKey: ['turnos', hoy, hoy],
    queryFn: () => getJson<Turno[]>(`/api/turnos?desde=${hoy}&hasta=${hoy}`),
    enabled: puede('agenda'),
  });
  const clientesHoy = useMemo(() => {
    const deEquipo = turnos.filter((t) => !salida.equipoId || !t.equipoId || t.equipoId === salida.equipoId);
    return [...new Set(deEquipo.map((t) => t.cliente))];
  }, [turnos, salida.equipoId]);

  const guardar = useMutation({
    mutationFn: (cuerpo: { items?: ItemSalida[]; paradas?: Salida['paradas']; estado?: Salida['estado'] }) =>
      sendJson<Salida>(`/api/carga/salidas/${salida._id}`, 'PATCH', cuerpo),
    onSuccess: () => onCambio(),
    onError: (e: Error) => toast(`No se guardó: ${e.message}`, { tono: 'error' }),
  });

  // Se guarda solo, un momento después de cada toque.
  function cambiarItems(nuevos: ItemSalida[]) {
    setItems(nuevos);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => guardar.mutate({ items: nuevos }), 700);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const uso = useMemo(() => enUso(todas, salida._id), [todas, salida._id]);
  const herr = (id: string) => catalogo.find((h) => h._id === id);
  const editar = (id: string, f: (i: ItemSalida) => ItemSalida) => cambiarItems(items.map((i) => (i.herramientaId === id ? f(i) : i)));
  const alternarControl = (id: string, clave: string) =>
    editar(id, (i) => ({ ...i, controlesHechos: i.controlesHechos.includes(clave) ? i.controlesHechos.filter((c) => c !== clave) : [...i.controlesHechos, clave] }));

  // Lo que está arriba de la camioneta ahora (cargado menos lo que quedó en clientes).
  const arriba = items.filter((i) => aBajar(i) > 0);
  const faltanSubir = arriba.filter((i) => (subidos[i.herramientaId] ?? 0) < aBajar(i));
  const faltanBajar = items.filter((i) => i.devueltos < aBajar(i));

  async function crearTarea(nombre: string, donde: string) {
    try {
      await sendJson('/api/tareas', 'POST', {
        titulo: `Retirar ${nombre} de lo de ${donde}`,
        tipo: 'operativa',
        prioridad: 'urgente',
        vence: hoy,
        origen: `carga:${salida._id}:${nombre}:${donde}`.slice(0, 120),
      });
    } catch {
      // Sin permiso de tareas: queda igual el aviso en esta pantalla.
    }
  }

  function irseDelCliente() {
    const donde = cliente.trim() || 'Sin nombre';
    const nuevas = [...paradas, { cliente: donde, hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) }];
    const nuevos = items.map((i) => {
      const quedan = aBajar(i) - (subidos[i.herramientaId] ?? 0);
      return quedan > 0 ? { ...i, quedoEn: [...i.quedoEn, { cliente: donde, cantidad: quedan, fecha: hoy, retirado: false, retiradoEn: '' }] } : i;
    });
    for (const i of faltanSubir) void crearTarea(i.nombre, donde);
    setItems(nuevos);
    setParadas(nuevas);
    guardar.mutate({ items: nuevos, paradas: nuevas });
    toast(faltanSubir.length ? `Quedó anotado lo que quedó en lo de ${donde}` : `Todo arriba · salieron de lo de ${donde}`, { tono: faltanSubir.length ? 'neutro' : 'exito' });
    setSubidos({});
    setCliente('');
    setConfirmando(null);
  }

  function cerrar() {
    const nuevos = items.map((i) => {
      const falta = aBajar(i) - i.devueltos;
      return falta > 0 ? { ...i, quedoEn: [...i.quedoEn, { cliente: 'Sin ubicar (no volvió)', cantidad: falta, fecha: hoy, retirado: false, retiradoEn: '' }] } : i;
    });
    for (const i of faltanBajar) void crearTarea(i.nombre, 'algún cliente (no volvió)');
    setItems(nuevos);
    guardar.mutate({ items: nuevos, estado: 'cerrada' });
    toast(faltanBajar.length ? 'Salida cerrada · quedaron cosas sin ubicar' : 'Salida cerrada · volvió todo', { tono: faltanBajar.length ? 'neutro' : 'exito' });
    setConfirmando(null);
    onVolver();
  }

  const disponibles = catalogo.filter((h) => h.activo && !items.some((i) => i.herramientaId === h._id));

  /**
   * Agrega a la salida algo del catálogo o algo nuevo escrito a mano. Lo nuevo se
   * suma también al catálogo (si quien carga puede editarlo), así queda para la próxima.
   */
  async function agregarItem() {
    const nombre = agregar.trim();
    if (!nombre) return;
    const mismo = (n: string) => n.trim().toLowerCase() === nombre.toLowerCase();
    if (items.some((i) => mismo(i.nombre))) {
      toast(`${nombre} ya está en la lista`, { tono: 'neutro' });
      setAgregar('');
      return;
    }
    let h = catalogo.find((x) => mismo(x.nombre));
    if (!h && puedeCatalogo) {
      setCreando(true);
      try {
        h = await sendJson<Herramienta>('/api/carga/herramientas', 'POST', { nombre, cantidad: 1, categoria: 'Herramientas' });
        void qc.invalidateQueries({ queryKey: ['carga-herramientas'] });
      } catch {
        h = undefined;
      } finally {
        setCreando(false);
      }
    }
    // Sin catálogo (o sin permiso para editarlo) va igual a esta salida, sólo por hoy.
    const id = h?._id ?? `libre:${nombre.toLowerCase()}`;
    cambiarItems([...items, { herramientaId: id, nombre: h?.nombre ?? nombre, cantidad: 1, cargados: 1, devueltos: 0, controlesHechos: [], quedoEn: [] }]);
    toast(h && !catalogo.some((x) => x._id === h!._id) ? `${nombre} agregado a la salida y al catálogo` : `${nombre} agregado`, { tono: 'exito' });
    setAgregar('');
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn secundario sm" onClick={onVolver}>← Salidas de hoy</button>
        <strong style={{ fontSize: 18 }}>{salida.equipoNombre || 'Salida'} · {salida.plantilla}</strong>
        {guardar.isPending && <span style={{ fontSize: 12, color: 'var(--texto-2)' }}>Guardando…</span>}
      </div>

      <div role="tablist" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {([['cargar', '1. Cargar'], ['cliente', '2. Irse de un cliente'], ['volver', '3. Volver']] as const).map(([id, texto]) => (
          <button key={id} type="button" role="tab" aria-selected={paso === id} className={`btn ${paso === id ? '' : 'secundario'}`} style={{ padding: '12px 6px' }} onClick={() => setPaso(id)} disabled={cerrada && id !== 'volver'}>
            {texto}
          </button>
        ))}
      </div>

      {paso === 'cargar' && (
        <>
          <p className="form-ayuda" style={{ margin: 0 }}>Tocá cada cosa cuando la subís. Si es más de una, tocá una vez por cada una.</p>
          <div style={grilla}>
            {items.map((i) => {
              const h = herr(i.herramientaId);
              const otros = uso.get(i.herramientaId);
              const total = h?.cantidad ?? i.cantidad;
              const exceso = otros && otros.cantidad + i.cargados > total ? `Ojo: ${otros.cantidad} ${otros.donde.join(', ')}` : undefined;
              return (
                <div key={i.herramientaId} style={{ display: 'grid', gap: 4 }}>
                  <Ficha
                    texto={i.nombre}
                    hechos={i.cargados}
                    total={i.cantidad}
                    aviso={exceso}
                    onTocar={() => editar(i.herramientaId, (x) => ({ ...x, cargados: x.cargados >= x.cantidad ? 0 : x.cargados + 1 }))}
                  />
                  {i.cargados > 0 && controlesPendientes({ ...i, controlesHechos: [] }, h, 'salida').map((c) => {
                    const clave = `salida:${c.texto}`;
                    const ok = i.controlesHechos.includes(clave);
                    return (
                      <button key={clave} type="button" className={`btn sm ${ok ? '' : 'secundario'}`} onClick={() => alternarControl(i.herramientaId, clave)}>
                        {ok ? '✓' : '○'} {c.texto}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <form
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
            onSubmit={(e) => { e.preventDefault(); void agregarItem(); }}
          >
            <input
              className="campo"
              list="carga-disponibles"
              value={agregar}
              onChange={(e) => setAgregar(e.target.value)}
              placeholder="+ Agregar: escribí o elegí una herramienta"
              aria-label="Agregar herramienta"
              style={{ flex: '1 1 240px' }}
            />
            <datalist id="carga-disponibles">
              {disponibles.map((h) => <option key={h._id} value={h.nombre} />)}
            </datalist>
            <button type="submit" className="btn sm" disabled={!agregar.trim() || creando}>
              {creando ? 'Agregando…' : 'Agregar'}
            </button>
          </form>
        </>
      )}

      {paso === 'cliente' && (
        <>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>¿De qué cliente se van?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {clientesHoy.map((c) => (
                <button key={c} type="button" className={`btn ${cliente === c ? '' : 'secundario'}`} style={{ padding: '12px 14px' }} onClick={() => setCliente(c)}>
                  {paradas.some((p) => p.cliente === c) ? '✓ ' : ''}{c}
                </button>
              ))}
              <input className="campo" value={clientesHoy.includes(cliente) ? '' : cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Otro cliente" aria-label="Otro cliente" />
            </div>
          </div>
          {cliente.trim() && (
            <>
              <p className="form-ayuda" style={{ margin: 0 }}>Tocá cada cosa cuando vuelve a la camioneta.</p>
              <div style={grilla}>
                {arriba.map((i) => (
                  <Ficha
                    key={i.herramientaId}
                    texto={i.nombre}
                    hechos={subidos[i.herramientaId] ?? 0}
                    total={aBajar(i)}
                    onTocar={() => setSubidos((s) => {
                      const v = s[i.herramientaId] ?? 0;
                      return { ...s, [i.herramientaId]: v >= aBajar(i) ? 0 : v + 1 };
                    })}
                  />
                ))}
              </div>
              <button
                type="button"
                className="btn"
                style={{ padding: 16, fontSize: 17 }}
                onClick={() => (faltanSubir.length ? setConfirmando('cliente') : irseDelCliente())}
              >
                {faltanSubir.length ? `Nos vamos (faltan ${faltanSubir.length})` : '✓ Está todo, nos vamos'}
              </button>
            </>
          )}
          {paradas.length > 0 && (
            <p className="form-ayuda">Ya salieron de: {paradas.map((p) => `${p.cliente} (${p.hora})`).join(' · ')}</p>
          )}
        </>
      )}

      {paso === 'volver' && (
        <>
          <p className="form-ayuda" style={{ margin: 0 }}>
            {cerrada ? 'Esta salida ya se cerró.' : 'En el depósito: tocá cada cosa cuando la bajás y hacé los controles.'}
          </p>
          <div style={grilla}>
            {items.filter((i) => aBajar(i) > 0 || i.quedoEn.length).map((i) => {
              const h = herr(i.herramientaId);
              const quedo = sinRetirar(i);
              return (
                <div key={i.herramientaId} style={{ display: 'grid', gap: 4 }}>
                  <Ficha
                    texto={i.nombre}
                    hechos={i.devueltos}
                    total={aBajar(i)}
                    aviso={quedo ? `${quedo} quedó en lo de ${i.quedoEn.filter((q) => !q.retirado).map((q) => q.cliente).join(', ')}` : undefined}
                    onTocar={() => !cerrada && editar(i.herramientaId, (x) => ({ ...x, devueltos: x.devueltos >= aBajar(x) ? 0 : x.devueltos + 1 }))}
                  />
                  {i.devueltos > 0 && controlesPendientes({ ...i, controlesHechos: [] }, h, 'vuelta').map((c) => {
                    const clave = `vuelta:${c.texto}`;
                    const ok = i.controlesHechos.includes(clave);
                    return (
                      <button key={clave} type="button" className={`btn sm ${ok ? '' : 'secundario'}`} onClick={() => !cerrada && alternarControl(i.herramientaId, clave)}>
                        {ok ? '✓' : '○'} {c.texto}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {!cerrada && (
            <button type="button" className="btn" style={{ padding: 16, fontSize: 17 }} onClick={() => (faltanBajar.length ? setConfirmando('cierre') : cerrar())}>
              {faltanBajar.length ? `Cerrar la salida (faltan ${faltanBajar.length})` : '✓ Volvió todo, cerrar la salida'}
            </button>
          )}
        </>
      )}

      {confirmando === 'cliente' && (
        <Modal titulo={`¿Quedan en lo de ${cliente}?`} onCerrar={() => setConfirmando(null)} ancho="chico">
          <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
            {faltanSubir.map((i) => <li key={i.herramientaId}>{aBajar(i) - (subidos[i.herramientaId] ?? 0) > 1 ? `${aBajar(i) - (subidos[i.herramientaId] ?? 0)} × ` : ''}{i.nombre}</li>)}
          </ul>
          <p className="form-ayuda">Se anota que quedaron ahí y se crea una tarea para ir a buscarlas.</p>
          <ModalAcciones tipo="button" onCancelar={() => setConfirmando(null)} onConfirmar={irseDelCliente} textoConfirmar="Sí, quedaron" />
        </Modal>
      )}
      {confirmando === 'cierre' && (
        <Modal titulo="Faltan cosas por bajar" onCerrar={() => setConfirmando(null)} ancho="chico">
          <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
            {faltanBajar.map((i) => <li key={i.herramientaId}>{aBajar(i) - i.devueltos > 1 ? `${aBajar(i) - i.devueltos} × ` : ''}{i.nombre}</li>)}
          </ul>
          <p className="form-ayuda">Si cerrás igual, quedan como "sin ubicar" y se crea una tarea para buscarlas.</p>
          <ModalAcciones tipo="button" onCancelar={() => setConfirmando(null)} onConfirmar={cerrar} textoConfirmar="Cerrar igual" />
        </Modal>
      )}
    </div>
  );
}

function ModalCatalogo({ catalogo, plantillas, onCerrar }: { catalogo: Herramienta[]; plantillas: Plantilla[]; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [vista, setVista] = useState<'herramientas' | string>('herramientas');
  const [nuevo, setNuevo] = useState('');
  const [nuevaCant, setNuevaCant] = useState('1');

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['carga-herramientas'] });
    void qc.invalidateQueries({ queryKey: ['carga-plantillas'] });
  };
  const editarH = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: Partial<Herramienta> }) => sendJson(`/api/carga/herramientas/${id}`, 'PATCH', datos),
    onSuccess: refrescar,
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });
  const crearH = useMutation({
    mutationFn: () => sendJson('/api/carga/herramientas', 'POST', { nombre: nuevo.trim(), cantidad: Number(nuevaCant) || 1, categoria: 'Herramientas' }),
    onSuccess: () => { refrescar(); setNuevo(''); setNuevaCant('1'); },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });
  const editarP = useMutation({
    mutationFn: ({ id, items }: { id: string; items: Plantilla['items'] }) => sendJson(`/api/carga/plantillas/${id}`, 'PATCH', { items }),
    onSuccess: refrescar,
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const plantilla = plantillas.find((p) => p._id === vista);
  const enPlantilla = (id: string) => plantilla?.items.find((i) => i.herramientaId === id)?.cantidad ?? 0;
  const ponerEnPlantilla = (id: string, cantidad: number) => {
    if (!plantilla) return;
    const resto = plantilla.items.filter((i) => i.herramientaId !== id);
    editarP.mutate({ id: plantilla._id, items: cantidad > 0 ? [...resto, { herramientaId: id, cantidad }] : resto });
  };

  return (
    <Modal titulo="Herramientas y plantillas" descripcion="Cuántas hay de cada cosa y qué lleva cada tipo de trabajo." onCerrar={onCerrar} ancho="ancho">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" className={`btn sm ${vista === 'herramientas' ? '' : 'secundario'}`} onClick={() => setVista('herramientas')}>Todas las herramientas</button>
        {plantillas.map((p) => (
          <button key={p._id} type="button" className={`btn sm ${vista === p._id ? '' : 'secundario'}`} onClick={() => setVista(p._id)}>{p.nombre}</button>
        ))}
      </div>
      <div className="tabla-scroll" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        <table style={{ fontSize: 14 }}>
          <thead>
            <tr><th>Herramienta</th><th>{plantilla ? `En "${plantilla.nombre}"` : 'Cuántas hay'}</th>{!plantilla && <th />}</tr>
          </thead>
          <tbody>
            {catalogo.map((h) => {
              const n = plantilla ? enPlantilla(h._id) : h.cantidad;
              return (
                <tr key={h._id} style={{ opacity: h.activo ? 1 : 0.5 }}>
                  <td>
                    {h.nombre}
                    <div style={{ fontSize: 11, color: 'var(--texto-2)' }}>
                      {h.categoria}{h.controles.length ? ` · ${h.controles.map((c) => c.texto).join(' / ')}` : ''}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button type="button" className="btn secundario sm" aria-label={`Menos ${h.nombre}`} disabled={plantilla ? n <= 0 : n <= 1}
                        onClick={() => (plantilla ? ponerEnPlantilla(h._id, n - 1) : editarH.mutate({ id: h._id, datos: { cantidad: n - 1 } }))}>−</button>
                      <span style={{ minWidth: 24, textAlign: 'center', fontFamily: 'var(--fuente-mono)' }}>{n}</span>
                      <button type="button" className="btn secundario sm" aria-label={`Más ${h.nombre}`}
                        onClick={() => (plantilla ? ponerEnPlantilla(h._id, Math.min(n + 1, h.cantidad)) : editarH.mutate({ id: h._id, datos: { cantidad: n + 1 } }))}>+</button>
                    </div>
                  </td>
                  {!plantilla && (
                    <td>
                      <button type="button" className="btn secundario sm" onClick={() => editarH.mutate({ id: h._id, datos: { activo: !h.activo } })}>
                        {h.activo ? 'Dar de baja' : 'Reactivar'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!plantilla && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <input className="campo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nueva herramienta" aria-label="Nueva herramienta" />
          <input className="campo" style={{ width: 70 }} type="number" min="1" value={nuevaCant} onChange={(e) => setNuevaCant(e.target.value)} aria-label="Cantidad" />
          <button type="button" className="btn sm" onClick={() => nuevo.trim() && crearH.mutate()} disabled={!nuevo.trim()}>Agregar</button>
        </div>
      )}
    </Modal>
  );
}
