import { useMemo, useRef, useState } from 'react';
import { todayISO } from '@/lib/format';
import { LABEL_EGRESO, NOMBRES_CUENTA, csvEscape, downloadCsv, mesClaveRef } from '@/lib/j2local';
import type { J2Egreso, J2EgresoTipo } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';
import { useOrden, Th, BarraFiltros, coincideAlguno } from '@/components/Tabla';
import { Modal, ModalAcciones } from '@/components/Modal';
import { Vacio } from '@/components/Estados';

const CATS_FIJO = ['Monotributo', 'Seguro', 'Mutual', 'Marketing', 'ChatGPT', 'Claude', 'Otro'];

const TIPOS_EGRESO: J2EgresoTipo[] = ['fijo', 'varios', 'sueldo', 'mercaderia', 'inventario', 'bancario'];

/** Columnas por las que se puede ordenar el historial. */
type ColEgreso = 'fecha' | 'tipo' | 'categoria' | 'concepto' | 'monto' | 'cuenta';

const COLUMNAS_EGRESO = [
  { valor: 'fecha', label: 'Fecha' },
  { valor: 'tipo', label: 'Tipo' },
  { valor: 'categoria', label: 'Categoría' },
  { valor: 'concepto', label: 'Concepto' },
  { valor: 'monto', label: 'Monto' },
  { valor: 'cuenta', label: 'Cuenta' },
];

/** Pasa "2026-09" a "Septiembre 2026" para el filtro de mes. */
function nombreMes(clave: string) {
  const [anio, mes] = clave.split('-');
  const nombres = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return `${nombres[Number(mes) - 1] || mes} ${anio}`;
}

export function EgresosPage() {
  const { toast, toastDeshacer } = useToast();
  const j2 = useJ2Local();
  const mc = mesClaveRef();

  // Formulario de alta (ahora vive dentro del modal)
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<J2EgresoTipo>('fijo');
  const [categoria, setCategoria] = useState(CATS_FIJO[0]);
  const [empleado, setEmpleado] = useState('');
  const empleadoRef = useRef<HTMLSelectElement>(null);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [cuenta, setCuenta] = useState<'mp' | 'banco' | 'efectivo'>('mp');

  // Filtros del historial
  const [busqueda, setBusqueda] = useState('');
  const [fTipo, setFTipo] = useState<'todos' | J2EgresoTipo>('todos');
  const [fCuenta, setFCuenta] = useState('todas');
  const [fMes, setFMes] = useState('todos');

  const empleadosActivos = j2.empleados.filter((e) => e.activo);

  const stats = useMemo(() => {
    const fijos   = j2.egresos.filter((e) => e.tipo === 'fijo'        && e.fecha.startsWith(mc));
    const varios  = j2.egresos.filter((e) => e.tipo === 'varios'       && e.fecha.startsWith(mc));
    const sueldos = j2.egresos.filter((e) => e.tipo === 'sueldo'       && e.fecha.startsWith(mc));
    const mercs   = j2.egresos.filter((e) => e.tipo === 'mercaderia'   && e.fecha.startsWith(mc));
    const invs    = j2.egresos.filter((e) => e.tipo === 'inventario'   && e.fecha.startsWith(mc));
    const bancs   = j2.egresos.filter((e) => e.tipo === 'bancario'     && e.fecha.startsWith(mc));
    const tf = fijos.reduce((s, e) => s + e.monto, 0);
    const tv = varios.reduce((s, e) => s + e.monto, 0);
    const ts = sueldos.reduce((s, e) => s + e.monto, 0);
    const tm = mercs.reduce((s, e) => s + e.monto, 0);
    const ti = invs.reduce((s, e) => s + e.monto, 0);
    const tb = bancs.reduce((s, e) => s + e.monto, 0);
    return { fijos, varios, sueldos, mercs, invs, bancs, tf, tv, ts, tm, ti, tb, total: tf + tv + ts + tm + ti + tb };
  }, [j2.egresos, mc]);

  /** Meses que realmente tienen egresos cargados, del más nuevo al más viejo. */
  const meses = useMemo(() => {
    const claves = new Set<string>();
    j2.egresos.forEach((e) => {
      if (e.fecha) claves.add(e.fecha.slice(0, 7));
    });
    return [...claves].sort((a, b) => b.localeCompare(a));
  }, [j2.egresos]);

  /** Cuentas de pago que aparecen en los egresos cargados. */
  const cuentasUsadas = useMemo(() => {
    const claves = new Set<string>();
    j2.egresos.forEach((e) => claves.add(e.cuenta));
    return [...claves];
  }, [j2.egresos]);

  const filtradas = useMemo(
    () =>
      j2.egresos.filter((e) => {
        if (fTipo !== 'todos' && e.tipo !== fTipo) return false;
        if (fCuenta !== 'todas' && e.cuenta !== fCuenta) return false;
        if (fMes !== 'todos' && !e.fecha.startsWith(fMes)) return false;
        return coincideAlguno([e.concepto, e.categoria, LABEL_EGRESO[e.tipo]], busqueda);
      }),
    [j2.egresos, fTipo, fCuenta, fMes, busqueda]
  );

  const valoresEgreso = useMemo(
    () => ({
      fecha: (e: J2Egreso) => e.fecha,
      tipo: (e: J2Egreso) => LABEL_EGRESO[e.tipo],
      categoria: (e: J2Egreso) => e.categoria,
      concepto: (e: J2Egreso) => e.concepto,
      monto: (e: J2Egreso) => e.monto,
      cuenta: (e: J2Egreso) => NOMBRES_CUENTA[e.cuenta] || e.cuenta,
    }),
    []
  );

  const { filas: lista, orden, alternar, setOrden } = useOrden<J2Egreso, ColEgreso>(
    filtradas,
    valoresEgreso,
    { campo: 'fecha', direccion: 'desc' }
  );

  const hayFiltros = busqueda.trim() !== '' || fTipo !== 'todos' || fCuenta !== 'todas' || fMes !== 'todos';

  function limpiarFiltros() {
    setBusqueda('');
    setFTipo('todos');
    setFCuenta('todas');
    setFMes('todos');
  }

  function abrirAlta() {
    setConcepto('');
    setMonto('');
    setFecha(todayISO());
    setAbierto(true);
  }

  function registrar() {
    const m = parseInt(monto, 10);
    if (!m || m <= 0) {
      toast('⚠ Ingresá un monto válido', { tono: 'error' });
      return;
    }
    if (!fecha) {
      toast('⚠ Elegí una fecha', { tono: 'error' });
      return;
    }
    // Leer el empleado directo del DOM para evitar problemas de estado
    const empleadoVal = tipo === 'sueldo'
      ? (empleadoRef.current?.value || empleado)
      : '';
    if (tipo === 'sueldo' && !empleadoVal) {
      toast('⚠ Seleccioná un empleado', { tono: 'error' });
      return;
    }
    const cat =
      tipo === 'fijo' ? categoria
      : tipo === 'sueldo' ? empleadoVal
      : LABEL_EGRESO[tipo] || 'Varios';
    try {
      j2.addEgreso({
        fecha,
        tipo,
        categoria: cat,
        concepto: concepto.trim() || cat,
        monto: m,
        cuenta: tipo === 'inventario' ? 'efectivo' : cuenta,
      });
    } catch {
      toast('No se pudo registrar el egreso', { tono: 'error' });
      return;
    }
    setConcepto('');
    setMonto('');
    setAbierto(false);
    toast(`✓ Egreso de $${m.toLocaleString('es-AR')} registrado`, { tono: 'exito' });
  }

  function csvEgresos() {
    const filas = [['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Monto', 'Cuenta']];
    lista.forEach((e) =>
      filas.push([
        e.fecha,
        e.tipo,
        e.categoria,
        e.concepto,
        String(e.monto),
        NOMBRES_CUENTA[e.cuenta] || e.cuenta,
      ])
    );
    return filas.map((r) => r.map(csvEscape).join(',')).join('\n');
  }

  function descargarCsv() {
    if (lista.length === 0) {
      toast('No hay egresos para exportar', { tono: 'error' });
      return;
    }
    downloadCsv('egresos.csv', csvEgresos());
    toast(`✓ ${lista.length} egresos exportados a CSV`, { tono: 'exito' });
  }

  const totalRegs =
    stats.fijos.length + stats.varios.length + stats.sueldos.length + stats.mercs.length + stats.invs.length + stats.bancs.length;

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          Egresos <small>Gastos fijos, mercadería y más</small>
        </div>
        <button type="button" className="btn" onClick={abrirAlta}>
          ➕ Registrar egreso
        </button>
      </div>

      <div className="cards-grid">
        <div className="card rojo">
          <div className="card-label">Gastos Fijos del Mes</div>
          <div className="card-valor">${stats.tf.toLocaleString('es-AR')}</div>
          <div className="card-sub">
            {stats.fijos.length ? stats.fijos.map((e) => e.categoria).join(' · ') : '—'}
          </div>
        </div>
        <div className="card amarillo">
          <div className="card-label">Gastos Varios del Mes</div>
          <div className="card-valor">${(stats.tv + stats.ts + stats.tm + stats.ti + stats.tb).toLocaleString('es-AR')}</div>
          <div className="card-sub">
            {[
              stats.varios.length && `Varios $${stats.tv.toLocaleString('es-AR')}`,
              stats.sueldos.length && `Sueldos $${stats.ts.toLocaleString('es-AR')}`,
              stats.mercs.length && `Merc. $${stats.tm.toLocaleString('es-AR')}`,
              stats.invs.length && `Inv. $${stats.ti.toLocaleString('es-AR')}`,
              stats.bancs.length && `Banc. $${stats.tb.toLocaleString('es-AR')}`,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </div>
        </div>
        <div className="card tierra">
          <div className="card-label">Total Egresos del Mes</div>
          <div className="card-valor">${stats.total.toLocaleString('es-AR')}</div>
          <div className="card-sub">{totalRegs} registros</div>
        </div>
      </div>

      <div className="section-title" style={{ margin: '20px 0 12px' }}>
        📋 Historial de egresos
      </div>

      <BarraFiltros
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar por concepto o categoría…"
        filtros={[
          {
            id: 'tipo-egreso',
            label: 'Tipo',
            valor: fTipo,
            opciones: [
              { valor: 'todos', label: 'Todos' },
              ...TIPOS_EGRESO.map((t) => ({ valor: t, label: LABEL_EGRESO[t] })),
            ],
            onCambio: (v) => setFTipo(v as 'todos' | J2EgresoTipo),
          },
          {
            id: 'cuenta-egreso',
            label: 'Cuenta',
            valor: fCuenta,
            opciones: [
              { valor: 'todas', label: 'Todas' },
              ...cuentasUsadas.map((c) => ({ valor: c, label: NOMBRES_CUENTA[c] || c })),
            ],
            onCambio: setFCuenta,
          },
          {
            id: 'mes-egreso',
            label: 'Mes',
            valor: fMes,
            opciones: [
              { valor: 'todos', label: 'Todos' },
              ...meses.map((m) => ({ valor: m, label: nombreMes(m) })),
            ],
            onCambio: setFMes,
          },
        ]}
        resultados={lista.length}
        total={j2.egresos.length}
        hayFiltros={hayFiltros}
        onLimpiar={limpiarFiltros}
        orden={{
          actual: orden.campo,
          columnas: COLUMNAS_EGRESO,
          direccion: orden.direccion,
          onCampo: (campo) => setOrden({ campo: campo as ColEgreso, direccion: orden.direccion }),
          onDireccion: () =>
            setOrden({ campo: orden.campo, direccion: orden.direccion === 'asc' ? 'desc' : 'asc' }),
        }}
        extra={
          <button type="button" className="btn secundario sm" onClick={descargarCsv}>
            ⬇ CSV
          </button>
        }
      />

      {j2.egresos.length === 0 ? (
        <Vacio
          icono="💸"
          titulo="Todavía no cargaste egresos"
          texto="Registrá el primer gasto para empezar a ver los totales del mes."
          accion={
            <button type="button" className="btn" onClick={abrirAlta}>
              ➕ Registrar egreso
            </button>
          }
        />
      ) : lista.length === 0 ? (
        <Vacio
          icono="🔍"
          titulo="Ningún egreso coincide con esos filtros"
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
            <table className="responsive">
              <thead>
                <tr>
                  <Th campo="fecha" orden={orden} alternar={alternar}>Fecha</Th>
                  <Th campo="tipo" orden={orden} alternar={alternar}>Tipo</Th>
                  <Th campo="categoria" orden={orden} alternar={alternar}>Categoría</Th>
                  <Th campo="concepto" orden={orden} alternar={alternar}>Concepto</Th>
                  <Th campo="monto" orden={orden} alternar={alternar}>Monto</Th>
                  <Th campo="cuenta" orden={orden} alternar={alternar}>Cuenta</Th>
                  <Th>Acción</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Fecha" style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{e.fecha}</td>
                    <td data-label="Tipo">
                      <span className="badge pendiente">{LABEL_EGRESO[e.tipo]}</span>
                    </td>
                    <td data-label="Categoría">{e.categoria}</td>
                    <td data-label="Concepto">{e.concepto}</td>
                    <td data-label="Monto" style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, color: 'var(--rojo)' }}>
                      -${e.monto.toLocaleString('es-AR')}
                    </td>
                    <td data-label="Cuenta">{NOMBRES_CUENTA[e.cuenta]}</td>
                    <td data-label="Acción">
                      <button
                        type="button"
                        aria-label={`Eliminar egreso de ${e.categoria}`}
                        onClick={() => {
                          j2.removeEgreso(e.id);
                          toastDeshacer(
                            `Egreso de $${e.monto.toLocaleString('es-AR')} eliminado`,
                            j2.deshacer
                          );
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid rgba(192,57,43,0.3)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          color: 'var(--rojo)',
                        }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abierto && (
        <Modal
          titulo="Registrar egreso"
          descripcion="Queda guardado en el historial y descuenta de la cuenta elegida."
          onCerrar={() => setAbierto(false)}
          ancho="normal"
        >
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              registrar();
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="egresos-tipo">Tipo</label>
                <select
                  id="egresos-tipo"
                  value={tipo}
                  onChange={(e) => {
                    const t = e.target.value as J2EgresoTipo;
                    setTipo(t);
                    // Al elegir sueldo, pre-seleccionar el primer empleado activo si el state está vacío
                    if (t === 'sueldo' && !empleado && empleadosActivos.length > 0) {
                      setEmpleado(empleadosActivos[0].nombre);
                    }
                  }}
                >
                  <option value="fijo">Gasto fijo</option>
                  <option value="varios">Gasto varios</option>
                  <option value="sueldo">Sueldo / Empleado</option>
                  <option value="mercaderia">Compra / Mercadería</option>
                  <option value="inventario">Diferencia de inventario</option>
                  <option value="bancario">Mov. bancario negativo</option>
                </select>
              </div>
              {tipo === 'fijo' && (
                <div className="form-group">
                  <label htmlFor="egresos-categoria-1">Categoría</label>
                  <select id="egresos-categoria-1" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                    {CATS_FIJO.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
              {tipo === 'sueldo' && (
                <div className="form-group">
                  <label htmlFor="egresos-empleado">Empleado</label>
                  <select
                    id="egresos-empleado"
                    ref={empleadoRef}
                    defaultValue=""
                    onChange={(e) => setEmpleado(e.target.value)}
                  >
                    <option value="" disabled>— Seleccioná un empleado —</option>
                    {empleadosActivos.map((e) => (
                      <option key={e.id} value={e.nombre}>{e.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="egresos-concepto-detalle-2">Concepto / Detalle</label>
                <input id="egresos-concepto-detalle-2" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="egresos-monto-3">Monto</label>
                <input id="egresos-monto-3" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="egresos-fecha-4">Fecha</label>
                <input id="egresos-fecha-4" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              {tipo !== 'inventario' && (
                <div className="form-group">
                  <label htmlFor="egresos-cuenta-de-pago-5">Cuenta de pago</label>
                  <select id="egresos-cuenta-de-pago-5" value={cuenta} onChange={(e) => setCuenta(e.target.value as 'mp' | 'banco' | 'efectivo')}>
                    <option value="mp">Mercado Pago</option>
                    <option value="banco">Banco</option>
                    <option value="efectivo">Efectivo</option>
                  </select>
                </div>
              )}
            </div>
            <ModalAcciones onCancelar={() => setAbierto(false)} textoConfirmar="Registrar egreso" />
          </form>
        </Modal>
      )}
    </>
  );
}
