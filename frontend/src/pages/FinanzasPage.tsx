import { useRef, useState } from 'react';
import { money, todayISO } from '@/lib/format';
import { NOMBRES_CUENTA } from '@/lib/j2local';
import { nombreCuenta } from '@/lib/j2reducer';
import { useJ2Local } from '@/context/J2LocalContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones, ModalConfirmar } from '@/components/Modal';
import type { J2Credito, J2Inversion } from '@/types';

type UsdOp = 'comprar' | 'vender' | 'precio' | null;
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

  const [cuota, setCuota] = useState<J2Credito | null>(null);
  const [cuCapital, setCuCapital] = useState('');
  const [cuInteres, setCuInteres] = useState('');
  const [cuCuenta, setCuCuenta] = useState<Liquida>('banco');
  const [cuFecha, setCuFecha] = useState(todayISO());

  const [nuevaInv, setNuevaInv] = useState('');
  const [rendInv, setRendInv] = useState<J2Inversion | null>(null);
  const [rendMonto, setRendMonto] = useState('');
  const [rendFecha, setRendFecha] = useState(todayISO());

  const [anular, setAnular] = useState<{ tipo: 'capital' | 'credito'; id: string; texto: string } | null>(null);

  const [usdOp, setUsdOp] = useState<UsdOp>(null);
  const [usdPrecio, setUsdPrecio] = useState('');
  const [usdCant, setUsdCant] = useState('');
  const [usdCuenta, setUsdCuenta] = useState<Liquida>('banco');
  const [usdMotivo, setUsdMotivo] = useState('');

  const c = j2.cuentas;
  const inv = j2.inversiones;
  const activas = inv.items.filter((i) => i.activa);
  const archivadas = inv.items.filter((i) => !i.activa);
  const totalUSD = inv.usd.cantidad * inv.usd.precio;
  const deudaCreditos = inv.creditos.reduce((s, x) => s + x.saldo, 0);
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
      j2.recibirCredito({ fecha: capFecha, entidad: capQuien.trim(), monto: m, cuenta: capCuenta, nota: capNota.trim() });
    } else {
      j2.movCapital({ fecha: capFecha, tipo: capTipo, socio: capQuien.trim(), monto: m, cuenta: capCuenta, nota: capNota.trim() });
    }
    toast(`${TITULO_CAPITAL[capTipo]} registrado · ${money(m)}`, { tono: 'exito' });
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
    setCuCapital('');
    setCuInteres('');
    setCuFecha(todayISO());
  }

  function pagarCuota() {
    if (!cuota) return;
    const capital = Number(cuCapital) || 0;
    const interes = Number(cuInteres) || 0;
    if (capital < 0 || interes < 0 || capital + interes <= 0) {
      toast('Ingresá cuánto de la cuota es capital y cuánto interés', { tono: 'error' });
      return;
    }
    if (capital > cuota.saldo) {
      toast(`El capital no puede superar lo que se debe (${money(cuota.saldo)})`, { tono: 'error' });
      return;
    }
    j2.pagarCuotaCredito({ creditoId: cuota.id, capital, interes, cuenta: cuCuenta, fecha: cuFecha });
    toast(`Cuota pagada · ${money(capital + interes)}`, { tono: 'exito' });
    setCuota(null);
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

  function guardarUsd() {
    const precio = parseFloat(usdPrecio);
    if (Number.isNaN(precio) || precio <= 0) { toast('Precio inválido', { tono: 'error' }); return; }
    if (usdOp === 'precio') {
      j2.actualizarPrecioUsd(precio);
      setUsdOp(null);
      toast('Precio del dólar actualizado', { tono: 'exito' });
      return;
    }
    const cant = parseFloat(usdCant);
    if (Number.isNaN(cant) || cant <= 0) { toast('Cantidad inválida', { tono: 'error' }); return; }
    if (usdOp === 'comprar') {
      j2.comprarUsd(cant, precio, usdCuenta, usdMotivo.trim());
      toast('Compra de dólares registrada', { tono: 'exito' });
    } else if (usdOp === 'vender') {
      if (cant > inv.usd.cantidad) { toast('No tenés suficientes dólares', { tono: 'error' }); return; }
      j2.venderUsd(cant, precio, usdCuenta, usdMotivo.trim());
      toast('Venta de dólares registrada', { tono: 'exito' });
    }
    setUsdOp(null);
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
            {inv.creditos.filter((x) => x.saldo > 0).length || 'Sin'} crédito{inv.creditos.filter((x) => x.saldo > 0).length === 1 ? '' : 's'} pendiente{inv.creditos.filter((x) => x.saldo > 0).length === 1 ? '' : 's'}
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
            <label htmlFor="fin-cap-monto">Monto</label>
            <input id="fin-cap-monto" type="number" inputMode="numeric" min="0" value={capMonto} onChange={(e) => setCapMonto(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="fin-cap-cuenta">{capTipo === 'retiro' ? 'Sale de' : 'Entra a'}</label>
            <select id="fin-cap-cuenta" value={capCuenta} onChange={(e) => setCapCuenta(e.target.value)}>
              {opcionesCuentas(capTipo === 'retiro')}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fin-cap-fecha">Fecha</label>
            <input id="fin-cap-fecha" type="date" value={capFecha} onChange={(e) => setCapFecha(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="fin-cap-nota">Nota</label>
            <input id="fin-cap-nota" value={capNota} onChange={(e) => setCapNota(e.target.value)} placeholder={capTipo === 'credito' ? 'Ej: 12 cuotas, tasa 45%' : ''} />
          </div>
        </div>
        <p className="form-ayuda" style={{ marginBottom: 12 }}>{AYUDA_CAPITAL[capTipo]}</p>
        <button type="button" className="btn" onClick={registrarCapital}>Registrar {TITULO_CAPITAL[capTipo].toLowerCase()}</button>
      </div>

      {credList.length > 0 && (
        <div className="tabla-wrap" style={{ marginBottom: 20 }}>
          <div className="tabla-scroll">
            <table className="responsive">
              <thead><tr><th>Crédito</th><th>Fecha</th><th>Monto</th><th>Falta pagar</th><th>Entró a</th><th>Acción</th></tr></thead>
              <tbody>
                {credList.map((cr) => (
                  <tr key={cr.id}>
                    <td data-label="Crédito"><strong>{cr.entidad}</strong>{cr.nota && <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>{cr.nota}</div>}</td>
                    <td data-label="Fecha" style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12 }}>{cr.fecha}</td>
                    <td data-label="Monto" style={{ fontFamily: 'var(--fuente-mono)' }}>{money(cr.monto)}</td>
                    <td data-label="Falta pagar" style={{ fontFamily: 'var(--fuente-mono)', fontWeight: 600, color: cr.saldo > 0 ? 'var(--rojo)' : 'var(--verde-vivo)' }}>
                      {cr.saldo > 0 ? money(cr.saldo) : 'Cancelado'}
                    </td>
                    <td data-label="Entró a">{nombre(cr.cuenta)}</td>
                    <td data-label="Acción">
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {cr.saldo > 0 && <button type="button" className="btn sm" onClick={() => abrirCuota(cr)}>💳 Pagar cuota</button>}
                        {cr.saldo === cr.monto && (
                          <button type="button" className="btn secundario sm" onClick={() => setAnular({ tipo: 'credito', id: cr.id, texto: `el crédito de ${cr.entidad} por ${money(cr.monto)}` })}>🗑</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
                  <tr key={m.id}>
                    <td data-label="Fecha" style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12 }}>{m.fecha}</td>
                    <td data-label="Movimiento">
                      <span className={`badge ${m.tipo === 'aporte' ? 'ok' : 'pendiente'}`}>{m.tipo === 'aporte' ? 'Aporte' : 'Retiro'}</span>
                    </td>
                    <td data-label="Socio">{m.socio}{m.nota && <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>{m.nota}</div>}</td>
                    <td data-label="Cuenta">{nombre(m.cuenta)}</td>
                    <td data-label="Monto" style={{ fontFamily: 'var(--fuente-mono)', fontWeight: 600 }}>{m.tipo === 'aporte' ? '+' : '−'}{money(m.monto)}</td>
                    <td><button type="button" className="btn secundario sm" onClick={() => setAnular({ tipo: 'capital', id: m.id, texto: `el ${m.tipo} de ${m.socio} por ${money(m.monto)}` })}>🗑</button></td>
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
              <button type="button" className="btn fantasma sm" onClick={() => archivar(i)}>Archivar</button>
            </div>
          </div>
        ))}
        <div className="card tierra">
          <div className="card-label">Dólares</div>
          <div className="card-valor">{inv.usd.cantidad} USD</div>
          <div className="card-sub">{money(totalUSD)} a {money(inv.usd.precio)}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm" onClick={() => { setUsdOp('comprar'); setUsdPrecio(String(inv.usd.precio || '')); setUsdCant(''); setUsdMotivo(''); }}>Comprar</button>
            <button type="button" className="btn secundario sm" onClick={() => { setUsdOp('vender'); setUsdPrecio(String(inv.usd.precio || '')); setUsdCant(''); setUsdMotivo(''); }}>Vender</button>
            <button type="button" className="btn secundario sm" onClick={() => { setUsdOp('precio'); setUsdPrecio(String(inv.usd.precio || '')); }}>Precio</button>
          </div>
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
                <label htmlFor="fin-cu-capital">Capital</label>
                <input id="fin-cu-capital" type="number" inputMode="numeric" min="0" value={cuCapital} onChange={(e) => setCuCapital(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label htmlFor="fin-cu-interes">Interés</label>
                <input id="fin-cu-interes" type="number" inputMode="numeric" min="0" value={cuInteres} onChange={(e) => setCuInteres(e.target.value)} />
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
              El capital baja la deuda. El interés se carga como egreso bancario, porque es un costo del negocio. Total de la cuota: {money((Number(cuCapital) || 0) + (Number(cuInteres) || 0))}.
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

      {usdOp && (
        <Modal
          titulo={usdOp === 'comprar' ? 'Comprar dólares' : usdOp === 'vender' ? 'Vender dólares' : 'Actualizar precio del dólar'}
          onCerrar={() => setUsdOp(null)}
          ancho="chico"
        >
          <form onSubmit={(e) => { e.preventDefault(); guardarUsd(); }} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div className="form-grid">
              {usdOp !== 'precio' && (
                <div className="form-group">
                  <label htmlFor="fin-usd-cant">Cantidad USD</label>
                  <input id="fin-usd-cant" type="number" step="0.01" value={usdCant} onChange={(e) => setUsdCant(e.target.value)} placeholder="Ej: 50" autoFocus />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="fin-usd-precio">Precio en pesos por USD</label>
                <input id="fin-usd-precio" type="number" value={usdPrecio} onChange={(e) => setUsdPrecio(e.target.value)} placeholder="Ej: 1300" />
              </div>
              {usdOp !== 'precio' && (
                <div className="form-group">
                  <label htmlFor="fin-usd-cuenta">{usdOp === 'comprar' ? 'Pagás desde' : 'Cobrás en'}</label>
                  <select id="fin-usd-cuenta" value={usdCuenta} onChange={(e) => setUsdCuenta(e.target.value as Liquida)}>
                    {opcionesCuentas(false)}
                  </select>
                </div>
              )}
              {usdOp !== 'precio' && (
                <div className="form-group">
                  <label htmlFor="fin-usd-motivo">Detalle</label>
                  <input id="fin-usd-motivo" value={usdMotivo} onChange={(e) => setUsdMotivo(e.target.value)} placeholder="Ej: Ahorro" />
                </div>
              )}
            </div>
            <ModalAcciones onCancelar={() => setUsdOp(null)} textoConfirmar="Guardar" />
          </form>
        </Modal>
      )}

      {anular && (
        <ModalConfirmar
          titulo="Anular movimiento"
          peligro
          textoConfirmar="Anular"
          mensaje={<>Se anula {anular.texto} y la cuenta vuelve al saldo anterior.</>}
          onConfirmar={() => {
            if (anular.tipo === 'capital') j2.anularCapital(anular.id);
            else j2.anularCredito(anular.id);
            setAnular(null);
            toast('Movimiento anulado', { tono: 'exito' });
          }}
          onCerrar={() => setAnular(null)}
        />
      )}
    </>
  );
}
