import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-guard.js';

try {
  // Local dev convenience: Vercel production injects env vars, but local Node may not.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
} catch (e) {
  // ignore
}

type ImportMode = 'upsert' | 'replace';

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function json(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function ok(res: VercelResponse, data: any) {
  return json(res, 200, { ok: true, ...data });
}

function fail(res: VercelResponse, status: number, message: string, extra?: any) {
  return json(res, status, { ok: false, message, ...(extra || {}) });
}

const DEFAULT_TABLES = ['profiles', 'favorites', 'watch_history', 'user_changes'] as const;

function normalizeTables(input: any): string[] {
  const arr = Array.isArray(input) ? input : [];
  const cleaned = arr.map((x) => String(x || '').trim()).filter(Boolean);
  const allowed = new Set(DEFAULT_TABLES as unknown as string[]);
  const picked = cleaned.filter((t) => allowed.has(t));
  return picked.length ? picked : [...DEFAULT_TABLES];
}

async function deleteAllRows(client: any, table: string) {
  // Best-effort delete without knowing PK. We only target known tables.
  // Prefer delete by created_at if exists; fallback to generic not-null checks.
  const attempts = [
    () => client.from(table).delete({ count: 'exact' }).gte('created_at', '1970-01-01T00:00:00.000Z'),
    () => client.from(table).delete({ count: 'exact' }).gte('last_watched', '1970-01-01T00:00:00.000Z'),
    () => client.from(table).delete({ count: 'exact' }).neq('id', '00000000-0000-0000-0000-000000000000'),
    () => client.from(table).delete({ count: 'exact' }).not('id', 'is', null),
    () => client.from(table).delete({ count: 'exact' }).not('user_uid', 'is', null),
  ];

  let lastErr: any = null;
  for (const fn of attempts) {
    const r: any = await fn();
    if (!r?.error) return r;
    lastErr = r.error;
  }
  throw lastErr;
}

async function upsertRows(client: any, table: string, rows: any[]) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { count: 0 };

  // Use explicit onConflict for known uniques to make import stable.
  if (table === 'profiles') {
    const r: any = await client.from(table).upsert(list, { onConflict: 'id', count: 'exact' });
    if (r.error) throw r.error;
    return { count: typeof r.count === 'number' ? r.count : list.length };
  }

  if (table === 'favorites') {
    const r: any = await client.from(table).upsert(list, { onConflict: 'user_uid,movie_slug', count: 'exact' });
    if (r.error) throw r.error;
    return { count: typeof r.count === 'number' ? r.count : list.length };
  }

  if (table === 'watch_history') {
    const r: any = await client.from(table).upsert(list, { onConflict: 'user_uid,movie_slug', count: 'exact' });
    if (r.error) throw r.error;
    return { count: typeof r.count === 'number' ? r.count : list.length };
  }

  const r: any = await client.from(table).upsert(list, { count: 'exact' });
  if (r.error) throw r.error;
  return { count: typeof r.count === 'number' ? r.count : list.length };
}

async function insertRows(client: any, table: string, rows: any[]) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { count: 0 };
  const r: any = await client.from(table).insert(list, { count: 'exact' });
  if (r.error) throw r.error;
  return { count: typeof r.count === 'number' ? r.count : list.length };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return fail(res, 405, 'Method not allowed');
  }

  if (!(await requireAdmin(req, res))) return;

  try {
    const url = getEnv('SUPABASE_USER_URL');
    const serviceKey = getEnv('SUPABASE_USER_SERVICE_ROLE_KEY');

    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const action = String((req.body as any)?.action || '').trim();
    const mode = String((req.body as any)?.mode || 'upsert') as ImportMode;
    const tables = normalizeTables((req.body as any)?.tables);

    if (action === 'export') {
      const payload: Record<string, any[]> = {};
      for (const t of tables) {
        const r: any = await client.from(t).select('*');
        if (r.error) throw r.error;
        payload[t] = r.data ?? [];
      }
      payload.__meta = [{ exported_at: new Date().toISOString(), tables }];
      return ok(res, { data: payload });
    }

    if (action === 'import') {
      const incoming = (req.body as any)?.data;
      if (!incoming || typeof incoming !== 'object') {
        return fail(res, 400, 'Missing data');
      }

      const summary: Record<string, number> = {};

      for (const t of tables) {
        const rows = Array.isArray(incoming[t]) ? incoming[t] : [];
        if (mode === 'replace') {
          await deleteAllRows(client, t);
          const ins = await insertRows(client, t, rows);
          summary[t] = ins.count;
        } else {
          const up = await upsertRows(client, t, rows);
          summary[t] = up.count;
        }
      }

      return ok(res, { summary });
    }

    return fail(res, 400, 'Invalid action');
  } catch (e: any) {
    return fail(res, 500, e?.message || 'Server error');
  }
}
