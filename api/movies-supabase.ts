import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { applyMovieR2Uploads } from './movies-media';

function getEnv() {
  const url = String(
    process.env.SUPABASE_ADMIN_URL || process.env.VITE_SUPABASE_ADMIN_URL || ''
  ).trim();
  const key = String(process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY || '').trim();
  return { url, key };
}

export function isSupabaseMoviesConfigured() {
  const { url, key } = getEnv();
  return !!(url && key);
}

export function getSupabaseAdmin(): SupabaseClient {
  const { url, key } = getEnv();
  if (!url || !key) {
    throw new Error(
      'Thiếu URL Supabase Admin (SUPABASE_ADMIN_URL hoặc VITE_SUPABASE_ADMIN_URL) hoặc SUPABASE_ADMIN_SERVICE_ROLE_KEY. ' +
        'Không dùng VITE_SUPABASE_ADMIN_ANON_KEY cho API phim — cần service_role.'
    );
  }
  return createClient(url, key);
}

function rowToMovie(row: Record<string, any>) {
  const m: any = { ...row };
  if (m.content && !m.description) m.description = m.content;
  if (m.name && !m.title) m.title = m.name;
  return m;
}

export async function listMoviesSb(
  type: string,
  page: number,
  limit: number,
  search: string,
  unbuiltOnly: boolean,
  duplicatesOnly: boolean
) {
  const sb = getSupabaseAdmin();

  if (duplicatesOnly) {
    const { data: dupSlugs, error: rpcErr } = await sb.rpc('movies_duplicate_slugs');
    if (rpcErr) throw rpcErr;
    const slugs = (dupSlugs || []).map((r: any) => (typeof r === 'string' ? r : r?.slug)).filter(Boolean);
    if (!slugs.length) {
      return { data: [], total: 0, page, limit };
    }
    let q = sb.from('movies').select('*', { count: 'exact' }).in('slug', slugs);
    if (type && type !== 'all') {
      q = q.eq('type', type);
    }
    const { data: rows, error, count } = await q;
    if (error) throw error;
    let movies = (rows || []).map((r, i) => ({ ...rowToMovie(r), _rowIndex: i + 2 }));
    movies = sortMoviesLikeSheet(movies);
    const total = count ?? movies.length;
    const start = (page - 1) * limit;
    return { data: movies.slice(start, start + limit), total, page, limit };
  }

  let q = sb.from('movies').select('*', { count: 'exact' });

  if (type && type !== 'all') {
    q = q.eq('type', type);
  }
  if (unbuiltOnly) {
    q = q.eq('update', 'NEW');
  }
  if (search.trim()) {
    const raw = search.trim().replace(/%/g, '\\%').replace(/,/g, ' ');
    const s = `%${raw}%`;
    q = q.or(`title.ilike.${s},origin_name.ilike.${s},id.ilike.${s}`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, error, count } = await q.order('modified', { ascending: false, nullsFirst: false }).range(from, to);
  if (error) throw error;

  const movies = (rows || []).map((r, i) => ({ ...rowToMovie(r), _rowIndex: from + i + 2 }));
  return { data: movies, total: count ?? movies.length, page, limit };
}

function sortMoviesLikeSheet(movies: any[]) {
  const toTs = (v: any) => {
    const s = String(v || '').trim();
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  };
  return [...movies].sort((a: any, b: any) => {
    const ta = Math.max(toTs(a.modified), toTs(a.update));
    const tb = Math.max(toTs(b.modified), toTs(b.update));
    if (ta !== tb) return tb - ta;
    const ra = Number(a._rowIndex || 0);
    const rb = Number(b._rowIndex || 0);
    return rb - ra;
  });
}

export async function getMovieSb(id: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('movies').select('*').eq('id', String(id).trim()).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToMovie(data);
}

export async function getMovieBySlugSb(slug: string) {
  const sb = getSupabaseAdmin();
  const s = String(slug || '').trim();
  if (!s) return null;
  const { data: rows, error } = await sb.from('movies').select('*').eq('slug', s);
  if (error) throw error;
  if (!rows?.length) return null;
  const sorted = sortMoviesLikeSheet(rows.map((r, i) => ({ ...rowToMovie(r), _rowIndex: i + 2 })));
  return sorted[0] || null;
}

function moviePayloadToRow(movieData: any) {
  const str = (v: any) => (Array.isArray(v) ? v.join(',') : v ?? '') || '';
  return {
    id: String(movieData.id ?? '').trim(),
    slug: str(movieData.slug),
    title: str(movieData.title),
    name: str(movieData.name),
    origin_name: str(movieData.origin_name),
    type: str(movieData.type),
    year: str(movieData.year),
    genre: str(movieData.genre),
    country: str(movieData.country),
    language: str(movieData.language),
    quality: str(movieData.quality),
    episode_current: str(movieData.episode_current),
    thumb_url: str(movieData.thumb_url),
    poster_url: str(movieData.poster_url),
    description: str(movieData.description),
    content: str(movieData.content),
    status: str(movieData.status),
    chieurap: str(movieData.chieurap),
    showtimes: str(movieData.showtimes),
    is_exclusive: str(movieData.is_exclusive),
    tmdb_id: str(movieData.tmdb_id),
    modified: str(movieData.modified),
    update: str(movieData.update),
    note: str(movieData.note),
    director: str(movieData.director),
    actor: str(movieData.actor),
    tmdb_type: str(movieData.tmdb_type),
    updated_at: new Date().toISOString(),
  };
}

export async function saveMovieSb(movieData: any) {
  const isNew = !movieData.id;
  if (isNew) {
    movieData.id = String(Date.now());
  }
  if (!movieData.modified) {
    movieData.modified = new Date().toISOString();
  }
  if (isNew && !movieData.update) {
    movieData.update = 'NEW';
  }

  await applyMovieR2Uploads(movieData);

  const row = moviePayloadToRow(movieData);
  const sb = getSupabaseAdmin();
  const { data: existing } = await sb.from('movies').select('id').eq('id', row.id).maybeSingle();

  const { error } = await sb.from('movies').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return { success: true, id: row.id, isNew: !existing };
}

export async function deleteMovieSb(id: string) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('movies').delete().eq('id', String(id).trim());
  if (error) throw error;
  return { success: true };
}

export async function updateShowtimesSb(movieId: string, body: any) {
  const sb = getSupabaseAdmin();
  const modifiedVal = new Date().toISOString();
  const { error } = await sb
    .from('movies')
    .update({
      showtimes: String((body as any)?.showtimes ?? '').trim(),
      modified: modifiedVal,
      update: 'NEW',
      updated_at: modifiedVal,
    })
    .eq('id', String(movieId).trim());
  if (error) throw error;
  return { success: true, id: String(movieId).trim(), updated: ['showtimes', 'modified', 'update'] };
}

export async function updateShowtimesExclusiveSb(movieId: string, body: any) {
  const sb = getSupabaseAdmin();
  const modifiedVal = new Date().toISOString();
  const { error } = await sb
    .from('movies')
    .update({
      showtimes: String((body as any)?.showtimes ?? '').trim(),
      is_exclusive: (body as any)?.is_exclusive ? '1' : '0',
      modified: modifiedVal,
      update: 'NEW',
      updated_at: modifiedVal,
    })
    .eq('id', String(movieId).trim());
  if (error) throw error;
  return {
    success: true,
    id: String(movieId).trim(),
    updated: ['showtimes', 'is_exclusive', 'modified', 'update'],
  };
}

export async function countRowsSb(sheetNames: string[]) {
  const sb = getSupabaseAdmin();
  const results: any[] = [];
  for (const name of sheetNames) {
    const n = String(name || '').trim().toLowerCase();
    if (n === 'movies') {
      const { count, error } = await sb.from('movies').select('*', { count: 'exact', head: true });
      if (error) throw error;
      results.push({ sheet: 'movies', headerRows: 1, lastRow: (count ?? 0) + 1, nonEmptyDataRows: count ?? 0 });
    } else if (n === 'episodes') {
      const { count, error } = await sb.from('movie_episodes').select('*', { count: 'exact', head: true });
      if (error) throw error;
      results.push({ sheet: 'episodes', headerRows: 1, lastRow: (count ?? 0) + 1, nonEmptyDataRows: count ?? 0 });
    }
  }
  return { ok: true, results };
}

export async function getEpisodesSb(movieId: string, debug?: boolean) {
  const sb = getSupabaseAdmin();
  const movieIdStr = String(movieId ?? '').trim();

  let q = sb
    .from('movie_episodes')
    .select('*')
    .eq('movie_id', movieIdStr)
    .order('sort_order', { ascending: true })
    .order('episode_code', { ascending: true });

  const { data: byId, error } = await q;
  if (error) throw error;
  let matchedRows = byId || [];

  if (!matchedRows.length && movieIdStr) {
    const movie = await getMovieSb(movieIdStr);
    const slug = String((movie as any)?.slug ?? '').trim();
    if (slug) {
      const { data: bySlug } = await sb
        .from('movie_episodes')
        .select('*')
        .eq('movie_id', slug)
        .order('sort_order', { ascending: true })
        .order('episode_code', { ascending: true });
      matchedRows = bySlug || [];
    }
  }

  const eps = (matchedRows || []).map((r: any) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = r;
    return rest;
  });

  if (!debug) return eps;

  return {
    episodes: eps,
    debug: {
      movieId: movieIdStr,
      reason: matchedRows.length ? '' : 'no episode rows',
      matchMode: 'movie_id',
    },
  };
}

export async function saveEpisodesSb(movieId: string, episodes: any[]) {
  const sb = getSupabaseAdmin();
  const mid = String(movieId).trim();
  await sb.from('movie_episodes').delete().eq('movie_id', mid);

  const rows = (episodes || []).map((ep: any, index: number) => {
    const episodeCode = ep.episode_code || ep.episode || ep.code || String(index + 1);
    const episodeName = ep.episode_name || ep.name || `Tập ${episodeCode}`;
    const serverSlug = ep.server_slug || ep.server || ep.server_source || 'vietsub-1';
    const serverName = ep.server_name || ep.serverName || '';
    return {
      movie_id: mid,
      episode_code: String(episodeCode),
      episode_name: String(episodeName),
      server_slug: String(serverSlug),
      server_name: String(serverName),
      link_m3u8: String(ep.link_m3u8 || ''),
      link_embed: String(ep.link_embed || ''),
      link_backup: String(ep.link_backup || ''),
      link_vip1: String(ep.link_vip1 || ''),
      link_vip2: String(ep.link_vip2 || ''),
      link_vip3: String(ep.link_vip3 || ''),
      link_vip4: String(ep.link_vip4 || ''),
      link_vip5: String(ep.link_vip5 || ''),
      note: String(ep.note || ''),
      sort_order: index,
      updated_at: new Date().toISOString(),
    };
  });

  if (rows.length) {
    const { error } = await sb.from('movie_episodes').insert(rows);
    if (error) throw error;
  }

  return { success: true, count: rows.length };
}

export function authInfoSb() {
  const { url } = getEnv();
  return {
    ok: true,
    source: 'supabase',
    supabase_url: url ? `${url.slice(0, 24)}...` : '',
  };
}
