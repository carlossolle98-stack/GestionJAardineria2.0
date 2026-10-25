import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import {
  CATEGORIAS_INVENTARIO,
  LABEL_MOV,
  UNIDADES,
  alertasProducto,
  estadoStock,
  margen,
  parsearProductos,
  signoMov,
  valorStock,
  type ProductoImportado,
} from '@/lib/inventario';
import type { ItemInventario, J2Cuentas } from '@/types';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import { BarraFiltros, coincideAlguno, Th, useOrden } from '@/components/Tabla';
import { Vacio } from '@/components/Estados';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { useJ2Local } from '@/context/J2LocalContext';

type Columna = 'codigo' | 'nombre' | 'categoria' | 'stock' | 'precio' | 'margen';
type TipoMov = 'compra' | 'venta' | 'uso' | 'merma' | 'ajuste';

const TIPOS_MOV: { tipo: TipoMov; icono: string; ayuda: string }[] = [
  { tipo: 'compra', icono: '🛒', ayuda: 'Entra mercadería. La plata sale de la caja pero no es gasto: pasa a ser stock.' },
  { tipo: 'venta', icono: '💵', ayuda: 'Sale mercadería vendida. Se registra el ingreso y el costo de lo vendido.' },
  { tipo: 'uso', icono: '🌿', ayuda: 'Se usó en un trabajo. Su costo pasa a ser gasto del mes.' },
  { tipo: 'merma', icono: '🥀', ayuda: 'Se rompió, venció o se perdió. Su costo pasa a ser gasto del mes.' },
  { tipo: 'ajuste', icono: '📋', ayuda: 'Contaste el stock real. Si falta mercadería, la diferencia va a gasto.' },
];

const MEDIOS_COBRO = ['Efectivo', 'Mercado Pago', 'Transferencia bancaria', 'A cobrar'];
const CUENTAS_PAGO: { valor: keyof J2Cuentas | 'nada'; label: string }[] = [
  { valor: 'efectivo', label: 'Efectivo' },
  { valor: 'mp', label: 'Mercado Pago' },
  { valor: 'banco', label: 'Banco' },
  { valor: 'nada', label: 'No registrar el pago (ya estaba pagado)' },
];

function badgeEstado(i: ItemInventario) {
  if (i.activo === false) return <span className="badge">De baja</span>;
  switch (estadoStock(i)) {
    case 'negativo': return <span className="badge urgente">Negativo</span>;
    case 'sin': return <span className="badge urgente">Sin stock</span>;
    case 'bajo': return <span className="badge pendiente">Stock bajo</span>;
    case 'pedido': return <span className="badge info">A pedido</span>;
    default: return <span className="badge ok">OK</span>;
  }
}

function cant(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function pct(m: number | null) {
  return m === null ? '—' : `${Math.round(m * 100)} %`;
}

const FICHA_VACIA = {
  nombre: '', codigo: '', marca: '', categoria: 'Fitosanitarios', unidad: 'unidades', stock: '0',
  stockMinimo: '0', costo: '', precioVenta: '', proveedor: '', ubicacion: '', origen: 'propio' as 'propio' | 'pedido',
  temporada: '', cuidados: '', notas: '', activo: true,
};
type Ficha = typeof FICHA_VACIA;

function fichaDe(i: ItemInventario): Ficha {
  return {
    nombre: i.nombre, codigo: i.codigo ?? '', marca: i.marca ?? '', categoria: i.categoria, unidad: i.unidad,
    stock: String(i.stock), stockMinimo: String(i.stockMinimo), costo: i.costo ? String(Math.round(i.costo * 100) / 100) : '',
    precioVenta: i.precioVenta ? String(i.precioVenta) : '', proveedor: i.proveedor ?? '', ubicacion: i.ubicacion ?? '',
    origen: i.origen ?? 'propio', temporada: i.temporada ?? '', cuidados: i.cuidados ?? '', notas: i.notas ?? '',
    activo: i.activo !== false,
  };
}

export function InventarioPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { puede } = useAuth();
  const j2 = useJ2Local();
  // Costos, márgenes y la plata asociada sólo para quien maneja las finanzas.
  const conCostos = puede('finanzas');

  const { data = [], isLoading, error: errorCarga } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => getJson<ItemInventario[]>('/api/inventario'),
  });

  const [busqueda, setBusqueda] = useState('');
  const [filCat, setFilCat] = useState('todas');
  const [filEstado, setFilEstado] = useState('activos');

  // Ficha: alta (null + abierta) o edición
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [fichaItem, setFichaItem] = useState<ItemInventario | null>(null);
  const [ficha, setFicha] = useState<Ficha>(FICHA_VACIA);
  const [editando, setEditando] = useState(false);

  // Movimiento
  const [movItem, setMovItem] = useState<ItemInventario | null>(null);
  const [movTipo, setMovTipo] = useState<TipoMov>('venta');
  const [movFecha, setMovFecha] = useState(todayISO());
  const [movCant, setMovCant] = useState('');
  const [movPrecio, setMovPrecio] = useState('');
  const [movCliente, setMovCliente] = useState('');
  const [movMedio, setMovMedio] = useState('Efectivo');
  const [movCuenta, setMovCuenta] = useState<keyof J2Cuentas | 'nada'>('efectivo');
  const [movMotivo, setMovMotivo] = useState('');

  const [importando, setImportando] = useState(false);
  const [delItem, setDelItem] = useState<ItemInventario | null>(null);

  const refrescar = () => qc.invalidateQueries({ queryKey: ['inventario'] });

  const guardarFicha = useMutation({
    mutationFn: () => {
      const cuerpo: Record<string, unknown> = {
        nombre: ficha.nombre.trim(), codigo: ficha.codigo.trim(), marca: ficha.marca.trim(), categoria: ficha.categoria,
        unidad: ficha.unidad, stockMinimo: Number(ficha.stockMinimo) || 0, precioVenta: Number(ficha.precioVenta) || 0,
        proveedor: ficha.proveedor.trim(), ubicacion: ficha.ubicacion.trim(), origen: ficha.origen,
        temporada: ficha.temporada.trim(), cuidados: ficha.cuidados.trim(), notas: ficha.notas.trim(), activo: ficha.activo,
      };
      if (conCostos) cuerpo.costo = Number(ficha.costo) || 0;
      if (!fichaItem) return sendJson<ItemInventario>('/api/inventario', 'POST', { ...cuerpo, stock: Number(ficha.stock) || 0 });
      return sendJson<ItemInventario>(`/api/inventario/${fichaItem._id}`, 'PATCH', cuerpo);
    },
    onSuccess: (doc) => {
      void refrescar();
      toast(fichaItem ? 'Producto actualizado' : 'Producto agregado', { tono: 'exito' });
      if (fichaItem) { setFichaItem(doc); setEditando(false); } else cerrarFicha();
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => sendJson(`/api/inventario/${id}`, 'DELETE'),
    onSuccess: () => { void refrescar(); toast('Producto eliminado', { tono: 'exito' }); },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const movMut = useMutation({
    mutationFn: () => {
      const item = movItem!;
      return sendJson<ItemInventario>(`/api/inventario/${item._id}/movimientos`, 'POST', {
        fecha: movFecha,
        tipo: movTipo,
        cantidad: movTipo === 'ajuste' ? undefined : Number(movCant),
        nuevoStock: movTipo === 'ajuste' ? Number(movCant) : undefined,
        costoUnitario: movTipo === 'compra' && conCostos ? Number(movPrecio) || 0 : undefined,
        precioUnitario: movTipo === 'venta' ? Number(movPrecio) || 0 : undefined,
        cliente: movCliente.trim(),
        motivo: movMotivo.trim(),
      });
    },
    onSuccess: (doc) => {
      registrarPlata(movItem!, doc);
      void refrescar();
      if (fichaItem?._id === doc._id) setFichaItem(doc);
      toast(`${LABEL_MOV[movTipo]} registrada`, { tono: 'exito' });
      setMovItem(null);
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  /**
   * Lo contable de cada movimiento. Comprar no es gasto (cambia plata por
   * mercadería); el gasto aparece cuando la mercadería sale: costo de lo vendido,
   * de lo usado o de lo que se perdió, al costo promedio vigente.
   */
  function registrarPlata(item: ItemInventario, doc: ItemInventario) {
    if (!conCostos) return;
    const mov = doc.ultimoMovimiento;
    const costoU = mov?.costoUnitario ?? item.costo ?? 0;
    const n = movTipo === 'ajuste' ? -(mov?.cantidad ?? 0) : Number(movCant);
    const detalle = `${cant(n)} ${item.unidad} ${item.nombre}`;
    const costoEgreso = (categoria: string, concepto: string) => {
      const monto = Math.round(n * costoU * 100) / 100;
      if (monto > 0) {
        j2.addEgreso({ fecha: movFecha, tipo: 'costo_mercaderia', categoria, concepto, monto, cuenta: 'efectivo' });
      }
    };

    if (movTipo === 'compra') {
      const monto = Math.round(n * (Number(movPrecio) || 0) * 100) / 100;
      if (movCuenta !== 'nada' && monto > 0) {
        j2.compraMercaderia({ detalle: `${detalle}${movCliente.trim() ? ` — ${movCliente.trim()}` : ''}`, monto, cuenta: movCuenta, fecha: movFecha });
      }
    } else if (movTipo === 'venta') {
      const total = Math.round(n * (Number(movPrecio) || 0) * 100) / 100;
      const cliente = movCliente.trim();
      if (total > 0) {
        if (movMedio === 'A cobrar') {
          j2.addDeudaCliente({ nombreCliente: cliente || 'Cliente vivero', concepto: `Venta vivero — ${detalle}`, monto: total, fecha: movFecha });
        } else {
          j2.addIngreso({ fecha: movFecha, cliente: cliente || 'Venta mostrador', concepto: `Venta vivero — ${detalle}`, monto: total, medio: movMedio });
        }
      }
      costoEgreso('Costo de lo vendido', detalle);
    } else if (movTipo === 'uso') {
      costoEgreso('Uso en trabajo', `${detalle}${movCliente.trim() ? ` — ${movCliente.trim()}` : ''}`);
    } else if (movTipo === 'merma') {
      costoEgreso('Merma', `${detalle}${movMotivo.trim() ? ` — ${movMotivo.trim()}` : ''}`);
    } else if (movTipo === 'ajuste' && n > 0) {
      costoEgreso('Diferencia de inventario', `Faltante por conteo: ${detalle}`);
    }
  }

  const activos = useMemo(() => data.filter((i) => i.activo !== false), [data]);
  const conAlertas = useMemo(
    () => activos.map((i) => ({ i, alertas: alertasProducto(i, conCostos) })).filter((x) => x.alertas.length > 0),
    [activos, conCostos]
  );

  const categorias = useMemo(() => {
    const vistas = new Set([...data.map((i) => i.categoria).filter(Boolean)]);
    return [...vistas].sort((a, b) => a.localeCompare(b, 'es'));
  }, [data]);

  const filtrados = useMemo(
    () =>
      data.filter((i) => {
        if (!coincideAlguno([i.nombre, i.codigo ?? '', i.marca ?? '', i.categoria, i.proveedor ?? ''], busqueda)) return false;
        if (filCat !== 'todas' && i.categoria !== filCat) return false;
        const baja = i.activo === false;
        if (filEstado === 'baja') return baja;
        if (baja) return false;
        if (filEstado === 'alertas') return alertasProducto(i, conCostos).length > 0;
        if (filEstado === 'activos') return true;
        return estadoStock(i) === filEstado;
      }),
    [data, busqueda, filCat, filEstado, conCostos]
  );

  const valores = useMemo(
    () => ({
      codigo: (i: ItemInventario) => i.codigo ?? '',
      nombre: (i: ItemInventario) => i.nombre,
      categoria: (i: ItemInventario) => i.categoria,
      stock: (i: ItemInventario) => i.stock,
      precio: (i: ItemInventario) => i.precioVenta ?? 0,
      margen: (i: ItemInventario) => margen(i) ?? -Infinity,
    }),
    []
  );
  const { filas, orden, alternar, setOrden } = useOrden(filtrados, valores, { campo: 'categoria' as Columna, direccion: 'asc' });

  const hayFiltros = busqueda.trim() !== '' || filCat !== 'todas' || filEstado !== 'activos';
  const limpiar = () => { setBusqueda(''); setFilCat('todas'); setFilEstado('activos'); };

  const totalCosto = valorStock(activos);
  const totalVenta = activos.reduce((s, i) => s + Math.max(0, i.stock) * (i.precioVenta ?? 0), 0);

  function abrirNuevo() {
    setFichaItem(null);
    setFicha(FICHA_VACIA);
    setEditando(true);
    setFichaAbierta(true);
  }
  function abrirFicha(i: ItemInventario) {
    setFichaItem(i);
    setFicha(fichaDe(i));
    setEditando(false);
    setFichaAbierta(true);
  }
  function cerrarFicha() {
    setFichaAbierta(false);
    setFichaItem(null);
  }
  function abrirMov(i: ItemInventario, tipo: TipoMov = 'venta') {
    setMovItem(i);
    elegirTipo(i, tipo);
    setMovFecha(todayISO());
    setMovCliente('');
    setMovMotivo('');
  }
  function elegirTipo(i: ItemInventario, tipo: TipoMov) {
    setMovTipo(tipo);
    setMovCant(tipo === 'ajuste' ? String(i.stock) : '');
    setMovPrecio(
      tipo === 'venta' ? String(i.precioVenta || '') : tipo === 'compra' && i.costo ? String(Math.round(i.costo * 100) / 100) : ''
    );
  }

  const campo = (k: keyof Ficha) => ({
    value: String(ficha[k]),
    onChange: (e: { target: { value: string } }) => setFicha((f) => ({ ...f, [k]: e.target.value })),
  });

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  const nMov = Number(movCant) || 0;
  const precioMov = Number(movPrecio) || 0;
  const costoMov = movItem?.costo ?? 0;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Inventario <small>Productos del vivero e insumos</small>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {conCostos && (
            <button type="button" className="btn secundario" onClick={() => setImportando(true)}>
              ⬆ Importar planilla
            </button>
          )}
          <button type="button" className="btn" onClick={abrirNuevo}>+ Nuevo producto</button>
        </div>
      </div>

      {errorCarga && (
        <div className="alerta urgente" role="alert">No se pudo cargar el inventario: {errorCarga.message}</div>
      )}

      {activos.length > 0 && (
        <div className="cards-grid">
          <div className="card">
            <div className="card-label">Productos activos</div>
            <div className="card-valor">{activos.length}</div>
            <div className="card-sub">{categorias.length} categorías</div>
          </div>
          {conCostos && (
            <>
              <div className="card azul">
                <div className="card-label">Mercadería al costo</div>
                <div className="card-valor">{money(Math.round(totalCosto))}</div>
                <div className="card-sub">Lo que vale el stock en el balance</div>
              </div>
              <div className="card amarillo">
                <div className="card-label">A precio de venta</div>
                <div className="card-valor">{money(Math.round(totalVenta))}</div>
                <div className="card-sub">Ganancia posible {money(Math.round(totalVenta - totalCosto))}</div>
              </div>
            </>
          )}
          <div className={`card ${conAlertas.length ? 'rojo' : ''}`}>
            <div className="card-label">Con alertas</div>
            <div className="card-valor">{conAlertas.length}</div>
            <div className="card-sub">
              {conAlertas.length ? (
                <button type="button" className="btn secundario sm" onClick={() => setFilEstado('alertas')}>Ver cuáles</button>
              ) : 'Todo en orden'}
            </div>
          </div>
        </div>
      )}

      {conAlertas.length > 0 && filEstado !== 'alertas' && (
        <div className="alerta aviso">
          <span aria-hidden="true">⚠️</span>
          <span>
            <strong>Para revisar:</strong>{' '}
            {conAlertas.slice(0, 6).map((x) => `${x.i.nombre} (${x.alertas[0].texto.toLowerCase()})`).join(' · ')}
            {conAlertas.length > 6 && ` · y ${conAlertas.length - 6} más`}
          </span>
        </div>
      )}

      <BarraFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por nombre, código, marca o proveedor…"
        filtros={[
          {
            id: 'inv-cat',
            label: 'Categoría',
            valor: filCat,
            opciones: [{ valor: 'todas', label: 'Todas' }, ...categorias.map((c) => ({ valor: c, label: c }))],
            onCambio: setFilCat,
          },
          {
            id: 'inv-estado',
            label: 'Estado',
            valor: filEstado,
            opciones: [
              { valor: 'activos', label: 'Todos los activos' },
              { valor: 'alertas', label: '⚠️ Con alertas' },
              { valor: 'negativo', label: '❗ Stock negativo' },
              { valor: 'sin', label: '🔴 Sin stock' },
              { valor: 'bajo', label: '🟡 Stock bajo' },
              { valor: 'ok', label: '✅ OK' },
              { valor: 'pedido', label: '📞 A pedido' },
              { valor: 'baja', label: 'Dados de baja' },
            ],
            onCambio: setFilEstado,
          },
        ]}
        resultados={filas.length}
        total={data.length}
        hayFiltros={hayFiltros}
        onLimpiar={limpiar}
        orden={{
          actual: orden.campo,
          columnas: [
            { valor: 'nombre', label: 'Nombre' },
            { valor: 'codigo', label: 'Código' },
            { valor: 'categoria', label: 'Categoría' },
            { valor: 'stock', label: 'Stock' },
            ...(conCostos ? [{ valor: 'margen', label: 'Margen' }] : []),
          ],
          direccion: orden.direccion,
          onCampo: (c) => setOrden({ campo: c as Columna, direccion: orden.direccion }),
          onDireccion: () => setOrden({ campo: orden.campo, direccion: orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {data.length === 0 ? (
        <Vacio
          icono="🪴"
          titulo="Todavía no hay productos"
          texto="Cargá los productos del vivero y los insumos que usás, o importalos desde la planilla."
          accion={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {conCostos && <button type="button" className="btn secundario" onClick={() => setImportando(true)}>⬆ Importar planilla</button>}
              <button type="button" className="btn" onClick={abrirNuevo}>+ Nuevo producto</button>
            </div>
          }
        />
      ) : filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún producto coincide con los filtros"
          accion={<button type="button" className="btn secundario" onClick={limpiar}>Limpiar filtros</button>}
        />
      ) : (
        <div className="tabla-wrap">
          <div className="tabla-scroll">
            <table className="responsive">
              <thead>
                <tr>
                  <Th campo="codigo" orden={orden} alternar={alternar}>Código</Th>
                  <Th campo="nombre" orden={orden} alternar={alternar}>Producto</Th>
                  <Th campo="categoria" orden={orden} alternar={alternar}>Categoría</Th>
                  <Th campo="stock" orden={orden} alternar={alternar}>Stock</Th>
                  <Th campo="precio" orden={orden} alternar={alternar}>Precio</Th>
                  {conCostos && <Th>Costo</Th>}
                  {conCostos && <Th campo="margen" orden={orden} alternar={alternar}>Margen</Th>}
                  <Th>Estado</Th>
                  <Th>Acción</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((item) => {
                  const m = margen(item);
                  return (
                    <tr key={item._id} style={{ cursor: 'pointer' }} onClick={() => abrirFicha(item)}>
                      <td data-label="Código" style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12, color: 'var(--texto-2)' }}>
                        {item.codigo || '—'}
                      </td>
                      <td data-label="Producto">
                        <strong>{item.nombre}</strong>
                        {item.marca && <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>{item.marca}</div>}
                      </td>
                      <td data-label="Categoría"><span className="badge info" style={{ fontSize: 11 }}>{item.categoria}</span></td>
                      <td data-label="Stock">
                        <span style={{ fontFamily: 'var(--fuente-mono)', fontWeight: 600, color: item.stock < 0 ? 'var(--rojo)' : undefined }}>
                          {cant(item.stock)}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--texto-2)', marginLeft: 4 }}>{item.unidad}</span>
                        {item.stockMinimo > 0 && <div style={{ fontSize: 10, color: 'var(--texto-2)' }}>mín: {item.stockMinimo}</div>}
                      </td>
                      <td data-label="Precio" style={{ fontFamily: 'var(--fuente-mono)' }}>
                        {item.precioVenta ? money(item.precioVenta) : '—'}
                      </td>
                      {conCostos && (
                        <td data-label="Costo" style={{ fontFamily: 'var(--fuente-mono)', color: 'var(--texto-2)' }}>
                          {item.costo ? money(Math.round(item.costo)) : '—'}
                        </td>
                      )}
                      {conCostos && (
                        <td data-label="Margen" style={{ fontFamily: 'var(--fuente-mono)', color: m !== null && m < 0 ? 'var(--rojo)' : undefined }}>
                          {pct(m)}
                        </td>
                      )}
                      <td data-label="Estado">{badgeEstado(item)}</td>
                      <td data-label="Acción" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" className="btn sm" onClick={() => abrirMov(item, 'venta')}>Mover</button>
                          <button type="button" className="btn secundario sm" onClick={() => abrirFicha(item)}>Ficha</button>
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

      {/* Ficha del producto: ver, editar o dar de alta */}
      {fichaAbierta && (
        <Modal
          titulo={fichaItem ? `${fichaItem.codigo ? `${fichaItem.codigo} · ` : ''}${fichaItem.nombre}` : 'Nuevo producto'}
          descripcion={fichaItem ? undefined : 'Los datos de venta y cuidados ayudan a cualquiera del equipo a atender.'}
          onCerrar={cerrarFicha}
          ancho="ancho"
        >
          {fichaItem && !editando ? (
            <FichaVista
              item={fichaItem}
              conCostos={conCostos}
              onEditar={() => setEditando(true)}
              onMover={() => abrirMov(fichaItem, 'venta')}
              onEliminar={conCostos ? () => setDelItem(fichaItem) : undefined}
            />
          ) : (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!ficha.nombre.trim()) { toast('Ingresá el nombre', { tono: 'error' }); return; }
                guardarFicha.mutate();
              }}
            >
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="inv-nombre">Nombre</label>
                  <input id="inv-nombre" {...campo('nombre')} placeholder="Ej: Fertilizante triple 15 500 g" required />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-marca">Marca</label>
                  <input id="inv-marca" {...campo('marca')} placeholder="Ej: Glacoxan" />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-codigo">Código</label>
                  <input id="inv-codigo" {...campo('codigo')} placeholder="Se arma solo si lo dejás vacío" />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-cat">Categoría</label>
                  <select id="inv-cat" {...campo('categoria')}>
                    {[...new Set([...CATEGORIAS_INVENTARIO, ficha.categoria])].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="inv-unidad">Unidad</label>
                  <select id="inv-unidad" {...campo('unidad')}>
                    {[...new Set([...UNIDADES, ficha.unidad])].map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
                {!fichaItem && (
                  <div className="form-group">
                    <label htmlFor="inv-stock">Stock actual</label>
                    <input id="inv-stock" type="number" inputMode="decimal" step="any" {...campo('stock')} />
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="inv-min">Stock mínimo (alerta)</label>
                  <input id="inv-min" type="number" inputMode="decimal" min="0" step="any" {...campo('stockMinimo')} />
                  <p className="form-ayuda">Avisa cuando queden esta cantidad o menos. 0 para no avisar.</p>
                </div>
                <div className="form-group">
                  <label htmlFor="inv-precio">Precio de venta</label>
                  <input id="inv-precio" type="number" inputMode="decimal" min="0" step="any" {...campo('precioVenta')} placeholder="$" />
                </div>
                {conCostos && (
                  <div className="form-group">
                    <label htmlFor="inv-costo">Costo por unidad</label>
                    <input id="inv-costo" type="number" inputMode="decimal" min="0" step="any" {...campo('costo')} placeholder="$" />
                    <p className="form-ayuda">
                      {fichaItem ? 'Es el costo promedio: se recalcula solo con cada compra.' : 'Lo que te costó cada unidad.'}
                      {margen({ costo: Number(ficha.costo), precioVenta: Number(ficha.precioVenta) }) !== null &&
                        ` Margen: ${pct(margen({ costo: Number(ficha.costo), precioVenta: Number(ficha.precioVenta) }))}.`}
                    </p>
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="inv-origen">¿Cómo se consigue?</label>
                  <select id="inv-origen" {...campo('origen')}>
                    <option value="propio">Lo tengo en stock</option>
                    <option value="pedido">Lo encargo cuando lo piden</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="inv-prov">Proveedor</label>
                  <input id="inv-prov" {...campo('proveedor')} placeholder="Ej: Vivero El Sol" />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-ubic">Dónde está</label>
                  <input id="inv-ubic" {...campo('ubicacion')} placeholder="Ej: estante 2, galpón" />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-temp">Temporada</label>
                  <input id="inv-temp" {...campo('temporada')} placeholder="Ej: primavera, todo el año" />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 'var(--sp-3)' }}>
                <label htmlFor="inv-cuidados">Uso y cuidados</label>
                <textarea id="inv-cuidados" rows={3} {...campo('cuidados')} placeholder="Cómo se usa, dosis, para qué plantas sirve, precauciones…" />
              </div>
              <div className="form-group" style={{ marginTop: 'var(--sp-3)' }}>
                <label htmlFor="inv-notas">Notas</label>
                <textarea id="inv-notas" rows={2} {...campo('notas')} />
              </div>
              {fichaItem && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'var(--sp-3)', fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!ficha.activo} onChange={(e) => setFicha((f) => ({ ...f, activo: !e.target.checked }))} />
                  Dar de baja (no se vende más; queda el historial)
                </label>
              )}
              <ModalAcciones
                onCancelar={fichaItem ? () => { setFicha(fichaDe(fichaItem)); setEditando(false); } : cerrarFicha}
                textoConfirmar={fichaItem ? 'Guardar cambios' : 'Agregar producto'}
                enviando={guardarFicha.isPending}
              />
            </form>
          )}
        </Modal>
      )}

      {/* Movimiento de stock */}
      {movItem && (
        <Modal
          titulo={`Mover stock — ${movItem.nombre}`}
          descripcion={`Hay ${cant(movItem.stock)} ${movItem.unidad}.`}
          onCerrar={() => setMovItem(null)}
        >
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (movTipo === 'ajuste' ? movCant.trim() === '' || !Number.isFinite(nMov) : !(nMov > 0)) {
                toast('Ingresá una cantidad válida', { tono: 'error' });
                return;
              }
              movMut.mutate();
            }}
          >
            <div role="radiogroup" aria-label="Tipo de movimiento" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
              {TIPOS_MOV.map((t) => (
                <button
                  key={t.tipo}
                  type="button"
                  role="radio"
                  aria-checked={movTipo === t.tipo}
                  className={`btn sm ${movTipo === t.tipo ? '' : 'secundario'}`}
                  onClick={() => elegirTipo(movItem, t.tipo)}
                >
                  {t.icono} {LABEL_MOV[t.tipo]}
                </button>
              ))}
            </div>
            <p className="form-ayuda" style={{ marginBottom: 'var(--sp-3)' }}>
              {TIPOS_MOV.find((t) => t.tipo === movTipo)?.ayuda}
            </p>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="mov-fecha">Fecha</label>
                <input id="mov-fecha" type="date" value={movFecha} onChange={(e) => setMovFecha(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="mov-cant">{movTipo === 'ajuste' ? `Stock contado (${movItem.unidad})` : `Cantidad (${movItem.unidad})`}</label>
                <input id="mov-cant" type="number" inputMode="decimal" step="any" min={movTipo === 'ajuste' ? undefined : '0'} value={movCant} onChange={(e) => setMovCant(e.target.value)} required />
                {movTipo === 'ajuste' && movCant.trim() !== '' && nMov !== movItem.stock && (
                  <p className="form-ayuda">
                    {nMov < movItem.stock ? `Faltan ${cant(movItem.stock - nMov)}` : `Sobran ${cant(nMov - movItem.stock)}`} respecto de lo registrado.
                  </p>
                )}
                {(movTipo === 'venta' || movTipo === 'uso' || movTipo === 'merma') && nMov > movItem.stock && (
                  <p className="form-ayuda" style={{ color: 'var(--rojo)' }}>⚠️ Es más de lo que figura en stock.</p>
                )}
              </div>

              {movTipo === 'compra' && conCostos && (
                <>
                  <div className="form-group">
                    <label htmlFor="mov-costo">Costo por unidad</label>
                    <input id="mov-costo" type="number" inputMode="decimal" min="0" step="any" value={movPrecio} onChange={(e) => setMovPrecio(e.target.value)} placeholder="$" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="mov-cuenta">Pagado con</label>
                    <select id="mov-cuenta" value={movCuenta} onChange={(e) => setMovCuenta(e.target.value as keyof J2Cuentas | 'nada')}>
                      {CUENTAS_PAGO.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                    </select>
                  </div>
                </>
              )}
              {movTipo === 'compra' && (
                <div className="form-group">
                  <label htmlFor="mov-prov">Proveedor</label>
                  <input id="mov-prov" value={movCliente} onChange={(e) => setMovCliente(e.target.value)} placeholder={movItem.proveedor || 'Ej: Vivero El Sol'} />
                </div>
              )}

              {movTipo === 'venta' && (
                <>
                  <div className="form-group">
                    <label htmlFor="mov-precio">Precio por unidad</label>
                    <input id="mov-precio" type="number" inputMode="decimal" min="0" step="any" value={movPrecio} onChange={(e) => setMovPrecio(e.target.value)} placeholder="$" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="mov-cliente">Cliente</label>
                    <input id="mov-cliente" value={movCliente} onChange={(e) => setMovCliente(e.target.value)} placeholder="Opcional" />
                  </div>
                  {conCostos && (
                    <div className="form-group">
                      <label htmlFor="mov-medio">Cobrado por</label>
                      <select id="mov-medio" value={movMedio} onChange={(e) => setMovMedio(e.target.value)}>
                        {MEDIOS_COBRO.map((m) => <option key={m}>{m}</option>)}
                      </select>
                      {movMedio === 'A cobrar' && <p className="form-ayuda">Queda en Cobros como deuda del cliente.</p>}
                    </div>
                  )}
                </>
              )}

              {movTipo === 'uso' && (
                <div className="form-group">
                  <label htmlFor="mov-trabajo">Trabajo o cliente</label>
                  <input id="mov-trabajo" value={movCliente} onChange={(e) => setMovCliente(e.target.value)} placeholder="Ej: mantenimiento casa Pérez" />
                </div>
              )}
              {(movTipo === 'merma' || movTipo === 'ajuste' || movTipo === 'compra') && (
                <div className="form-group">
                  <label htmlFor="mov-motivo">{movTipo === 'merma' ? 'Qué pasó' : 'Nota'}</label>
                  <input id="mov-motivo" value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)} placeholder={movTipo === 'merma' ? 'Ej: se venció, se rompió' : 'Opcional'} />
                </div>
              )}
            </div>

            {conCostos && nMov > 0 && (
              <div className="alerta info" style={{ marginTop: 'var(--sp-3)' }}>
                <span>
                  {movTipo === 'compra' && precioMov > 0 && (
                    <>Total {money(Math.round(nMov * precioMov))}{movCuenta === 'nada' ? ' · no se descuenta de la caja' : ''}. No cuenta como gasto: pasa a mercadería.</>
                  )}
                  {movTipo === 'venta' && (
                    <>
                      Cobrás {money(Math.round(nMov * precioMov))}
                      {costoMov > 0 && <> · costo {money(Math.round(nMov * costoMov))} · ganancia {money(Math.round(nMov * (precioMov - costoMov)))}</>}
                    </>
                  )}
                  {(movTipo === 'uso' || movTipo === 'merma') && (
                    costoMov > 0 ? <>Gasto del mes: {money(Math.round(nMov * costoMov))} (al costo).</> : <>Sin costo cargado: no se registra gasto.</>
                  )}
                  {movTipo === 'ajuste' && nMov < movItem.stock && costoMov > 0 && (
                    <>El faltante va a gasto: {money(Math.round((movItem.stock - nMov) * costoMov))}.</>
                  )}
                </span>
              </div>
            )}
            {!conCostos && movTipo === 'venta' && (
              <p className="form-ayuda" style={{ marginTop: 'var(--sp-3)' }}>La cobranza la registra administración en Cargar.</p>
            )}

            <ModalAcciones onCancelar={() => setMovItem(null)} textoConfirmar={`Registrar ${LABEL_MOV[movTipo].toLowerCase()}`} enviando={movMut.isPending} />
          </form>
        </Modal>
      )}

      {importando && <ModalImportar existentes={data} onCerrar={() => setImportando(false)} />}

      {delItem && (
        <ModalConfirmar
          titulo="Eliminar producto"
          peligro
          textoConfirmar="Eliminar"
          mensaje={
            <>
              Se elimina <strong>{delItem.nombre}</strong> con todo su historial. Si ya no lo vendés, mejor
              dalo de baja desde Editar: así queda el historial. Esto no se puede deshacer.
            </>
          }
          onConfirmar={() => { delMut.mutate(delItem._id); setDelItem(null); cerrarFicha(); }}
          onCerrar={() => setDelItem(null)}
        />
      )}
    </>
  );
}

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{children}</div>
    </div>
  );
}

function FichaVista({
  item, conCostos, onEditar, onMover, onEliminar,
}: {
  item: ItemInventario;
  conCostos: boolean;
  onEditar: () => void;
  onMover: () => void;
  onEliminar?: () => void;
}) {
  const alertas = alertasProducto(item, conCostos);
  const movs = [...item.movimientos].reverse();
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      {alertas.map((a) => (
        <div key={a.tipo} className={`alerta ${a.tipo === 'bajo' ? 'aviso' : 'urgente'}`}>{a.texto}</div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sp-3)' }}>
        <Dato label="Stock">{cant(item.stock)} {item.unidad}</Dato>
        <Dato label="Precio de venta">{item.precioVenta ? money(item.precioVenta) : '—'}</Dato>
        {conCostos && <Dato label="Costo promedio">{item.costo ? money(Math.round(item.costo)) : '—'}</Dato>}
        {conCostos && <Dato label="Margen">{pct(margen(item))}</Dato>}
        <Dato label="Categoría">{item.categoria}</Dato>
        {item.marca && <Dato label="Marca">{item.marca}</Dato>}
        {item.proveedor && <Dato label="Proveedor">{item.proveedor}</Dato>}
        {item.ubicacion && <Dato label="Dónde está">{item.ubicacion}</Dato>}
        {item.temporada && <Dato label="Temporada">{item.temporada}</Dato>}
        <Dato label="Se consigue">{item.origen === 'pedido' ? 'A pedido' : 'En stock'}</Dato>
        {item.stockMinimo > 0 && <Dato label="Stock mínimo">{item.stockMinimo}</Dato>}
      </div>
      {item.cuidados && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>Uso y cuidados</div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{item.cuidados}</p>
        </div>
      )}
      {item.notas && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>Notas</div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{item.notas}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={onMover}>Mover stock</button>
        <button type="button" className="btn secundario" onClick={onEditar}>✏️ Editar</button>
        {onEliminar && (
          <button type="button" className="btn secundario" style={{ color: 'var(--rojo)', marginLeft: 'auto' }} onClick={onEliminar}>
            🗑 Eliminar
          </button>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 'var(--sp-2)', fontSize: 'var(--txt-sm)' }}>Movimientos</div>
        {movs.length === 0 ? (
          <p style={{ color: 'var(--texto-2)', fontSize: 'var(--txt-sm)' }}>Sin movimientos registrados.</p>
        ) : (
          <div className="tabla-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Cantidad</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {movs.map((m) => {
                  const s = signoMov(m.tipo, m.cantidad);
                  const detalle = [
                    m.cliente,
                    m.motivo,
                    m.tipo === 'venta' && m.precioUnitario ? `a ${money(m.precioUnitario)}` : '',
                    conCostos && m.tipo === 'compra' && m.costoUnitario ? `costo ${money(Math.round(m.costoUnitario))}` : '',
                    m.usuario ? `por ${m.usuario}` : '',
                  ].filter(Boolean).join(' · ');
                  return (
                    <tr key={m._id}>
                      <td>{m.fecha}</td>
                      <td><span className={`badge ${s >= 0 ? 'ok' : 'pendiente'}`}>{LABEL_MOV[m.tipo] ?? m.tipo}</span></td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)' }}>{s > 0 ? '+' : ''}{cant(s)}</td>
                      <td style={{ color: 'var(--texto-2)' }}>{detalle || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ModalImportar({ existentes, onCerrar }: { existentes: ItemInventario[]; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [leidos, setLeidos] = useState<ProductoImportado[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [archivo, setArchivo] = useState('');

  const importar = useMutation({
    mutationFn: () => sendJson<{ creados: number; actualizados: number }>('/api/inventario/importar', 'POST', { items: leidos }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['inventario'] });
      toast(`Importación lista: ${r.creados} nuevos, ${r.actualizados} actualizados`, { tono: 'exito' });
      onCerrar();
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  async function leer(f: File | undefined) {
    if (!f) return;
    const r = parsearProductos(await f.text());
    setArchivo(f.name);
    setLeidos(r.productos);
    setErrores(r.errores);
  }

  const yaEstan = leidos.filter((p) =>
    existentes.some((e) => (p.codigo && e.codigo === p.codigo) || e.nombre.toLowerCase() === p.nombre.toLowerCase())
  ).length;

  return (
    <Modal
      titulo="Importar productos"
      descripcion="Archivo .csv con encabezado: codigo; nombre; categoria; marca; unidad; stock; costo; precioVenta; proveedor. Sólo nombre es obligatorio."
      onCerrar={onCerrar}
      ancho="ancho"
    >
      <form onSubmit={(e) => { e.preventDefault(); if (leidos.length) importar.mutate(); }} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <div className="form-group">
          <label htmlFor="inv-archivo">Archivo (.csv)</label>
          <input id="inv-archivo" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => void leer(e.target.files?.[0])} />
          {archivo && (
            <p className="form-ayuda">
              {archivo}: {leidos.length} productos{yaEstan ? `, ${yaEstan} ya están y se actualizan (el stock se reemplaza por el del archivo)` : ''}.
            </p>
          )}
        </div>
        {errores.length > 0 && (
          <div className="alerta aviso" role="alert">
            <div>{errores.slice(0, 5).map((e) => <div key={e}>{e}</div>)}{errores.length > 5 && <div>…y {errores.length - 5} más</div>}</div>
          </div>
        )}
        {leidos.length > 0 && (
          <div className="tabla-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr><th>Código</th><th>Producto</th><th>Categoría</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Costo</th><th style={{ textAlign: 'right' }}>Precio</th></tr>
              </thead>
              <tbody>
                {leidos.map((p, i) => (
                  <tr key={`${p.codigo}-${i}`}>
                    <td>{p.codigo || '—'}</td>
                    <td>{p.nombre}</td>
                    <td>{p.categoria || '—'}</td>
                    <td style={{ textAlign: 'right', color: (p.stock ?? 0) < 0 ? 'var(--rojo)' : undefined }}>{p.stock ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{p.costo ? money(Math.round(p.costo)) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{p.precioVenta ? money(p.precioVenta) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="form-ayuda">
          El stock importado entra al balance como mercadería al costo, sin tocar la caja. Si la planilla está
          desactualizada, después hacé un conteo y usá “Ajuste por conteo” en cada producto.
        </p>
        <ModalAcciones onCancelar={onCerrar} textoConfirmar={`Importar ${leidos.length || ''} productos`} enviando={importar.isPending} />
      </form>
    </Modal>
  );
}
