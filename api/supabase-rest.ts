/**
 * Gọi Supabase PostgREST bằng fetch — không dùng @supabase/supabase-js (tránh lỗi bundle / FUNCTION_INVOCATION_FAILED trên Vercel).
 */

export type RestScope = 'admin' | 'movies' | 'episodes';

function pickByScope(scope: RestScope): { url: string; key: string } {
  if (scope === 'movies') {
    return {
      url: String(process.env.SUPABASE_MOVIES_URL || process.env.VITE_SUPABASE_MOVIES_URL || '')
        .trim()
        .replace(/\/$/, ''),
      key: String(process.env.SUPABASE_MOVIES_SERVICE_ROLE_KEY || '').trim(),
    };
  }
  if (scope === 'episodes') {
    return {
      url: String(process.env.SUPABASE_EPISODES_URL || process.env.VITE_SUPABASE_EPISODES_URL || '')
        .trim()
        .replace(/\/$/, ''),
      key: String(process.env.SUPABASE_EPISODES_SERVICE_ROLE_KEY || '').trim(),
    };
  }
  return {
    url: String(process.env.SUPABASE_ADMIN_URL || process.env.VITE_SUPABASE_ADMIN_URL || '')
      .trim()
      .replace(/\/$/, ''),
    key: String(process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY || '').trim(),
  };
}

export function getRestEnv(scope: RestScope = 'admin') {
  const { url, key } = pickByScope(scope);
  return { url, key };
}

export function authHeaders(key: string, prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

export async function errFromRes(res: Response): Promise<Error> {
  const t = await res.text();
  let msg = t;
  try {
    const j = JSON.parse(t);
    msg = j.message || j.details || j.hint || j.code || t;
  } catch {
    /* ignore */
  }
  return new Error(msg || `HTTP ${res.status}`);
}

export function parseContentRangeTotal(res: Response): number | undefined {
  const cr = res.headers.get('content-range');
  if (!cr) return undefined;
  const m = cr.match(/\/(\d+)$/);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

export async function restFetch(path: string, init: RequestInit & { key: string }): Promise<Response> {
  const { key, ...rest } = init;
  const { url } = getRestEnv('admin');
  const fullUrl = `${url}/rest/v1${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(rest.headers);
  if (!headers.has('apikey')) headers.set('apikey', key);
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${key}`);
  if (!headers.has('Content-Type') && rest.body) headers.set('Content-Type', 'application/json');
  return fetch(fullUrl, { ...rest, headers });
}

export async function restFetchByScope(
  scope: RestScope,
  path: string,
  init: RequestInit & { key: string }
): Promise<Response> {
  const { key, ...rest } = init;
  const { url } = getRestEnv(scope);
  const fullUrl = `${url}/rest/v1${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(rest.headers);
  if (!headers.has('apikey')) headers.set('apikey', key);
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${key}`);
  if (!headers.has('Content-Type') && rest.body) headers.set('Content-Type', 'application/json');
  return fetch(fullUrl, { ...rest, headers });
}

export async function restJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw await errFromRes(res);
  const text = await res.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from Supabase: ${text.slice(0, 200)}`);
  }
}
