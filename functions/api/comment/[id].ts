import { json, pickAuthor, verifySupabaseJwt, type Env } from './_shared';

export const onRequestDelete: PagesFunction<Env> = async ({ env, request, params }) => {
  const id = Number.parseInt(String(params?.id || ''), 10);
  if (!Number.isFinite(id) || id <= 0) return json({ error: 'id không hợp lệ' }, 400);

  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json({ error: 'Thiếu token đăng nhập' }, 401);

  const payload = await verifySupabaseJwt(token, String(env.SUPABASE_JWT_SECRET || ''));
  if (!payload) return json({ error: 'Token không hợp lệ hoặc đã hết hạn' }, 401);
  const author = pickAuthor(payload);
  if (!author.userId) return json({ error: 'Token thiếu user_id' }, 401);

  const found = await env.DB.prepare('SELECT id, user_id, post_slug FROM comments WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ id: number; user_id: string; post_slug: string }>();
  if (!found) return json({ error: 'Không tìm thấy bình luận' }, 404);

  if (!author.isAdmin && found.user_id !== author.userId) {
    return json({ error: 'Bạn không có quyền xóa bình luận này' }, 403);
  }

  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  await env.COMMENT_CACHE.delete(`has:${found.post_slug}`);
  return json({ ok: true, id });
};

