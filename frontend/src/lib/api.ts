const base = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function parseErr(res: Response) {
  try {
    const j = await res.json();
    return j.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`);
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
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
  const res = await fetch(`${base()}/api/admin/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, force: opts?.force !== false }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export async function sendJson<T>(
  path: string,
  method: string,
  body?: unknown
): Promise<T | void> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return;
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json() as Promise<T>;
}
