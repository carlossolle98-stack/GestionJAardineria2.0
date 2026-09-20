import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
import { mensajeWa, copiar } from '@/lib/whatsapp';
import type { ResumenPayload } from '@/types';
import { clasificarLineas } from '@/lib/clasificarWA';
import { useToast } from '@/context/ToastContext';

export function WhatsappPage() {
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ['resumen'],
    queryFn: () => getJson<ResumenPayload>('/api/resumen'),
  });

  const urgentes = useMemo(() => {
    const list = data?.cuentasPorCobrar.clientes || [];
    return list.map((c) => ({
      cliente: c.nombre.split(' ')[0],
      nota: `${moneyShort(c.deuda)} pendiente`,
      tipo: 'cobro' as const,
    }));
  }, [data]);

  const [pegado, setPegado] = useState('');
  const [clasif, setClasif] = useState<ReturnType<typeof clasificarLineas>>([]);

  return (
    <>
      <div className="section-header">
        <div className="section-title">
          WhatsApp <small>Mensajes listos</small>
        </div>
      </div>

      <div className="alerta info">
        <div>💬</div>
        <div>
          <strong>Uso:</strong> Copiá, pegá en WA, editá si hace falta.
        </div>
      </div>

      {urgentes.map((u) => (
        <div key={u.cliente} className="whatsapp-box">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            💬 {u.cliente} <span className="badge urgente">{u.nota}</span>
          </div>
          <div className="mensaje-wa">{mensajeWa(u.tipo, u.cliente)}</div>
          <button type="button" className="copy-btn" onClick={() => void copiar(mensajeWa(u.tipo, u.cliente), toast)}>
            Copiar
          </button>
        </div>
      ))}

      <div className="sep" />
      <div className="section-title" style={{ marginBottom: 12 }}>
        Pegar transcripción WA
      </div>
      <div className="tabla-wrap" style={{ padding: 20 }}>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label htmlFor="whatsapp-texto-del-chat-1">Texto del chat</label>
          <textarea id="whatsapp-texto-del-chat-1" rows={6} value={pegado} onChange={(e) => setPegado(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!pegado.trim()) {
              toast('Pegá texto primero');
              return;
            }
            setClasif(clasificarLineas(pegado));
          }}
        >
          Clasificar
        </button>
      </div>

      {clasif.length > 0 && (
        <div className="tabla-wrap" style={{ marginTop: 16 }}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fragmento</th>
                  <th>Categoría</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {clasif.map((r, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 280 }}>{r.fragmento}</td>
                    <td>
                      <span className="badge info">{r.categoria}</span>
                    </td>
                    <td>{r.accion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function moneyShort(n: number) {
  return `$${n.toLocaleString('es-AR')}`;
}
