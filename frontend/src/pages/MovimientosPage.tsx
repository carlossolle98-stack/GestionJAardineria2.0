import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
import { csvEscape, downloadCsv, NOMBRES_CUENTA } from '@/lib/j2local';
import { money } from '@/lib/format';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { useOrden, Th, BarraFiltros, coincideAlguno } from '@/components/Tabla';
import { Vacio } from '@/components/Estados';
import type { Cliente, J2DeudaCliente, J2MovLog, Prospecto, Turno } from '@/types';

function csvRows(rows: (string | number | undefined)[][]) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

type FilaCobro = { nombre: string; fecha: string; monto: number; horas?: number };

type ColMov = 'fecha' | 'tipo' | 'concepto' | 'detalle' | 'monto' | 'cuenta';
type ColCobro = 'nombre' | 'fecha' | 'monto' | 'horas';
type ColDeuda = 'fecha' | 'nombreCliente' | 'concepto' | 'monto' | 'estado' | 'fechaPago';
type ColTurno = 'fecha' | 'hora' | 'cliente' | 'duracion' | 'tipo' | 'estado';
type ColProspecto = 'nombre' | 'zona' | 'tipoTrabajo' | 'frecuencia' | 'estado';

const COLS_MOV = [
  { valor: 'fecha', label: 'Fecha' },
  { valor: 'tipo', label: 'Tipo' },
  { valor: 'concepto', label: 'Concepto' },
  { valor: 'detalle', label: 'Detalle' },
  { valor: 'monto', label: 'Monto' },
  { valor: 'cuenta', label: 'Cuenta' },
];

const COLS_COBRO = [
  { valor: 'nombre', label: 'Cliente' },
  { valor: 'fecha', label: 'Fecha' },
  { valor: 'monto', label: 'Monto' },
  { valor: 'horas', label: 'Horas' },
];

const COLS_DEUDA = [
  { valor: 'fecha', label: 'Fecha' },
  { valor: 'nombreCliente', label: 'Cliente' },
  { valor: 'concepto', label: 'Concepto' },
  { valor: 'monto', label: 'Monto' },
  { valor: 'estado', label: 'Estado' },
  { valor: 'fechaPago', label: 'Fecha cobro' },
];

const COLS_TURNO = [
  { valor: 'fecha', label: 'Fecha' },
  { valor: 'hora', label: 'Hora' },
  { valor: 'cliente', label: 'Cliente' },
  { valor: 'duracion', label: 'Duración' },
  { valor: 'tipo', label: 'Tipo' },
  { valor: 'estado', label: 'Estado' },
];

const COLS_PROSPECTO = [
  { valor: 'nombre', label: 'Nombre' },
  { valor: 'zona', label: 'Zona' },
  { valor: 'tipoTrabajo', label: 'Tipo' },
  { valor: 'frecuencia', label: 'Frecuencia' },
  { valor: 'estado', label: 'Estado' },
];

export function MovimientosPage() {
  const j2 = useJ2Local();
  const { toast } = useToast();

  const { data: clientes = [], isLoading: lc } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getJson<Cliente[]>('/api/clientes'),
  });
  const { data: turnos = [], isLoading: lt } = useQuery({
    queryKey: ['turnos-all'],
    queryFn: () => getJson<Turno[]>('/api/turnos'),
  });
  const { data: prospectos = [], isLoading: lp } = useQuery({
    queryKey: ['prospectos'],
    queryFn: () => getJson<Prospecto[]>('/api/prospectos'),
  });

  // ── Filtros de cada tabla ──
  const [bMov, setBMov] = useState('');
  const [fMovTipo, setFMovTipo] = useState('todos');
  const [fMovCuenta, setFMovCuenta] = useState('todas');

  const [bCobro, setBCobro] = useState('');

  const [bDeuda, setBDeuda] = useState('');
  const [fDeudaEstado, setFDeudaEstado] = useState('todos');

  const [bTurno, setBTurno] = useState('');
  const [fTurnoEstado, setFTurnoEstado] = useState('todos');

  const [bProspecto, setBProspecto] = useState('');

  const filasCobros = useMemo(() => {
    const out: FilaCobro[] = [];
    for (const c of clientes) {
      for (const p of c.pagos || []) {
        out.push({ nombre: c.nombre, fecha: p.fecha, monto: p.monto, horas: p.horas });
      }
    }
    return out;
  }, [clientes]);

  const turnosOrd = useMemo(() => [...turnos], [turnos]);

  const fecha = new Date().toISOString().split('T')[0];

  /* ── Movimientos (movlog) ── */

  const tiposMov = useMemo(() => {
    const claves = new Set<string>();
    j2.movlog.forEach((m) => { if (m.tipo) claves.add(m.tipo); });
    return [...claves].sort((a, b) => a.localeCompare(b, 'es'));
  }, [j2.movlog]);

  const cuentasMov = useMemo(() => {
    const claves = new Set<string>();
    j2.movlog.forEach((m) => { if (m.cuenta) claves.add(m.cuenta); });
    return [...claves];
  }, [j2.movlog]);

  const movFiltrados = useMemo(
    () =>
      j2.movlog.filter((m) => {
        if (fMovTipo !== 'todos' && m.tipo !== fMovTipo) return false;
        if (fMovCuenta !== 'todas' && m.cuenta !== fMovCuenta) return false;
        return coincideAlguno([m.concepto, m.detalle, m.tipo], bMov);
      }),
    [j2.movlog, fMovTipo, fMovCuenta, bMov]
  );

  const valoresMov = useMemo(
    () => ({
      fecha: (m: J2MovLog) => m.fecha,
      tipo: (m: J2MovLog) => m.tipo,
      concepto: (m: J2MovLog) => m.concepto,
      detalle: (m: J2MovLog) => m.detalle,
      monto: (m: J2MovLog) => m.monto,
      cuenta: (m: J2MovLog) => NOMBRES_CUENTA[m.cuenta] || m.cuenta,
    }),
    []
  );

  const om = useOrden<J2MovLog, ColMov>(movFiltrados, valoresMov, { campo: 'fecha', direccion: 'desc' });
  const hayFiltrosMov = bMov.trim() !== '' || fMovTipo !== 'todos' || fMovCuenta !== 'todas';
  function limpiarMov() {
    setBMov('');
    setFMovTipo('todos');
    setFMovCuenta('todas');
  }

  /* ── Cobros del servidor ── */

  const cobrosFiltrados = useMemo(
    () => filasCobros.filter((p) => coincideAlguno([p.nombre], bCobro)),
    [filasCobros, bCobro]
  );

  const valoresCobro = useMemo(
    () => ({
      nombre: (p: FilaCobro) => p.nombre,
      fecha: (p: FilaCobro) => p.fecha,
      monto: (p: FilaCobro) => p.monto,
      horas: (p: FilaCobro) => p.horas ?? null,
    }),
    []
  );

  const oc = useOrden<FilaCobro, ColCobro>(cobrosFiltrados, valoresCobro, { campo: 'fecha', direccion: 'desc' });

  /* ── Deudas de clientes ── */

  const deudasFiltradas = useMemo(
    () =>
      j2.deudasClientes.filter((d) => {
        if (fDeudaEstado !== 'todos' && d.estado !== fDeudaEstado) return false;
        return coincideAlguno([d.nombreCliente, d.concepto], bDeuda);
      }),
    [j2.deudasClientes, fDeudaEstado, bDeuda]
  );

  const valoresDeuda = useMemo(
    () => ({
      fecha: (d: J2DeudaCliente) => d.fecha,
      nombreCliente: (d: J2DeudaCliente) => d.nombreCliente,
      concepto: (d: J2DeudaCliente) => d.concepto,
      monto: (d: J2DeudaCliente) => d.monto,
      estado: (d: J2DeudaCliente) => d.estado,
      fechaPago: (d: J2DeudaCliente) => d.fechaPago ?? null,
    }),
    []
  );

  const od = useOrden<J2DeudaCliente, ColDeuda>(deudasFiltradas, valoresDeuda, { campo: 'fecha', direccion: 'desc' });
  const hayFiltrosDeuda = bDeuda.trim() !== '' || fDeudaEstado !== 'todos';
  function limpiarDeuda() {
    setBDeuda('');
    setFDeudaEstado('todos');
  }

  /* ── Turnos ── */

  const turnosFiltrados = useMemo(
    () =>
      turnosOrd.filter((t) => {
        if (fTurnoEstado === 'realizado' && !t.realizado) return false;
        if (fTurnoEstado === 'pendiente' && t.realizado) return false;
        return coincideAlguno([t.cliente, t.tipo], bTurno);
      }),
    [turnosOrd, fTurnoEstado, bTurno]
  );

  const valoresTurno = useMemo(
    () => ({
      fecha: (t: Turno) => t.fecha,
      hora: (t: Turno) => t.hora ?? null,
      cliente: (t: Turno) => t.cliente,
      duracion: (t: Turno) => t.duracion,
      tipo: (t: Turno) => t.tipo,
      estado: (t: Turno) => (t.realizado ? 'Realizado' : 'Pendiente'),
    }),
    []
  );

  const ot = useOrden<Turno, ColTurno>(turnosFiltrados, valoresTurno, { campo: 'fecha', direccion: 'asc' });
  const hayFiltrosTurno = bTurno.trim() !== '' || fTurnoEstado !== 'todos';
  function limpiarTurno() {
    setBTurno('');
    setFTurnoEstado('todos');
  }

  /* ── Prospectos ── */

  const prospectosFiltrados = useMemo(
    () => prospectos.filter((p) => coincideAlguno([p.nombre, p.zona, p.tipoTrabajo], bProspecto)),
    [prospectos, bProspecto]
  );

  const valoresProspecto = useMemo(
    () => ({
      nombre: (p: Prospecto) => p.nombre,
      zona: (p: Prospecto) => p.zona,
      tipoTrabajo: (p: Prospecto) => p.tipoTrabajo,
      frecuencia: (p: Prospecto) => p.frecuencia,
      estado: (p: Prospecto) => p.estado,
    }),
    []
  );

  const op = useOrden<Prospecto, ColProspecto>(prospectosFiltrados, valoresProspecto, {
    campo: 'nombre',
    direccion: 'asc',
  });

  /** Descarga un CSV y avisa; si no hay filas, no baja nada. */
  function bajar(nombre: string, contenido: string, cantidad: number, que: string) {
    if (cantidad === 0) {
      toast(`No hay ${que} para exportar`, { tono: 'error' });
      return;
    }
    downloadCsv(nombre, contenido);
    toast(`✓ ${cantidad} ${que} exportados a CSV`, { tono: 'exito' });
  }

  function descargarTodo() {
    const totalFilas =
      j2.movlog.length + j2.ingresos.length + j2.egresos.length +
      j2.deudasClientes.length + filasCobros.length + turnos.length + prospectos.length;
    if (totalFilas === 0) {
      toast('Todavía no hay datos para exportar', { tono: 'error' });
      return;
    }

    // Movimientos locales (movlog)
    const mov = csvRows([
      ['Fecha', 'Tipo', 'Concepto', 'Detalle', 'Monto', 'Cuenta'],
      ...j2.movlog.map((m) => [m.fecha, m.tipo, m.concepto, m.detalle, m.monto, NOMBRES_CUENTA[m.cuenta] || m.cuenta]),
    ]);
    downloadCsv(`jardineria_movimientos_${fecha}.csv`, mov);

    setTimeout(() => {
      // Ingresos locales
      const ing = csvRows([
        ['Fecha', 'Cliente', 'Concepto', 'Monto', 'Medio'],
        ...j2.ingresos.map((i) => [i.fecha, i.cliente, i.concepto, i.monto, i.medio]),
      ]);
      downloadCsv(`jardineria_ingresos_${fecha}.csv`, ing);
    }, 150);

    setTimeout(() => {
      // Egresos locales
      const eg = csvRows([
        ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Monto', 'Cuenta'],
        ...j2.egresos.map((e) => [e.fecha, e.tipo, e.categoria, e.concepto, e.monto, NOMBRES_CUENTA[e.cuenta] || e.cuenta]),
      ]);
      downloadCsv(`jardineria_egresos_${fecha}.csv`, eg);
    }, 300);

    setTimeout(() => {
      // Deudas clientes
      const deudas = csvRows([
        ['Fecha', 'Cliente', 'Concepto', 'Monto', 'Estado', 'Fecha cobro', 'Cuenta cobro'],
        ...j2.deudasClientes.map((d) => [
          d.fecha, d.nombreCliente, d.concepto, d.monto,
          d.estado, d.fechaPago || '', NOMBRES_CUENTA[d.cuentaCobro || ''] || d.cuentaCobro || '',
        ]),
      ]);
      downloadCsv(`jardineria_deudas_${fecha}.csv`, deudas);
    }, 600);

    setTimeout(() => {
      // Cobros backend
      const cob = csvRows([
        ['Cliente', 'Fecha', 'Monto', 'Horas'],
        ...filasCobros.map((p) => [p.nombre, p.fecha, p.monto, p.horas ?? '']),
      ]);
      downloadCsv(`jardineria_cobros_backend_${fecha}.csv`, cob);
    }, 900);

    setTimeout(() => {
      const t = csvRows([
        ['Fecha', 'Hora', 'Cliente', 'Duración', 'Tipo', 'Estado'],
        ...turnosOrd.map((x) => [x.fecha, x.hora || '', x.cliente, x.duracion, x.tipo, x.realizado ? 'Realizado' : 'Pendiente']),
      ]);
      downloadCsv(`jardineria_turnos_${fecha}.csv`, t);
    }, 1200);

    setTimeout(() => {
      const pr = csvRows([
        ['Nombre', 'Zona', 'Tipo', 'Frecuencia', 'Estado', 'Notas'],
        ...prospectos.map((p) => [p.nombre, p.zona, p.tipoTrabajo, p.frecuencia, p.estado, p.notas || '']),
      ]);
      downloadCsv(`jardineria_prospectos_${fecha}.csv`, pr);
      toast('✓ Se descargaron los 6 archivos CSV', { tono: 'exito' });
    }, 1500);
  }

  if (lc || lt || lp) return <p style={{ padding: 16 }}>Cargando…</p>;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Movimientos <small>Todos los registros de la app</small>
        </div>
        <button type="button" className="btn" onClick={descargarTodo}>
          ⬇ Descargar todo (CSV)
        </button>
      </div>

      <div className="alerta info">
        <div>💡</div>
        <div>
          <strong>CSV para Excel.</strong> Se descargan 6 archivos: movimientos, egresos, deudas, cobros, turnos y prospectos.
          Los botones de cada tabla bajan solo lo que estás viendo con los filtros puestos.
        </div>
      </div>

      {/* ── Movimientos locales (movlog) ── */}
      <div className="section-title" style={{ margin: '20px 0 12px' }}>
        📋 Movimientos financieros (app)
      </div>

      <BarraFiltros
        busqueda={bMov}
        onBusqueda={setBMov}
        placeholder="Buscar por concepto o detalle…"
        filtros={[
          {
            id: 'mov-tipo',
            label: 'Tipo',
            valor: fMovTipo,
            opciones: [{ valor: 'todos', label: 'Todos' }, ...tiposMov.map((t) => ({ valor: t, label: t }))],
            onCambio: setFMovTipo,
          },
          {
            id: 'mov-cuenta',
            label: 'Cuenta',
            valor: fMovCuenta,
            opciones: [
              { valor: 'todas', label: 'Todas' },
              ...cuentasMov.map((c) => ({ valor: c, label: NOMBRES_CUENTA[c] || c })),
            ],
            onCambio: setFMovCuenta,
          },
        ]}
        resultados={om.filas.length}
        total={j2.movlog.length}
        hayFiltros={hayFiltrosMov}
        onLimpiar={limpiarMov}
        orden={{
          actual: om.orden.campo,
          columnas: COLS_MOV,
          direccion: om.orden.direccion,
          onCampo: (campo) => om.setOrden({ campo: campo as ColMov, direccion: om.orden.direccion }),
          onDireccion: () =>
            om.setOrden({ campo: om.orden.campo, direccion: om.orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {j2.movlog.length === 0 ? (
        <Vacio
          icono="📋"
          titulo="Todavía no hay movimientos"
          texto="Cuando cargues ingresos o egresos van a aparecer acá."
        />
      ) : om.filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún movimiento coincide con esos filtros"
          texto="Probá con otra búsqueda o sacá algún filtro."
          accion={
            <button type="button" className="btn secundario" onClick={limpiarMov}>
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
                  <Th campo="fecha" orden={om.orden} alternar={om.alternar}>Fecha</Th>
                  <Th campo="tipo" orden={om.orden} alternar={om.alternar}>Tipo</Th>
                  <Th campo="concepto" orden={om.orden} alternar={om.alternar}>Concepto</Th>
                  <Th campo="detalle" orden={om.orden} alternar={om.alternar}>Detalle</Th>
                  <Th campo="monto" orden={om.orden} alternar={om.alternar}>Monto</Th>
                  <Th campo="cuenta" orden={om.orden} alternar={om.alternar}>Cuenta</Th>
                </tr>
              </thead>
              <tbody>
                {om.filas.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Fecha" style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{m.fecha}</td>
                    <td data-label="Tipo"><span className="badge pendiente">{m.tipo}</span></td>
                    <td data-label="Concepto"><strong>{m.concepto}</strong></td>
                    <td data-label="Detalle" style={{ fontSize: 12, color: '#666' }}>{m.detalle || '—'}</td>
                    <td data-label="Monto" style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: m.monto >= 0 ? '#2e7d32' : 'var(--rojo)' }}>
                      {m.monto >= 0 ? '+' : ''}{money(m.monto)}
                    </td>
                    <td data-label="Cuenta" style={{ fontSize: 12 }}>{NOMBRES_CUENTA[m.cuenta] || m.cuenta || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn secundario sm"
        style={{ marginBottom: 20 }}
        onClick={() =>
          bajar(
            `movimientos_${fecha}.csv`,
            csvRows([
              ['Fecha', 'Tipo', 'Concepto', 'Detalle', 'Monto', 'Cuenta'],
              ...om.filas.map((m) => [m.fecha, m.tipo, m.concepto, m.detalle, m.monto, NOMBRES_CUENTA[m.cuenta] || m.cuenta]),
            ]),
            om.filas.length,
            'movimientos'
          )
        }
      >
        ⬇ Descargar movimientos CSV
      </button>

      {/* ── Cobros backend ── */}
      <div className="section-title" style={{ marginBottom: 12 }}>💵 Cobros por cliente (servidor)</div>

      <BarraFiltros
        busqueda={bCobro}
        onBusqueda={setBCobro}
        placeholder="Buscar por cliente…"
        resultados={oc.filas.length}
        total={filasCobros.length}
        hayFiltros={bCobro.trim() !== ''}
        onLimpiar={() => setBCobro('')}
        orden={{
          actual: oc.orden.campo,
          columnas: COLS_COBRO,
          direccion: oc.orden.direccion,
          onCampo: (campo) => oc.setOrden({ campo: campo as ColCobro, direccion: oc.orden.direccion }),
          onDireccion: () =>
            oc.setOrden({ campo: oc.orden.campo, direccion: oc.orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {filasCobros.length === 0 ? (
        <Vacio icono="💵" titulo="Sin cobros registrados" texto="Los cobros cargados en el servidor aparecen acá." />
      ) : oc.filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún cobro coincide con esa búsqueda"
          texto="Probá con otro nombre de cliente."
          accion={
            <button type="button" className="btn secundario" onClick={() => setBCobro('')}>
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
                  <Th campo="nombre" orden={oc.orden} alternar={oc.alternar}>Cliente</Th>
                  <Th campo="fecha" orden={oc.orden} alternar={oc.alternar}>Fecha</Th>
                  <Th campo="monto" orden={oc.orden} alternar={oc.alternar}>Monto</Th>
                  <Th campo="horas" orden={oc.orden} alternar={oc.alternar}>Horas</Th>
                  <Th>$/hora</Th>
                </tr>
              </thead>
              <tbody>
                {oc.filas.map((p, i) => {
                  const vh = p.horas && p.horas > 0 ? `$${Math.round(p.monto / p.horas).toLocaleString('es-AR')}` : '—';
                  return (
                    <tr key={`${p.nombre}-${p.fecha}-${i}`}>
                      <td data-label="Cliente"><strong>{p.nombre}</strong></td>
                      <td data-label="Fecha">{p.fecha}</td>
                      <td data-label="Monto" style={{ fontFamily: 'DM Mono,monospace', color: '#2e7d32', fontWeight: 600 }}>
                        ${p.monto.toLocaleString('es-AR')}
                      </td>
                      <td data-label="Horas" style={{ textAlign: 'center' }}>{p.horas ? `${p.horas}h` : '—'}</td>
                      <td data-label="$/hora" style={{ textAlign: 'center', color: '#888' }}>{vh}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn secundario sm"
        style={{ marginBottom: 20 }}
        onClick={() =>
          bajar(
            'cobros_backend.csv',
            csvRows([
              ['Cliente', 'Fecha', 'Monto', 'Horas'],
              ...oc.filas.map((p) => [p.nombre, p.fecha, p.monto, p.horas ?? '']),
            ]),
            oc.filas.length,
            'cobros'
          )
        }
      >
        ⬇ Descargar cobros CSV
      </button>

      {/* ── Deudas clientes ── */}
      <div className="section-title" style={{ marginBottom: 12 }}>💳 Deudas por cobrar (registro)</div>

      <BarraFiltros
        busqueda={bDeuda}
        onBusqueda={setBDeuda}
        placeholder="Buscar por cliente o concepto…"
        filtros={[
          {
            id: 'deuda-estado',
            label: 'Estado',
            valor: fDeudaEstado,
            opciones: [
              { valor: 'todos', label: 'Todos' },
              { valor: 'pendiente', label: 'Pendiente' },
              { valor: 'pagado', label: 'Cobrado' },
            ],
            onCambio: setFDeudaEstado,
          },
        ]}
        resultados={od.filas.length}
        total={j2.deudasClientes.length}
        hayFiltros={hayFiltrosDeuda}
        onLimpiar={limpiarDeuda}
        orden={{
          actual: od.orden.campo,
          columnas: COLS_DEUDA,
          direccion: od.orden.direccion,
          onCampo: (campo) => od.setOrden({ campo: campo as ColDeuda, direccion: od.orden.direccion }),
          onDireccion: () =>
            od.setOrden({ campo: od.orden.campo, direccion: od.orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {j2.deudasClientes.length === 0 ? (
        <Vacio icono="💳" titulo="Sin deudas registradas" texto="Las deudas que cargues de tus clientes aparecen acá." />
      ) : od.filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ninguna deuda coincide con esos filtros"
          texto="Probá con otra búsqueda o cambiá el estado."
          accion={
            <button type="button" className="btn secundario" onClick={limpiarDeuda}>
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
                  <Th campo="fecha" orden={od.orden} alternar={od.alternar}>Fecha</Th>
                  <Th campo="nombreCliente" orden={od.orden} alternar={od.alternar}>Cliente</Th>
                  <Th campo="concepto" orden={od.orden} alternar={od.alternar}>Concepto</Th>
                  <Th campo="monto" orden={od.orden} alternar={od.alternar}>Monto</Th>
                  <Th campo="estado" orden={od.orden} alternar={od.alternar}>Estado</Th>
                  <Th campo="fechaPago" orden={od.orden} alternar={od.alternar}>Fecha cobro</Th>
                  <Th>Medio</Th>
                </tr>
              </thead>
              <tbody>
                {od.filas.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Fecha" style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fecha}</td>
                    <td data-label="Cliente"><strong>{d.nombreCliente}</strong></td>
                    <td data-label="Concepto" style={{ fontSize: 12, color: '#666' }}>{d.concepto}</td>
                    <td data-label="Monto" style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: d.estado === 'pendiente' ? 'var(--rojo)' : '#2e7d32' }}>
                      {money(d.monto)}
                    </td>
                    <td data-label="Estado">
                      <span className={`badge ${d.estado === 'pendiente' ? 'urgente' : 'ok'}`}>
                        {d.estado === 'pendiente' ? '⏳ Pendiente' : '✓ Cobrado'}
                      </span>
                    </td>
                    <td data-label="Fecha cobro" style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{d.fechaPago || '—'}</td>
                    <td data-label="Medio" style={{ fontSize: 12 }}>{NOMBRES_CUENTA[d.cuentaCobro || ''] || d.cuentaCobro || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn secundario sm"
        style={{ marginBottom: 20 }}
        onClick={() =>
          bajar(
            `deudas_clientes_${fecha}.csv`,
            csvRows([
              ['Fecha', 'Cliente', 'Concepto', 'Monto', 'Estado', 'Fecha cobro', 'Medio'],
              ...od.filas.map((d) => [
                d.fecha, d.nombreCliente, d.concepto, d.monto,
                d.estado, d.fechaPago || '', NOMBRES_CUENTA[d.cuentaCobro || ''] || d.cuentaCobro || '',
              ]),
            ]),
            od.filas.length,
            'deudas'
          )
        }
      >
        ⬇ Descargar deudas CSV
      </button>

      {/* ── Turnos ── */}
      <div className="section-title" style={{ marginBottom: 12 }}>📅 Turnos agendados</div>

      <BarraFiltros
        busqueda={bTurno}
        onBusqueda={setBTurno}
        placeholder="Buscar por cliente o tipo…"
        filtros={[
          {
            id: 'turno-estado',
            label: 'Estado',
            valor: fTurnoEstado,
            opciones: [
              { valor: 'todos', label: 'Todos' },
              { valor: 'pendiente', label: 'Pendiente' },
              { valor: 'realizado', label: 'Realizado' },
            ],
            onCambio: setFTurnoEstado,
          },
        ]}
        resultados={ot.filas.length}
        total={turnosOrd.length}
        hayFiltros={hayFiltrosTurno}
        onLimpiar={limpiarTurno}
        orden={{
          actual: ot.orden.campo,
          columnas: COLS_TURNO,
          direccion: ot.orden.direccion,
          onCampo: (campo) => ot.setOrden({ campo: campo as ColTurno, direccion: ot.orden.direccion }),
          onDireccion: () =>
            ot.setOrden({ campo: ot.orden.campo, direccion: ot.orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {turnosOrd.length === 0 ? (
        <Vacio icono="📅" titulo="Sin turnos registrados" texto="Los turnos que agendes aparecen acá." />
      ) : ot.filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún turno coincide con esos filtros"
          texto="Probá con otra búsqueda o cambiá el estado."
          accion={
            <button type="button" className="btn secundario" onClick={limpiarTurno}>
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
                  <Th campo="fecha" orden={ot.orden} alternar={ot.alternar}>Fecha</Th>
                  <Th campo="hora" orden={ot.orden} alternar={ot.alternar}>Hora</Th>
                  <Th campo="cliente" orden={ot.orden} alternar={ot.alternar}>Cliente</Th>
                  <Th campo="duracion" orden={ot.orden} alternar={ot.alternar}>Duración</Th>
                  <Th campo="tipo" orden={ot.orden} alternar={ot.alternar}>Tipo</Th>
                  <Th campo="estado" orden={ot.orden} alternar={ot.alternar}>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {ot.filas.map((t) => (
                  <tr key={t._id}>
                    <td data-label="Fecha">{t.fecha}</td>
                    <td data-label="Hora" style={{ fontFamily: 'DM Mono,monospace' }}>{t.hora || '—'}</td>
                    <td data-label="Cliente"><strong>{t.cliente}</strong></td>
                    <td data-label="Duración">{t.duracion}</td>
                    <td data-label="Tipo">{t.tipo}</td>
                    <td data-label="Estado">
                      <span className={`badge ${t.realizado ? 'ok' : 'pendiente'}`}>
                        {t.realizado ? '✓ Realizado' : '○ Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn secundario sm"
        style={{ marginBottom: 20 }}
        onClick={() =>
          bajar(
            'turnos.csv',
            csvRows([
              ['Fecha', 'Hora', 'Cliente', 'Duración', 'Tipo', 'Estado'],
              ...ot.filas.map((x) => [x.fecha, x.hora || '', x.cliente, x.duracion, x.tipo, x.realizado ? 'Realizado' : 'Pendiente']),
            ]),
            ot.filas.length,
            'turnos'
          )
        }
      >
        ⬇ Descargar turnos CSV
      </button>

      {/* ── Prospectos ── */}
      <div className="section-title" style={{ marginBottom: 12 }}>🌱 Prospectos</div>

      <BarraFiltros
        busqueda={bProspecto}
        onBusqueda={setBProspecto}
        placeholder="Buscar por nombre, zona o tipo…"
        resultados={op.filas.length}
        total={prospectos.length}
        hayFiltros={bProspecto.trim() !== ''}
        onLimpiar={() => setBProspecto('')}
        orden={{
          actual: op.orden.campo,
          columnas: COLS_PROSPECTO,
          direccion: op.orden.direccion,
          onCampo: (campo) => op.setOrden({ campo: campo as ColProspecto, direccion: op.orden.direccion }),
          onDireccion: () =>
            op.setOrden({ campo: op.orden.campo, direccion: op.orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
      />

      {prospectos.length === 0 ? (
        <Vacio icono="🌱" titulo="Sin prospectos" texto="Los contactos que todavía no son clientes aparecen acá." />
      ) : op.filas.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún prospecto coincide con esa búsqueda"
          texto="Probá con otro nombre o zona."
          accion={
            <button type="button" className="btn secundario" onClick={() => setBProspecto('')}>
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
                  <Th campo="nombre" orden={op.orden} alternar={op.alternar}>Nombre</Th>
                  <Th campo="zona" orden={op.orden} alternar={op.alternar}>Zona</Th>
                  <Th campo="tipoTrabajo" orden={op.orden} alternar={op.alternar}>Tipo</Th>
                  <Th campo="frecuencia" orden={op.orden} alternar={op.alternar}>Frecuencia</Th>
                  <Th campo="estado" orden={op.orden} alternar={op.alternar}>Estado</Th>
                  <Th>Notas</Th>
                </tr>
              </thead>
              <tbody>
                {op.filas.map((p) => (
                  <tr key={p._id}>
                    <td data-label="Nombre"><strong>{p.nombre}</strong></td>
                    <td data-label="Zona">{p.zona}</td>
                    <td data-label="Tipo">{p.tipoTrabajo}</td>
                    <td data-label="Frecuencia">{p.frecuencia}</td>
                    <td data-label="Estado"><span className="badge pendiente">{p.estado}</span></td>
                    <td data-label="Notas" style={{ fontSize: 12, color: '#888' }}>{p.notas || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn secundario sm"
        onClick={() =>
          bajar(
            'prospectos.csv',
            csvRows([
              ['Nombre', 'Zona', 'Tipo', 'Frecuencia', 'Estado', 'Notas'],
              ...op.filas.map((p) => [p.nombre, p.zona, p.tipoTrabajo, p.frecuencia, p.estado, p.notas || '']),
            ]),
            op.filas.length,
            'prospectos'
          )
        }
      >
        ⬇ Descargar prospectos CSV
      </button>
    </>
  );
}
