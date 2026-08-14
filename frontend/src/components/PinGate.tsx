import { useState, type ReactNode } from 'react';
import { adminUnlocked, tryPin, HAY_PIN } from '@/lib/role';

export function PinGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(adminUnlocked);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  // Sin PIN configurado o ya desbloqueado → mostrar contenido directamente
  if (!HAY_PIN || unlocked) return <>{children}</>;

  function intentar() {
    if (tryPin(pin)) {
      setUnlocked(true);
    } else {
      setError(true);
      setPin('');
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        gap: 16,
      }}
    >
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--verde-oscuro)' }}>
        Sección privada
      </div>
      <div style={{ color: '#888', fontSize: 14, marginBottom: 8 }}>
        Ingresá el PIN para continuar
      </div>
      <input
        type="password"
        value={pin}
        autoFocus
        placeholder="••••"
        onChange={(e) => { setPin(e.target.value); setError(false); }}
        onKeyDown={(e) => e.key === 'Enter' && intentar()}
        style={{
          textAlign: 'center',
          fontSize: 22,
          letterSpacing: 8,
          width: 150,
          padding: '12px 16px',
          border: error ? '2px solid var(--rojo)' : '1px solid rgba(26,46,26,0.25)',
          borderRadius: 10,
          outline: 'none',
          fontFamily: 'DM Mono, monospace',
        }}
      />
      {error && (
        <div style={{ color: 'var(--rojo)', fontSize: 13, fontWeight: 500 }}>
          PIN incorrecto. Intentá de nuevo.
        </div>
      )}
      <button type="button" className="btn" style={{ marginTop: 4 }} onClick={intentar}>
        Acceder
      </button>
      <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>
        El acceso se mantiene durante esta sesión
      </div>
    </div>
  );
}
