import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/', label: '📊 Resumen', end: true },
  { to: '/clientes', label: '👥 Clientes Fijos' },
  { to: '/prospectos', label: '🌱 Prospectos' },
  { to: '/agenda', label: '📅 Agenda' },
  { to: '/cobros', label: '💰 Cobros' },
  { to: '/whatsapp', label: '💬 WhatsApp' },
  { to: '/cargar', label: '➕ Cargar Info' },
  { to: '/movimientos', label: '📥 Movimientos' },
  { to: '/espera', label: '⏳ En espera' },
  { to: '/egresos', label: '💸 Egresos' },
  { to: '/finanzas', label: '🏦 Finanzas' },
  { to: '/empleados', label: '👷 Empleados' },
];

export function AppLayout() {
  const hoy = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <header
        style={{
          background: 'var(--verde-oscuro)',
          color: 'var(--crema)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 28px',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                background: 'var(--verde-vivo)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              🌿
            </div>
            <div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20 }}>Jardinería 2.0</div>
              <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1, textTransform: 'uppercase' }}>
                Gestión Operativa
              </div>
            </div>
          </div>
          <div
            style={{
              fontFamily: "'DM Mono',monospace",
              fontSize: 12,
              opacity: 0.7,
              background: 'rgba(255,255,255,0.08)',
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {hoy}
          </div>
        </div>
        <nav
          style={{
            background: 'var(--verde-medio)',
            display: 'flex',
            gap: 2,
            padding: '0 28px',
            overflowX: 'auto',
          }}
        >
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              style={({ isActive }) => ({
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--verde-claro)' : '3px solid transparent',
                color: isActive ? 'var(--verde-claro)' : 'rgba(245,240,232,0.65)',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 500,
                padding: '12px 18px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                textDecoration: 'none',
              })}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
