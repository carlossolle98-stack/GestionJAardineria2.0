import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { Dialogo, ConfirmarDialogo } from '@/components/Modal';
import { CargandoTabla, ErrorCarga, Vacio } from '@/components/Estados';
import { BarraFiltros, Th, coincideAlguno, useOrden } from '@/components/Tabla';
import type { Permiso, PermisoMeta, Rol, Usuario } from '@/lib/permisos';

type CatalogoResp = { permisos: PermisoMeta[]; porRol: Record<Rol, Permiso[]> };

function fechaCorta(iso: string | null) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function UsuariosPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { usuario: yo } = useAuth();
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [creando, setCreando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Usuario | null>(null);
  const [aResetear, setAResetear] = useState<Usuario | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const usuariosQ = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => getJson<Usuario[]>('/api/usuarios'),
  });

  const catalogoQ = useQuery({
    queryKey: ['permisos-catalogo'],
    queryFn: () => getJson<CatalogoResp>('/api/auth/permisos'),
    staleTime: 60 * 60 * 1000,
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ['usuarios'] });

  const todos = useMemo(() => usuariosQ.data ?? [], [usuariosQ.data]);

  const filtrados = useMemo(
    () =>
      todos.filter((u) => {
        if (!coincideAlguno([u.nombre, u.usuario], busqueda)) return false;
        if (filtroRol !== 'todos' && u.rol !== filtroRol) return false;
        if (filtroEstado === 'activos' && !u.activo) return false;
        if (filtroEstado === 'inactivos' && u.activo) return false;
        return true;
      }),
    [todos, busqueda, filtroRol, filtroEstado]
  );

  const valoresOrden = useMemo(
    () => ({
      nombre: (u: Usuario) => u.nombre,
      rol: (u: Usuario) => u.rol,
      secciones: (u: Usuario) => u.permisos.length,
      acceso: (u: Usuario) => u.ultimoAcceso ?? '',
      estado: (u: Usuario) => (u.activo ? 'activo' : 'inactivo'),
    }),
    []
  );

  const { filas, orden, alternar, setOrden } = useOrden(filtrados, valoresOrden, {
    campo: 'nombre',
    direccion: 'asc',
  });

  const hayFiltros = busqueda !== '' || filtroRol !== 'todos' || filtroEstado !== 'todos';
  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroRol('todos');
    setFiltroEstado('todos');
  };

  const eliminar = useMutation({
    mutationFn: (u: Usuario) => sendJson(`/api/usuarios/${u.id}`, 'DELETE'),
    onSuccess: (_d, u) => {
      toast(`Usuario ${u.usuario} eliminado`, { tono: 'exito' });
      void refrescar();
    },
    onError: (e: ApiError) => toast(e.message, { tono: 'error' }),
  });

  const alternarActivo = useMutation({
    mutationFn: (u: Usuario) => sendJson(`/api/usuarios/${u.id}`, 'PATCH', { activo: !u.activo }),
    onSuccess: (_d, u) => {
      toast(u.activo ? `${u.usuario} desactivado` : `${u.usuario} activado`, { tono: 'exito' });
      void refrescar();
    },
    onError: (e: ApiError) => toast(e.message, { tono: 'error' }),
  });

  if (usuariosQ.isLoading || catalogoQ.isLoading) {
    return (
      <>
        <div className="section-header">
          <h2 className="section-title">Usuarios y permisos</h2>
        </div>
        <CargandoTabla />
      </>
    );
  }

  if (usuariosQ.error || catalogoQ.error) {
    const e = (usuariosQ.error || catalogoQ.error) as Error;
    return <ErrorCarga mensaje={e.message} onReintentar={() => void refrescar()} />;
  }

  const usuarios = todos;
  const catalogo = catalogoQ.data!;

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          Usuarios y permisos
          <small>
            {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''}
          </small>
        </h2>
        <button type="button" className="btn" onClick={() => setCreando(true)}>
          ➕ Nuevo usuario
        </button>
      </div>

      <div className="alerta info" style={{ marginBottom: 'var(--sp-5)' }}>
        <span aria-hidden="true">ℹ️</span>
        <span>
          Cada usuario ve únicamente las secciones que le habilites. El servidor valida estos
          permisos en cada pedido, así que no alcanza con conocer la dirección de una pantalla para
          entrar. Un <strong>administrador</strong> siempre tiene acceso completo.
        </span>
      </div>

      {usuarios.length > 1 && (
        <BarraFiltros
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          placeholder="Buscar por nombre o usuario…"
          filtros={[
            {
              id: 'rol',
              label: 'Rol',
              valor: filtroRol,
              onCambio: setFiltroRol,
              opciones: [
                { valor: 'todos', label: 'Todos' },
                { valor: 'admin', label: 'Administradores' },
                { valor: 'empleado', label: 'Equipo' },
              ],
            },
            {
              id: 'estado',
              label: 'Estado',
              valor: filtroEstado,
              onCambio: setFiltroEstado,
              opciones: [
                { valor: 'todos', label: 'Todos' },
                { valor: 'activos', label: 'Activos' },
                { valor: 'inactivos', label: 'Inactivos' },
              ],
            },
          ]}
          orden={{
            actual: orden.campo,
            direccion: orden.direccion,
            columnas: [
              { valor: 'nombre', label: 'Nombre' },
              { valor: 'rol', label: 'Rol' },
              { valor: 'secciones', label: 'Secciones' },
              { valor: 'acceso', label: 'Último acceso' },
              { valor: 'estado', label: 'Estado' },
            ],
            onCampo: (campo) => setOrden((o) => ({ ...o, campo: campo as typeof o.campo })),
            onDireccion: () =>
              setOrden((o) => ({ ...o, direccion: o.direccion === 'asc' ? 'desc' : 'asc' })),
          }}
          resultados={filas.length}
          total={usuarios.length}
          hayFiltros={hayFiltros}
          onLimpiar={limpiarFiltros}
        />
      )}

      {usuarios.length === 0 ? (
        <Vacio
          icono="🔑"
          titulo="Todavía no hay usuarios"
          texto="Creá el primero para que tu equipo pueda ingresar."
          accion={
            <button type="button" className="btn" onClick={() => setCreando(true)}>
              Crear usuario
            </button>
          }
        />
      ) : (
        <div className="tabla-wrap">
          <div className="tabla-scroll">
            <table className="responsive">
              <thead>
                <tr>
                  <Th campo="nombre" orden={orden} alternar={alternar}>
                    Usuario
                  </Th>
                  <Th campo="rol" orden={orden} alternar={alternar}>
                    Rol
                  </Th>
                  <Th campo="secciones" orden={orden} alternar={alternar}>
                    Secciones habilitadas
                  </Th>
                  <Th campo="acceso" orden={orden} alternar={alternar}>
                    Último acceso
                  </Th>
                  <Th campo="estado" orden={orden} alternar={alternar}>
                    Estado
                  </Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((u) => (
                  <tr key={u.id} style={u.activo ? undefined : { opacity: 0.62 }}>
                    <td data-label="Usuario">
                      <div style={{ fontWeight: 600 }}>{u.nombre}</div>
                      <div style={{ fontSize: 'var(--txt-sm)', color: 'var(--texto-2)' }}>
                        @{u.usuario}
                        {u.id === yo?.id && ' · vos'}
                      </div>
                    </td>
                    <td data-label="Rol">
                      <span className={`badge ${u.rol === 'admin' ? 'info' : 'ok'}`}>
                        {u.rol === 'admin' ? 'Admin' : 'Equipo'}
                      </span>
                    </td>
                    <td data-label="Secciones">
                      {u.rol === 'admin' ? (
                        <span style={{ color: 'var(--texto-2)' }}>Todas</span>
                      ) : (
                        <span>
                          {u.permisos.length === 0
                            ? '— ninguna —'
                            : `${u.permisos.length} de ${catalogo.permisos.length}`}
                        </span>
                      )}
                    </td>
                    <td data-label="Último acceso">{fechaCorta(u.ultimoAcceso)}</td>
                    <td data-label="Estado">
                      <span className={`badge ${u.activo ? 'ok' : 'urgente'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Acciones">
                      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn secundario sm"
                          onClick={() => setEditando(u)}
                        >
                          Permisos
                        </button>
                        <button
                          type="button"
                          className="btn secundario sm"
                          onClick={() => setAResetear(u)}
                        >
                          Contraseña
                        </button>
                        <button
                          type="button"
                          className="btn secundario sm"
                          disabled={u.id === yo?.id || alternarActivo.isPending}
                          onClick={() => alternarActivo.mutate(u)}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className="btn fantasma sm"
                          disabled={u.id === yo?.id}
                          onClick={() => setAEliminar(u)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filas.length === 0 && (
            <Vacio
              icono="🔍"
              titulo="Ningún usuario coincide con el filtro"
              texto="Probá con otro texto o volvé a ver la lista completa."
              accion={
                <button type="button" className="btn secundario" onClick={limpiarFiltros}>
                  Limpiar filtros
                </button>
              }
            />
          )}
        </div>
      )}

      {creando && (
        <FormularioUsuario
          catalogo={catalogo}
          onCerrar={() => setCreando(false)}
          onListo={() => {
            setCreando(false);
            void refrescar();
          }}
        />
      )}

      {editando && (
        <FormularioUsuario
          usuario={editando}
          catalogo={catalogo}
          onCerrar={() => setEditando(null)}
          onListo={() => {
            setEditando(null);
            void refrescar();
          }}
        />
      )}

      {aResetear && (
        <ResetPassword usuario={aResetear} onCerrar={() => setAResetear(null)} />
      )}

      {aEliminar && (
        <ConfirmarDialogo
          titulo="Eliminar usuario"
          peligro
          textoConfirmar="Eliminar"
          mensaje={
            <>
              Se elimina el acceso de <strong>{aEliminar.nombre}</strong> (@{aEliminar.usuario}).
              Los datos que cargó quedan intactos. Si sólo querés cortarle el acceso por un tiempo,
              conviene desactivarlo.
            </>
          }
          onConfirmar={() => eliminar.mutate(aEliminar)}
          onCerrar={() => setAEliminar(null)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function FormularioUsuario({
  usuario,
  catalogo,
  onCerrar,
  onListo,
}: {
  usuario?: Usuario;
  catalogo: CatalogoResp;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const { toast } = useToast();
  const esEdicion = Boolean(usuario);

  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [nombreUsuario, setNombreUsuario] = useState(usuario?.usuario ?? '');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? 'empleado');
  const [permisos, setPermisos] = useState<Permiso[]>(
    usuario?.permisosAsignados ?? catalogo.porRol.empleado
  );
  const [error, setError] = useState('');

  const grupos = useMemo(() => {
    const m = new Map<string, PermisoMeta[]>();
    for (const p of catalogo.permisos) {
      if (!m.has(p.grupo)) m.set(p.grupo, []);
      m.get(p.grupo)!.push(p);
    }
    return [...m.entries()];
  }, [catalogo]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (esEdicion) {
        return sendJson(`/api/usuarios/${usuario!.id}`, 'PATCH', { nombre, rol, permisos });
      }
      return sendJson('/api/usuarios', 'POST', {
        usuario: nombreUsuario,
        nombre,
        password,
        rol,
        permisos,
      });
    },
    onSuccess: () => {
      toast(esEdicion ? 'Permisos actualizados' : 'Usuario creado', { tono: 'exito' });
      onListo();
    },
    onError: (e: ApiError) => setError(e.message),
  });

  function alternar(clave: Permiso) {
    setPermisos((s) => (s.includes(clave) ? s.filter((x) => x !== clave) : [...s, clave]));
  }

  function alternarGrupo(metas: PermisoMeta[]) {
    const claves = metas.map((m) => m.clave);
    const todos = claves.every((c) => permisos.includes(c));
    setPermisos((s) =>
      todos ? s.filter((x) => !claves.includes(x)) : [...new Set([...s, ...claves])]
    );
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    guardar.mutate();
  }

  return (
    <Dialogo
      titulo={esEdicion ? `Permisos de ${usuario!.nombre}` : 'Nuevo usuario'}
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        {error && (
          <div className="alerta urgente" role="alert">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div className="form-grid" style={{ marginBottom: 0 }}>
          <div className="form-group">
            <label htmlFor="u-nombre">Nombre visible</label>
            <input
              id="u-nombre"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Juan Pérez"
            />
          </div>

          {!esEdicion && (
            <>
              <div className="form-group">
                <label htmlFor="u-usuario">Usuario para ingresar</label>
                <input
                  id="u-usuario"
                  required
                  autoCapitalize="none"
                  value={nombreUsuario}
                  onChange={(e) => setNombreUsuario(e.target.value)}
                  placeholder="juan"
                />
              </div>
              <div className="form-group">
                <label htmlFor="u-pass">Contraseña inicial</label>
                <input
                  id="u-pass"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="form-ayuda">Mínimo 8 caracteres. Se la pasás a mano.</p>
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="u-rol">Rol</label>
            <select id="u-rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="empleado">Equipo — ve sólo lo que marques</option>
              <option value="admin">Administrador — ve todo</option>
            </select>
          </div>
        </div>

        {rol === 'admin' ? (
          <div className="alerta aviso">
            <span aria-hidden="true">⚠️</span>
            <span>
              Un administrador accede a todas las secciones, incluidos sueldos, caja y la
              administración de usuarios. Dáselo sólo a quien maneje la plata.
            </span>
          </div>
        ) : (
          <fieldset style={{ border: 'none' }}>
            <legend className="form-group" style={{ marginBottom: 'var(--sp-2)' }}>
              <span
                style={{
                  fontSize: 'var(--txt-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  color: 'var(--texto-2)',
                }}
              >
                Secciones que puede ver ({permisos.length})
              </span>
            </legend>

            {grupos.map(([titulo, metas]) => {
              const todos = metas.every((m) => permisos.includes(m.clave));
              return (
                <div className="permiso-grupo" key={titulo}>
                  <div className="permiso-grupo-titulo">
                    <span>{titulo}</span>
                    <button
                      type="button"
                      className="btn fantasma sm"
                      onClick={() => alternarGrupo(metas)}
                    >
                      {todos ? 'Quitar todo' : 'Marcar todo'}
                    </button>
                  </div>
                  <div className="permiso-lista">
                    {metas.map((m) => {
                      const activo = permisos.includes(m.clave);
                      return (
                        <label
                          key={m.clave}
                          className={`permiso-item ${activo ? 'activo' : ''}`}
                          htmlFor={`permiso-${m.clave}`}
                        >
                          <input
                            id={`permiso-${m.clave}`}
                            type="checkbox"
                            checked={activo}
                            onChange={() => alternar(m.clave)}
                          />
                          <span>
                            <span className="permiso-item-label">{m.label}</span>
                            <br />
                            <span className="permiso-item-desc">{m.descripcion}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </fieldset>
        )}

        <div className="dialogo-acciones">
          <button type="button" className="btn secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

/* ------------------------------------------------------------------ */

function ResetPassword({ usuario, onCerrar }: { usuario: Usuario; onCerrar: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const guardar = useMutation({
    mutationFn: () => sendJson(`/api/usuarios/${usuario.id}/password`, 'POST', { password }),
    onSuccess: () => {
      toast(`Contraseña de ${usuario.usuario} actualizada`, { tono: 'exito' });
      onCerrar();
    },
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <Dialogo titulo={`Nueva contraseña de ${usuario.nombre}`} onCerrar={onCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          guardar.mutate();
        }}
        style={{ display: 'grid', gap: 'var(--sp-4)' }}
      >
        {error && (
          <div className="alerta urgente" role="alert">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}
        <div className="form-group">
          <label htmlFor="reset-pass">Contraseña</label>
          <input
            id="reset-pass"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="form-ayuda">
            Se cierran todas las sesiones abiertas de este usuario. Pasásela por un canal seguro.
          </p>
        </div>
        <div className="dialogo-acciones">
          <button type="button" className="btn secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
