import { json, pickAuthor, verifySupabaseJwt, type Env } from './_shared';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json({ error: 'Thiếu token đăng nhập' }, 401);

  const payload = await verifySupabaseJwt(token, String(env.SUPABASE_JWT_SECRET || ''));
  if (!payload) return json({ error: 'Token không hợp lệ hoặc đã hết hạn' }, 401);
  const author = pickAuthor(payload);
  if (!author.userId) return json({ error: 'Token thiếu user_id' }, 401);

  const body = (await request.json().catch(() => null)) as Record<string, any> | null;
  if (!body) return json({ error: 'Body không hợp lệ' }, 400);

  const commentId = Number.parseInt(String(body.commentId || 0), 10) || 0;
  const value = Number.parseInt(String(body.value || 0), 10) || 0;
  if (!commentId) return json({ error: 'commentId không hợp lệ' }, 400);
  if (![1, -1, 0].includes(value)) return json({ error: 'value chỉ nhận -1, 0, 1' }, 400);

  const comment = await env.DB.prepare('SELECT id, post_slug FROM comments WHERE id = ? LIMIT 1')
    .bind(commentId)
    .first<{ id: number; post_slug: string }>();
  if (!comment) return json({ error: 'Không tìm thấy bình luận' }, 404);

  if (value === 0) {
    await env.DB.prepare('DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ?')
      .bind(commentId, author.userId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO comment_reactions (comment_id, user_id, value, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(comment_id, user_id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    )
      .bind(commentId, author.userId, value)
      .run();
  }

  const row = await env.DB.prepare(
    `SELECT
      COALESCE((SELECT COUNT(1) FROM comment_reactions r WHERE r.comment_id = ? AND r.value = 1), 0) AS like_count,
      COALESCE((SELECT COUNT(1) FROM comment_reactions r WHERE r.comment_id = ? AND r.value = -1), 0) AS dislike_count`
  )
    .bind(commentId, commentId)
    .first<{ like_count: number; dislike_count: number }>();

  await env.COMMENT_CACHE.delete(`has:${comment.post_slug}`);

  return json({
    ok: true,
    commentId,
    likeCount: Number(row?.like_count || 0),
    dislikeCount: Number(row?.dislike_count || 0),
    myReaction: value,
  });
};

