import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendJson } from '@/lib/api';
import { money } from '@/lib/format';
import { NOMBRES_MES, parsearHistorial, type MesImportado } from '@/lib/historial';
import type { AppSettings } from '@/types';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalAcciones } from '@/components/Modal';

type MesGuardado = AppSettings['mesesHistoricos'][number];

function clave(m: MesGuardado) {
  const n = NOMBRES_MES.findIndex((x) => x.toLowerCase() === m.mes.toLowerCase()) + 1;
  return `${m.anio}-${String(n).padStart(2, '0')}`;
}

/**
 * Carga totales mensuales de una planilla (por ejemplo, los meses anteriores a
 * usar la app). Los meses que ya estaban se reemplazan; los demás se conservan.
 */
export function ModalImportarHistorial({ actuales, onCerrar }: { actuales: MesGuardado[]; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [leidos, setLeidos] = useState<MesImportado[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [archivo, setArchivo] = useState('');

  const guardar = useMutation({
    mutationFn: () => {
      const porClave = new Map(actuales.map((m) => [clave(m), m]));
      for (const m of leidos) {
        porClave.set(m.clave, { mes: m.mes, anio: m.anio, ingresos: m.ingresos, egresos: m.egresos, estado: 'Cerrado' });
      }
      const mesesHistoricos = [...porClave.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, m]) => m);
      return sendJson('/api/settings', 'PUT', { mesesHistoricos });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['resumen'] });
      toast(`Historial actualizado · ${leidos.length} meses`, { tono: 'exito' });
      onCerrar();
    },
    onError: (e: Error) => toast(e.message, { tono: 'error' }),
  });

  async function leerArchivo(f: File | undefined) {
    if (!f) return;
    const r = parsearHistorial(await f.text());
    setArchivo(f.name);
    setLeidos(r.meses);
    setErrores(r.errores);
  }

  const reemplaza = leidos.filter((m) => actuales.some((a) => clave(a) === m.clave)).length;

  return (
    <Modal
      titulo="Importar historial de meses"
      descripcion="Archivo con columnas Año; Mes; Ingresos; Egresos. Para los meses cerrados, estos totales se muestran en lugar de lo cargado en la app."
      onCerrar={onCerrar}
    >
      <form onSubmit={(e) => { e.preventDefault(); if (leidos.length) guardar.mutate(); }} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <div className="form-group">
          <label htmlFor="historial-archivo">Archivo (.csv)</label>
          <input id="historial-archivo" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => void leerArchivo(e.target.files?.[0])} />
          {archivo && <p className="form-ayuda">{archivo}: {leidos.length} meses leídos{reemplaza ? `, ${reemplaza} reemplazan a los que ya estaban` : ''}.</p>}
        </div>

        {errores.length > 0 && (
          <div className="alerta aviso" role="alert">
            <div>{errores.slice(0, 5).map((e) => <div key={e}>{e}</div>)}{errores.length > 5 && <div>…y {errores.length - 5} más</div>}</div>
          </div>
        )}

        {leidos.length > 0 && (
          <div className="tabla-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Mes</th><th style={{ textAlign: 'right' }}>Ingresos</th><th style={{ textAlign: 'right' }}>Egresos</th><th style={{ textAlign: 'right' }}>Resultado</th></tr></thead>
              <tbody>
                {leidos.map((m) => (
                  <tr key={m.clave}>
                    <td>{m.mes} {m.anio}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)' }}>{money(Math.round(m.ingresos))}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)' }}>{money(Math.round(m.egresos))}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--fuente-mono)', color: m.ingresos - m.egresos >= 0 ? 'var(--verde-vivo)' : 'var(--rojo)' }}>
                      {money(Math.round(m.ingresos - m.egresos))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ModalAcciones onCancelar={onCerrar} textoConfirmar="Importar" confirmarDisabled={!leidos.length} enviando={guardar.isPending} />
      </form>
    </Modal>
  );
}
