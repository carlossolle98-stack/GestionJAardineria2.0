import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getJson, sendJson, onSesionCaida, ApiError } from '@/lib/api';
import type { Permiso, Usuario } from '@/lib/permisos';
import { limpiarCache } from '@/lib/j2local';

type Estado = 'cargando' | 'anonimo' | 'autenticado';

type AuthCtx = {
  estado: Estado;
  usuario: Usuario | null;
  /** true cuando la base todavía no tiene ningún usuario creado. */
  necesitaBootstrap: boolean;
  puede: (p: Permiso) => boolean;
  esAdmin: boolean;
  login: (usuario: string, password: string) => Promise<void>;
  crearPrimerAdmin: (datos: { usuario: string; nombre: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  cambiarPassword: (actual: string, nueva: string) => Promise<void>;
  refrescar: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [necesitaBootstrap, setNecesitaBootstrap] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      const { usuario: u } = await getJson<{ usuario: Usuario }>('/api/auth/me');
      setUsuario(u);
      setEstado('autenticado');
    } catch {
      setUsuario(null);
      setEstado('anonimo');
      // Sin sesión: puede ser una instalación nueva sin ningún usuario.
      try {
        const { necesitaBootstrap: nb } = await getJson<{ necesitaBootstrap: boolean }>(
          '/api/auth/estado'
        );
        setNecesitaBootstrap(nb);
      } catch {
        setNecesitaBootstrap(false);
      }
    }
  }, []);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  // Cualquier 401 en cualquier request devuelve la app a la pantalla de ingreso.
  useEffect(() => {
    onSesionCaida(() => {
      setUsuario(null);
      setEstado('anonimo');
    });
    return () => onSesionCaida(() => {});
  }, []);

  const login = useCallback(async (nombreUsuario: string, password: string) => {
    const { usuario: u } = await sendJson<{ usuario: Usuario }>('/api/auth/login', 'POST', {
      usuario: nombreUsuario,
      password,
    });
    setUsuario(u);
    setEstado('autenticado');
  }, []);

  const crearPrimerAdmin = useCallback(
    async (datos: { usuario: string; nombre: string; password: string }) => {
      const { usuario: u } = await sendJson<{ usuario: Usuario }>(
        '/api/auth/bootstrap',
        'POST',
        datos
      );
      setUsuario(u);
      setNecesitaBootstrap(false);
      setEstado('autenticado');
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await sendJson('/api/auth/logout', 'POST');
    } catch (e) {
      // Si el backend no responde igual cerramos del lado del cliente.
      if (!(e instanceof ApiError)) throw e;
    }
    // No dejamos datos de la empresa en un equipo compartido.
    limpiarCache();
    setUsuario(null);
    setEstado('anonimo');
  }, []);

  const cambiarPassword = useCallback(async (actual: string, nueva: string) => {
    await sendJson('/api/auth/password', 'POST', { actual, nueva });
  }, []);

  const puede = useCallback(
    (p: Permiso) => Boolean(usuario?.permisos.includes(p)),
    [usuario]
  );

  const value = useMemo<AuthCtx>(
    () => ({
      estado,
      usuario,
      necesitaBootstrap,
      puede,
      esAdmin: usuario?.rol === 'admin',
      login,
      crearPrimerAdmin,
      logout,
      cambiarPassword,
      refrescar,
    }),
    [estado, usuario, necesitaBootstrap, puede, login, crearPrimerAdmin, logout, cambiarPassword, refrescar]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const x = useContext(Ctx);
  if (!x) throw new Error('useAuth fuera de AuthProvider');
  return x;
}
