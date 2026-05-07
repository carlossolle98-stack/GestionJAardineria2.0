import { useState } from 'react';
import { money, todayISO } from '@/lib/format';
import { NOMBRES_CUENTA } from '@/lib/j2local';
import { useJ2Local } from '@/context/J2LocalContext';
import { useToast } from '@/context/ToastContext';

type UsdOp = 'comprar' | 'vender' | 'precio' | null;

export function FinanzasPage() {
  const { toast } = useToast();
  const j2 = useJ2Local();
  const [editCuenta, setEditCuenta] = useState<'mp' | 'banco' | 'efectivo' | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [editMotivo, setEditMotivo] = useState('');
  const [trDe, setTrDe] = useState('mp');
  const [trPara, setTrPara] = useState('banco');
  const [trMonto, setTrMonto] = useState('');
  const [trFecha, setTrFecha] = useState(todayISO());
  const [trNota, setTrNota] = useState('');
  const [invTipo, setInvTipo] = useState<'entrada' | 'salida'>('entrada');
  const [invMonto, setInvMonto] = useState('');
  const [invWhich, setInvWhich] = useState<'cocos' | 'servente' | null>(null);
  const [usdOp, setUsdOp] = useState<UsdOp>(null);
  const [usdPrecio, setUsdPrecio] = useState('');
  const [usdCant, setUsdCant] = useState('');
  const [usdCuenta, setUsdCuenta] = useState<'mp' | 'banco' | 'efectivo'>('banco');
  const [usdMotivo, setUsdMotivo] = useState('');

  const c = j2.cuentas;
  const inv = j2.inversiones;
  const totalUSD = (inv.usd?.cantidad || 0) * (inv.usd?.precio || 0);

  function abrirUsd(op: UsdOp) {
    setUsdOp(op);
    setUsdPrecio(String(inv.usd?.precio ?? ''));
    setUsdCant('');
    setUsdMotivo('');
    setInvWhich(null);
  }

  function guardarCuenta() {
    if (!editCuenta) return;
    const m = parseInt(editMonto, 10);
    if (Number.isNaN(m)) { toast('⚠ Ingresá un monto válido'); return; }
    if (!editMotivo.trim()) { toast('⚠ Ingresá el motivo de la corrección'); return; }
    j2.setCuentaSaldo(editCuenta, m, editMotivo.trim());
    setEditCuenta(null);
    setEditMotivo('');
    toast('✓ Saldo actualizado');
  }

  function registrarTr() {
    if (trDe === trPara) { toast('⚠ Origen y destino distintos'); return; }
    const m = parseInt(trMonto, 10);
    if (!m || m <= 0) { toast('⚠ Monto inválido'); return; }
    j2.registrarTransferencia({ de: trDe, para: trPara, monto: m, fecha: trFecha, nota: trNota.trim() });
    setTrMonto(''); setTrNota('');
    toast('✓ Transferencia registrada');
  }

  function confirmInv() {
    if (!invWhich) return;
    const m = parseInt(invMonto, 10);
    if (!m || m <= 0) { toast('⚠ Monto inválido'); return; }
    j2.movInversion(invWhich, invTipo, m);
    setInvWhich(null); setInvMonto('');
    toast('✓ Inversión actualizada');
  }

  function guardarUsd() {
    const precio = parseFloat(usdPrecio);
    if (Number.isNaN(precio) || precio <= 0) { toast('⚠ Precio inválido'); return; }
    if (usdOp === 'precio') {
      j2.actualizarPrecioUsd(precio);
      setUsdOp(null);
      toast('✓ Precio USD actualizado');
      return;
    }
    const cant = parseFloat(usdCant);
    if (Number.isNaN(cant) || cant <= 0) { toast('⚠ Cantidad inválida'); return; }
    if (usdOp === 'comprar') {
      j2.comprarUsd(cant, precio, usdCuenta, usdMotivo.trim());
      toast('✓ Compra USD registrada');
    } else if (usdOp === 'vender') {
      if (cant > (inv.usd?.cantidad || 0)) { toast('⚠ No tenés suficientes USD'); return; }
      j2.venderUsd(cant, precio, usdCuenta, usdMotivo.trim());
      toast('✓ Venta USD registrada');
    }
    setUsdOp(null);
  }

  const trList = [...j2.transferencias].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  return (
    <>
      <div className="section-header">
        <div className="section-title">Finanzas <small>Cuentas · Transferencias · Inversiones</small></div>
      </div>

      <div className="section-title" style={{ marginBottom: 12 }}>💳 Saldos de cuentas</div>
      <div className="cards-grid" style={{ marginBottom: 8 }}>
        {(['mp', 'banco', 'efectivo'] as const).map((k) => (
          <div key={k} className={k === 'banco' ? 'card azul' : k === 'efectivo' ? 'card tierra' : 'card'}>
            <div className="card-label">{NOMBRES_CUENTA[k]}</div>
            <div className="card-valor">{money(c[k] || 0)}</div>
            <button type="button" className="btn secundario sm" onClick={() => { setEditCuenta(k); setEditMonto(String(c[k] ?? 0)); setEditMotivo(''); }}>
              ✏ Actualizar
            </button>
          </div>
        ))}
      </div>

      {editCuenta && (
        <div className="tabla-wrap" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ background: 'rgba(230,180,0,0.08)', border: '1px solid rgba(230,180,0,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#888' }}>
            ⚠ Usá esto solo para correcciones puntuales. Los movimientos normales se actualizan solos.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 180 }}>
              <label>Nuevo saldo — {NOMBRES_CUENTA[editCuenta]}</label>
              <input type="number" value={editMonto} onChange={(e) => setEditMonto(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 2, minWidth: 220 }}>
              <label>Motivo de la corrección</label>
              <input value={editMotivo} onChange={(e) => setEditMotivo(e.target.value)} placeholder="Ej: Ajuste por depósito no registrado" />
            </div>
            <button type="button" className="btn" onClick={guardarCuenta}>Guardar</button>
            <button type="button" className="btn secundario" onClick={() => setEditCuenta(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="sep" />

      <div className="section-title" style={{ marginBottom: 12 }}>🔄 Transferencia entre cuentas</div>
      <div className="tabla-wrap" style={{ padding: 20, marginBottom: 20 }}>
        <div className="form-grid">
          <div className="form-group">
            <label>Desde</label>
            <select value={trDe} onChange={(e) => setTrDe(e.target.value)}>
              <option value="mp">Mercado Pago</option>
              <option value="banco">Banco</option>
              <option value="efectivo">Efectivo</option>
              <option value="cocos">COCOS Capital</option>
              <option value="servente">Servente & Cía</option>
            </select>
          </div>
          <div className="form-group">
            <label>Hacia</label>
            <select value={trPara} onChange={(e) => setTrPara(e.target.value)}>
              <option value="banco">Banco</option>
              <option value="mp">Mercado Pago</option>
              <option value="efectivo">Efectivo</option>
              <option value="cocos">COCOS Capital</option>
              <option value="servente">Servente & Cía</option>
            </select>
          </div>
          <div className="form-group">
            <label>Monto</label>
            <input type="number" value={trMonto} onChange={(e) => setTrMonto(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Fecha</label>
            <input type="date" value={trFecha} onChange={(e) => setTrFecha(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Nota</label>
            <input value={trNota} onChange={(e) => setTrNota(e.target.value)} />
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
                <tr><td colSpan={6} style={{ color: '#bbb', textAlign: 'center', padding: 16 }}>Sin transferencias</td></tr>
              ) : (
                trList.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{t.fecha}</td>
                    <td>{NOMBRES_CUENTA[t.de] || t.de}</td>
                    <td>{NOMBRES_CUENTA[t.para] || t.para}</td>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600 }}>{money(t.monto)}</td>
                    <td style={{ fontSize: 12, color: '#666' }}>{t.nota || '—'}</td>
                    <td><button type="button" className="btn secundario sm" onClick={() => j2.removeTransferencia(t.id)}>🗑</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sep" />

      <div className="section-title" style={{ marginBottom: 12 }}>📈 Inversiones</div>
      <div className="cards-grid" style={{ marginBottom: 16 }}>
        <div className="card azul">
          <div className="card-label">COCOS Capital</div>
          <div className="card-valor">{money(inv.cocos || 0)}</div>
          <button type="button" className="btn secundario sm" onClick={() => setInvWhich('cocos')}>+ / - Movimiento</button>
        </div>
        <div className="card azul">
          <div className="card-label">Servente & Cía</div>
          <div className="card-valor">{money(inv.servente || 0)}</div>
          <button type="button" className="btn secundario sm" onClick={() => setInvWhich('servente')}>+ / - Movimiento</button>
        </div>
        <div className="card tierra">
          <div className="card-label">USD · Cantidad actual</div>
          <div className="card-valor">{inv.usd?.cantidad || 0} USD</div>
          <div className="card-sub">Precio: {money(inv.usd?.precio || 0)}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm" style={{ background: '#2e7d32' }} onClick={() => abrirUsd('comprar')}>+ Comprar</button>
            <button type="button" className="btn sm" style={{ background: '#c0392b' }} onClick={() => abrirUsd('vender')}>- Vender</button>
            <button type="button" className="btn secundario sm" onClick={() => abrirUsd('precio')}>✏ Precio</button>
          </div>
        </div>
        <div className="card">
          <div className="card-label">Valor total USD (ARS)</div>
          <div className="card-valor">{money(totalUSD)}</div>
          <div className="card-sub">{inv.usd?.cantidad || 0} USD × {money(inv.usd?.precio || 0)}</div>
        </div>
      </div>

      {invWhich && (
        <div className="tabla-wrap" style={{ padding: 16, marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 12, fontSize: 15 }}>
            Movimiento — {invWhich === 'cocos' ? 'COCOS Capital' : 'Servente & Cía'}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 130 }}>
              <label>Tipo</label>
              <select value={invTipo} onChange={(e) => setInvTipo(e.target.value as 'entrada' | 'salida')}>
                <option value="entrada">+ Ingreso</option>
                <option value="salida">- Retiro</option>
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 130 }}>
              <label>Monto (ARS)</label>
              <input type="number" value={invMonto} onChange={(e) => setInvMonto(e.target.value)} />
            </div>
            <button type="button" className="btn" onClick={confirmInv}>Confirmar</button>
            <button type="button" className="btn secundario" onClick={() => setInvWhich(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {usdOp && (
        <div className="tabla-wrap" style={{ padding: 16, marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 12, fontSize: 15 }}>
            {usdOp === 'comprar' ? '🟢 Comprar USD' : usdOp === 'vender' ? '🔴 Vender USD' : '✏ Actualizar precio USD'}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {usdOp !== 'precio' && (
              <div className="form-group" style={{ minWidth: 120 }}>
                <label>Cantidad USD</label>
                <input type="number" step="0.01" value={usdCant} onChange={(e) => setUsdCant(e.target.value)} placeholder="Ej: 50" />
              </div>
            )}
            <div className="form-group" style={{ minWidth: 140 }}>
              <label>Precio ARS por USD</label>
              <input type="number" value={usdPrecio} onChange={(e) => setUsdPrecio(e.target.value)} placeholder="Ej: 1300" />
            </div>
            {usdOp !== 'precio' && (
              <div className="form-group" style={{ minWidth: 140 }}>
                <label>{usdOp === 'comprar' ? 'Cuenta de pago (sale ARS)' : 'Cuenta de destino (entra ARS)'}</label>
                <select value={usdCuenta} onChange={(e) => setUsdCuenta(e.target.value as 'mp' | 'banco' | 'efectivo')}>
                  <option value="mp">Mercado Pago</option>
                  <option value="banco">Banco</option>
                  <option value="efectivo">Efectivo</option>
                </select>
              </div>
            )}
            {usdOp !== 'precio' && (
              <div className="form-group" style={{ flex: 2, minWidth: 180 }}>
                <label>Motivo / Detalle</label>
                <input value={usdMotivo} onChange={(e) => setUsdMotivo(e.target.value)} placeholder="Ej: Compra para ahorro" />
              </div>
            )}
            <button type="button" className="btn" onClick={guardarUsd}>Guardar</button>
            <button type="button" className="btn secundario" onClick={() => setUsdOp(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  );
}
