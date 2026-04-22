import type { VercelRequest, VercelResponse } from '@vercel/node';
import { guardAdmin } from './admin-guard.js';
import { authHeaders, errFromRes, getRestEnv, restFetchByScope, restJson } from './supabase-rest.js';

function parseAction(req: VercelRequest): string {
  return String((req.query as any)?.action || (req.body as any)?.action || '')
    .trim()
    .toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const g = await guardAdmin(req, res);
  if (g.ok === false) return res.status(g.status).json({ ok: false, error: g.error });

  try {
    const { key } = getRestEnv('admin');
    if (!key) {
      return res.status(500).json({ ok: false, error: 'Thiếu SUPABASE_ADMIN_SERVICE_ROLE_KEY trên Vercel.' });
    }

    const action = parseAction(req);
    if (action === 'sections') {
      const path =
        '/homepage_sections?select=*&order=sort_order.asc';
      const r = await restFetchByScope('admin', path, {
        method: 'GET',
        key,
        headers: authHeaders(key),
      });
      if (!r.ok) throw await errFromRes(r);
      const data = await restJson<any[]>(r);
      return res.status(200).json({ ok: true, data: data || [] });
    }

    if (action === 'site-config') {
      const keys = ['r2_img_domain', 'ophim_img_domain'];
      const inFilter = `key=in.(${keys.join(',')})`;
      const path = `/site_settings?select=key,value&${inFilter}`;
      const r = await restFetchByScope('admin', path, {
        method: 'GET',
        key,
        headers: authHeaders(key),
      });
      if (!r.ok) throw await errFromRes(r);
      const rows = await restJson<Array<{ key: string; value: string }>>(r);
      const out = (rows || []).reduce<Record<string, string>>((acc, row) => {
        acc[String(row.key || '')] = String(row.value || '');
        return acc;
      }, {});
      return res.status(200).json({ ok: true, data: out });
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
}
