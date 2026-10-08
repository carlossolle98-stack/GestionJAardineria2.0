import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { EstadoGuardado } from '@/components/EstadoGuardado';
import { CambiarPasswordDialogo } from '@/components/CambiarPasswordDialogo';
import type { Permiso } from '@/lib/permisos';

type Tab = { to: string; label: string; icono: string; end?: boolean; permiso: Permiso };

/** La navegación se agrupa por intención, no en una fila plana de doce tabs. */
const GRUPOS: { titulo: string; tabs: Tab[] }[] = [
  {
    titulo: 'Operación',
    tabs: [
      { to: '/agenda', label: 'Agenda', icono: '📅', permiso: 'agenda' },
      { to: '/clientes', label: 'Clientes', icono: '👥', permiso: 'clientes' },
      { to: '/prospectos', label: 'Prospectos', icono: '🌱', permiso: 'prospectos' },
      { to: '/espera', label: 'En espera', icono: '⏳', permiso: 'espera' },
      { to: '/cargar', label: 'Ingresos', icono: '➕', permiso: 'cargar' },
      { to: '/whatsapp', label: 'WhatsApp', icono: '💬', permiso: 'whatsapp' },
    ],
  },
  {
    titulo: 'Dinero',
    tabs: [
      { to: '/', label: 'Resumen', icono: '📊', end: true, permiso: 'resumen' },
      { to: '/graficos', label: 'Gráficos', icono: '📈', permiso: 'resumen' },
      { to: '/cobros', label: 'Cobros', icono: '💰', permiso: 'cobros' },
      { to: '/egresos', label: 'Egresos', icono: '💸', permiso: 'egresos' },
      { to: '/movimientos', label: 'Movimientos', icono: '📥', permiso: 'movimientos' },
      { to: '/finanzas', label: 'Finanzas', icono: '🏦', permiso: 'finanzas' },
      { to: '/empleados', label: 'Empleados', icono: '👷', permiso: 'empleados' },
    ],
  },
  {
    titulo: 'Stock',
    tabs: [
      { to: '/inventario', label: 'Inventario', icono: '📦', permiso: 'inventario' },
      { to: '/proveedores', label: 'Proveedores', icono: '🏪', permiso: 'egresos' },
      { to: '/activos', label: 'Activos', icono: '🔧', permiso: 'finanzas' },
    ],
  },
  {
    titulo: 'Administración',
    tabs: [{ to: '/usuarios', label: 'Usuarios', icono: '🔑', permiso: 'usuarios' }],
  },
];

function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function AppLayout() {
  const { usuario, puede, logout } = useAuth();
  const location = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [usuarioAbierto, setUsuarioAbierto] = useState(false);
  const [cambiarPass, setCambiarPass] = useState(false);
  const menuUsuarioRef = useRef<HTMLDivElement>(null);

  const hoy = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Sólo se muestran los grupos con al menos una pantalla habilitada.
  const gruposVisibles = GRUPOS.map((g) => ({
    ...g,
    tabs: g.tabs.filter((t) => puede(t.permiso)),
  })).filter((g) => g.tabs.length > 0);

  // Al navegar se cierra el panel lateral.
  useEffect(() => {
    setMenuAbierto(false);
    setUsuarioAbierto(false);
  }, [location.pathname]);

  // Escape cierra lo que esté abierto; un clic afuera cierra el menú de usuario.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuAbierto(false);
        setUsuarioAbierto(false);
      }
    }
    function onClick(e: MouseEvent) {
      if (menuUsuarioRef.current && !menuUsuarioRef.current.contains(e.target as Node)) {
        setUsuarioAbierto(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  return (
    <>
      <a className="saltar-a-contenido" href="#contenido">
        Saltar al contenido
      </a>

      <header className="app-header">
        <div className="app-header-fila">
          <div className="app-marca">
            <div className="app-logo" aria-hidden="true">
              🌿
            </div>
            <div>
              <div className="app-titulo">Jardinería 2.0</div>
              <div className="app-subtitulo">Gestión operativa</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <EstadoGuardado />
            <span className="app-chip fecha">{hoy}</span>

            <div className="menu-usuario" ref={menuUsuarioRef}>
              <button
                type="button"
                className="menu-usuario-boton"
                onClick={() => setUsuarioAbierto((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={usuarioAbierto}
              >
                <span className="avatar" aria-hidden="true">
                  {iniciales(usuario?.nombre || '?')}
                </span>
                <span className="nombre">{usuario?.nombre}</span>
                <span aria-hidden="true">▾</span>
              </button>

              {usuarioAbierto && (
                <div className="menu-usuario-panel" role="menu">
                  <div className="menu-usuario-cabecera">
                    <div style={{ fontWeight: 700 }}>{usuario?.nombre}</div>
                    <div style={{ fontSize: 'var(--txt-sm)', color: 'var(--texto-2)' }}>
                      @{usuario?.usuario} · {usuario?.rol === 'admin' ? 'Administrador' : 'Equipo'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="menu-usuario-item"
                    role="menuitem"
                    onClick={() => {
                      setCambiarPass(true);
                      setUsuarioAbierto(false);
                    }}
                  >
                    🔑 Cambiar contraseña
                  </button>
                  <button
                    type="button"
                    className="menu-usuario-item"
                    role="menuitem"
                    onClick={() => void logout()}
                  >
                    🚪 Cerrar sesión
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="nav-boton-menu"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú de navegación"
              aria-expanded={menuAbierto}
            >
              ☰
            </button>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="Secciones">
          <div className="nav-tabs-inner">
            {gruposVisibles.map((g) => (
              <div className="nav-grupo" key={g.titulo}>
                {g.tabs.map((t) => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end={t.end}
                    className={({ isActive }) => `nav-tab ${isActive ? 'activo' : ''}`}
                  >
                    <span aria-hidden="true">{t.icono}</span>
                    {t.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </div>
        </nav>
      </header>

      {menuAbierto && (
        <>
          <button
            type="button"
            className="nav-fondo"
            aria-label="Cerrar menú"
            onClick={() => setMenuAbierto(false)}
          />
          <div className="nav-panel" role="dialog" aria-label="Navegación">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Secciones</strong>
              <button
                type="button"
                className="btn fantasma sm"
                onClick={() => setMenuAbierto(false)}
                aria-label="Cerrar menú"
              >
                ✕
              </button>
            </div>
            {gruposVisibles.map((g) => (
              <div key={g.titulo}>
                <div className="nav-panel-grupo-titulo">{g.titulo}</div>
                {g.tabs.map((t) => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end={t.end}
                    className={({ isActive }) => `nav-panel-link ${isActive ? 'activo' : ''}`}
                  >
                    <span aria-hidden="true">{t.icono}</span>
                    {t.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <main className="page" id="contenido">
        <Outlet />
      </main>

      {cambiarPass && <CambiarPasswordDialogo onCerrar={() => setCambiarPass(false)} />}
    </>
  );
}
