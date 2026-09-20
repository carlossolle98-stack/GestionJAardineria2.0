import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getJson, sendJson } from '@/lib/api';
import { mensajeWa, copiar } from '@/lib/whatsapp';
import type { Prospecto } from '@/types';
import { Modal, ModalAcciones } from '@/components/Modal';
import { useOrden, Th, BarraFiltros, coincideAlguno } from '@/components/Tabla';
import { Vacio } from '@/components/Estados';
import { useToast } from '@/context/ToastContext';

/** Columnas por las que se puede ordenar el pipeline. */
type Columna = 'nombre' | 'zona' | 'tipoTrabajo' | 'frecuencia' | 'estado';

const COLUMNAS = [
  { valor: 'nombre', label: 'Nombre' },
  { valor: 'zona', label: 'Zona' },
  { valor: 'tipoTrabajo', label: 'Tipo de trabajo' },
  { valor: 'frecuencia', label: 'Frecuencia' },
  { valor: 'estado', label: 'Estado' },
];

const FORM_VACIO = {
  nombre: '',
  zona: '',
  tipoTrabajo: '',
  frecuencia: '',
  disponibilidad: '',
  estado: 'Presupuesto pendiente',
  notas: '',
};

export function ProspectosPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const nav = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ['prospectos'],
    queryFn: () => getJson<Prospecto[]>('/api/prospectos'),
  });

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('todos');
  const [frecuencia, setFrecuencia] = useState('todas');

  const [show, setShow] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  const mut = useMutation({
    mutationFn: () => sendJson<Prospecto>('/api/prospectos', 'POST', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospectos'] });
      setShow(false);
      setForm(FORM_VACIO);
      toast('Prospecto guardado', { tono: 'exito' });
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  // Estados y frecuencias salen de los datos: si aparece uno nuevo, se filtra igual.
  const estados = useMemo(() => {
    const vistos = new Set(data.map((p) => p.estado).filter(Boolean));
    return [...vistos].sort((a, b) => a.localeCompare(b, 'es'));
  }, [data]);

  const frecuencias = useMemo(() => {
    const vistas = new Set(data.map((p) => p.frecuencia).filter(Boolean));
    return [...vistas].sort((a, b) => a.localeCompare(b, 'es'));
  }, [data]);

  const filtrados = useMemo(
    () =>
      data.filter((p) => {
        if (!coincideAlguno([p.nombre, p.zona, p.tipoTrabajo], busqueda)) return false;
        if (estado !== 'todos' && p.estado !== estado) return false;
        if (frecuencia === 'sindefinir' && p.frecuencia) return false;
        if (frecuencia !== 'todas' && frecuencia !== 'sindefinir' && p.frecuencia !== frecuencia) return false;
        return true;
      }),
    [data, busqueda, estado, frecuencia]
  );

  const valores = useMemo(
    () => ({
      nombre: (p: Prospecto) => p.nombre,
      zona: (p: Prospecto) => p.zona,
      tipoTrabajo: (p: Prospecto) => p.tipoTrabajo,
      frecuencia: (p: Prospecto) => p.frecuencia,
      estado: (p: Prospecto) => p.estado,
    }),
    []
  );

  // El genérico sale de las claves de `valores`, no hace falta tiparlo a mano.
  const { filas, orden, alternar, setOrden } = useOrden(filtrados, valores, {
    campo: 'nombre',
    direccion: 'asc',
  });

  const hayFiltros = busqueda.trim() !== '' || estado !== 'todos' || frecuencia !== 'todas';

  function limpiarFiltros() {
    setBusqueda('');
    setEstado('todos');
    setFrecuencia('todas');
  }

  function guardarProspecto(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast('Poné el nombre del prospecto', { tono: 'error' });
      return;
    }
    if (!form.zona.trim()) {
      toast('Falta la zona: sin eso no se puede presupuestar', { tono: 'error' });
      return;
    }
    mut.mutate();
  }

  function contactar(p: Prospecto) {
    void copiar(mensajeWa('prospecto', p.nombre), toast);
    nav('/whatsapp');
  }

  if (isLoading) return <p style={{ padding: 16 }}>Cargando…</p>;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Prospectos <small>Pipeline</small>
        </div>
        <button type="button" className="btn" onClick={() => setShow(true)}>
          + Nuevo prospecto
        </button>
      </div>

      <BarraFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por nombre, zona o trabajo…"
        filtros={[
          {
            id: 'estado',
            label: 'Estado',
            valor: estado,
            opciones: [
              { valor: 'todos', label: 'Todos' },
              ...estados.map((e) => ({ valor: e, label: e })),
            ],
            onCambio: setEstado,
          },
          {
            id: 'frecuencia',
            label: 'Frecuencia',
            valor: frecuencia,
            opciones: [
              { valor: 'todas', label: 'Todas' },
              ...frecuencias.map((f) => ({ valor: f, label: f })),
              { valor: 'sindefinir', label: 'Sin definir' },
            ],
            onCambio: setFrecuencia,
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
          titulo="Todavía no hay prospectos"
          texto="Cargá el primero para ir siguiendo los presupuestos pendientes."
          accion={
            <button type="button" className="btn" onClick={() => setShow(true)}>
              + Nuevo prospecto
            </button>
          }
        />
      ) : filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún prospecto coincide con los filtros"
          texto="Probá con otra búsqueda o sacá algún filtro para ver más resultados."
          accion={
            <button type="button" className="btn secundario" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <div className="tabla-wrap">
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <Th campo="nombre" orden={orden} alternar={alternar}>
                    Nombre
                  </Th>
                  <Th campo="zona" orden={orden} alternar={alternar}>
                    Zona
                  </Th>
                  <Th campo="tipoTrabajo" orden={orden} alternar={alternar}>
                    Tipo
                  </Th>
                  <Th campo="frecuencia" orden={orden} alternar={alternar}>
                    Frecuencia
                  </Th>
                  <Th campo="estado" orden={orden} alternar={alternar}>
                    Estado
                  </Th>
                  <Th>Urgencia</Th>
                  <Th>Acción</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <strong>{p.nombre}</strong>
                    </td>
                    <td>{p.zona}</td>
                    <td>{p.tipoTrabajo || '—'}</td>
                    <td>{p.frecuencia || <span style={{ color: 'var(--texto-2)' }}>Sin definir</span>}</td>
                    <td>
                      <span className={`badge ${p.estado.includes('Presupuesto') ? 'pendiente' : 'info'}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td>
                      <span className="badge pendiente">A gestionar</span>
                    </td>
                    <td>
                      <button type="button" className="btn sm" onClick={() => contactar(p)}>
                        💬 WA
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="sep" />
      <div className="alerta info">
        <div>📌</div>
        <div>
          <strong>Datos mínimos para presupuestar:</strong>
          Zona exacta · Tipo de trabajo · m² o fotos · Frecuencia · Disponibilidad · Acceso moto/camioneta
        </div>
      </div>

      {show && (
        <Modal
          titulo="Nuevo prospecto"
          descripcion="Nombre y zona son los datos mínimos para poder presupuestar."
          ancho="ancho"
          onCerrar={() => setShow(false)}
        >
          <form onSubmit={guardarProspecto}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="prospectos-nombre-1">Nombre</label>
                <input
                  id="prospectos-nombre-1"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="prospectos-zona-2">Zona</label>
                <input
                  id="prospectos-zona-2"
                  value={form.zona}
                  onChange={(e) => setForm({ ...form, zona: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="prospectos-tipo-trabajo-3">Tipo trabajo</label>
                <select
                  id="prospectos-tipo-trabajo-3"
                  value={form.tipoTrabajo}
                  onChange={(e) => setForm({ ...form, tipoTrabajo: e.target.value })}
                >
                  <option value="">Seleccionar…</option>
                  <option>Mantenimiento mensual</option>
                  <option>Poda</option>
                  <option>Desmalezado</option>
                  <option>Diseño de jardín</option>
                  <option>Vivero / venta</option>
                  <option>Otro</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="prospectos-frecuencia-4">Frecuencia</label>
                <select
                  id="prospectos-frecuencia-4"
                  value={form.frecuencia}
                  onChange={(e) => setForm({ ...form, frecuencia: e.target.value })}
                >
                  <option value="">Sin definir</option>
                  <option>Mensual</option>
                  <option>Quincenal</option>
                  <option>Semanal</option>
                  <option>Una sola vez</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="prospectos-disponibilidad-7">Disponibilidad</label>
                <input
                  id="prospectos-disponibilidad-7"
                  value={form.disponibilidad}
                  onChange={(e) => setForm({ ...form, disponibilidad: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="prospectos-estado-5">Estado</label>
                <select
                  id="prospectos-estado-5"
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value })}
                >
                  <option>Presupuesto pendiente</option>
                  <option>A confirmar</option>
                  <option>Espera / sin lugar</option>
                  <option>En negociación</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 'var(--sp-3)' }}>
              <label htmlFor="prospectos-notas-6">Notas</label>
              <textarea
                id="prospectos-notas-6"
                rows={2}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>
            <ModalAcciones
              onCancelar={() => setShow(false)}
              textoConfirmar="Crear prospecto"
              enviando={mut.isPending}
            />
          </form>
        </Modal>
      )}
    </>
  );
}
