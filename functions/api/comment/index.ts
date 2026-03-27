import {
  badRequest,
  checkRateLimitByIp,
  json,
  normalizeSlug,
  parseLimit,
  parsePage,
  pickAuthor,
  sanitizeCommentText,
  verifySupabaseJwt,
  type Env,
} from './_shared';

interface CommentRow {
  id: number;
  post_slug: string;
  parent_id: number;
  user_id: string;
  author_name: string;
  author_email: string;
  author_avatar: string;
  content: string;
  created_at: string;
}

const cachePageKey = (slug: string, page: number, limit: number) => `comments:${slug}:page:${page}:limit:${limit}`;

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const postSlug = normalizeSlug(url.searchParams.get('postSlug'));
  if (!postSlug) return badRequest('Thiếu postSlug');

  const page = parsePage(url.searchParams.get('page'), 1, 1000);
  const limit = parseLimit(url.searchParams.get('limit'), 20, 50);
  const offset = (page - 1) * limit;
  const key = cachePageKey(postSlug, page, limit);

  const cached = await env.COMMENT_CACHE.get(key);
  if (cached) {
    return new Response(cached, {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120' },
    });
  }

  const rows = await env.DB.prepare(
    `SELECT id, post_slug, parent_id, user_id, author_name, author_email, author_avatar, content, created_at
     FROM comments
     WHERE post_slug = ? AND status = 'approved'
     ORDER BY id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(postSlug, limit, offset)
    .all<CommentRow>();

  const list = Array.isArray(rows.results) ? rows.results : [];
  const hasMore = list.length === limit;
  const payload = { postSlug, page, limit, hasMore, items: list };
  const body = JSON.stringify(payload);
  await env.COMMENT_CACHE.put(key, body, { expirationTtl: 300 });
  return new Response(body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120' },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return badRequest('Content-Type phải là application/json');

  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json({ error: 'Thiếu token đăng nhập' }, 401);

  const payload = await verifySupabaseJwt(token, String(env.SUPABASE_JWT_SECRET || ''));
  if (!payload) return json({ error: 'Token không hợp lệ hoặc đã hết hạn' }, 401);

  const author = pickAuthor(payload);
  if (!author.userId) return json({ error: 'Token thiếu user_id' }, 401);

  const body = (await request.json().catch(() => null)) as Record<string, any> | null;
  if (!body) return badRequest('Body không hợp lệ');
  if (String(body.hp || '').trim() !== '') return json({ ok: true });

  const postSlug = normalizeSlug(body.postSlug);
  if (!postSlug) return badRequest('postSlug không hợp lệ');

  const parentId = Number.parseInt(String(body.parentId || 0), 10) || 0;
  const content = sanitizeCommentText(body.content);
  if (content.length < 2) return badRequest('Nội dung quá ngắn');
  if (content.length > 4000) return badRequest('Nội dung quá dài');

  const ip = (request.headers.get('cf-connecting-ip') || '').slice(0, 80);
  const userAgent = (request.headers.get('user-agent') || '').slice(0, 255);
  const allowed = await checkRateLimitByIp(env, ip || 'unknown', 5, 300);
  if (!allowed) return json({ error: 'Bạn gửi bình luận quá nhanh, thử lại sau ít phút.' }, 429);

  const inserted = await env.DB.prepare(
    `INSERT INTO comments
      (post_slug, parent_id, user_id, author_name, author_email, author_avatar, content, status, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)
     RETURNING id, post_slug, parent_id, user_id, author_name, author_email, author_avatar, content, created_at`
  )
    .bind(
      postSlug,
      parentId,
      author.userId,
      author.authorName,
      author.authorEmail || null,
      author.authorAvatar || null,
      content,
      ip || null,
      userAgent || null
    )
    .first<CommentRow>();

  if (!inserted) return json({ error: 'Không thể tạo bình luận' }, 500);

  await env.COMMENT_CACHE.delete(`has:${postSlug}`);
  for (let p = 1; p <= 5; p += 1) {
    await env.COMMENT_CACHE.delete(cachePageKey(postSlug, p, 20));
  }

  return json({ ok: true, item: inserted }, 201);
};

