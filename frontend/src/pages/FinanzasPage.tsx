import { Fragment, useRef, useState, type ReactNode } from 'react';
import { money, todayISO } from '@/lib/format';
import { NOMBRES_CUENTA } from '@/lib/j2local';
import { nombreCuenta } from '@/lib/j2reducer';
import { CATALOGO_MONEDAS, formatoCantidad, nombreMoneda } from '@/lib/monedas';
import { useJ2Local } from '@/context/J2LocalContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones, ModalAnular } from '@/components/Modal';
import type { J2Credito, J2Inversion } from '@/types';

type MonedaOp = 'comprar' | 'vender' | 'precio' | null;
type Liquida = 'mp' | 'banco' | 'efectivo';
type TipoCapital = 'aporte' | 'retiro' | 'credito';

const LIQUIDAS: Liquida[] = ['mp', 'banco', 'efectivo'];
const SUGERENCIAS_INVERSION = [
  'Fondo Mercado Pago',
  'Ualá',
  'Naranja X',
  'Plazo fijo',
  'COCOS Capital',
  'Balanz',
  'InvertirOnline',
];
const TITULO_CAPITAL: Record<TipoCapital, string> = {
  aporte: 'Aporte de capital',
  retiro: 'Retiro de socio',
  credito: 'Crédito recibido',
};
const AYUDA_CAPITAL: Record<TipoCapital, string> = {
  aporte: 'Plata que pone un socio en el negocio. Entra a caja pero no cuenta como ingreso del mes.',
  retiro: 'Plata que un socio saca para uso personal. Sale de caja o de una inversión pero no cuenta como gasto del negocio.',
  credito: 'Préstamo de un banco o financiera. Entra a caja y queda como deuda; las cuotas se cargan abajo.',
};

export function FinanzasPage() {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const j2 = useJ2Local();
  const refTransferencia = useRef<HTMLDivElement>(null);

  const [editCuenta, setEditCuenta] = useState<Liquida | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [editMotivo, setEditMotivo] = useState('');

  const [trDe, setTrDe] = useState('mp');
  const [trPara, setTrPara] = useState('banco');
  const [trMonto, setTrMonto] = useState('');
  const [trFecha, setTrFecha] = useState(todayISO());
  const [trNota, setTrNota] = useState('');

  const [capTipo, setCapTipo] = useState<TipoCapital>('aporte');
  const [capMonto, setCapMonto] = useState('');
  const [capCuenta, setCapCuenta] = useState('banco');
  const [capFecha, setCapFecha] = useState(todayISO());
  const [capQuien, setCapQuien] = useState(usuario?.nombre ?? '');
  const [capNota, setCapNota] = useState('');
  const [capCuotas, setCapCuotas] = useState('');
  const [capPrevio, setCapPrevio] = useState(false);
  const previo = capTipo === 'credito' && capPrevio;

  const [cuota, setCuota] = useState<J2Credito | null>(null);
  const [cuTotal, setCuTotal] = useState('');
  const [cuInteres, setCuInteres] = useState('');
  const [verPagos, setVerPagos] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<{ tipo: 'credito' | 'inversion'; id: string; nombre: string; actual: number } | null>(null);
  const [ajSaldo, setAjSaldo] = useState('');
  const [ajMotivo, setAjMotivo] = useState('');
  const [cuCuenta, setCuCuenta] = useState<Liquida>('banco');
  const [cuFecha, setCuFecha] = useState(todayISO());

  const [nuevaInv, setNuevaInv] = useState('');
  const [rendInv, setRendInv] = useState<J2Inversion | null>(null);
  const [rendMonto, setRendMonto] = useState('');
  const [rendFecha, setRendFecha] = useState(todayISO());

  const [anular, setAnular] = useState<{ titulo: string; mensaje: ReactNode; hacer: (motivo: string) => void } | null>(null);

  const [monOp, setMonOp] = useState<MonedaOp>(null);
  const [monCodigo, setMonCodigo] = useState('USD');
  const [monOtroCodigo, setMonOtroCodigo] = useState('');
  const [monOtroNombre, setMonOtroNombre] = useState('');
  const [monPrecio, setMonPrecio] = useState('');
  const [monCant, setMonCant] = useState('');
  const [monCuenta, setMonCuenta] = useState<Liquida>('banco');
  const [monMotivo, setMonMotivo] = useState('');

  const c = j2.cuentas;
  const inv = j2.inversiones;
  const activas = inv.items.filter((i) => i.activa);
  const archivadas = inv.items.filter((i) => !i.activa);
  const monedaDe = (codigo: string) => inv.monedas.find((m) => m.codigo === codigo);
  const creditosVigentes = inv.creditos.filter((x) => !x.anulado && x.saldo > 0);
  const deudaCreditos = creditosVigentes.reduce((s, x) => s + x.saldo, 0);
  const nombre = (k: string) => nombreCuenta(k, inv);
  const cuentasTransferibles = [...LIQUIDAS, ...activas.map((i) => i.id)];

  function opcionesCuentas(conInversiones: boolean) {
    return (
      <>
        {LIQUIDAS.map((k) => (
          <option key={k} value={k}>{NOMBRES_CUENTA[k]}</option>
        ))}
        {conInversiones &&
          activas.map((i) => (
            <option key={i.id} value={i.id}>{i.nombre}</option>
          ))}
      </>
    );
  }

  function guardarCuenta() {
    if (!editCuenta) return;
    const m = parseInt(editMonto, 10);
    if (Number.isNaN(m)) { toast('Ingresá un monto válido', { tono: 'error' }); return; }
    if (!editMotivo.trim()) { toast('Ingresá el motivo de la corrección', { tono: 'error' }); return; }
    j2.setCuentaSaldo(editCuenta, m, editMotivo.trim());
    setEditCuenta(null);
    setEditMotivo('');
    toast('Saldo actualizado', { tono: 'exito' });
  }

  function prepararTransferencia(de: string, para: string) {
    setTrDe(de);
    setTrPara(para);
    setTrMonto('');
    refTransferencia.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function registrarTr() {
    if (trDe === trPara) { toast('Elegí origen y destino distintos', { tono: 'error' }); return; }
    const m = parseInt(trMonto, 10);
    if (!m || m <= 0) { toast('Ingresá un monto válido', { tono: 'error' }); return; }
    j2.registrarTransferencia({ de: trDe, para: trPara, monto: m, fecha: trFecha, nota: trNota.trim() });
    setTrMonto('');
    setTrNota('');
    toast(`Transferencia registrada: ${nombre(trDe)} → ${nombre(trPara)}`, { tono: 'exito' });
  }

  function registrarCapital() {
    const m = parseInt(capMonto, 10);
    if (!m || m <= 0) { toast('Ingresá un monto válido', { tono: 'error' }); return; }
    if (!capQuien.trim()) {
      toast(capTipo === 'credito' ? 'Ingresá el banco o la financiera' : 'Ingresá el nombre del socio', { tono: 'error' });
      return;
    }
    if (capTipo === 'credito') {
      const cuotas = parseInt(capCuotas, 10);
      j2.recibirCredito({
        fecha: capFecha,
        entidad: capQuien.trim(),
        monto: m,
        cuenta: capPrevio ? 'credito' : capCuenta,
        cuotas: cuotas > 0 ? cuotas : undefined,
        nota: capNota.trim(),
        previo: capPrevio || undefined,
      });
      setCapCuotas('');
    } else {
      j2.movCapital({ fecha: capFecha, tipo: capTipo, socio: capQuien.trim(), monto: m, cuenta: capCuenta, nota: capNota.trim() });
    }
    toast(
      capTipo === 'credito' && capPrevio
        ? `Deuda registrada · ${money(m)} (la caja no cambia)`
        : `${TITULO_CAPITAL[capTipo]} registrado · ${money(m)}`,
      { tono: 'exito' }
    );
    setCapPrevio(false);
    setCapMonto('');
    setCapNota('');
  }

  function cambiarTipoCapital(t: TipoCapital) {
    setCapTipo(t);
    setCapQuien(t === 'credito' ? '' : usuario?.nombre ?? '');
    if (t !== 'retiro' && !LIQUIDAS.includes(capCuenta as Liquida)) setCapCuenta('banco');
  }

  function abrirCuota(cr: J2Credito) {
    setCuota(cr);
    setCuTotal('');
    setCuInteres('');
    setCuFecha(todayISO());
  }

  function pagarCuota() {
    if (!cuota) return;
    const total = Number(cuTotal) || 0;
    const interes = Number(cuInteres) || 0;
    if (total <= 0) { toast('Ingresá el total de la cuota', { tono: 'error' }); return; }
    if (interes < 0 || interes > total) { toast('El interés tiene que estar entre 0 y el total de la cuota', { tono: 'error' }); return; }
    if (total - interes > cuota.saldo) {
      toast(`El capital (${money(total - interes)}) supera lo que se debe (${money(cuota.saldo)}). Revisá los montos o ajustá la deuda.`, { tono: 'error' });
      return;
    }
    j2.pagarCuotaCredito({ creditoId: cuota.id, total, interes, cuenta: cuCuenta, fecha: cuFecha });
    toast(`Cuota pagada · ${money(total)}`, { tono: 'exito' });
    setCuota(null);
  }

  function abrirAjuste(tipo: 'credito' | 'inversion', id: string, nombreItem: string, actual: number) {
    setAjuste({ tipo, id, nombre: nombreItem, actual });
    setAjSaldo(String(actual));
    setAjMotivo('');
  }

  function guardarAjuste() {
    if (!ajuste) return;
    const n = Number(ajSaldo);
    if (!Number.isFinite(n) || n < 0) { toast('Ingresá un saldo válido', { tono: 'error' }); return; }
    if (!ajMotivo.trim()) { toast('Contá el motivo del ajuste', { tono: 'error' }); return; }
    if (n === ajuste.actual) { setAjuste(null); return; }
    if (ajuste.tipo === 'credito') j2.ajustarCredito(ajuste.id, n, ajMotivo.trim());
    else j2.corregirInversion(ajuste.id, n, ajMotivo.trim());
    toast(`Saldo de ${ajuste.nombre} ajustado a ${money(n)}`, { tono: 'exito' });
    setAjuste(null);
  }

  function pedirAnularCredito(cr: J2Credito) {
    if (cr.pagos.some((p) => !p.anulado)) {
      toast('Este crédito tiene cuotas pagas. Anulá primero las cuotas, o usá "Ajustar deuda" si sólo cambió el saldo.', { tono: 'error' });
      return;
    }
    setAnular({
      titulo: 'Anular crédito',
      mensaje: cr.previo
        ? <>Se anula la deuda con <strong>{cr.entidad}</strong> por <strong>{money(cr.monto)}</strong>. La caja no cambia.</>
        : <>Se anula el crédito de <strong>{cr.entidad}</strong> por <strong>{money(cr.monto)}</strong> y esa plata sale de {nombre(cr.cuenta)}.</>,
      hacer: (motivo) => j2.anularCredito(cr.id, motivo),
    });
  }

  function agregarInversion() {
    const n = nuevaInv.trim();
    if (!n) { toast('Escribí el nombre de la inversión', { tono: 'error' }); return; }
    if (inv.items.some((i) => i.nombre.toLowerCase() === n.toLowerCase())) {
      toast(`${n} ya existe. Si está archivada, reactivala desde abajo.`, { tono: 'error' });
      return;
    }
    j2.addInversion(n);
    setNuevaInv('');
    toast(`${n} agregada`, { tono: 'exito' });
  }

  function archivar(i: J2Inversion) {
    if (Math.abs(i.saldo) > 0.5) {
      toast(`${i.nombre} tiene ${money(i.saldo)}. Rescatala a una cuenta o registrá un retiro de socio antes de archivarla.`, { tono: 'error' });
      return;
    }
    j2.toggleInversion(i.id);
    toast(`${i.nombre} archivada`, { tono: 'exito' });
  }

  function guardarRendimiento() {
    if (!rendInv) return;
    const m = Number(rendMonto);
    if (!m) { toast('Ingresá el monto (negativo si fue pérdida)', { tono: 'error' }); return; }
    j2.rendimientoInversion(rendInv.id, m, rendFecha);
    toast(`${m > 0 ? 'Rendimiento' : 'Pérdida'} registrado en ${rendInv.nombre}`, { tono: 'exito' });
    setRendInv(null);
  }

  function abrirMoneda(op: NonNullable<MonedaOp>, codigo: string) {
    setMonOp(op);
    setMonCodigo(codigo);
    setMonOtroCodigo('');
    setMonOtroNombre('');
    setMonPrecio(String(monedaDe(codigo)?.precio || ''));
    setMonCant('');
    setMonMotivo('');
  }

  function guardarMoneda() {
    const otra = monCodigo === 'OTRA';
    const codigo = (otra ? monOtroCodigo : monCodigo).trim().toUpperCase();
    const nombre = otra ? monOtroNombre.trim() || codigo : monedaDe(codigo)?.nombre ?? nombreMoneda(codigo);
    if (!codigo) { toast('Escribí el código de la moneda (ej: CAD)', { tono: 'error' }); return; }
    const precio = parseFloat(monPrecio);
    if (Number.isNaN(precio) || precio <= 0) { toast('Cotización inválida', { tono: 'error' }); return; }
    if (monOp === 'precio') {
      j2.actualizarPrecioMoneda(codigo, precio);
      setMonOp(null);
      toast(`Cotización de ${nombre} actualizada`, { tono: 'exito' });
      return;
    }
    const cant = parseFloat(monCant);
    if (Number.isNaN(cant) || cant <= 0) { toast('Cantidad inválida', { tono: 'error' }); return; }
    if (monOp === 'vender' && cant > (monedaDe(codigo)?.cantidad || 0)) {
      toast(`No tenés suficiente ${nombre}`, { tono: 'error' });
      return;
    }
    j2.operarMoneda({
      codigo,
      nombre,
      operacion: monOp === 'comprar' ? 'compra' : 'venta',
      cantidad: cant,
      precio,
      cuenta: monCuenta,
      motivo: monMotivo.trim(),
    });
    toast(`${monOp === 'comprar' ? 'Compra' : 'Venta'} de ${formatoCantidad(cant)} ${codigo} registrada`, { tono: 'exito' });
    setMonOp(null);
  }

  const trList = [...j2.transferencias].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const capList = [...inv.capital].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const credList = [...inv.creditos].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <>
      <div className="section-header">
        <div className="section-title">Finanzas <small>Cuentas · Capital y créditos · Inversiones</small></div>
      </div>

      <div className="section-title" style={{ marginBottom: 12 }}>💳 Saldos de cuentas</div>
      <div className="cards-grid" style={{ marginBottom: 8 }}>
        {LIQUIDAS.map((k) => (
          <div key={k} className={k === 'banco' ? 'card azul' : k === 'efectivo' ? 'card tierra' : 'card'}>
            <div className="card-label">{NOMBRES_CUENTA[k]}</div>
            <div className="card-valor">{money(c[k] || 0)}</div>
            <button type="button" className="btn secundario sm" onClick={() => { setEditCuenta(k); setEditMonto(String(c[k] ?? 0)); setEditMotivo(''); }}>
              ✏ Corregir saldo
            </button>
          </div>
        ))}
        <div className="card rojo">
          <div className="card-label">Deuda por créditos</div>
          <div className="card-valor">{money(deudaCreditos)}</div>
          <div className="card-sub">
            {creditosVigentes.length === 0
              ? 'Sin créditos pendientes'
              : `${creditosVigentes.length} crédito${creditosVigentes.length === 1 ? '' : 's'} pendiente${creditosVigentes.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      {editCuenta && (
        <div className="tabla-wrap" style={{ padding: 16, marginBottom: 20 }}>
          <div className="alerta aviso" style={{ marginBottom: 12 }}>
            Usá esto sólo para correcciones puntuales. Si entró plata de un crédito o de un socio, cargala en "Capital y créditos".
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 180 }}>
              <label htmlFor="fin-nuevo-saldo">Nuevo saldo — {NOMBRES_CUENTA[editCuenta]}</label>
              <input id="fin-nuevo-saldo" type="number" value={editMonto} onChange={(e) => setEditMonto(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 2, minWidth: 220 }}>
              <label htmlFor="fin-motivo">Motivo de la corrección</label>
              <input id="fin-motivo" value={editMotivo} onChange={(e) => setEditMotivo(e.target.value)} placeholder="Ej: Arqueo de caja del viernes" />
            </div>
            <button type="button" className="btn" onClick={guardarCuenta}>Guardar</button>
            <button type="button" className="btn secundario" onClick={() => setEditCuenta(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="sep" />

      <div className="section-title" style={{ marginBottom: 12 }}>🤝 Capital y créditos</div>
      <div className="tabla-wrap" style={{ padding: 20, marginBottom: 20 }}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="fin-cap-tipo">Tipo de movimiento</label>
            <select id="fin-cap-tipo" value={capTipo} onChange={(e) => cambiarTipoCapital(e.target.value as TipoCapital)}>
              <option value="aporte">Aporte de capital (entra)</option>
              <option value="credito">Crédito recibido (entra)</option>
              <option value="retiro">Retiro de socio (sale)</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fin-cap-quien">{capTipo === 'credito' ? 'Banco o financiera' : 'Socio'}</label>
            <input
              id="fin-cap-quien"
              value={capQuien}
              onChange={(e) => setCapQuien(e.target.value)}
              placeholder={capTipo === 'credito' ? 'Ej: Banco Nación' : 'Ej: Carlos'}
            />
          </div>
          <div className="form-group">
            <label htmlFor="fin-cap-monto">{previo ? 'Lo que falta pagar hoy' : 'Monto'}</label>
            <input id="fin-cap-monto" type="number" inputMode="numeric" min="0" value={capMonto} onChange={(e) => setCapMonto(e.target.value)} />
            {previo && <p className="form-ayuda">Sumá las cuotas que te quedan. Ej: 4 cuotas de $72.000 = 288.000.</p>}
          </div>
          {!previo && (
            <div className="form-group">
              <label htmlFor="fin-cap-cuenta">{capTipo === 'retiro' ? 'Sale de' : 'Entra a'}</label>
              <select id="fin-cap-cuenta" value={capCuenta} onChange={(e) => setCapCuenta(e.target.value)}>
                {opcionesCuentas(capTipo === 'retiro')}
              </select>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="fin-cap-fecha">Fecha</label>
            <input id="fin-cap-fecha" type="date" value={capFecha} onChange={(e) => setCapFecha(e.target.value)} />
          </div>
          {capTipo === 'credito' && (
            <div className="form-group">
              <label htmlFor="fin-cap-cuotas">{previo ? 'Cuotas que faltan' : 'Cantidad de cuotas'}</label>
              <input id="fin-cap-cuotas" type="number" inputMode="numeric" min="1" value={capCuotas} onChange={(e) => setCapCuotas(e.target.value)} placeholder="Ej: 36" />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="fin-cap-nota">Nota</label>
            <input id="fin-cap-nota" value={capNota} onChange={(e) => setCapNota(e.target.value)} placeholder={capTipo === 'credito' ? 'Ej: tasa fija, para comprar herramientas' : ''} />
          </div>
        </div>
        {capTipo === 'credito' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--txt-md)', marginBottom: 8 }}>
            <input type="checkbox" checked={capPrevio} onChange={(e) => setCapPrevio(e.target.checked)} />
            Es una deuda que ya venía pagando (no sumar plata a la caja)
          </label>
        )}
        <p className="form-ayuda" style={{ marginBottom: 12 }}>
          {previo
            ? 'Se registra solo lo que falta pagar, para que figure en lo que debe la empresa. Desde ahora cada cuota se carga con "Pagar cuota", no como gasto fijo.'
            : AYUDA_CAPITAL[capTipo]}
        </p>
        <button type="button" className="btn" onClick={registrarCapital}>Registrar {TITULO_CAPITAL[capTipo].toLowerCase()}</button>
      </div>

      {credList.length > 0 && (
        <div className="tabla-wrap" style={{ marginBottom: 20 }}>
          <div className="tabla-scroll">
            <table className="responsive">
              <thead><tr><th>Crédito</th><th>Fecha</th><th>Monto</th><th>Cuotas</th><th>Falta pagar</th><th>Acción</th></tr></thead>
              <tbody>
                {credList.map((cr) => {
                  const pagosVigentes = cr.pagos.filter((p) => !p.anulado);
                  const abierto = verPagos === cr.id;
                  return (
                    <Fragment key={cr.id}>
                      <tr style={cr.anulado ? { color: 'var(--texto-3)' } : undefined}>
                        <td data-label="Crédito">
                          <strong>{cr.entidad}</strong>
                          {cr.nota && <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>{cr.nota}</div>}
                          {cr.anulado && <div style={{ fontSize: 12 }}>Anulado el {cr.anulado.fecha}: {cr.anulado.motivo}</div>}
                        </td>
                        <td data-label="Fecha" style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12 }}>{cr.fecha}</td>
                        <td data-label="Monto" style={{ fontFamily: 'var(--fuente-mono)', textDecoration: cr.anulado ? 'line-through' : undefined }}>{money(cr.monto)}</td>
                        <td data-label="Cuotas">{cr.cuotas ? `${pagosVigentes.length} de ${cr.cuotas}` : `${pagosVigentes.length} pagas`}</td>
                        <td data-label="Falta pagar" style={{ fontFamily: 'var(--fuente-mono)', fontWeight: 600, color: cr.anulado ? undefined : cr.saldo > 0 ? 'var(--rojo)' : 'var(--verde-vivo)' }}>
                          {cr.anulado ? 'Anulado' : cr.saldo > 0 ? money(cr.saldo) : 'Cancelado'}
                        </td>
                        <td data-label="Acción">
                          {!cr.anulado && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {cr.saldo > 0 && <button type="button" className="btn sm" onClick={() => abrirCuota(cr)}>Pagar cuota</button>}
                              {(cr.pagos.length > 0 || cr.ajustes.length > 0) && (
                                <button type="button" className="btn secundario sm" onClick={() => setVerPagos(abierto ? null : cr.id)}>
                                  {abierto ? 'Ocultar' : 'Historial'}
                                </button>
                              )}
                              <button type="button" className="btn secundario sm" onClick={() => abrirAjuste('credito', cr.id, cr.entidad, cr.saldo)}>Ajustar deuda</button>
                              <button type="button" className="btn fantasma sm" style={{ color: 'var(--rojo)' }} onClick={() => pedirAnularCredito(cr)}>Anular</button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {abierto && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--superficie-2)' }}>
                            <table style={{ width: '100%', fontSize: 13 }}>
                              <thead><tr><th>Fecha</th><th>Cuota</th><th>Capital</th><th>Interés</th><th>Estado</th><th /></tr></thead>
                              <tbody>
                                {cr.pagos.map((p) => (
                                  <tr key={p.id} style={p.anulado ? { color: 'var(--texto-3)' } : undefined}>
                                    <td style={{ fontFamily: 'var(--fuente-mono)' }}>{p.fecha}</td>
                                    <td style={{ fontFamily: 'var(--fuente-mono)', textDecoration: p.anulado ? 'line-through' : undefined }}>{money(p.capital + p.interes)}</td>
                                    <td style={{ fontFamily: 'var(--fuente-mono)' }}>{money(p.capital)}</td>
                                    <td style={{ fontFamily: 'var(--fuente-mono)' }}>{money(p.interes)}</td>
                                    <td>{p.anulado ? `Anulada: ${p.anulado.motivo}` : 'Pagada'}</td>
                                    <td>
                                      {!p.anulado && (
                                        <button
                                          type="button"
                                          className="btn fantasma sm"
                                          style={{ color: 'var(--rojo)' }}
                                          onClick={() =>
                                            setAnular({
                                              titulo: 'Anular cuota',
                                              mensaje: <>Se anula la cuota del {p.fecha} por <strong>{money(p.capital + p.interes)}</strong>: vuelve la plata a {nombre(p.cuenta)}, la deuda sube {money(p.capital)} y el interés se anula en Egresos.</>,
                                              hacer: (motivo) => j2.anularCuotaCredito(cr.id, p.id, motivo),
                                            })
                                          }
                                        >
                                          Anular
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {cr.ajustes.map((aj) => (
                                  <tr key={aj.id}>
                                    <td style={{ fontFamily: 'var(--fuente-mono)' }}>{aj.fecha}</td>
                                    <td colSpan={3}>Ajuste de deuda {aj.diferencia > 0 ? '+' : '−'}{money(Math.abs(aj.diferencia))}</td>
                                    <td colSpan={2}>{aj.motivo}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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

      {capList.length > 0 && (
        <div className="tabla-wrap" style={{ marginBottom: 24 }}>
          <div className="tabla-scroll">
            <table className="responsive">
              <thead><tr><th>Fecha</th><th>Movimiento</th><th>Socio</th><th>Cuenta</th><th>Monto</th><th /></tr></thead>
              <tbody>
                {capList.map((m) => (
                  <tr key={m.id} style={m.anulado ? { color: 'var(--texto-3)' } : undefined}>
                    <td data-label="Fecha" style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12 }}>{m.fecha}</td>
                    <td data-label="Movimiento">
                      {m.anulado ? (
                        <span className="badge urgente">Anulado</span>
                      ) : (
                        <span className={`badge ${m.tipo === 'aporte' ? 'ok' : 'pendiente'}`}>{m.tipo === 'aporte' ? 'Aporte' : 'Retiro'}</span>
                      )}
                    </td>
                    <td data-label="Socio">
                      {m.socio}
                      {m.nota && <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>{m.nota}</div>}
                      {m.anulado && <div style={{ fontSize: 12 }}>Anulado el {m.anulado.fecha}: {m.anulado.motivo}</div>}
                    </td>
                    <td data-label="Cuenta">{nombre(m.cuenta)}</td>
                    <td data-label="Monto" style={{ fontFamily: 'var(--fuente-mono)', fontWeight: 600, textDecoration: m.anulado ? 'line-through' : undefined }}>
                      {m.tipo === 'aporte' ? '+' : '−'}{money(m.monto)}
                    </td>
                    <td>
                      {!m.anulado && (
                        <button
                          type="button"
                          className="btn fantasma sm"
                          style={{ color: 'var(--rojo)' }}
                          onClick={() =>
                            setAnular({
                              titulo: `Anular ${m.tipo}`,
                              mensaje: <>Se anula el {m.tipo} de <strong>{m.socio}</strong> por <strong>{money(m.monto)}</strong> y {nombre(m.cuenta)} vuelve al saldo anterior.</>,
                              hacer: (motivo) => j2.anularCapital(m.id, motivo),
                            })
                          }
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="sep" />

      <div className="section-title" style={{ marginBottom: 12 }}>📈 Inversiones</div>
      <div className="cards-grid" style={{ marginBottom: 12 }}>
        {activas.map((i) => (
          <div key={i.id} className="card azul">
            <div className="card-label">{i.nombre}</div>
            <div className="card-valor">{money(i.saldo)}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm" onClick={() => prepararTransferencia('banco', i.id)}>Invertir</button>
              <button type="button" className="btn secundario sm" onClick={() => prepararTransferencia(i.id, 'banco')}>Rescatar</button>
              <button type="button" className="btn secundario sm" onClick={() => { setRendInv(i); setRendMonto(''); setRendFecha(todayISO()); }}>Rendimiento</button>
              <button type="button" className="btn fantasma sm" onClick={() => abrirAjuste('inversion', i.id, i.nombre, i.saldo)}>Corregir</button>
              <button type="button" className="btn fantasma sm" onClick={() => archivar(i)}>Archivar</button>
            </div>
          </div>
        ))}
        {inv.monedas.map((m) => (
          <div key={m.codigo} className="card tierra">
            <div className="card-label">{m.nombre}</div>
            <div className="card-valor">{formatoCantidad(m.cantidad)} {m.codigo}</div>
            <div className="card-sub">{money(Math.round(m.cantidad * m.precio))} a {money(m.precio)} c/u</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm" onClick={() => abrirMoneda('comprar', m.codigo)}>Comprar</button>
              <button type="button" className="btn secundario sm" onClick={() => abrirMoneda('vender', m.codigo)}>Vender</button>
              <button type="button" className="btn secundario sm" onClick={() => abrirMoneda('precio', m.codigo)}>Cotización</button>
            </div>
          </div>
        ))}
        <div className="card tierra">
          <div className="card-label">Moneda extranjera</div>
          <div className="card-sub" style={{ marginBottom: 8 }}>Dólar, euro, real, USDT u otra.</div>
          <button type="button" className="btn sm" onClick={() => abrirMoneda('comprar', inv.monedas.length ? 'OTRA' : 'USD')}>
            + Comprar moneda
          </button>
        </div>
      </div>

      <div className="tabla-wrap" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="fin-nueva-inv">Nueva inversión</label>
            <input
              id="fin-nueva-inv"
              list="fin-sugerencias-inv"
              value={nuevaInv}
              onChange={(e) => setNuevaInv(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregarInversion(); }}
              placeholder="Ej: Fondo Mercado Pago, Ualá, plazo fijo…"
            />
            <datalist id="fin-sugerencias-inv">
              {SUGERENCIAS_INVERSION.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <button type="button" className="btn" onClick={agregarInversion}>+ Agregar</button>
        </div>
        <p className="form-ayuda" style={{ marginTop: 8 }}>
          Para poner plata usá "Invertir" (sale de una cuenta). Para sacarla, "Rescatar" a una cuenta o, si es para uso personal, un retiro de socio desde la inversión.
        </p>
      </div>

      {archivadas.length > 0 && (
        <p className="form-ayuda" style={{ marginBottom: 20 }}>
          Archivadas:{' '}
          {archivadas.map((i, idx) => (
            <span key={i.id}>
              {idx > 0 && ' · '}
              {i.nombre}{' '}
              <button type="button" className="btn fantasma sm" onClick={() => j2.toggleInversion(i.id)}>Reactivar</button>
            </span>
          ))}
        </p>
      )}

      <div className="sep" />

      <div ref={refTransferencia} className="section-title" style={{ marginBottom: 12 }}>🔄 Transferencia entre cuentas e inversiones</div>
      <div className="tabla-wrap" style={{ padding: 20, marginBottom: 20 }}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="fin-tr-de">Desde</label>
            <select id="fin-tr-de" value={trDe} onChange={(e) => setTrDe(e.target.value)}>
              {cuentasTransferibles.map((k) => <option key={k} value={k}>{nombre(k)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fin-tr-para">Hacia</label>
            <select id="fin-tr-para" value={trPara} onChange={(e) => setTrPara(e.target.value)}>
              {cuentasTransferibles.map((k) => <option key={k} value={k}>{nombre(k)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fin-tr-monto">Monto</label>
            <input id="fin-tr-monto" type="number" value={trMonto} onChange={(e) => setTrMonto(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="fin-tr-fecha">Fecha</label>
            <input id="fin-tr-fecha" type="date" value={trFecha} onChange={(e) => setTrFecha(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="fin-tr-nota">Nota</label>
            <input id="fin-tr-nota" value={trNota} onChange={(e) => setTrNota(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn" onClick={registrarTr}>Registrar transferencia</button>
      </div>

      <div className="tabla-wrap" style={{ marginBottom: 24 }}>
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Fecha</th><th>Desde</th><th>Hacia</th><th>Monto</th><th>Nota</th><th /></tr></thead>
            <tbody>
              {trList.length === 0 ? (
                <tr><td colSpan={6} style={{ color: 'var(--texto-3)', textAlign: 'center', padding: 16 }}>Sin transferencias</td></tr>
              ) : (
                trList.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12 }}>{t.fecha}</td>
                    <td>{nombre(t.de)}</td>
                    <td>{nombre(t.para)}</td>
                    <td style={{ fontFamily: 'var(--fuente-mono)', fontWeight: 600 }}>{money(t.monto)}</td>
                    <td style={{ fontSize: 12, color: 'var(--texto-2)' }}>{t.nota || '—'}</td>
                    <td><button type="button" className="btn secundario sm" onClick={() => j2.removeTransferencia(t.id)}>🗑</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cuota && (
        <Modal titulo={`Pagar cuota — ${cuota.entidad}`} descripcion={`Falta pagar ${money(cuota.saldo)} de capital.`} onCerrar={() => setCuota(null)} ancho="chico">
          <form onSubmit={(e) => { e.preventDefault(); pagarCuota(); }} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="fin-cu-total">Total de la cuota</label>
                <input id="fin-cu-total" type="number" inputMode="numeric" min="0" value={cuTotal} onChange={(e) => setCuTotal(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label htmlFor="fin-cu-interes">De eso, interés</label>
                <input id="fin-cu-interes" type="number" inputMode="numeric" min="0" value={cuInteres} onChange={(e) => setCuInteres(e.target.value)} />
                <p className="form-ayuda">
                  {cuota.previo
                    ? 'Si cargaste la deuda como suma de las cuotas, dejalo en 0.'
                    : 'Figura en el resumen del banco. Incluí IVA y gastos.'}
                </p>
              </div>
              <div className="form-group">
                <label htmlFor="fin-cu-cuenta">Sale de</label>
                <select id="fin-cu-cuenta" value={cuCuenta} onChange={(e) => setCuCuenta(e.target.value as Liquida)}>
                  {opcionesCuentas(false)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="fin-cu-fecha">Fecha</label>
                <input id="fin-cu-fecha" type="date" value={cuFecha} onChange={(e) => setCuFecha(e.target.value)} />
              </div>
            </div>
            <p className="form-ayuda" style={{ margin: 0 }}>
              Capital que baja la deuda: <strong>{money(Math.max(0, (Number(cuTotal) || 0) - (Number(cuInteres) || 0)))}</strong>. El interés se carga como egreso bancario, porque es un costo del negocio.
              {cuota.cuotas ? ` Esta es la cuota ${cuota.pagos.filter((p) => !p.anulado).length + 1} de ${cuota.cuotas}.` : ''}
            </p>
            <ModalAcciones onCancelar={() => setCuota(null)} textoConfirmar="Pagar cuota" />
          </form>
        </Modal>
      )}

      {rendInv && (
        <Modal titulo={`Rendimiento — ${rendInv.nombre}`} descripcion="Lo que ganó o perdió la inversión. No mueve la caja." onCerrar={() => setRendInv(null)} ancho="chico">
          <form onSubmit={(e) => { e.preventDefault(); guardarRendimiento(); }} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="fin-rend-monto">Monto</label>
                <input id="fin-rend-monto" type="number" value={rendMonto} onChange={(e) => setRendMonto(e.target.value)} placeholder="Ej: 3500, o -2000 si perdió" autoFocus />
              </div>
              <div className="form-group">
                <label htmlFor="fin-rend-fecha">Fecha</label>
                <input id="fin-rend-fecha" type="date" value={rendFecha} onChange={(e) => setRendFecha(e.target.value)} />
              </div>
            </div>
            <ModalAcciones onCancelar={() => setRendInv(null)} textoConfirmar="Registrar" />
          </form>
        </Modal>
      )}

      {monOp && (
        <Modal
          titulo={monOp === 'comprar' ? 'Comprar moneda extranjera' : monOp === 'vender' ? `Vender ${monedaDe(monCodigo)?.nombre ?? monCodigo}` : `Cotización — ${monedaDe(monCodigo)?.nombre ?? monCodigo}`}
          descripcion={monOp === 'comprar' ? 'Pasar pesos a otra moneda no es un gasto: la plata sigue siendo de la empresa.' : undefined}
          onCerrar={() => setMonOp(null)}
          ancho="chico"
        >
          <form onSubmit={(e) => { e.preventDefault(); guardarMoneda(); }} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-grid">
              {monOp === 'comprar' && (
                <div className="form-group">
                  <label htmlFor="fin-mon-codigo">Moneda</label>
                  <select id="fin-mon-codigo" value={monCodigo} onChange={(e) => { setMonCodigo(e.target.value); setMonPrecio(String(monedaDe(e.target.value)?.precio || '')); }}>
                    {[...inv.monedas.map((m) => ({ codigo: m.codigo, nombre: m.nombre })), ...CATALOGO_MONEDAS.filter((c) => !monedaDe(c.codigo))].map((m) => (
                      <option key={m.codigo} value={m.codigo}>{m.nombre} ({m.codigo})</option>
                    ))}
                    <option value="OTRA">Otra moneda…</option>
                  </select>
                </div>
              )}
              {monOp === 'comprar' && monCodigo === 'OTRA' && (
                <>
                  <div className="form-group">
                    <label htmlFor="fin-mon-otro-cod">Código</label>
                    <input id="fin-mon-otro-cod" value={monOtroCodigo} onChange={(e) => setMonOtroCodigo(e.target.value.toUpperCase())} placeholder="Ej: CAD" maxLength={6} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="fin-mon-otro-nom">Nombre</label>
                    <input id="fin-mon-otro-nom" value={monOtroNombre} onChange={(e) => setMonOtroNombre(e.target.value)} placeholder="Ej: Dólar canadiense" />
                  </div>
                </>
              )}
              {monOp !== 'precio' && (
                <div className="form-group">
                  <label htmlFor="fin-mon-cant">Cantidad</label>
                  <input id="fin-mon-cant" type="number" step="0.01" min="0" value={monCant} onChange={(e) => setMonCant(e.target.value)} placeholder="Ej: 50" />
                  {monOp === 'vender' && <p className="form-ayuda">Tenés {formatoCantidad(monedaDe(monCodigo)?.cantidad || 0)} {monCodigo}</p>}
                </div>
              )}
              <div className="form-group">
                <label htmlFor="fin-mon-precio">Cotización (pesos por unidad)</label>
                <input id="fin-mon-precio" type="number" step="0.01" min="0" value={monPrecio} onChange={(e) => setMonPrecio(e.target.value)} placeholder="Ej: 1300" />
                {monOp === 'comprar' && <p className="form-ayuda">Si no la sabés: pesos que salieron ÷ cantidad que recibiste.</p>}
              </div>
              {monOp !== 'precio' && (
                <div className="form-group">
                  <label htmlFor="fin-mon-cuenta">{monOp === 'comprar' ? 'Pagás desde' : 'Cobrás en'}</label>
                  <select id="fin-mon-cuenta" value={monCuenta} onChange={(e) => setMonCuenta(e.target.value as Liquida)}>
                    {opcionesCuentas(false)}
                  </select>
                </div>
              )}
              {monOp !== 'precio' && (
                <div className="form-group">
                  <label htmlFor="fin-mon-motivo">Detalle</label>
                  <input id="fin-mon-motivo" value={monMotivo} onChange={(e) => setMonMotivo(e.target.value)} placeholder="Ej: Cuenta exterior para suscripciones" />
                </div>
              )}
            </div>
            {monOp !== 'precio' && Number(monCant) > 0 && Number(monPrecio) > 0 && (
              <p className="form-ayuda" style={{ margin: 0 }}>
                {monOp === 'comprar' ? 'Salen' : 'Entran'} {money(Math.round(Number(monCant) * Number(monPrecio)))} de {NOMBRES_CUENTA[monCuenta]}.
              </p>
            )}
            <ModalAcciones onCancelar={() => setMonOp(null)} textoConfirmar="Guardar" />
          </form>
        </Modal>
      )}

      {ajuste && (
        <Modal
          titulo={ajuste.tipo === 'credito' ? `Ajustar deuda — ${ajuste.nombre}` : `Corregir saldo — ${ajuste.nombre}`}
          descripcion={
            ajuste.tipo === 'credito'
              ? 'Para cuando el banco informa otro saldo (refinanciación, cargos, redondeos). No mueve la caja.'
              : 'Para cuando el saldo no coincide con lo que muestra la app de la inversión. Queda asentado en Movimientos.'
          }
          onCerrar={() => setAjuste(null)}
          ancho="chico"
        >
          <form onSubmit={(e) => { e.preventDefault(); guardarAjuste(); }} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-group">
              <label htmlFor="fin-aj-saldo">{ajuste.tipo === 'credito' ? 'Lo que se debe hoy' : 'Saldo real'}</label>
              <input id="fin-aj-saldo" type="number" min="0" value={ajSaldo} onChange={(e) => setAjSaldo(e.target.value)} autoFocus />
              <p className="form-ayuda">Hoy figura {money(ajuste.actual)}.</p>
            </div>
            <div className="form-group">
              <label htmlFor="fin-aj-motivo">Motivo</label>
              <input id="fin-aj-motivo" value={ajMotivo} onChange={(e) => setAjMotivo(e.target.value)} placeholder="Ej: según resumen de octubre" required />
            </div>
            <ModalAcciones onCancelar={() => setAjuste(null)} textoConfirmar="Guardar ajuste" />
          </form>
        </Modal>
      )}

      {anular && (
        <ModalAnular
          titulo={anular.titulo}
          mensaje={anular.mensaje}
          onConfirmar={(motivo) => {
            anular.hacer(motivo);
            toast('Movimiento anulado', { tono: 'exito' });
          }}
          onCerrar={() => setAnular(null)}
        />
      )}
    </>
  );
}
