import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { money } from '@/lib/format';
import type { Activo } from '@/types';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import { BarraFiltros, coincideAlguno, Th, useOrden } from '@/components/Tabla';
import { Vacio } from '@/components/Estados';
import { useToast } from '@/context/ToastContext';

const CATEGORIAS = ['Herramienta', 'Vehículo', 'Equipo eléctrico', 'Equipo de riego', 'Maquinaria', 'Otro'];
const ESTADOS_ACTIVO = ['Activo', 'En reparación', 'Dado de baja'];
type ColActivo = 'nombre' | 'categoria' | 'valorCompra' | 'valorLibros' | 'estado';

/** Años transcurridos desde una fecha ISO. */
function aniosDesde(fecha: string): number {
  const ms = Date.now() - new Date(fecha).getTime();
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

/** Valor libro con depreciación lineal. */
function valorLibros(a: Activo): number {
  if (a.vidaUtilAnios <= 0) return a.valorCompra;
  const dep = (a.valorCompra / a.vidaUtilAnios) * aniosDesde(a.fechaCompra);
  return Math.max(0, a.valorCompra - dep);
}

/** Porcentaje depreciado. */
function pctDep(a: Activo): number {
  const vl = valorLibros(a);
  if (a.valorCompra === 0) return 0;
  return Math.round(((a.valorCompra - vl) / a.valorCompra) * 100);
}

function badgeEstado(estado: string) {
  if (estado === 'Dado de baja') return <span className="badge urgente">Dado de baja</span>;
  if (estado === 'En reparación') return <span className="badge pendiente">En reparación</span>;
  return <span className="badge ok">Activo</span>;
}

/** Barra de depreciación visual. */
function BarraDep({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#c0392b' : pct >= 50 ? '#e67e22' : '#2e7d32';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--fondo)', borderRadius: 3, overflow: 'hidden', minWidth: 48 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--texto-2)', minWidth: 28 }}>{pct}%</span>
    </div>
  );
}

export function ActivosPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data = [], isLoading } = useQuery({
    queryKey: ['activos'],
    queryFn: () => getJson<Activo[]>('/api/activos'),
  });

  const [busqueda, setBusqueda] = useState('');
  const [filCat, setFilCat] = useState('todas');
  const [filEstado, setFilEstado] = useState('todos');

  // Alta
  const [showNew, setShowNew] = useState(false);
  const [nNombre, setNNombre] = useState('');
  const [nCat, setNCat] = useState('Herramienta');
  const [nValor, setNValor] = useState('');
  const [nFecha, setNFecha] = useState('');
  const [nVida, setNVida] = useState('5');
  const [nEstado, setNEstado] = useState('Activo');
  const [nNotas, setNNotas] = useState('');

  // Edición
  const [editA, setEditA] = useState<Activo | null>(null);
  const [eNombre, setENombre] = useState('');
  const [eCat, setECat] = useState('');
  const [eValor, setEValor] = useState('');
  const [eFecha, setEFecha] = useState('');
  const [eVida, setEVida] = useState('');
  const [eEstado, setEEstado] = useState('');
  const [eNotas, setENotas] = useState('');

  const [delA, setDelA] = useState<Activo | null>(null);

  const addMut = useMutation({
    mutationFn: () =>
      sendJson<Activo>('/api/activos', 'POST', {
        nombre: nNombre.trim(),
        categoria: nCat,
        valorCompra: Number(nValor),
        fechaCompra: nFecha,
        vidaUtilAnios: Number(nVida),
        estado: nEstado,
        notas: nNotas.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activos'] });
      setNNombre(''); setNValor(''); setNFecha(''); setNNotas('');
      setShowNew(false);
      toast('Activo registrado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const editMut = useMutation({
    mutationFn: () =>
      sendJson<Activo>(`/api/activos/${editA?._id}`, 'PATCH', {
        nombre: eNombre.trim(),
        categoria: eCat,
        valorCompra: Number(eValor),
        fechaCompra: eFecha,
        vidaUtilAnios: Number(eVida),
        estado: eEstado,
        notas: eNotas.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activos'] });
      setEditA(null);
      toast('Activo actualizado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => sendJson(`/api/activos/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activos'] });
      toast('Activo eliminado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const categorias = useMemo(() => [...new Set(data.map((a) => a.categoria))].sort(), [data]);

  const filtrados = useMemo(
    () =>
      data.filter((a) => {
        if (!coincideAlguno([a.nombre, a.categoria, a.notas], busqueda)) return false;
        if (filCat !== 'todas' && a.categoria !== filCat) return false;
        if (filEstado !== 'todos' && a.estado !== filEstado) return false;
        return true;
      }),
    [data, busqueda, filCat, filEstado]
  );

  const valores = useMemo(
    () => ({
      nombre: (a: Activo) => a.nombre,
      categoria: (a: Activo) => a.categoria,
      valorCompra: (a: Activo) => a.valorCompra,
      valorLibros: (a: Activo) => valorLibros(a),
      estado: (a: Activo) => a.estado,
    }),
    []
  );

  const { filas, orden, alternar, setOrden } = useOrden(filtrados, valores, {
    campo: 'categoria' as ColActivo,
    direccion: 'asc',
  });

  const hayFiltros = busqueda !== '' || filCat !== 'todas' || filEstado !== 'todos';

  const activosActivos = data.filter((a) => a.estado !== 'Dado de baja');
  const totalCompra = activosActivos.reduce((s, a) => s + a.valorCompra, 0);
  const totalLibros = activosActivos.reduce((s, a) => s + valorLibros(a), 0);
  const pctDepTotal = totalCompra > 0 ? Math.round(((totalCompra - totalLibros) / totalCompra) * 100) : 0;

  function abrirEdicion(a: Activo) {
    setEditA(a);
    setENombre(a.nombre);
    setECat(a.categoria);
    setEValor(String(a.valorCompra));
    setEFecha(a.fechaCompra);
    setEVida(String(a.vidaUtilAnios));
    setEEstado(a.estado);
    setENotas(a.notas ?? '');
  }

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Activos fijos <small>Herramientas, vehículos y equipos</small>
        </div>
        <button type="button" className="btn" onClick={() => setShowNew(true)}>
          + Nuevo activo
        </button>
      </div>

      {/* Cards resumen */}
      {data.length > 0 && (
        <div className="cards-grid" style={{ marginBottom: 'var(--sp-5)' }}>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="card-label">🏷️ Valor de compra</div>
            <div className="card-valor">{money(totalCompra)}</div>
            <div className="card-sub">{activosActivos.length} activo{activosActivos.length !== 1 ? 's' : ''} en uso</div>
          </div>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="card-label">📊 Valor libro actual</div>
            <div className="card-valor" style={{ color: 'var(--verde-vivo)' }}>{money(Math.round(totalLibros))}</div>
            <div className="card-sub">Depreciación acumulada: {pctDepTotal}%</div>
          </div>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="card-label">💸 Depreciado</div>
            <div className="card-valor" style={{ color: 'var(--rojo)' }}>{money(Math.round(totalCompra - totalLibros))}</div>
            <div className="card-sub">Sobre el valor original</div>
          </div>
        </div>
      )}

      <BarraFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por nombre, categoría o notas…"
        filtros={[
          {
            id: 'act-cat',
            label: 'Categoría',
            valor: filCat,
            opciones: [{ valor: 'todas', label: 'Todas' }, ...categorias.map((c) => ({ valor: c, label: c }))],
            onCambio: setFilCat,
          },
          {
            id: 'act-est',
            label: 'Estado',
            valor: filEstado,
            opciones: [
              { valor: 'todos', label: 'Todos' },
              { valor: 'Activo', label: 'Activo' },
              { valor: 'En reparación', label: 'En reparación' },
              { valor: 'Dado de baja', label: 'Dado de baja' },
            ],
            onCambio: setFilEstado,
          },
        ]}
        resultados={filas.length}
        total={data.length}
        hayFiltros={hayFiltros}
        onLimpiar={() => { setBusqueda(''); setFilCat('todas'); setFilEstado('todos'); }}
        orden={{
          actual: orden.campo,
          columnas: [
            { valor: 'nombre', label: 'Nombre' },
            { valor: 'categoria', label: 'Categoría' },
            { valor: 'valorCompra', label: 'Valor compra' },
            { valor: 'valorLibros', label: 'Valor libro' },
          ],
          direccion: orden.direccion,
          onCampo: (c) => setOrden({ campo: c as ColActivo, direccion: orden.direccion }),
          onDireccion: () =>
            setOrden({ campo: orden.campo, direccion: orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {data.length === 0 ? (
        <Vacio
          icono="🔧"
          titulo="Todavía no registraste activos"
          texto="Cargá las herramientas, vehículos y equipos para llevar el control de su valor y depreciación."
          accion={
            <button type="button" className="btn" onClick={() => setShowNew(true)}>
              + Nuevo activo
            </button>
          }
        />
      ) : filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún activo coincide con los filtros"
          accion={
            <button type="button" className="btn secundario" onClick={() => { setBusqueda(''); setFilCat('todas'); setFilEstado('todos'); }}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <div className="tabla-wrap">
          <div className="tabla-scroll">
            <table className="responsive">
              <thead>
                <tr>
                  <Th campo="nombre" orden={orden} alternar={alternar}>Nombre</Th>
                  <Th campo="categoria" orden={orden} alternar={alternar}>Categoría</Th>
                  <Th campo="valorCompra" orden={orden} alternar={alternar}>Valor compra</Th>
                  <Th campo="valorLibros" orden={orden} alternar={alternar}>Valor libro</Th>
                  <Th>Depreciación</Th>
                  <Th>Estado</Th>
                  <Th>Acción</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((a) => {
                  const vl = valorLibros(a);
                  const pd = pctDep(a);
                  return (
                    <tr key={a._id} style={{ opacity: a.estado === 'Dado de baja' ? 0.5 : 1 }}>
                      <td data-label="Nombre">
                        <div><strong>{a.nombre}</strong></div>
                        {a.notas && <div style={{ fontSize: 11, color: 'var(--texto-2)' }}>{a.notas}</div>}
                      </td>
                      <td data-label="Categoría">
                        <span className="badge info" style={{ fontSize: 11 }}>{a.categoria}</span>
                      </td>
                      <td data-label="Valor compra" style={{ fontFamily: 'DM Mono,monospace' }}>
                        {money(a.valorCompra)}
                        <div style={{ fontSize: 10, color: 'var(--texto-2)' }}>{a.fechaCompra}</div>
                      </td>
                      <td data-label="Valor libro" style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600 }}>
                        {money(Math.round(vl))}
                        <div style={{ fontSize: 10, color: 'var(--texto-2)' }}>vida útil: {a.vidaUtilAnios} años</div>
                      </td>
                      <td data-label="Depreciación" style={{ minWidth: 100 }}>
                        <BarraDep pct={pd} />
                      </td>
                      <td data-label="Estado">{badgeEstado(a.estado)}</td>
                      <td data-label="Acción">
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" className="btn secundario sm" onClick={() => abrirEdicion(a)}>✏️</button>
                          <button
                            type="button"
                            className="btn secundario sm"
                            style={{ color: 'var(--rojo)', border: '1px solid rgba(192,57,43,0.3)' }}
                            onClick={() => setDelA(a)}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: nuevo activo */}
      {showNew && (
        <Modal titulo="Nuevo activo fijo" onCerrar={() => setShowNew(false)}>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!nNombre.trim()) { toast('Ingresá el nombre', { tono: 'error' }); return; }
              if (!nValor || Number(nValor) <= 0) { toast('Ingresá el valor de compra', { tono: 'error' }); return; }
              if (!nFecha) { toast('Ingresá la fecha de compra', { tono: 'error' }); return; }
              addMut.mutate();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="act-nombre">Nombre</label>
                <input id="act-nombre" value={nNombre} onChange={(e) => setNNombre(e.target.value)} placeholder="Ej: Motosierra Stihl MS 250" required />
              </div>
              <div className="form-group">
                <label htmlFor="act-cat">Categoría</label>
                <select id="act-cat" value={nCat} onChange={(e) => setNCat(e.target.value)}>
                  {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="act-valor">Valor de compra</label>
                <input id="act-valor" type="number" inputMode="numeric" min="0" value={nValor} onChange={(e) => setNValor(e.target.value)} placeholder="Ej: 350000" required />
              </div>
              <div className="form-group">
                <label htmlFor="act-fecha">Fecha de compra</label>
                <input id="act-fecha" type="date" value={nFecha} onChange={(e) => setNFecha(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="act-vida">Vida útil estimada (años)</label>
                <input id="act-vida" type="number" inputMode="numeric" min="1" max="50" value={nVida} onChange={(e) => setNVida(e.target.value)} />
                <p className="form-ayuda">Se usa para calcular la depreciación lineal.</p>
              </div>
              <div className="form-group">
                <label htmlFor="act-estado">Estado</label>
                <select id="act-estado" value={nEstado} onChange={(e) => setNEstado(e.target.value)}>
                  {ESTADOS_ACTIVO.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 'var(--sp-3)' }}>
              <label htmlFor="act-notas">Notas</label>
              <input id="act-notas" value={nNotas} onChange={(e) => setNNotas(e.target.value)} placeholder="Ej: comprado en Ferreria López, modelo 2023" />
            </div>
            <ModalAcciones onCancelar={() => setShowNew(false)} textoConfirmar="Registrar activo" enviando={addMut.isPending} />
          </form>
        </Modal>
      )}

      {/* Modal: editar activo */}
      {editA && (
        <Modal titulo="Editar activo" onCerrar={() => setEditA(null)}>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!eNombre.trim()) { toast('El nombre no puede quedar vacío', { tono: 'error' }); return; }
              editMut.mutate();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="eact-nombre">Nombre</label>
                <input id="eact-nombre" value={eNombre} onChange={(e) => setENombre(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="eact-cat">Categoría</label>
                <select id="eact-cat" value={eCat} onChange={(e) => setECat(e.target.value)}>
                  {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="eact-valor">Valor de compra</label>
                <input id="eact-valor" type="number" inputMode="numeric" min="0" value={eValor} onChange={(e) => setEValor(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="eact-fecha">Fecha de compra</label>
                <input id="eact-fecha" type="date" value={eFecha} onChange={(e) => setEFecha(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="eact-vida">Vida útil (años)</label>
                <input id="eact-vida" type="number" inputMode="numeric" min="1" max="50" value={eVida} onChange={(e) => setEVida(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="eact-estado">Estado</label>
                <select id="eact-estado" value={eEstado} onChange={(e) => setEEstado(e.target.value)}>
                  {ESTADOS_ACTIVO.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 'var(--sp-3)' }}>
              <label htmlFor="eact-notas">Notas</label>
              <input id="eact-notas" value={eNotas} onChange={(e) => setENotas(e.target.value)} />
            </div>
            <ModalAcciones onCancelar={() => setEditA(null)} textoConfirmar="Guardar cambios" enviando={editMut.isPending} />
          </form>
        </Modal>
      )}

      {/* Modal: confirmar eliminación */}
      {delA && (
        <ModalConfirmar
          titulo="Eliminar activo"
          peligro
          textoConfirmar="Eliminar"
          mensaje={<>Se elimina <strong>{delA.nombre}</strong>. Esta acción no se puede deshacer.</>}
          onConfirmar={() => { delMut.mutate(delA._id); setDelA(null); }}
          onCerrar={() => setDelA(null)}
        />
      )}
    </>
  );
}
