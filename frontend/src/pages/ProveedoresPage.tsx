import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from '@/lib/api';
import { money } from '@/lib/format';
import type { Proveedor } from '@/types';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import { BarraFiltros, coincideAlguno, Th, useOrden } from '@/components/Tabla';
import { Vacio } from '@/components/Estados';
import { useToast } from '@/context/ToastContext';

const ESTADOS = ['Pendiente', 'Parcial', 'Pagado'];
type Columna = 'nombre' | 'deudaTotal' | 'saldoActual' | 'estado';

function badgeEstado(p: Proveedor) {
  if (p.saldoActual === 0) return <span className="badge ok">Pagado</span>;
  if (p.saldoActual < p.deudaTotal) return <span className="badge pendiente">Parcial</span>;
  return <span className="badge urgente">Pendiente</span>;
}

export function ProveedoresPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data = [], isLoading } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => getJson<Proveedor[]>('/api/proveedores'),
  });

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filEstado, setFilEstado] = useState('todos');

  // Alta
  const [showNew, setShowNew] = useState(false);
  const [nNombre, setNNombre] = useState('');
  const [nFactura, setNFactura] = useState('');
  const [nDeuda, setNDeuda] = useState('');
  const [nSaldo, setNSaldo] = useState('');
  const [nEstado, setNEstado] = useState('Pendiente');

  // Edición
  const [editP, setEditP] = useState<Proveedor | null>(null);
  const [eNombre, setENombre] = useState('');
  const [eFactura, setEFactura] = useState('');
  const [eDeuda, setEDeuda] = useState('');
  const [eEstado, setEEstado] = useState('');

  // Pago parcial
  const [pagoP, setPagoP] = useState<Proveedor | null>(null);
  const [pagoMonto, setPagoMonto] = useState('');

  // Eliminar
  const [delP, setDelP] = useState<Proveedor | null>(null);

  const addMut = useMutation({
    mutationFn: () =>
      sendJson<Proveedor>('/api/proveedores', 'POST', {
        nombre: nNombre.trim(),
        factura: nFactura.trim(),
        deudaTotal: Number(nDeuda),
        saldoActual: nSaldo !== '' ? Number(nSaldo) : Number(nDeuda),
        estado: nEstado,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      setNNombre(''); setNFactura(''); setNDeuda(''); setNSaldo('');
      setShowNew(false);
      toast('Proveedor agregado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const editMut = useMutation({
    mutationFn: () =>
      sendJson<Proveedor>(`/api/proveedores/${editP?._id}`, 'PATCH', {
        nombre: eNombre.trim(),
        factura: eFactura.trim(),
        deudaTotal: Number(eDeuda),
        estado: eEstado,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      setEditP(null);
      toast('Proveedor actualizado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const pagoMut = useMutation({
    mutationFn: () => {
      const nuevo = Math.max(0, (pagoP?.saldoActual ?? 0) - Number(pagoMonto));
      return sendJson<Proveedor>(`/api/proveedores/${pagoP?._id}`, 'PATCH', {
        saldoActual: nuevo,
        estado: nuevo === 0 ? 'Pagado' : nuevo < (pagoP?.deudaTotal ?? 0) ? 'Parcial' : 'Pendiente',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      setPagoP(null);
      setPagoMonto('');
      toast('Pago registrado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => sendJson(`/api/proveedores/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      toast('Proveedor eliminado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  const filtrados = useMemo(
    () =>
      data.filter((p) => {
        if (!coincideAlguno([p.nombre, p.factura], busqueda)) return false;
        if (filEstado !== 'todos' && p.estado !== filEstado) return false;
        return true;
      }),
    [data, busqueda, filEstado]
  );

  const valores = useMemo(
    () => ({
      nombre: (p: Proveedor) => p.nombre,
      deudaTotal: (p: Proveedor) => p.deudaTotal,
      saldoActual: (p: Proveedor) => p.saldoActual,
      estado: (p: Proveedor) => p.estado,
    }),
    []
  );

  const { filas, orden, alternar, setOrden } = useOrden(filtrados, valores, {
    campo: 'saldoActual' as Columna,
    direccion: 'desc',
  });

  const totalAdeudado = data.reduce((s, p) => s + (p.saldoActual || 0), 0);
  const conDeuda = data.filter((p) => p.saldoActual > 0).length;
  const hayFiltros = busqueda.trim() !== '' || filEstado !== 'todos';

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Proveedores <small>Deudas y pagos</small>
        </div>
        <button type="button" className="btn" onClick={() => setShowNew(true)}>
          + Nuevo proveedor
        </button>
      </div>

      {data.length > 0 && (
        <div className="cards-grid" style={{ marginBottom: 'var(--sp-5)' }}>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="card-label">💰 Total adeudado</div>
            <div className="card-valor" style={{ color: totalAdeudado > 0 ? 'var(--rojo)' : 'var(--verde-vivo)' }}>
              {money(totalAdeudado)}
            </div>
            <div className="card-sub">{conDeuda} proveedor{conDeuda !== 1 ? 'es' : ''} con saldo pendiente</div>
          </div>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="card-label">📋 Total proveedores</div>
            <div className="card-valor">{data.length}</div>
            <div className="card-sub">{data.filter((p) => p.estado === 'Pagado').length} al día</div>
          </div>
        </div>
      )}

      <BarraFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por nombre o factura…"
        filtros={[
          {
            id: 'prov-estado',
            label: 'Estado',
            valor: filEstado,
            opciones: [
              { valor: 'todos', label: 'Todos' },
              { valor: 'Pendiente', label: 'Pendiente' },
              { valor: 'Parcial', label: 'Parcial' },
              { valor: 'Pagado', label: 'Pagado' },
            ],
            onCambio: setFilEstado,
          },
        ]}
        resultados={filas.length}
        total={data.length}
        hayFiltros={hayFiltros}
        onLimpiar={() => { setBusqueda(''); setFilEstado('todos'); }}
        orden={{
          actual: orden.campo,
          columnas: [
            { valor: 'nombre', label: 'Nombre' },
            { valor: 'deudaTotal', label: 'Deuda total' },
            { valor: 'saldoActual', label: 'Saldo pendiente' },
            { valor: 'estado', label: 'Estado' },
          ],
          direccion: orden.direccion,
          onCampo: (c) => setOrden({ campo: c as Columna, direccion: orden.direccion }),
          onDireccion: () =>
            setOrden({ campo: orden.campo, direccion: orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {data.length === 0 ? (
        <Vacio
          icono="🏪"
          titulo="Todavía no cargaste proveedores"
          texto="Registrá tus proveedores para llevar el control de deudas y pagos."
          accion={
            <button type="button" className="btn" onClick={() => setShowNew(true)}>
              + Nuevo proveedor
            </button>
          }
        />
      ) : filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún proveedor coincide con los filtros"
          accion={
            <button type="button" className="btn secundario" onClick={() => { setBusqueda(''); setFilEstado('todos'); }}>
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
                  <Th campo="deudaTotal" orden={orden} alternar={alternar}>Deuda total</Th>
                  <Th campo="saldoActual" orden={orden} alternar={alternar}>Saldo pendiente</Th>
                  <Th>Factura</Th>
                  <Th campo="estado" orden={orden} alternar={alternar}>Estado</Th>
                  <Th>Acción</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p._id}>
                    <td data-label="Nombre"><strong>{p.nombre}</strong></td>
                    <td data-label="Deuda total" style={{ fontFamily: 'DM Mono,monospace' }}>
                      {p.deudaTotal > 0 ? money(p.deudaTotal) : '—'}
                    </td>
                    <td data-label="Saldo pendiente">
                      {p.saldoActual > 0 ? (
                        <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: 'var(--rojo)' }}>
                          {money(p.saldoActual)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--texto-2)' }}>—</span>
                      )}
                    </td>
                    <td data-label="Factura" style={{ fontSize: 12, color: 'var(--texto-2)' }}>
                      {p.factura || '—'}
                    </td>
                    <td data-label="Estado">{badgeEstado(p)}</td>
                    <td data-label="Acción">
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {p.saldoActual > 0 && (
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => { setPagoP(p); setPagoMonto(''); }}
                          >
                            💳 Pagar
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn secundario sm"
                          onClick={() => {
                            setEditP(p);
                            setENombre(p.nombre);
                            setEFactura(p.factura || '');
                            setEDeuda(String(p.deudaTotal));
                            setEEstado(p.estado);
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn secundario sm"
                          style={{ color: 'var(--rojo)', border: '1px solid rgba(192,57,43,0.3)' }}
                          onClick={() => setDelP(p)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: nuevo proveedor */}
      {showNew && (
        <Modal
          titulo="Nuevo proveedor"
          descripcion="Nombre y saldo son los datos mínimos."
          onCerrar={() => setShowNew(false)}
        >
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!nNombre.trim()) { toast('Ingresá el nombre del proveedor', { tono: 'error' }); return; }
              addMut.mutate();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="pv-nombre">Nombre</label>
                <input id="pv-nombre" value={nNombre} onChange={(e) => setNNombre(e.target.value)} placeholder="Ej: Vivero Don Juan" required />
              </div>
              <div className="form-group">
                <label htmlFor="pv-factura">N° Factura / referencia</label>
                <input id="pv-factura" value={nFactura} onChange={(e) => setNFactura(e.target.value)} placeholder="Ej: A-0001-00012345" />
              </div>
              <div className="form-group">
                <label htmlFor="pv-deuda">Deuda total</label>
                <input id="pv-deuda" type="number" inputMode="numeric" min="0" value={nDeuda} onChange={(e) => setNDeuda(e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label htmlFor="pv-saldo">Saldo actual (si ya pagaste algo)</label>
                <input id="pv-saldo" type="number" inputMode="numeric" min="0" value={nSaldo} onChange={(e) => setNSaldo(e.target.value)} placeholder="Igual a deuda total si no pagaste nada" />
              </div>
              <div className="form-group">
                <label htmlFor="pv-estado">Estado</label>
                <select id="pv-estado" value={nEstado} onChange={(e) => setNEstado(e.target.value)}>
                  {ESTADOS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <ModalAcciones onCancelar={() => setShowNew(false)} textoConfirmar="Agregar proveedor" enviando={addMut.isPending} />
          </form>
        </Modal>
      )}

      {/* Modal: editar */}
      {editP && (
        <Modal titulo="Editar proveedor" onCerrar={() => setEditP(null)}>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!eNombre.trim()) { toast('El nombre no puede quedar vacío', { tono: 'error' }); return; }
              editMut.mutate();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="epv-nombre">Nombre</label>
                <input id="epv-nombre" value={eNombre} onChange={(e) => setENombre(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="epv-factura">N° Factura</label>
                <input id="epv-factura" value={eFactura} onChange={(e) => setEFactura(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="epv-deuda">Deuda total</label>
                <input id="epv-deuda" type="number" inputMode="numeric" min="0" value={eDeuda} onChange={(e) => setEDeuda(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="epv-estado">Estado</label>
                <select id="epv-estado" value={eEstado} onChange={(e) => setEEstado(e.target.value)}>
                  {ESTADOS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <ModalAcciones onCancelar={() => setEditP(null)} textoConfirmar="Guardar cambios" enviando={editMut.isPending} />
          </form>
        </Modal>
      )}

      {/* Modal: registrar pago */}
      {pagoP && (
        <Modal
          titulo={`Registrar pago — ${pagoP.nombre}`}
          descripcion={`Saldo pendiente: ${money(pagoP.saldoActual)}`}
          onCerrar={() => setPagoP(null)}
          ancho="chico"
        >
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              const m = Number(pagoMonto);
              if (!m || m <= 0) { toast('Ingresá un monto válido', { tono: 'error' }); return; }
              if (m > pagoP.saldoActual) { toast(`El monto supera el saldo pendiente (${money(pagoP.saldoActual)})`, { tono: 'error' }); return; }
              pagoMut.mutate();
            }}
          >
            <div className="form-group">
              <label htmlFor="pago-monto">Monto pagado</label>
              <input
                id="pago-monto"
                type="number"
                inputMode="numeric"
                min="1"
                value={pagoMonto}
                onChange={(e) => setPagoMonto(e.target.value)}
                placeholder={`Máx: ${pagoP.saldoActual}`}
                required
              />
              {pagoMonto && Number(pagoMonto) > 0 && Number(pagoMonto) <= pagoP.saldoActual && (
                <p className="form-ayuda">
                  Saldo restante: <strong>{money(pagoP.saldoActual - Number(pagoMonto))}</strong>
                </p>
              )}
            </div>
            <ModalAcciones onCancelar={() => setPagoP(null)} textoConfirmar="Confirmar pago" enviando={pagoMut.isPending} />
          </form>
        </Modal>
      )}

      {/* Modal: confirmar eliminación */}
      {delP && (
        <ModalConfirmar
          titulo="Eliminar proveedor"
          peligro
          textoConfirmar="Eliminar"
          mensaje={<>Se elimina a <strong>{delP.nombre}</strong> del listado. Esta acción no se puede deshacer.</>}
          onConfirmar={() => { delMut.mutate(delP._id); setDelP(null); }}
          onCerrar={() => setDelP(null)}
        />
      )}
    </>
  );
}
