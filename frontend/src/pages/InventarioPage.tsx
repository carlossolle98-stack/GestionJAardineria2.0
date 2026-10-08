import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { todayISO } from '@/lib/format';
import type { ItemInventario } from '@/types';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import { BarraFiltros, coincideAlguno, Th, useOrden } from '@/components/Tabla';
import { Vacio } from '@/components/Estados';
import { useToast } from '@/context/ToastContext';

const CATEGORIAS = ['Insumos', 'Herramientas', 'Químicos', 'Semillas', 'Protección personal', 'Otro'];
const UNIDADES = ['unidades', 'kg', 'litros', 'bolsas', 'metros', 'pares', 'cajas'];
type Columna = 'nombre' | 'categoria' | 'stock' | 'stockMinimo';

function badgeStock(item: ItemInventario) {
  if (item.stock === 0) return <span className="badge urgente">Sin stock</span>;
  if (item.stockMinimo > 0 && item.stock <= item.stockMinimo)
    return <span className="badge pendiente">Stock bajo</span>;
  return <span className="badge ok">OK</span>;
}

export function InventarioPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data = [], isLoading } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => getJson<ItemInventario[]>('/api/inventario'),
  });

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filCat, setFilCat] = useState('todas');
  const [filEstado, setFilEstado] = useState('todos');

  // Alta
  const [showNew, setShowNew] = useState(false);
  const [nNombre, setNNombre] = useState('');
  const [nCat, setNCat] = useState('Insumos');
  const [nStock, setNStock] = useState('0');
  const [nUnidad, setNUnidad] = useState('unidades');
  const [nMin, setNMin] = useState('0');

  // Edición
  const [editItem, setEditItem] = useState<ItemInventario | null>(null);
  const [eNombre, setENombre] = useState('');
  const [eCat, setECat] = useState('');
  const [eUnidad, setEUnidad] = useState('');
  const [eMin, setEMin] = useState('');

  // Movimiento
  const [movItem, setMovItem] = useState<ItemInventario | null>(null);
  const [movTipo, setMovTipo] = useState<'entrada' | 'salida'>('entrada');
  const [movCantidad, setMovCantidad] = useState('');
  const [movMotivo, setMovMotivo] = useState('');
  const [movFecha, setMovFecha] = useState(todayISO());

  // Historial expandido
  const [openId, setOpenId] = useState<string | null>(null);

  // Confirmar eliminación
  const [delItem, setDelItem] = useState<ItemInventario | null>(null);

  // Mutations
  const addMut = useMutation({
    mutationFn: () =>
      sendJson<ItemInventario>('/api/inventario', 'POST', {
        nombre: nNombre.trim(),
        categoria: nCat,
        stock: Number(nStock),
        unidad: nUnidad,
        stockMinimo: Number(nMin),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario'] });
      setNNombre(''); setNStock('0'); setNMin('0');
      setShowNew(false);
      toast('Ítem agregado al inventario', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const editMut = useMutation({
    mutationFn: () =>
      sendJson<ItemInventario>(`/api/inventario/${editItem?._id}`, 'PATCH', {
        nombre: eNombre.trim(),
        categoria: eCat,
        unidad: eUnidad,
        stockMinimo: Number(eMin),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario'] });
      setEditItem(null);
      toast('Ítem actualizado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => sendJson(`/api/inventario/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario'] });
      toast('Ítem eliminado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const movMut = useMutation({
    mutationFn: () =>
      sendJson<ItemInventario>(`/api/inventario/${movItem?._id}/movimientos`, 'POST', {
        fecha: movFecha,
        tipo: movTipo,
        cantidad: Number(movCantidad),
        motivo: movMotivo.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario'] });
      setMovItem(null);
      setMovCantidad('');
      setMovMotivo('');
      toast(movTipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  // Categorías reales en los datos
  const categorias = useMemo(() => {
    const vistas = new Set(data.map((i) => i.categoria).filter(Boolean));
    return [...vistas].sort((a, b) => a.localeCompare(b, 'es'));
  }, [data]);

  const filtrados = useMemo(
    () =>
      data.filter((i) => {
        if (!coincideAlguno([i.nombre, i.categoria], busqueda)) return false;
        if (filCat !== 'todas' && i.categoria !== filCat) return false;
        if (filEstado === 'bajo' && !(i.stockMinimo > 0 && i.stock <= i.stockMinimo)) return false;
        if (filEstado === 'sin' && i.stock !== 0) return false;
        if (filEstado === 'ok' && (i.stock === 0 || (i.stockMinimo > 0 && i.stock <= i.stockMinimo))) return false;
        return true;
      }),
    [data, busqueda, filCat, filEstado]
  );

  const valores = useMemo(
    () => ({
      nombre: (i: ItemInventario) => i.nombre,
      categoria: (i: ItemInventario) => i.categoria,
      stock: (i: ItemInventario) => i.stock,
      stockMinimo: (i: ItemInventario) => i.stockMinimo,
    }),
    []
  );

  const { filas, orden, alternar, setOrden } = useOrden(filtrados, valores, {
    campo: 'categoria' as Columna,
    direccion: 'asc',
  });

  const hayFiltros = busqueda.trim() !== '' || filCat !== 'todas' || filEstado !== 'todos';
  const bajoStock = data.filter((i) => i.stockMinimo > 0 && i.stock <= i.stockMinimo);

  function abrirMovimiento(item: ItemInventario, tipo: 'entrada' | 'salida') {
    setMovItem(item);
    setMovTipo(tipo);
    setMovCantidad('');
    setMovMotivo('');
    setMovFecha(todayISO());
  }

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Inventario <small>Insumos y herramientas</small>
        </div>
        <button type="button" className="btn" onClick={() => setShowNew(true)}>
          + Nuevo ítem
        </button>
      </div>

      {bajoStock.length > 0 && (
        <div className="alerta urgente">
          <span aria-hidden="true">⚠️</span>
          <span>
            <strong>Stock bajo o agotado:</strong>{' '}
            {bajoStock.map((i) => `${i.nombre} (${i.stock} ${i.unidad})`).join(' · ')}
          </span>
        </div>
      )}

      <BarraFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por nombre o categoría…"
        filtros={[
          {
            id: 'inv-cat',
            label: 'Categoría',
            valor: filCat,
            opciones: [
              { valor: 'todas', label: 'Todas' },
              ...categorias.map((c) => ({ valor: c, label: c })),
            ],
            onCambio: setFilCat,
          },
          {
            id: 'inv-estado',
            label: 'Estado',
            valor: filEstado,
            opciones: [
              { valor: 'todos', label: 'Todos' },
              { valor: 'bajo', label: '⚠️ Stock bajo' },
              { valor: 'sin', label: '🔴 Sin stock' },
              { valor: 'ok', label: '✅ OK' },
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
            { valor: 'stock', label: 'Stock' },
          ],
          direccion: orden.direccion,
          onCampo: (c) => setOrden({ campo: c as Columna, direccion: orden.direccion }),
          onDireccion: () =>
            setOrden({ campo: orden.campo, direccion: orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {data.length === 0 ? (
        <Vacio
          icono="📦"
          titulo="El inventario está vacío"
          texto="Agregá los insumos y herramientas que usás para poder llevar el control de stock."
          accion={
            <button type="button" className="btn" onClick={() => setShowNew(true)}>
              + Nuevo ítem
            </button>
          }
        />
      ) : filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún ítem coincide con los filtros"
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
                  <th style={{ width: 28 }} />
                  <Th campo="nombre" orden={orden} alternar={alternar}>Nombre</Th>
                  <Th campo="categoria" orden={orden} alternar={alternar}>Categoría</Th>
                  <Th campo="stock" orden={orden} alternar={alternar}>Stock</Th>
                  <Th>Estado</Th>
                  <Th>Movimiento</Th>
                  <Th>Acción</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((item) => {
                  const abierto = openId === item._id;
                  return (
                    <Fragment key={item._id}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setOpenId(abierto ? null : item._id)}>
                        <td>{abierto ? '▼' : '▶'}</td>
                        <td data-label="Nombre"><strong>{item.nombre}</strong></td>
                        <td data-label="Categoría">
                          <span className="badge info" style={{ fontSize: 11 }}>{item.categoria}</span>
                        </td>
                        <td data-label="Stock">
                          <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600 }}>
                            {item.stock}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--texto-2)', marginLeft: 4 }}>
                            {item.unidad}
                          </span>
                          {item.stockMinimo > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--texto-2)' }}>
                              mín: {item.stockMinimo}
                            </div>
                          )}
                        </td>
                        <td data-label="Estado">{badgeStock(item)}</td>
                        <td data-label="Movimiento" onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => abrirMovimiento(item, 'entrada')}
                            >
                              ↑ Entrada
                            </button>
                            <button
                              type="button"
                              className="btn secundario sm"
                              onClick={() => abrirMovimiento(item, 'salida')}
                            >
                              ↓ Salida
                            </button>
                          </div>
                        </td>
                        <td data-label="Acción" onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              type="button"
                              className="btn secundario sm"
                              onClick={() => {
                                setEditItem(item);
                                setENombre(item.nombre);
                                setECat(item.categoria);
                                setEUnidad(item.unidad);
                                setEMin(String(item.stockMinimo));
                              }}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn secundario sm"
                              style={{ color: 'var(--rojo)', border: '1px solid rgba(192,57,43,0.3)' }}
                              onClick={() => setDelItem(item)}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                      {abierto && (
                        <tr key={`${item._id}-h`}>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <HistorialMovimientos item={item} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: nuevo ítem */}
      {showNew && (
        <Modal
          titulo="Nuevo ítem de inventario"
          descripcion="Agregá el nombre, categoría y stock inicial."
          onCerrar={() => setShowNew(false)}
        >
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!nNombre.trim()) { toast('Ingresá el nombre', { tono: 'error' }); return; }
              addMut.mutate();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="inv-nombre">Nombre</label>
                <input id="inv-nombre" value={nNombre} onChange={(e) => setNNombre(e.target.value)} placeholder="Ej: Fertilizante NPK" required />
              </div>
              <div className="form-group">
                <label htmlFor="inv-cat">Categoría</label>
                <select id="inv-cat" value={nCat} onChange={(e) => setNCat(e.target.value)}>
                  {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="inv-stock">Stock inicial</label>
                <input id="inv-stock" type="number" inputMode="decimal" min="0" value={nStock} onChange={(e) => setNStock(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="inv-unidad">Unidad</label>
                <select id="inv-unidad" value={nUnidad} onChange={(e) => setNUnidad(e.target.value)}>
                  {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="inv-min">Stock mínimo (alerta)</label>
                <input id="inv-min" type="number" inputMode="decimal" min="0" value={nMin} onChange={(e) => setNMin(e.target.value)} />
                <p className="form-ayuda">Recibís alerta cuando el stock baje de este número. Dejalo en 0 para no alertar.</p>
              </div>
            </div>
            <ModalAcciones onCancelar={() => setShowNew(false)} textoConfirmar="Agregar ítem" enviando={addMut.isPending} />
          </form>
        </Modal>
      )}

      {/* Modal: editar ítem */}
      {editItem && (
        <Modal titulo="Editar ítem" onCerrar={() => setEditItem(null)}>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!eNombre.trim()) { toast('El nombre no puede quedar vacío', { tono: 'error' }); return; }
              editMut.mutate();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="einv-nombre">Nombre</label>
                <input id="einv-nombre" value={eNombre} onChange={(e) => setENombre(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="einv-cat">Categoría</label>
                <select id="einv-cat" value={eCat} onChange={(e) => setECat(e.target.value)}>
                  {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="einv-unidad">Unidad</label>
                <select id="einv-unidad" value={eUnidad} onChange={(e) => setEUnidad(e.target.value)}>
                  {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="einv-min">Stock mínimo</label>
                <input id="einv-min" type="number" inputMode="decimal" min="0" value={eMin} onChange={(e) => setEMin(e.target.value)} />
              </div>
            </div>
            <ModalAcciones onCancelar={() => setEditItem(null)} textoConfirmar="Guardar cambios" enviando={editMut.isPending} />
          </form>
        </Modal>
      )}

      {/* Modal: registrar movimiento */}
      {movItem && (
        <Modal
          titulo={`${movTipo === 'entrada' ? '↑ Entrada' : '↓ Salida'} — ${movItem.nombre}`}
          descripcion={movTipo === 'entrada' ? 'Reposición o compra de stock.' : 'Uso en trabajo o pérdida.'}
          onCerrar={() => setMovItem(null)}
          ancho="chico"
        >
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              const n = Number(movCantidad);
              if (!n || n <= 0) { toast('Ingresá una cantidad válida', { tono: 'error' }); return; }
              movMut.mutate();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="mov-fecha">Fecha</label>
                <input id="mov-fecha" type="date" value={movFecha} onChange={(e) => setMovFecha(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="mov-cant">Cantidad ({movItem.unidad})</label>
                <input id="mov-cant" type="number" inputMode="decimal" min="0.01" step="any" value={movCantidad} onChange={(e) => setMovCantidad(e.target.value)} placeholder="Ej: 5" required />
                <p className="form-ayuda">
                  Stock actual: <strong>{movItem.stock} {movItem.unidad}</strong>
                  {movTipo === 'salida' && Number(movCantidad) > movItem.stock && (
                    <span style={{ color: 'var(--rojo)', marginLeft: 8 }}>⚠️ Supera el stock actual</span>
                  )}
                </p>
              </div>
              <div className="form-group">
                <label htmlFor="mov-motivo">Motivo</label>
                <input id="mov-motivo" value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)} placeholder={movTipo === 'entrada' ? 'Ej: compra en vivero' : 'Ej: trabajo en Av. San Martín'} />
              </div>
            </div>
            <ModalAcciones
              onCancelar={() => setMovItem(null)}
              textoConfirmar={movTipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}
              enviando={movMut.isPending}
            />
          </form>
        </Modal>
      )}

      {/* Modal: confirmar eliminación */}
      {delItem && (
        <ModalConfirmar
          titulo="Eliminar ítem"
          peligro
          textoConfirmar="Eliminar"
          mensaje={
            <>
              Se elimina <strong>{delItem.nombre}</strong> junto con todo su historial de movimientos.
              Esta acción no se puede deshacer.
            </>
          }
          onConfirmar={() => { delMut.mutate(delItem._id); setDelItem(null); }}
          onCerrar={() => setDelItem(null)}
        />
      )}
    </>
  );
}

function HistorialMovimientos({ item }: { item: ItemInventario }) {
  const movs = [...item.movimientos].reverse();
  return (
    <div style={{ padding: 'var(--sp-4)', background: 'var(--fondo)', borderTop: 'var(--borde)' }}>
      <div style={{ fontWeight: 600, marginBottom: 'var(--sp-3)', fontSize: 'var(--txt-sm)' }}>
        Historial de movimientos — {item.nombre}
      </div>
      {movs.length === 0 ? (
        <p style={{ color: 'var(--texto-2)', fontSize: 'var(--txt-sm)' }}>Sin movimientos registrados.</p>
      ) : (
        <table style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--texto-2)' }}>Fecha</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--texto-2)' }}>Tipo</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--texto-2)' }}>Cantidad</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--texto-2)' }}>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => (
              <tr key={m._id} style={{ borderTop: 'var(--borde)' }}>
                <td style={{ padding: '6px 8px' }}>{m.fecha}</td>
                <td style={{ padding: '6px 8px' }}>
                  <span className={`badge ${m.tipo === 'entrada' ? 'ok' : 'pendiente'}`}>
                    {m.tipo === 'entrada' ? '↑ Entrada' : '↓ Salida'}
                  </span>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'DM Mono,monospace' }}>
                  {m.tipo === 'salida' ? '-' : '+'}{m.cantidad} {item.unidad}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--texto-2)' }}>{m.motivo || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
