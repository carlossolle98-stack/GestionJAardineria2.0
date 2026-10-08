import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJson } from '@/lib/api';
import { toYMD } from '@/lib/agenda';
import { diasDesde, semaforoEspera } from '@/lib/j2local';
import type { Cliente } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones } from '@/components/Modal';
import { BarraFiltros, coincideAlguno, useOrden } from '@/components/Tabla';
import { Vacio } from '@/components/Estados';

/** Tramos del semáforo, para filtrar por urgencia. */
const URGENCIAS = [
  { valor: 'todas', label: 'Todas' },
  { valor: 'rojo', label: '🔴 Urgente (+10 días)' },
  { valor: 'amarillo', label: '🟡 Atender pronto (6 a 10)' },
  { valor: 'verde', label: '🟢 Reciente (hasta 5)' },
];

export function EsperaPage() {
  const { toast, toastDeshacer } = useToast();
  const nav = useNavigate();
  const j2 = useJ2Local();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [trabajo, setTrabajo] = useState('');
  const [notas, setNotas] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [urgencia, setUrgencia] = useState('todas');

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
  });

  const clientesOrdenados = useMemo(
    () => [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [clientes]
  );

  const filtrados = useMemo(
    () =>
      j2.listaEspera.filter((e) => {
        if (!coincideAlguno([e.nombreCliente, e.trabajo, e.notas], busqueda)) return false;
        if (urgencia !== 'todas' && semaforoEspera(e.fechaAgregado).clase !== urgencia) return false;
        return true;
      }),
    [j2.listaEspera, busqueda, urgencia]
  );

  const valoresOrden = useMemo(
    () => ({
      espera: (e: { fechaAgregado: string }) => diasDesde(e.fechaAgregado),
      cliente: (e: { nombreCliente: string }) => e.nombreCliente,
      trabajo: (e: { trabajo: string }) => e.trabajo,
    }),
    []
  );

  const { filas: filasOrdenadas, orden, setOrden } = useOrden(filtrados, valoresOrden, {
    campo: 'espera',
    direccion: 'desc',
  });

  const hayFiltros = busqueda !== '' || urgencia !== 'todas';
  const esOrdenManual = orden.campo === 'espera' && !hayFiltros;
  // En modo manual respetamos el orden del array (posición en j2.listaEspera)
  const filas = esOrdenManual
    ? filtrados.slice().sort((a, b) => {
        const ia = j2.listaEspera.findIndex((x) => x.id === a.id);
        const ib = j2.listaEspera.findIndex((x) => x.id === b.id);
        return ia - ib;
      })
    : filasOrdenadas;

  const limpiarFiltros = () => {
    setBusqueda('');
    setUrgencia('todas');
  };

  function cerrarModal() {
    setModalAbierto(false);
    setClienteId('');
    setTrabajo('');
    setNotas('');
  }

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (!clienteId) {
      toast('Seleccioná un cliente', { tono: 'error' });
      return;
    }
    const c = clientes.find((x) => x._id === clienteId);
    const nombre = c?.nombre || '';

    j2.addListaEspera({
      clienteId,
      nombreCliente: nombre,
      trabajo: trabajo.trim(),
      notas: notas.trim(),
      fechaAgregado: toYMD(new Date()),
    });
    cerrarModal();
    toastDeshacer(`${nombre} entró a la lista de espera`, j2.deshacer);
  }

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          En espera <small>Clientes sin fecha asignada</small>
        </h2>
        <button type="button" className="btn" onClick={() => setModalAbierto(true)}>
          ➕ Agregar a la lista
        </button>
      </div>

      <div className="alerta info">
        <span aria-hidden="true">⏳</span>
        <span>
          <strong>Semáforo de espera:</strong> 🟢 hasta 5 días · 🟡 de 6 a 10 · 🔴 más de 10 (tratar
          con urgencia).
        </span>
      </div>

      {j2.listaEspera.length > 0 && (
        <BarraFiltros
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          placeholder="Buscar por cliente, trabajo o nota…"
          filtros={[
            {
              id: 'urgencia',
              label: 'Urgencia',
              valor: urgencia,
              onCambio: setUrgencia,
              opciones: URGENCIAS,
            },
          ]}
          orden={{
            actual: orden.campo,
            direccion: orden.direccion,
            columnas: [
              { valor: 'espera', label: 'Días de espera' },
              { valor: 'cliente', label: 'Cliente' },
              { valor: 'trabajo', label: 'Trabajo' },
            ],
            onCampo: (campo) => setOrden((o) => ({ ...o, campo: campo as typeof o.campo })),
            onDireccion: () =>
              setOrden((o) => ({ ...o, direccion: o.direccion === 'asc' ? 'desc' : 'asc' })),
          }}
          resultados={filas.length}
          total={j2.listaEspera.length}
          hayFiltros={hayFiltros}
          onLimpiar={limpiarFiltros}
        />
      )}

      {j2.listaEspera.length === 0 ? (
        <Vacio
          icono="⏳"
          titulo="No hay nadie esperando turno"
          texto="Cuando un cliente pide un trabajo pero todavía no tenés fecha, anotalo acá para no perderlo de vista."
          accion={
            <button type="button" className="btn" onClick={() => setModalAbierto(true)}>
              Agregar a la lista
            </button>
          }
        />
      ) : filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún pendiente coincide con el filtro"
          texto="Probá con otro texto o mostrá la lista completa."
          accion={
            <button type="button" className="btn secundario" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        filas.map((e) => {
          const s = semaforoEspera(e.fechaAgregado);
          return (
            <div key={e.id} className="espera-card">
              <span className={`semaforo ${s.clase}`}>
                {s.icono} {s.texto}
              </span>
              <div className="ec-nombre">{e.nombreCliente}</div>
              <div className="ec-nota">
                {e.trabajo ? <strong>{e.trabajo}</strong> : null}
                {e.trabajo && e.notas ? ' · ' : null}
                {e.notas || '—'}
              </div>
              <div className="ec-acciones">
                {esOrdenManual && (
                  <>
                    <button
                      type="button"
                      className="btn secundario sm"
                      title="Subir prioridad"
                      onClick={() => j2.moverListaEspera(e.id, 'arriba')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn secundario sm"
                      title="Bajar prioridad"
                      onClick={() => j2.moverListaEspera(e.id, 'abajo')}
                    >
                      ↓
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    nav('/agenda', { state: { prefillCliente: e.nombreCliente } });
                    j2.removeListaEspera(e.id);
                    toast(`Agendá el turno de ${e.nombreCliente}`, { tono: 'exito' });
                  }}
                >
                  📅 Agendar
                </button>
                <button
                  type="button"
                  className="btn secundario sm"
                  aria-label={`Quitar a ${e.nombreCliente} de la lista de espera`}
                  onClick={() => {
                    j2.removeListaEspera(e.id);
                    toastDeshacer(`${e.nombreCliente} salió de la lista`, j2.deshacer);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })
      )}

      {modalAbierto && (
        <Modal
          titulo="Agregar a la lista de espera"
          descripcion="Para trabajos pedidos que todavía no tienen fecha."
          onCerrar={cerrarModal}
        >
          <form onSubmit={guardar} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-group">
              <label htmlFor="espera-cliente">Cliente</label>
              <select
                id="espera-cliente"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                required
              >
                <option value="">— Seleccioná un cliente —</option>
                {clientesOrdenados.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="espera-trabajo">Tipo de trabajo</label>
              <input
                id="espera-trabajo"
                value={trabajo}
                onChange={(e) => setTrabajo(e.target.value)}
                placeholder="Ej: poda de ligustros"
              />
            </div>

            <div className="form-group">
              <label htmlFor="espera-notas">Notas / contexto</label>
              <textarea
                id="espera-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Ej: pidió para después del 20, tiene perro"
              />
            </div>

            <ModalAcciones onCancelar={cerrarModal} textoConfirmar="Guardar en lista" />
          </form>
        </Modal>
      )}
    </>
  );
}
