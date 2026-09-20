import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ApiError } from '@/lib/api';
import { Dialogo } from '@/components/Modal';

export function CambiarPasswordDialogo({ onCerrar }: { onCerrar: () => void }) {
  const { cambiarPassword } = useAuth();
  const { toast } = useToast();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (nueva !== repetir) {
      setError('La nueva contraseña no coincide con la repetición');
      return;
    }
    setError('');
    setEnviando(true);
    try {
      await cambiarPassword(actual, nueva);
      toast('Contraseña actualizada', { tono: 'exito' });
      onCerrar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo titulo="Cambiar contraseña" onCerrar={onCerrar}>
      <form onSubmit={enviar} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        {error && (
          <div className="alerta urgente" role="alert">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}
        <div className="form-group">
          <label htmlFor="pass-actual">Contraseña actual</label>
          <input
            id="pass-actual"
            type="password"
            autoComplete="current-password"
            required
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="pass-nueva">Nueva contraseña</label>
          <input
            id="pass-nueva"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
          <p className="form-ayuda">Mínimo 8 caracteres.</p>
        </div>
        <div className="form-group">
          <label htmlFor="pass-repetir">Repetir la nueva</label>
          <input
            id="pass-repetir"
            type="password"
            autoComplete="new-password"
            required
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
          />
        </div>
        <div className="dialogo-acciones">
          <button type="button" className="btn secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Cambiar'}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
