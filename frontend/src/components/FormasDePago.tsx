import { money } from '@/lib/format';
import type { Financiacion } from '@/lib/j2reducer';
import type { J2Pago } from '@/types';

export type Forma = 'mp' | 'banco' | 'efectivo' | 'prestamo' | 'tarjeta';

export type FilaPago = {
  id: string;
  forma: Forma;
  monto: string;
  entidad: string;
  cuotas: string;
  valorCuota: string;
};

const ETIQUETA: Record<Forma, string> = {
  mp: 'Mercado Pago',
  banco: 'Banco',
  efectivo: 'Efectivo',
  prestamo: 'Crédito / préstamo',
  tarjeta: 'Tarjeta en cuotas',
};

export function filaNueva(forma: Forma = 'banco'): FilaPago {
  return { id: Math.random().toString(36).slice(2), forma, monto: '', entidad: '', cuotas: '', valorCuota: '' };
}

/** Separa lo que salió de las cuentas de lo que se financió. */
export function armarPago(filas: FilaPago[]): { pagos: J2Pago[]; financiaciones: Financiacion[] } {
  const pagos: J2Pago[] = [];
  const financiaciones: Financiacion[] = [];
  for (const f of filas) {
    const monto = Number(f.monto) || 0;
    if (monto <= 0) continue;
    if (f.forma === 'prestamo' || f.forma === 'tarjeta') {
      const cuotas = parseInt(f.cuotas, 10) || 0;
      const valor = Number(f.valorCuota) || 0;
      financiaciones.push({
        entidad: f.entidad.trim() || (f.forma === 'tarjeta' ? 'Tarjeta' : 'Crédito'),
        tipoCredito: f.forma === 'tarjeta' ? 'tarjeta' : 'prestamo',
        monto,
        cuotas: cuotas || undefined,
        totalADevolver: cuotas && valor ? cuotas * valor : undefined,
      });
    } else {
      pagos.push({ cuenta: f.forma, monto });
    }
  }
  return { pagos, financiaciones };
}

export function totalFilas(filas: FilaPago[]) {
  return filas.reduce((t, f) => t + (Number(f.monto) || 0), 0);
}

/**
 * Editor de formas de pago de una compra: cada fila es una cuenta que pagó o
 * una financiación (crédito o tarjeta) que pagó directo al vendedor.
 */
export function FormasDePago({ filas, onCambio, total }: { filas: FilaPago[]; onCambio: (f: FilaPago[]) => void; total: number }) {
  const cargado = totalFilas(filas);
  const falta = Math.round((total - cargado) * 100) / 100;
  const cambiar = (id: string, campo: keyof FilaPago, valor: string) =>
    onCambio(filas.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {filas.map((f, i) => {
        const financia = f.forma === 'prestamo' || f.forma === 'tarjeta';
        const cuotas = parseInt(f.cuotas, 10) || 0;
        const devolver = cuotas * (Number(f.valorCuota) || 0);
        const monto = Number(f.monto) || 0;
        return (
          <div key={f.id} style={{ border: 'var(--borde)', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor={`fp-forma-${f.id}`}>Forma {i + 1}</label>
                <select id={`fp-forma-${f.id}`} value={f.forma} onChange={(e) => cambiar(f.id, 'forma', e.target.value)}>
                  {(Object.keys(ETIQUETA) as Forma[]).map((k) => <option key={k} value={k}>{ETIQUETA[k]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor={`fp-monto-${f.id}`}>{financia ? 'Parte del precio que cubrió' : 'Monto'}</label>
                <input
                  id={`fp-monto-${f.id}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={f.monto}
                  onChange={(e) => cambiar(f.id, 'monto', e.target.value)}
                  placeholder={falta > 0 && !f.monto ? String(falta) : ''}
                />
              </div>
              {financia && (
                <>
                  <div className="form-group">
                    <label htmlFor={`fp-entidad-${f.id}`}>{f.forma === 'tarjeta' ? 'Tarjeta' : 'Entidad'}</label>
                    <input id={`fp-entidad-${f.id}`} value={f.entidad} onChange={(e) => cambiar(f.id, 'entidad', e.target.value)} placeholder={f.forma === 'tarjeta' ? 'Ej: Visa Banco Nación' : 'Ej: Mercado Pago'} />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`fp-cuotas-${f.id}`}>Cuotas</label>
                    <input id={`fp-cuotas-${f.id}`} type="number" inputMode="numeric" min="1" value={f.cuotas} onChange={(e) => cambiar(f.id, 'cuotas', e.target.value)} placeholder="Ej: 6" />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`fp-valor-${f.id}`}>Valor de cada cuota</label>
                    <input id={`fp-valor-${f.id}`} type="number" inputMode="numeric" min="0" value={f.valorCuota} onChange={(e) => cambiar(f.id, 'valorCuota', e.target.value)} placeholder={f.forma === 'tarjeta' ? 'Vacío = sin interés' : ''} />
                  </div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="form-ayuda" style={{ margin: 0 }}>
                {financia
                  ? devolver > monto && monto > 0
                    ? `Se devuelven ${money(devolver)}: ${money(devolver - monto)} de interés, que se reparte en las cuotas.`
                    : 'Queda como deuda; cada cuota se paga desde Finanzas.'
                  : 'Sale de esta cuenta.'}
              </span>
              <button type="button" className="btn secundario sm" onClick={() => onCambio(filas.filter((x) => x.id !== f.id))}>
                Quitar
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn secundario sm" onClick={() => onCambio([...filas, filaNueva(filas.length ? 'mp' : 'banco')])}>
          + Agregar forma de pago
        </button>
        {filas.length > 0 && total > 0 && (
          <span style={{ fontSize: 14, fontWeight: 600, color: Math.abs(falta) < 1 ? 'var(--verde-vivo)' : 'var(--rojo)' }}>
            {Math.abs(falta) < 1 ? '✓ Cubre el precio' : falta > 0 ? `Faltan ${money(falta)}` : `Sobran ${money(-falta)}`}
          </span>
        )}
      </div>
    </div>
  );
}
