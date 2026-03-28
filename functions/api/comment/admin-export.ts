import {
  commentsAdminErrorMessage,
  corsOptions,
  jsonCors,
  verifyCommentsAdminSecret,
  type Env,
} from './_shared';

export const onRequestOptions: PagesFunction<Env> = async () => corsOptions();

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const v = verifyCommentsAdminSecret(env, request);
  if (!v.ok) {
    const { status, body } = commentsAdminErrorMessage(v);
    return jsonCors(body, status);
  }

  try {
    const comments = await env.DB.prepare(
      `SELECT id, post_slug, parent_id, user_id, author_name, author_email, author_avatar,
              content, created_at, status, ip, user_agent
       FROM comments ORDER BY id ASC`
    ).all();

    const reactions = await env.DB.prepare(
      `SELECT id, comment_id, user_id, value, updated_at FROM comment_reactions ORDER BY id ASC`
    ).all();

    return jsonCors({
      ok: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      comments: Array.isArray(comments.results) ? comments.results : [],
      comment_reactions: Array.isArray(reactions.results) ? reactions.results : [],
    });
  } catch (e: any) {
    return jsonCors({ ok: false, error: e?.message || 'Export lỗi' }, 500);
  }
};
