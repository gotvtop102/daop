export interface Env {
  DB: D1Database;
  COMMENT_CACHE: KVNamespace;
  COMMENT_RATE_LIMIT: KVNamespace;
  SUPABASE_JWT_SECRET: string;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function normalizeSlug(input: unknown): string {
  const slug = String(input || '').trim().toLowerCase();
  return slug.replace(/[^a-z0-9\-_/\.]/g, '').slice(0, 180);
}

export function parsePage(input: unknown, fallback = 1, max = 1000): number {
  const n = Number.parseInt(String(input || fallback), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export function parseLimit(input: unknown, fallback = 20, max = 50): number {
  const n = Number.parseInt(String(input || fallback), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeCommentText(input: unknown): string {
  const raw = String(input || '').replace(/\r\n/g, '\n').trim();
  const clipped = raw.slice(0, 4000);
  return clipped.replace(/[<>]/g, '');
}

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function b64urlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToB64url(input: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < input.length; i += 1) binary += String.fromCharCode(input[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export interface JwtPayload {
  sub?: string;
  email?: string;
  exp?: number;
  iat?: number;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
}

export async function verifySupabaseJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    if (!header || header.alg !== 'HS256') return null;

    const data = `${h}.${p}`;
    const key = await crypto.subtle.importKey(
      'raw',
      toBytes(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, toBytes(data));
    const expected = bytesToB64url(new Uint8Array(sig));
    if (expected !== s) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as JwtPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function pickAuthor(payload: JwtPayload): {
  userId: string;
  authorName: string;
  authorEmail: string;
  authorAvatar: string;
  isAdmin: boolean;
} {
  const userMeta = payload.user_metadata || {};
  const appMeta = payload.app_metadata || {};
  const role = String(appMeta.role || appMeta.user_role || '').toLowerCase();
  const userId = String(payload.sub || '').trim();
  const email = String(payload.email || userMeta.email || '').trim();
  const authorName =
    String(userMeta.full_name || userMeta.name || userMeta.preferred_username || email.split('@')[0] || 'Người dùng').trim();
  const authorAvatar = String(userMeta.avatar_url || userMeta.picture || '').trim();
  const isAdmin = role === 'admin';
  return {
    userId,
    authorName: authorName.slice(0, 120),
    authorEmail: email.slice(0, 180),
    authorAvatar: authorAvatar.slice(0, 300),
    isAdmin,
  };
}

export async function checkRateLimitByIp(env: Env, ip: string, maxHit = 5, windowSec = 300): Promise<boolean> {
  const key = `comment:rl:${ip || 'unknown'}`;
  const cur = Number.parseInt((await env.COMMENT_RATE_LIMIT.get(key)) || '0', 10) || 0;
  if (cur >= maxHit) return false;
  await env.COMMENT_RATE_LIMIT.put(key, String(cur + 1), { expirationTtl: windowSec });
  return true;
}

