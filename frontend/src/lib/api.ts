const base = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  datos?: unknown;

  constructor(mensaje: string, status: number, code?: string, datos?: unknown) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.datos = datos;
  }

  get esSesion() {
    return this.status === 401;
  }
  get esPermiso() {
    return this.status === 403;
  }
  get esConflicto() {
    return this.status === 409;
  }
}

/** Se avisa a la app cuando el backend dice que la sesión ya no sirve. */
type SinSesionHandler = () => void;
let alPerderSesion: SinSesionHandler = () => {};
export function onSesionCaida(fn: SinSesionHandler) {
  alPerderSesion = fn;
}

async function armarError(res: Response) {
  let mensaje = res.statusText || `Error ${res.status}`;
  let code: string | undefined;
  let datos: unknown;
  try {
    const j = await res.json();
    mensaje = j.error || mensaje;
    code = j.code;
    datos = j;
  } catch {
    /* respuesta sin cuerpo JSON */
  }
  return new ApiError(mensaje, res.status, code, datos);
}

async function pedir<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      ...init,
      // Imprescindible: la sesión viaja en una cookie httpOnly.
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor', 0, 'SIN_RED');
  }

  if (res.status === 401) {
    const err = await armarError(res);
    alPerderSesion();
    throw err;
  }
  if (!res.ok) throw await armarError(res);
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

export function getJson<T>(path: string): Promise<T> {
  return pedir<T>(path);
}

export function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  return pedir<T>(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Guardado que sobrevive al cierre de la pestaña: un fetch normal se cancela
 * al descargar la página, con keepalive el navegador lo termina igual.
 */
export function sendJsonKeepalive(path: string, body: unknown) {
  return fetch(`${base()}${path}`, {
    method: 'PUT',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export async function postAdminSeed(
  secret: string,
  opts?: { force?: boolean }
): Promise<{
  ok: boolean;
  force: boolean;
  insertedClientes: number;
  insertedProveedores: number;
  settingsUpserted: boolean;
  totals: { clientes: number; proveedores: number };
}> {
  return sendJson('/api/admin/seed', 'POST', { secret, force: opts?.force !== false });
}
