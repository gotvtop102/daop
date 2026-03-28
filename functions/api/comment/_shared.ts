export interface Env {
  DB: D1Database;
  COMMENT_CACHE: KVNamespace;
  COMMENT_RATE_LIMIT: KVNamespace;
  SUPABASE_JWT_SECRET: string;
  /** Bí mật dùng cho export/import comment qua Admin (header X-Comments-Admin-Secret hoặc Bearer cùng giá trị). Đặt trên Pages → Environment variables. */
  COMMENTS_ADMIN_SECRET?: string;
}

const CORS_ADMIN = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Comments-Admin-Secret, Authorization',
};

export function jsonCors(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS_ADMIN,
    },
  });
}

export function corsOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_ADMIN });
}

export type CommentsAdminVerify =
  | { ok: true }
  | { ok: false; reason: 'missing_env' | 'bad_header' };

const MIN_SECRET_LEN = 8;

/** Export/import bulk — không dùng JWT User; chỉ secret khớp COMMENTS_ADMIN_SECRET. */
export function verifyCommentsAdminSecret(env: Env, request: Request): CommentsAdminVerify {
  const raw = env.COMMENTS_ADMIN_SECRET;
  const secret = String(raw ?? '').trim();
  if (!secret) {
    return { ok: false, reason: 'missing_env' };
  }
  if (secret.length < MIN_SECRET_LEN) {
    return { ok: false, reason: 'missing_env' };
  }
  const xh = request.headers.get('x-comments-admin-secret')?.trim() || '';
  if (xh && xh === secret) return { ok: true };
  const auth = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (bearer && bearer === secret) return { ok: true };
  return { ok: false, reason: 'bad_header' };
}

export function commentsAdminErrorMessage(
  v: Extract<CommentsAdminVerify, { ok: false }>
): { status: number; body: Record<string, unknown> } {
  if (v.reason === 'missing_env') {
    return {
      status: 503,
      body: {
        ok: false,
        error:
          'COMMENTS_ADMIN_SECRET chưa có trên worker (env rỗng) hoặc quá ngắn (<8 ký tự). Thêm Secret trên Cloudflare Pages (Production và Preview nếu cần), rồi redeploy.',
        hint: 'wrangler pages secret put COMMENTS_ADMIN_SECRET --project-name=<tên>',
      },
    };
  }
  return {
    status: 401,
    body: {
      ok: false,
      error: 'Header X-Comments-Admin-Secret hoặc Bearer không khớp với COMMENTS_ADMIN_SECRET trên Cloudflare.',
    },
  };
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
  iss?: string;
  sub?: string;
  email?: string;
  exp?: number;
  iat?: number;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
}

type JwkKey = {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
};

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

const jwksCache: Map<string, { exp: number; keys: JwkKey[] }> = new Map();

async function verifyHs256(tokenParts: string[], secret: string): Promise<boolean> {
  const [h, p, s] = tokenParts;
  if (!secret) return false;
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
  return expected === s;
}

async function getJwks(issuer: string): Promise<JwkKey[]> {
  const now = Date.now();
  const cached = jwksCache.get(issuer);
  if (cached && cached.exp > now) return cached.keys;

  const url = issuer.replace(/\/$/, '') + '/.well-known/jwks.json';
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { keys?: JwkKey[] } | null;
  const keys = Array.isArray(data?.keys) ? data!.keys! : [];
  jwksCache.set(issuer, { exp: now + 10 * 60 * 1000, keys });
  return keys;
}

async function verifyRs256(tokenParts: string[], header: JwtHeader, payload: JwtPayload): Promise<boolean> {
  const [h, p, s] = tokenParts;
  const iss = String(payload.iss || '').trim();
  if (!iss) return false;

  const keys = await getJwks(iss);
  if (!keys.length) return false;

  const key = keys.find((k) => {
    if (String(k.kty || '') !== 'RSA') return false;
    if (header.kid && k.kid && header.kid !== k.kid) return false;
    return true;
  });
  if (!key || !key.n || !key.e) return false;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: key.n,
      e: key.e,
      alg: 'RS256',
      ext: true,
      key_ops: ['verify'],
    },
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify']
  );

  const verified = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    b64urlToBytes(s),
    toBytes(`${h}.${p}`)
  );
  return !!verified;
}

export async function verifySupabaseJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [h, p] = parts;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h))) as JwtHeader;
    if (!header || !header.alg) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as JwtPayload;

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec >= payload.exp) return null;

    if (header.alg === 'HS256') {
      const ok = await verifyHs256(parts, secret);
      if (!ok) return null;
      return payload;
    }

    if (header.alg === 'RS256') {
      const ok = await verifyRs256(parts, header, payload);
      if (!ok) return null;
      return payload;
    }

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
  const authorName = String(userMeta.full_name || userMeta.name || userMeta.preferred_username || 'Người dùng').trim();
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

