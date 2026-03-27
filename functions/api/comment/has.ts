import { badRequest, json, normalizeSlug, type Env } from './_shared';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const postSlug = normalizeSlug(url.searchParams.get('postSlug'));
  if (!postSlug) return badRequest('Thiếu postSlug');

  const cacheKey = `has:${postSlug}`;
  const cached = await env.COMMENT_CACHE.get(cacheKey);
  if (cached != null) return json({ postSlug, has: cached === '1' });

  const row = await env.DB.prepare(
    `SELECT 1 AS has FROM comments WHERE post_slug = ? AND status = 'approved' LIMIT 1`
  )
    .bind(postSlug)
    .first<{ has?: number }>();

  const has = !!row?.has;
  await env.COMMENT_CACHE.put(cacheKey, has ? '1' : '0', { expirationTtl: 300 });
  return json({ postSlug, has });
};

