import {
  corsOptions,
  jsonCors,
  normalizeSlug,
  verifyCommentsAdminSecret,
  type Env,
} from './_shared';

export const onRequestOptions: PagesFunction<Env> = async () => corsOptions();

type CommentRow = {
  id?: number;
  post_slug?: string;
  parent_id?: number;
  user_id?: string;
  author_name?: string;
  author_email?: string;
  author_avatar?: string;
  content?: string;
  created_at?: string;
  status?: string;
  ip?: string;
  user_agent?: string;
};

type ReactionRow = {
  id?: number;
  comment_id?: number;
  user_id?: string;
  value?: number;
  updated_at?: string;
};

function invalidateSlugCache(env: Env, slug: string) {
  const s = normalizeSlug(slug);
  if (s) return env.COMMENT_CACHE.delete(`has:${s}`);
  return Promise.resolve();
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!verifyCommentsAdminSecret(env, request)) {
    return jsonCors({ ok: false, error: 'Thiếu hoặc sai COMMENTS_ADMIN_SECRET' }, 401);
  }

  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return jsonCors({ ok: false, error: 'Content-Type phải là application/json' }, 400);
  }

  const body = (await request.json().catch(() => null)) as Record<string, any> | null;
  if (!body || typeof body !== 'object') {
    return jsonCors({ ok: false, error: 'Body không hợp lệ' }, 400);
  }

  const mode = String(body.mode || 'merge').toLowerCase() === 'replace' ? 'replace' : 'merge';
  const commentsIn = Array.isArray(body.comments) ? (body.comments as CommentRow[]) : [];
  const reactionsIn = Array.isArray(body.comment_reactions) ? (body.comment_reactions as ReactionRow[]) : [];

  if (!commentsIn.length && !reactionsIn.length && mode === 'merge') {
    return jsonCors({ ok: false, error: 'Không có dữ liệu comments hoặc comment_reactions' }, 400);
  }

  const slugSet = new Set<string>();

  try {
    if (mode === 'replace') {
      await env.DB.prepare('DELETE FROM comment_reactions').run();
      await env.DB.prepare('DELETE FROM comments').run();
    }

    const insertComment = env.DB.prepare(
      `INSERT INTO comments (id, post_slug, parent_id, user_id, author_name, author_email, author_avatar, content, created_at, status, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         post_slug = excluded.post_slug,
         parent_id = excluded.parent_id,
         user_id = excluded.user_id,
         author_name = excluded.author_name,
         author_email = excluded.author_email,
         author_avatar = excluded.author_avatar,
         content = excluded.content,
         created_at = excluded.created_at,
         status = excluded.status,
         ip = excluded.ip,
         user_agent = excluded.user_agent`
    );

    const sortedComments = [...commentsIn].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

    for (const row of sortedComments) {
      const id = Number.parseInt(String(row.id), 10);
      if (!Number.isFinite(id) || id <= 0) continue;
      const postSlug = normalizeSlug(row.post_slug);
      if (!postSlug) continue;
      const parentId = Number.parseInt(String(row.parent_id ?? 0), 10) || 0;
      const userId = String(row.user_id || '').trim().slice(0, 120) || 'unknown';
      const authorName = String(row.author_name || 'Ẩn danh').trim().slice(0, 120);
      const authorEmail = String(row.author_email || '').trim().slice(0, 180);
      const authorAvatar = String(row.author_avatar || '').trim().slice(0, 300);
      const content = String(row.content || '').trim().slice(0, 4000);
      if (!content) continue;
      const createdAt = String(row.created_at || '').trim() || new Date().toISOString();
      const status = String(row.status || 'approved').trim().slice(0, 32) || 'approved';
      const ip = String(row.ip || '').trim().slice(0, 64);
      const userAgent = String(row.user_agent || '').trim().slice(0, 256);

      await insertComment
        .bind(
          id,
          postSlug,
          parentId,
          userId,
          authorName,
          authorEmail || null,
          authorAvatar || null,
          content,
          createdAt,
          status,
          ip || null,
          userAgent || null
        )
        .run();
      slugSet.add(postSlug);
    }

    const insertReaction = env.DB.prepare(
      `INSERT INTO comment_reactions (id, comment_id, user_id, value, updated_at)
       VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
       ON CONFLICT(id) DO UPDATE SET
         comment_id = excluded.comment_id,
         user_id = excluded.user_id,
         value = excluded.value,
         updated_at = excluded.updated_at`
    );

    for (const row of reactionsIn) {
      const id = Number.parseInt(String(row.id), 10);
      const commentId = Number.parseInt(String(row.comment_id), 10);
      const userId = String(row.user_id || '').trim();
      const value = Number.parseInt(String(row.value), 10);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!Number.isFinite(commentId) || commentId <= 0) continue;
      if (!userId) continue;
      if (value !== 1 && value !== -1) continue;
      const updatedAt = String(row.updated_at || '').trim() || null;
      await insertReaction.bind(id, commentId, userId, value, updatedAt).run();
    }

    if (mode === 'replace' && commentsIn.length) {
      for (const row of commentsIn) {
        const ps = normalizeSlug(row.post_slug);
        if (ps) slugSet.add(ps);
      }
    }

    await Promise.all([...slugSet].map((s) => invalidateSlugCache(env, s)));

    return jsonCors({
      ok: true,
      mode,
      commentsUpserted: sortedComments.filter((r) => Number(r.id) > 0).length,
      reactionsProcessed: reactionsIn.length,
      slugsCacheInvalidated: slugSet.size,
    });
  } catch (e: any) {
    return jsonCors({ ok: false, error: e?.message || 'Import lỗi' }, 500);
  }
};
