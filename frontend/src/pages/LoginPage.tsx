import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';

/**
 * Pantalla única de ingreso. Si la base todavía no tiene ningún usuario,
 * la misma pantalla crea el primer administrador.
 */
export function LoginPage() {
  const { login, crearPrimerAdmin, necesitaBootstrap } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      if (necesitaBootstrap) {
        await crearPrimerAdmin({ usuario, nombre: nombre || usuario, password });
      } else {
        await login(usuario, password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo ingresar');
      setPassword('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-pantalla">
      <form className="auth-caja" onSubmit={enviar} noValidate>
        <div className="auth-marca">
          <div className="app-logo" aria-hidden="true">
            🌿
          </div>
          <h1 className="auth-titulo">Jardinería 2.0</h1>
          <p className="auth-sub">
            {necesitaBootstrap
              ? 'Primer arranque: creá el usuario administrador'
              : 'Ingresá para acceder a la gestión'}
          </p>
        </div>

        {error && (
          <div className="alerta urgente" role="alert">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            name="usuario"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            aria-invalid={Boolean(error)}
          />
        </div>

        {necesitaBootstrap && (
          <div className="form-group">
            <label htmlFor="nombre">Nombre visible</label>
            <input
              id="nombre"
              name="nombre"
              autoComplete="name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Cómo querés que te muestre la app"
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={necesitaBootstrap ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
          />
          {necesitaBootstrap && (
            <p className="form-ayuda">Mínimo 8 caracteres. Guardala en un lugar seguro.</p>
          )}
        </div>

        <button type="submit" className="btn bloque" disabled={enviando}>
          {enviando ? 'Verificando…' : necesitaBootstrap ? 'Crear administrador' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
