import type { VercelRequest, VercelResponse } from '@vercel/node';

export type GuardResult = { ok: true; isAdmin: boolean } | { ok: false; status: number; error: string };

function bearerFromReq(req: VercelRequest): string {
  const h = String((req.headers as any)?.authorization || '').trim();
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
}

export async function guardAdmin(req: VercelRequest, _res: VercelResponse): Promise<GuardResult> {
  const url = String(process.env.SUPABASE_ADMIN_URL || process.env.VITE_SUPABASE_ADMIN_URL || '').trim().replace(/\/$/, '');
  const anon = String(process.env.SUPABASE_ADMIN_ANON_KEY || '').trim();
  if (!url || !anon) {
    return { ok: false, status: 500, error: 'Thiếu SUPABASE_ADMIN_URL hoặc SUPABASE_ADMIN_ANON_KEY trên Vercel.' };
  }
  const token = bearerFromReq(req);
  if (!token) return { ok: false, status: 401, error: 'Thiếu Authorization Bearer token.' };

  const r = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!r.ok) return { ok: false, status: 401, error: 'Token không hợp lệ hoặc đã hết hạn.' };
  const u = await r.json().catch(() => ({}));
  const role = String(u?.app_metadata?.role || '').trim().toLowerCase();
  return { ok: true, isAdmin: role === 'admin' };
}

export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const g = await guardAdmin(req, res);
  if (!g.ok) {
    res.status(g.status).json({ ok: false, error: g.error });
    return false;
  }
  if (!g.isAdmin) {
    res.status(403).json({ ok: false, error: 'Tài khoản không có role admin (chỉ xem).' });
    return false;
  }
  return true;
}

