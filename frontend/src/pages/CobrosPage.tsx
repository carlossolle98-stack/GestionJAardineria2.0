import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { money, todayISO } from '@/lib/format';
import type { ResumenPayload, Cliente, J2DeudaCliente } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useJ2Local } from '@/context/J2LocalContext';
import { NOMBRES_CUENTA } from '@/lib/j2local';
import { useOrden, Th, BarraFiltros, coincideAlguno } from '@/components/Tabla';
import { Modal, ModalAcciones } from '@/components/Modal';
import { Vacio } from '@/components/Estados';

type Proveedor = ResumenPayload['cuentasPagar']['proveedores'][number];

type ColPend = 'fecha' | 'cliente' | 'concepto' | 'monto';
type ColPag = 'fecha' | 'cliente' | 'monto' | 'fechaPago' | 'cuenta';
type ColProv = 'nombre' | 'factura' | 'deudaTotal' | 'saldo' | 'estado';

export function CobrosPage() {
  const { toast, toastDeshacer } = useToast();
  const qc = useQueryClient();
  const j2 = useJ2Local();

  // ── Alta de deuda (modal) ───────────────────────────────────
  const [abrirAlta, setAbrirAlta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [dcNombre, setDcNombre] = useState('');
  const [dcConcepto, setDcConcepto] = useState('');
  const [dcMonto, setDcMonto] = useState('');
  const [dcFecha, setDcFecha] = useState(todayISO());

  const [openPagoId, setOpenPagoId] = useState<string | null>(null);
  const [pagoCuenta, setPagoCuenta] = useState<'mp' | 'banco' | 'efectivo'>('mp');
  const [verPagadas, setVerPagadas] = useState(false);

  const pendientes = j2.deudasClientes.filter((d) => d.estado === 'pendiente');
  const pagadas = j2.deudasClientes.filter((d) => d.estado === 'pagado');
  const totalPendiente = pendientes.reduce((s, d) => s + d.monto, 0);

  // Clientes formales (para datalist + sync badge)
  const { data: clientesData = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
  });

  // Proveedores (sección independiente al final)
  const { data, isLoading } = useQuery({
    queryKey: ['resumen'],
    queryFn: () => getJson<ResumenPayload>('/api/resumen'),
  });
  const proveedores = useMemo(() => data?.cuentasPagar.proveedores ?? [], [data]);

  /* ── Filtros: deudas pendientes ──────────────────────────── */
  const [busPend, setBusPend] = useState('');
  const [filCliente, setFilCliente] = useState('');

  const clientesConDeuda = useMemo(
    () => [...new Set(pendientes.map((d) => d.nombreCliente))].sort((a, b) => a.localeCompare(b, 'es')),
    [pendientes]
  );

  const pendFiltradas = useMemo(
    () =>
      pendientes.filter(
        (d) =>
          coincideAlguno([d.nombreCliente, d.concepto], busPend) &&
          (!filCliente || d.nombreCliente === filCliente)
      ),
    [pendientes, busPend, filCliente]
  );

  const valoresPend = useMemo(
    () => ({
      fecha: (d: J2DeudaCliente) => d.fecha,
      cliente: (d: J2DeudaCliente) => d.nombreCliente,
      concepto: (d: J2DeudaCliente) => d.concepto,
      monto: (d: J2DeudaCliente) => d.monto,
    }),
    []
  );
  const {
    filas: pendOrdenadas,
    orden: ordenPend,
    alternar: alternarPend,
    setOrden: setOrdenPend,
  } = useOrden<J2DeudaCliente, ColPend>(pendFiltradas, valoresPend, {
    campo: 'fecha',
    direccion: 'desc',
  });

  const hayFiltrosPend = Boolean(busPend || filCliente);
  function limpiarPend() {
    setBusPend('');
    setFilCliente('');
  }

  /* ── Filtros: historial cobrado ──────────────────────────── */
  const [busPag, setBusPag] = useState('');
  const [filCuenta, setFilCuenta] = useState('');

  const pagFiltradas = useMemo(
    () =>
      pagadas.filter(
        (d) =>
          coincideAlguno([d.nombreCliente, d.concepto], busPag) &&
          (!filCuenta || (d.cuentaCobro || '') === filCuenta)
      ),
    [pagadas, busPag, filCuenta]
  );

  const valoresPag = useMemo(
    () => ({
      fecha: (d: J2DeudaCliente) => d.fecha,
      cliente: (d: J2DeudaCliente) => d.nombreCliente,
      monto: (d: J2DeudaCliente) => d.monto,
      fechaPago: (d: J2DeudaCliente) => d.fechaPago,
      cuenta: (d: J2DeudaCliente) => NOMBRES_CUENTA[d.cuentaCobro || ''] || d.cuentaCobro,
    }),
    []
  );
  const {
    filas: pagOrdenadas,
    orden: ordenPag,
    alternar: alternarPag,
    setOrden: setOrdenPag,
  } = useOrden<J2DeudaCliente, ColPag>(pagFiltradas, valoresPag, {
    campo: 'fechaPago',
    direccion: 'desc',
  });

  const hayFiltrosPag = Boolean(busPag || filCuenta);
  function limpiarPag() {
    setBusPag('');
    setFilCuenta('');
  }

  /* ── Filtros: proveedores ────────────────────────────────── */
  const [busProv, setBusProv] = useState('');
  const [filEstadoProv, setFilEstadoProv] = useState('');

  const estadosProv = useMemo(
    () => [...new Set(proveedores.map((p) => p.estado).filter(Boolean))].sort(),
    [proveedores]
  );

  const provFiltrados = useMemo(
    () =>
      proveedores.filter(
        (p) =>
          coincideAlguno([p.nombre, p.factura], busProv) &&
          (!filEstadoProv || p.estado === filEstadoProv)
      ),
    [proveedores, busProv, filEstadoProv]
  );

  const valoresProv = useMemo(
    () => ({
      nombre: (p: Proveedor) => p.nombre,
      factura: (p: Proveedor) => p.factura,
      deudaTotal: (p: Proveedor) => p.deudaTotal,
      saldo: (p: Proveedor) => p.saldoActual,
      estado: (p: Proveedor) => p.estado,
    }),
    []
  );
  const {
    filas: provOrdenados,
    orden: ordenProv,
    alternar: alternarProv,
    setOrden: setOrdenProv,
  } = useOrden<Proveedor, ColProv>(provFiltrados, valoresProv, {
    campo: 'saldo',
    direccion: 'desc',
  });

  const hayFiltrosProv = Boolean(busProv || filEstadoProv);
  function limpiarProv() {
    setBusProv('');
    setFilEstadoProv('');
  }

  // Busca cliente formal por nombre (case-insensitive)
  function buscarFormal(nombre: string) {
    return clientesData.find(
      (c) => c.nombre.toLowerCase() === nombre.trim().toLowerCase()
    ) ?? null;
  }

  function cerrarAlta() {
    setAbrirAlta(false);
    setDcNombre('');
    setDcConcepto('');
    setDcMonto('');
  }

  async function registrarDeuda() {
    const m = parseInt(dcMonto, 10);
    if (!dcNombre.trim()) { toast('⚠ Ingresá el nombre del cliente', { tono: 'error' }); return; }
    if (!m || m <= 0) { toast('⚠ Ingresá un monto válido', { tono: 'error' }); return; }
    if (!dcFecha) { toast('⚠ Elegí una fecha', { tono: 'error' }); return; }

    setGuardando(true);
    try {
      // Si coincide con cliente formal → actualizar badge en ficha del cliente
      const formal = buscarFormal(dcNombre);
      if (formal) {
        await sendJson(`/api/clientes/${formal._id}`, 'PATCH', {
          deuda: (formal.deuda || 0) + m,
        }).catch(() => {
          toast('No se pudo actualizar la deuda en la ficha del cliente', { tono: 'error' });
        });
        qc.invalidateQueries({ queryKey: ['clientes'] });
      }

      j2.addDeudaCliente({
        nombreCliente: dcNombre.trim(),
        concepto: dcConcepto.trim() || 'Servicio de jardinería',
        monto: m,
        fecha: dcFecha,
      });
      cerrarAlta();
      toast('✓ Deuda registrada', { tono: 'exito' });
    } catch {
      toast('No se pudo registrar la deuda', { tono: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarPago(id: string) {
    const deuda = j2.deudasClientes.find((d) => d.id === id);
    if (!deuda) { toast('No encontramos esa deuda', { tono: 'error' }); return; }

    j2.pagarDeudaCliente(id, pagoCuenta);
    setOpenPagoId(null);

    // Si coincide con cliente formal → reducir badge en ficha del cliente
    const formal = buscarFormal(deuda.nombreCliente);
    if (formal) {
      await sendJson(`/api/clientes/${formal._id}`, 'PATCH', {
        deuda: Math.max(0, (formal.deuda || 0) - deuda.monto),
      }).catch(() => {
        toast('No se pudo actualizar la deuda en la ficha del cliente', { tono: 'error' });
      });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    }

    toast(`✓ Cobro registrado → ${NOMBRES_CUENTA[pagoCuenta]}`, { tono: 'exito' });
  }

  return (
    <>
      {/* ── Sección local ── */}
      <div className="section-header">
        <div className="section-title">💳 Cuentas por Cobrar</div>
        <button type="button" className="btn" onClick={() => setAbrirAlta(true)}>
          ➕ Registrar deuda
        </button>
      </div>

      <div className="cards-grid">
        <div className="card rojo">
          <div className="card-label">Total Pendiente</div>
          <div className="card-valor">{money(totalPendiente)}</div>
          <div className="card-sub">
            {pendientes.length
              ? pendientes.map((d) => `${d.nombreCliente.split(' ')[0]} ${money(d.monto)}`).join(' · ')
              : 'Sin deudas pendientes'}
          </div>
        </div>
      </div>

      <div className="section-title" style={{ margin: '20px 0 12px' }}>📋 Deudas pendientes</div>

      <BarraFiltros
        busqueda={busPend}
        onBusqueda={setBusPend}
        placeholder="Buscar por cliente o concepto…"
        filtros={[
          {
            id: 'cobros-cliente',
            label: 'Cliente',
            valor: filCliente,
            opciones: [
              { valor: '', label: 'Todos' },
              ...clientesConDeuda.map((c) => ({ valor: c, label: c })),
            ],
            onCambio: setFilCliente,
          },
        ]}
        resultados={pendOrdenadas.length}
        total={pendientes.length}
        hayFiltros={hayFiltrosPend}
        onLimpiar={limpiarPend}
        orden={{
          actual: ordenPend.campo,
          columnas: [
            { valor: 'fecha', label: 'Fecha' },
            { valor: 'cliente', label: 'Cliente' },
            { valor: 'concepto', label: 'Concepto' },
            { valor: 'monto', label: 'Monto' },
          ],
          direccion: ordenPend.direccion,
          onCampo: (campo) => setOrdenPend((o) => ({ ...o, campo: campo as ColPend })),
          onDireccion: () =>
            setOrdenPend((o) => ({ ...o, direccion: o.direccion === 'asc' ? 'desc' : 'asc' })),
        }}
      />

      <div className="tabla-wrap">
        <div className="tabla-scroll">
          <table className="responsive">
            <thead>
              <tr>
                <Th campo="fecha" orden={ordenPend} alternar={alternarPend}>Fecha</Th>
                <Th campo="cliente" orden={ordenPend} alternar={alternarPend}>Cliente</Th>
                <Th campo="concepto" orden={ordenPend} alternar={alternarPend}>Concepto</Th>
                <Th campo="monto" orden={ordenPend} alternar={alternarPend}>Monto</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {pendOrdenadas.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 0 }}>
                    {hayFiltrosPend ? (
                      <Vacio
                        icono="🔍"
                        titulo="Ninguna deuda coincide con los filtros"
                        texto="Probá con otro cliente o borrá lo que escribiste en la búsqueda."
                        accion={
                          <button type="button" className="btn secundario sm" onClick={limpiarPend}>
                            Limpiar filtros
                          </button>
                        }
                      />
                    ) : (
                      <Vacio
                        icono="💰"
                        titulo="No hay deudas pendientes"
                        texto="Cuando un cliente te quede debiendo, cargalo acá y te lo vamos a recordar."
                        accion={
                          <button type="button" className="btn sm" onClick={() => setAbrirAlta(true)}>
                            ➕ Registrar deuda
                          </button>
                        }
                      />
                    )}
                  </td>
                </tr>
              ) : (
                pendOrdenadas.map((d) => (
                  <Fragment key={d.id}>
                    <tr className="prioridad-alta">
                      <td data-label="Fecha" style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fecha}</td>
                      <td data-label="Cliente"><strong>{d.nombreCliente}</strong></td>
                      <td data-label="Concepto" style={{ fontSize: 13, color: 'var(--texto-2)' }}>{d.concepto}</td>
                      <td data-label="Monto" style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: 'var(--rojo)' }}>
                        {money(d.monto)}
                      </td>
                      <td data-label="Acciones">
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => setOpenPagoId((id) => (id === d.id ? null : d.id))}
                          >
                            ✓ Ya cobré
                          </button>
                          <button
                            type="button"
                            style={{ background: 'none', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 6, cursor: 'pointer', color: 'var(--rojo)', padding: '2px 8px' }}
                            aria-label={`Eliminar deuda de ${d.nombreCliente}`}
                            onClick={() => {
                              j2.removeDeudaCliente(d.id);
                              toastDeshacer(`Deuda de ${d.nombreCliente} eliminada`, j2.deshacer);
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                    {openPagoId === d.id && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div style={{ background: '#f0fdf0', padding: '14px 20px', borderTop: '1px dashed #a3e6a3' }}>
                            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>
                              ¿Cómo te pagó {d.nombreCliente}?
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                              <div className="form-group" style={{ minWidth: 160 }}>
                                <label htmlFor="cobros-medio-de-pago-4">Medio de pago</label>
                                <select id="cobros-medio-de-pago-4" value={pagoCuenta} onChange={(e) => setPagoCuenta(e.target.value as 'mp' | 'banco' | 'efectivo')}>
                                  <option value="mp">Mercado Pago</option>
                                  <option value="banco">Transferencia bancaria</option>
                                  <option value="efectivo">Efectivo</option>
                                </select>
                              </div>
                              <button type="button" className="btn sm" onClick={() => confirmarPago(d.id)}>
                                ✓ Confirmar cobro
                              </button>
                              <button type="button" className="btn secundario sm" onClick={() => setOpenPagoId(null)}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial cobrado */}
      <div style={{ margin: '16px 0 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>✅ Historial cobrado ({pagadas.length})</div>
        <button type="button" className="btn secundario sm" onClick={() => setVerPagadas((v) => !v)}>
          {verPagadas ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      {verPagadas && (
        <>
          <BarraFiltros
            busqueda={busPag}
            onBusqueda={setBusPag}
            placeholder="Buscar por cliente o concepto…"
            filtros={[
              {
                id: 'cobros-cuenta',
                label: 'Cuenta',
                valor: filCuenta,
                opciones: [
                  { valor: '', label: 'Todas' },
                  { valor: 'mp', label: 'Mercado Pago' },
                  { valor: 'banco', label: 'Transferencia bancaria' },
                  { valor: 'efectivo', label: 'Efectivo' },
                ],
                onCambio: setFilCuenta,
              },
            ]}
            resultados={pagOrdenadas.length}
            total={pagadas.length}
            hayFiltros={hayFiltrosPag}
            onLimpiar={limpiarPag}
            orden={{
              actual: ordenPag.campo,
              columnas: [
                { valor: 'fecha', label: 'Fecha deuda' },
                { valor: 'cliente', label: 'Cliente' },
                { valor: 'monto', label: 'Monto' },
                { valor: 'fechaPago', label: 'Cobrado' },
                { valor: 'cuenta', label: 'Cuenta' },
              ],
              direccion: ordenPag.direccion,
              onCampo: (campo) => setOrdenPag((o) => ({ ...o, campo: campo as ColPag })),
              onDireccion: () =>
                setOrdenPag((o) => ({ ...o, direccion: o.direccion === 'asc' ? 'desc' : 'asc' })),
            }}
          />
          <div className="tabla-wrap">
            <div className="tabla-scroll">
              <table className="responsive">
                <thead>
                  <tr>
                    <Th campo="fecha" orden={ordenPag} alternar={alternarPag}>Fecha deuda</Th>
                    <Th campo="cliente" orden={ordenPag} alternar={alternarPag}>Cliente</Th>
                    <Th>Concepto</Th>
                    <Th campo="monto" orden={ordenPag} alternar={alternarPag}>Monto</Th>
                    <Th campo="fechaPago" orden={ordenPag} alternar={alternarPag}>Cobrado</Th>
                    <Th campo="cuenta" orden={ordenPag} alternar={alternarPag}>Cuenta</Th>
                  </tr>
                </thead>
                <tbody>
                  {pagOrdenadas.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        {hayFiltrosPag ? (
                          <Vacio
                            icono="🔍"
                            titulo="Ningún cobro coincide con los filtros"
                            texto="Probá con otra cuenta o limpiá la búsqueda."
                            accion={
                              <button type="button" className="btn secundario sm" onClick={limpiarPag}>
                                Limpiar filtros
                              </button>
                            }
                          />
                        ) : (
                          <Vacio
                            icono="✅"
                            titulo="Sin cobros registrados"
                            texto="Cuando marques una deuda como cobrada, te queda el historial acá."
                          />
                        )}
                      </td>
                    </tr>
                  ) : (
                    pagOrdenadas.map((d) => (
                      <tr key={d.id}>
                        <td data-label="Fecha deuda" style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fecha}</td>
                        <td data-label="Cliente"><strong>{d.nombreCliente}</strong></td>
                        <td data-label="Concepto" style={{ fontSize: 13, color: 'var(--texto-2)' }}>{d.concepto}</td>
                        <td data-label="Monto" style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: '#2e7d32' }}>{money(d.monto)}</td>
                        <td data-label="Cobrado" style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fechaPago || '—'}</td>
                        <td data-label="Cuenta">{NOMBRES_CUENTA[d.cuentaCobro || ''] || d.cuentaCobro || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="sep" />

      {/* ── Proveedores ── */}
      {isLoading ? (
        <p style={{ padding: 16, color: 'var(--texto-2)' }}>Cargando proveedores…</p>
      ) : (
        <>
          <div className="section-title" style={{ marginBottom: 12 }}>Proveedores</div>

          <BarraFiltros
            busqueda={busProv}
            onBusqueda={setBusProv}
            placeholder="Buscar por proveedor o factura…"
            filtros={[
              {
                id: 'cobros-estado-prov',
                label: 'Estado',
                valor: filEstadoProv,
                opciones: [
                  { valor: '', label: 'Todos' },
                  ...estadosProv.map((e) => ({ valor: e, label: e })),
                ],
                onCambio: setFilEstadoProv,
              },
            ]}
            resultados={provOrdenados.length}
            total={proveedores.length}
            hayFiltros={hayFiltrosProv}
            onLimpiar={limpiarProv}
            orden={{
              actual: ordenProv.campo,
              columnas: [
                { valor: 'nombre', label: 'Proveedor' },
                { valor: 'factura', label: 'Factura' },
                { valor: 'deudaTotal', label: 'Deuda total' },
                { valor: 'saldo', label: 'Saldo' },
                { valor: 'estado', label: 'Estado' },
              ],
              direccion: ordenProv.direccion,
              onCampo: (campo) => setOrdenProv((o) => ({ ...o, campo: campo as ColProv })),
              onDireccion: () =>
                setOrdenProv((o) => ({ ...o, direccion: o.direccion === 'asc' ? 'desc' : 'asc' })),
            }}
          />

          <div className="tabla-wrap">
            <div className="tabla-scroll">
              <table className="responsive">
                <thead>
                  <tr>
                    <Th campo="nombre" orden={ordenProv} alternar={alternarProv}>Proveedor</Th>
                    <Th campo="factura" orden={ordenProv} alternar={alternarProv}>Factura</Th>
                    <Th campo="deudaTotal" orden={ordenProv} alternar={alternarProv}>Deuda total</Th>
                    <Th campo="saldo" orden={ordenProv} alternar={alternarProv}>Saldo</Th>
                    <Th campo="estado" orden={ordenProv} alternar={alternarProv}>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {provOrdenados.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 0 }}>
                        {hayFiltrosProv ? (
                          <Vacio
                            icono="🔍"
                            titulo="Ningún proveedor coincide con los filtros"
                            texto="Probá con otro estado o limpiá la búsqueda."
                            accion={
                              <button type="button" className="btn secundario sm" onClick={limpiarProv}>
                                Limpiar filtros
                              </button>
                            }
                          />
                        ) : (
                          <Vacio icono="🧾" titulo="Sin proveedores con deuda" texto="No le debés nada a nadie. Disfrutalo." />
                        )}
                      </td>
                    </tr>
                  ) : (
                    provOrdenados.map((p) => (
                      <tr key={p._id}>
                        <td data-label="Proveedor">{p.nombre}</td>
                        <td data-label="Factura">{p.factura}</td>
                        <td data-label="Deuda total">{money(p.deudaTotal)}</td>
                        <td data-label="Saldo" style={{ fontWeight: 600, color: p.saldoActual > 0 ? 'var(--rojo)' : undefined }}>{money(p.saldoActual)}</td>
                        <td data-label="Estado"><span className="badge pendiente">{p.estado}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Modal: alta de deuda ── */}
      {abrirAlta && (
        <Modal
          titulo="Registrar deuda"
          descripcion="Cargá lo que un cliente te quedó debiendo."
          onCerrar={cerrarAlta}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void registrarDeuda();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="cobros-cliente-0">Cliente</label>
                <input
                  id="cobros-cliente-0"
                  list="dl-cobros-clientes"
                  value={dcNombre}
                  onChange={(e) => setDcNombre(e.target.value)}
                  placeholder="Nombre del cliente"
                  autoComplete="off"
                />
                <datalist id="dl-cobros-clientes">
                  {clientesData.map((c) => (
                    <option key={c._id} value={c.nombre} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label htmlFor="cobros-concepto-1">Concepto</label>
                <input id="cobros-concepto-1" value={dcConcepto} onChange={(e) => setDcConcepto(e.target.value)} placeholder="Ej: Corte de césped" />
              </div>
              <div className="form-group">
                <label htmlFor="cobros-monto-2">Monto</label>
                <input id="cobros-monto-2" type="number" value={dcMonto} onChange={(e) => setDcMonto(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="cobros-fecha-del-servicio-3">Fecha del servicio</label>
                <input id="cobros-fecha-del-servicio-3" type="date" value={dcFecha} onChange={(e) => setDcFecha(e.target.value)} />
              </div>
            </div>
            <ModalAcciones onCancelar={cerrarAlta} textoConfirmar="Registrar deuda" enviando={guardando} />
          </form>
        </Modal>
      )}
    </>
  );
}
