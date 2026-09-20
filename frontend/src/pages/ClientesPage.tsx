import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJson, sendJson } from '@/lib/api';
import { money } from '@/lib/format';
import { mensajeWa, copiar } from '@/lib/whatsapp';
import type { Cliente } from '@/types';
import { ClienteHistorial } from '@/components/clientes/ClienteHistorial';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import { useOrden, Th, BarraFiltros, coincideAlguno } from '@/components/Tabla';
import { Vacio } from '@/components/Estados';
import { useToast } from '@/context/ToastContext';

type Pendiente = { accion: 'limpiar' | 'eliminar'; id: string; nombre: string };

/** Columnas por las que se puede ordenar el listado. */
type Columna = 'num' | 'nombre' | 'direccion' | 'formaPago' | 'pagado' | 'ultimo' | 'estado';

const COLUMNAS = [
  { valor: 'num', label: '#' },
  { valor: 'nombre', label: 'Nombre' },
  { valor: 'direccion', label: 'Dirección' },
  { valor: 'formaPago', label: 'Forma de pago' },
  { valor: 'pagado', label: 'Pagado acumulado' },
  { valor: 'ultimo', label: 'Último pago' },
  { valor: 'estado', label: 'Deuda' },
];

/** Total cobrado a un cliente, sumando todos sus pagos. */
function totalPagado(c: Cliente) {
  return (c.pagos || []).reduce((s, p) => s + p.monto, 0);
}

function ultimoPago(c: Cliente) {
  const pagos = c.pagos || [];
  return pagos.length ? pagos[pagos.length - 1] : null;
}

export function ClientesPage() {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const nav = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [deuda, setDeuda] = useState('todos');
  const [pago, setPago] = useState('todos');

  // Alta
  const [showNew, setShowNew] = useState(false);
  const [nNombre, setNNombre] = useState('');
  const [nDir, setNDir] = useState('');
  const [nPago, setNPago] = useState('Transferencia');

  const { data = [], isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
  });

  const addCliente = useMutation({
    mutationFn: () =>
      sendJson<Cliente>('/api/clientes', 'POST', {
        nombre: nNombre.trim(),
        direccion: nDir.trim() || 'dato pendiente',
        formaPago: nPago,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      setNNombre('');
      setNDir('');
      setShowNew(false);
      toast('Cliente agregado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const delCliente = useMutation({
    mutationFn: (id: string) => sendJson(`/api/clientes/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast('Cliente eliminado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const limpiarDeuda = useMutation({
    mutationFn: (id: string) => sendJson(`/api/clientes/${id}`, 'PATCH', { deuda: 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast('Deuda del cliente limpiada', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  // Las formas de pago salen de los datos: si mañana se agrega una, aparece sola.
  const formasPago = useMemo(() => {
    const vistas = new Set(data.map((c) => c.formaPago).filter(Boolean));
    return [...vistas].sort((a, b) => a.localeCompare(b, 'es'));
  }, [data]);

  const filtradas = useMemo(
    () =>
      data.filter((c) => {
        if (!coincideAlguno([c.nombre, c.direccion, c.telefono], busqueda)) return false;
        if (deuda === 'con' && !(c.deuda > 0)) return false;
        if (deuda === 'aldia' && c.deuda > 0) return false;
        if (pago !== 'todos' && c.formaPago !== pago) return false;
        return true;
      }),
    [data, busqueda, deuda, pago]
  );

  const valores = useMemo(
    () => ({
      num: (c: Cliente) => c.num,
      nombre: (c: Cliente) => c.nombre,
      direccion: (c: Cliente) => c.direccion,
      formaPago: (c: Cliente) => c.formaPago,
      pagado: (c: Cliente) => totalPagado(c),
      ultimo: (c: Cliente) => ultimoPago(c)?.fecha ?? null,
      estado: (c: Cliente) => c.deuda,
    }),
    []
  );

  // El genérico sale de las claves de `valores`, no hace falta tiparlo a mano.
  const { filas, orden, alternar, setOrden } = useOrden(filtradas, valores, {
    campo: 'num',
    direccion: 'asc',
  });

  const hayFiltros = busqueda.trim() !== '' || deuda !== 'todos' || pago !== 'todos';

  function limpiarFiltros() {
    setBusqueda('');
    setDeuda('todos');
    setPago('todos');
  }

  function guardarCliente(e: React.FormEvent) {
    e.preventDefault();
    if (!nNombre.trim()) {
      toast('Poné el nombre del cliente', { tono: 'error' });
      return;
    }
    addCliente.mutate();
  }

  function waCobro(nombre: string) {
    const txt = mensajeWa('cobro', nombre.split(' ')[0]);
    void copiar(txt, toast);
    nav('/whatsapp');
  }

  function waTurno(nombre: string) {
    const txt = mensajeWa('turno', nombre.split(' ')[0]);
    void copiar(txt, toast);
    nav('/whatsapp');
  }

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Clientes Fijos <small>Hacé clic en un cliente para ver historial</small>
        </div>
        <button type="button" className="btn" onClick={() => setShowNew(true)}>
          + Nuevo cliente
        </button>
      </div>

      <BarraFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por nombre, dirección o teléfono…"
        filtros={[
          {
            id: 'deuda',
            label: 'Deuda',
            valor: deuda,
            opciones: [
              { valor: 'todos', label: 'Todos' },
              { valor: 'con', label: 'Con deuda' },
              { valor: 'aldia', label: 'Al día' },
            ],
            onCambio: setDeuda,
          },
          {
            id: 'pago',
            label: 'Forma de pago',
            valor: pago,
            opciones: [
              { valor: 'todos', label: 'Todas' },
              ...formasPago.map((f) => ({ valor: f, label: f })),
            ],
            onCambio: setPago,
          },
        ]}
        resultados={filas.length}
        total={data.length}
        hayFiltros={hayFiltros}
        onLimpiar={limpiarFiltros}
        orden={{
          actual: orden.campo,
          columnas: COLUMNAS,
          direccion: orden.direccion,
          onCampo: (campo) => setOrden({ campo: campo as Columna, direccion: orden.direccion }),
          onDireccion: () =>
            setOrden({ campo: orden.campo, direccion: orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {data.length === 0 ? (
        <Vacio
          icono="🌱"
          titulo="Todavía no cargaste clientes"
          texto="Dale de alta al primero y vas a poder registrarle pagos y turnos."
          accion={
            <button type="button" className="btn" onClick={() => setShowNew(true)}>
              + Nuevo cliente
            </button>
          }
        />
      ) : filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún cliente coincide con los filtros"
          texto="Probá con otra búsqueda o sacá algún filtro para ver más resultados."
          accion={
            <button type="button" className="btn secundario" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <>
          <div className="tabla-wrap">
            <div className="tabla-scroll">
              <table className="responsive">
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <Th campo="num" orden={orden} alternar={alternar}>
                      #
                    </Th>
                    <Th campo="nombre" orden={orden} alternar={alternar}>
                      Nombre
                    </Th>
                    <Th campo="direccion" orden={orden} alternar={alternar}>
                      Dirección
                    </Th>
                    <Th campo="formaPago" orden={orden} alternar={alternar}>
                      Pago
                    </Th>
                    <Th campo="pagado" orden={orden} alternar={alternar}>
                      Pagado acum.
                    </Th>
                    <Th campo="ultimo" orden={orden} alternar={alternar}>
                      Último pago
                    </Th>
                    <Th campo="estado" orden={orden} alternar={alternar}>
                      Estado
                    </Th>
                    <Th>Contacto</Th>
                    <Th>Acción</Th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((c) => {
                    const pagos = c.pagos || [];
                    const tot = totalPagado(c);
                    const ult = ultimoPago(c);
                    const abierto = openId === c._id;
                    return (
                      <Fragment key={c._id}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => setOpenId(abierto ? null : c._id)}>
                          <td>{abierto ? '▼' : '▶'}</td>
                          <td data-label="#" style={{ color: 'var(--texto-2)' }}>
                            {c.num}
                          </td>
                          <td data-label="Nombre">
                            <strong>{c.nombre}</strong>
                          </td>
                          <td data-label="Dirección" style={{ fontSize: 12, color: 'var(--texto-2)' }}>
                            {c.direccion}
                          </td>
                          <td data-label="Pago">
                            <span className="badge info" style={{ fontSize: 11 }}>
                              {c.formaPago}
                            </span>
                          </td>
                          <td data-label="Pagado acum.">
                            {tot > 0 ? (
                              <>
                                <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: '#2e7d32' }}>
                                  {money(tot)}
                                </span>
                                <div style={{ fontSize: 10, color: 'var(--texto-2)' }}>({pagos.length} pagos)</div>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td data-label="Último pago" style={{ fontSize: 12 }}>
                            {ult ? (
                              <>
                                {ult.fecha}
                                <br />
                                <span style={{ fontFamily: 'DM Mono,monospace', color: '#2e7d32' }}>
                                  {money(ult.monto)}
                                </span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td data-label="Estado">
                            {c.deuda > 0 ? (
                              <span className="badge urgente">{money(c.deuda)} adeuda</span>
                            ) : tot > 0 ? (
                              <span className="badge ok">Al día</span>
                            ) : (
                              <span className="badge pendiente">Sin registros</span>
                            )}
                          </td>
                          <td data-label="Contacto" onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {c.deuda > 0 ? (
                                <>
                                  <button type="button" className="btn sm" onClick={() => waCobro(c.nombre)}>
                                    💬 Cobrar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn secundario sm"
                                    style={{ fontSize: 11 }}
                                    onClick={() => setPendiente({ accion: 'limpiar', id: c._id, nombre: c.nombre })}
                                  >
                                    🗑 Deuda
                                  </button>
                                </>
                              ) : (
                                <button type="button" className="btn secundario sm" onClick={() => waTurno(c.nombre)}>
                                  📅 Turno
                                </button>
                              )}
                            </div>
                          </td>
                          <td data-label="Acción" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn secundario sm"
                              style={{ color: 'var(--rojo)', border: '1px solid rgba(192,57,43,0.3)' }}
                              aria-label={`Eliminar a ${c.nombre}`}
                              onClick={() => setPendiente({ accion: 'eliminar', id: c._id, nombre: c.nombre })}
                            >
                              🗑
                            </button>
                          </td>
                        </tr>
                        {abierto && (
                          <tr key={`${c._id}-h`}>
                            <td colSpan={10} style={{ padding: 0 }}>
                              <ClienteHistorial cliente={c} />
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
          <p style={{ fontSize: 'var(--txt-sm)', color: 'var(--texto-2)', textAlign: 'right', marginTop: 8 }}>
            {filas.length === data.length
              ? `Total: ${data.length} clientes`
              : `Mostrando ${filas.length} de ${data.length} clientes`}
          </p>
        </>
      )}

      {showNew && (
        <Modal
          titulo="Nuevo cliente"
          descripcion="Con el nombre alcanza; el resto lo podés completar después."
          onCerrar={() => setShowNew(false)}
        >
          <form onSubmit={guardarCliente}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="clientes-nombre-1">Nombre</label>
                <input id="clientes-nombre-1" value={nNombre} onChange={(e) => setNNombre(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="clientes-direccion-2">Dirección</label>
                <input id="clientes-direccion-2" value={nDir} onChange={(e) => setNDir(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="clientes-forma-de-pago-3">Forma de pago</label>
                <select id="clientes-forma-de-pago-3" value={nPago} onChange={(e) => setNPago(e.target.value)}>
                  <option>Transferencia</option>
                  <option>Contado</option>
                  <option>Transf / Contado</option>
                  <option>Mercado Pago</option>
                </select>
              </div>
            </div>
            <ModalAcciones
              onCancelar={() => setShowNew(false)}
              textoConfirmar="Crear cliente"
              enviando={addCliente.isPending}
            />
          </form>
        </Modal>
      )}

      {pendiente && (
        <ModalConfirmar
          titulo={pendiente.accion === 'eliminar' ? 'Eliminar cliente' : 'Limpiar deuda'}
          peligro={pendiente.accion === 'eliminar'}
          textoConfirmar={pendiente.accion === 'eliminar' ? 'Eliminar' : 'Limpiar deuda'}
          mensaje={
            pendiente.accion === 'eliminar' ? (
              <>
                Se elimina a <strong>{pendiente.nombre}</strong> junto con su historial de pagos. Esta acción no se
                puede deshacer.
              </>
            ) : (
              <>
                La deuda de <strong>{pendiente.nombre}</strong> queda en $0. Usalo cuando ya cobraste por fuera del
                sistema o la diste de baja.
              </>
            )
          }
          onConfirmar={() =>
            pendiente.accion === 'eliminar' ? delCliente.mutate(pendiente.id) : limpiarDeuda.mutate(pendiente.id)
          }
          onCerrar={() => setPendiente(null)}
        />
      )}
    </>
  );
}
