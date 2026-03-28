import { authHeaders, errFromRes, getRestEnv, parseContentRangeTotal, restFetch, restJson } from './supabase-rest.js';

/** Không gồm description/content (thường rất dài) — chỉ dùng cho list / tab trùng slug. */
const MOVIE_LIST_SELECT =
  'id,slug,title,name,origin_name,type,year,genre,country,language,quality,episode_current,thumb_url,poster_url,status,showtimes,chieurap,is_exclusive,tmdb_id,modified,update,note,director,actor,tmdb_type,created_at,updated_at';

/** Tập phim: đủ field hiểnịh/sửa link, không cần uuid nội bộ nếu không dùng. */
const EPISODE_ROW_SELECT =
  'movie_id,episode_code,episode_name,server_slug,server_name,link_m3u8,link_embed,link_backup,link_vip1,link_vip2,link_vip3,link_vip4,link_vip5,note,sort_order';

function getEnv() {
  return getRestEnv();
}

export function isSupabaseMoviesConfigured() {
  const { url, key } = getEnv();
  return !!(url && key);
}

/** DB / export dùng text 0|1; Switch Ant cần boolean — chuỗi '0' là truthy trong JS nên phải parse. */
export function parseBoolFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '' || s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  return false;
}

function boolToDbFlag(v: unknown): string {
  return parseBoolFlag(v) ? '1' : '0';
}

function rowToMovie(row: Record<string, any>) {
  const m: any = { ...row };
  if (m.content && !m.description) m.description = m.content;
  if (m.name && !m.title) m.title = m.name;
  m.chieurap = parseBoolFlag(m.chieurap);
  m.is_exclusive = parseBoolFlag(m.is_exclusive);
  return m;
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

function buildSlugInParam(slugs: string[]) {
  const inner = slugs
    .map((v) => {
      const s = String(v);
      if (/[",()]/.test(s) || /\s/.test(s)) return `"${s.replace(/"/g, '')}"`;
      return s;
    })
    .join(',');
  return `in.(${inner})`;
}

export async function listMoviesSb(
  type: string,
  page: number,
  limit: number,
  search: string,
  unbuiltOnly: boolean,
  duplicatesOnly: boolean
) {
  const { key } = getEnv();

  if (duplicatesOnly) {
    const rpcRes = await restFetch('/rpc/movies_duplicate_slugs', {
      method: 'POST',
      key,
      headers: authHeaders(key),
      body: JSON.stringify({}),
    });
    if (!rpcRes.ok) throw await errFromRes(rpcRes);
    const dupSlugs = await rpcRes.json();
    const slugs = (dupSlugs || []).map((r: any) => (typeof r === 'string' ? r : r?.slug)).filter(Boolean);
    if (!slugs.length) {
      return { data: [], total: 0, page, limit };
    }
    const slugFilter = `slug=${encodeURIComponent(buildSlugInParam(slugs))}`;
    const typePart = type && type !== 'all' ? `&type=eq.${encodeURIComponent(type)}` : '';
    const path = `/movies?select=${encodeURIComponent(MOVIE_LIST_SELECT)}&${slugFilter}${typePart}`;
    const res = await restFetch(path, { method: 'GET', key, headers: authHeaders(key) });
    if (!res.ok) throw await errFromRes(res);
    const rows = await restJson<any[]>(res);
    let movies = (rows || []).map((r, i) => ({ ...rowToMovie(r), _rowIndex: i + 2 }));
    movies = sortMoviesLikeSheet(movies);
    const total = movies.length;
    const start = (page - 1) * limit;
    return { data: movies.slice(start, start + limit), total, page, limit };
  }

  const parts = [`select=${encodeURIComponent(MOVIE_LIST_SELECT)}`, 'order=modified.desc'];
  if (type && type !== 'all') parts.push(`type=eq.${encodeURIComponent(type)}`);
  if (unbuiltOnly) parts.push(`update=eq.${encodeURIComponent('NEW')}`);
  if (search.trim()) {
    const raw = search.trim().replace(/%/g, '\\%').replace(/,/g, ' ');
    const patt = encodeURIComponent(`%${raw}%`);
    parts.push(`or=(title.ilike.${patt},origin_name.ilike.${patt},id.ilike.${patt})`);
  }
  const query = parts.join('&');
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const res = await restFetch(`/movies?${query}`, {
    method: 'GET',
    key,
    headers: {
      ...authHeaders(key, 'count=exact'),
      Range: `${from}-${to}`,
    },
  });
  if (!res.ok) throw await errFromRes(res);
  const rows = await restJson<any[]>(res);
  const total = parseContentRangeTotal(res) ?? rows.length;
  const movies = (rows || []).map((r, i) => ({ ...rowToMovie(r), _rowIndex: from + i + 2 }));
  return { data: movies, total, page, limit };
}

export async function getMovieSb(id: string) {
  const { key } = getEnv();
  const sid = String(id).trim();
  const res = await restFetch(`/movies?select=*&id=eq.${encodeURIComponent(sid)}`, {
    method: 'GET',
    key,
    headers: authHeaders(key),
  });
  if (!res.ok) throw await errFromRes(res);
  const rows = await restJson<any[]>(res);
  const data = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!data) return null;
  return rowToMovie(data);
}

export async function getMovieBySlugSb(slug: string) {
  const { key } = getEnv();
  const s = String(slug || '').trim();
  if (!s) return null;
  const res = await restFetch(`/movies?select=*&slug=eq.${encodeURIComponent(s)}`, {
    method: 'GET',
    key,
    headers: authHeaders(key),
  });
  if (!res.ok) throw await errFromRes(res);
  const rows = await restJson<any[]>(res);
  if (!rows?.length) return null;
  const sorted = sortMoviesLikeSheet(rows.map((r, i) => ({ ...rowToMovie(r), _rowIndex: i + 2 })));
  return sorted[0] || null;
}

export function moviePayloadToRow(movieData: any) {
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
    chieurap: boolToDbFlag(movieData.chieurap),
    showtimes: str(movieData.showtimes),
    is_exclusive: boolToDbFlag(movieData.is_exclusive),
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

/** Dùng từ movies-supabase-save — PostgREST upsert, không dùng supabase-js */
export async function movieExistsByIdRest(id: string): Promise<boolean> {
  const { key } = getEnv();
  const res = await restFetch(`/movies?select=id&id=eq.${encodeURIComponent(String(id).trim())}&limit=1`, {
    method: 'GET',
    key,
    headers: authHeaders(key),
  });
  if (!res.ok) throw await errFromRes(res);
  const rows = await restJson<any[]>(res);
  return Array.isArray(rows) && rows.length > 0;
}

export async function upsertMovieRowRest(row: Record<string, any>) {
  const { key } = getEnv();
  const res = await restFetch(`/movies?on_conflict=id`, {
    method: 'POST',
    key,
    headers: authHeaders(key, 'resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify([row]),
  });
  if (!res.ok) throw await errFromRes(res);
}

export async function deleteMovieSb(id: string) {
  const { key } = getEnv();
  const res = await restFetch(`/movies?id=eq.${encodeURIComponent(String(id).trim())}`, {
    method: 'DELETE',
    key,
    headers: authHeaders(key),
  });
  if (!res.ok) throw await errFromRes(res);
  return { success: true };
}

export async function updateShowtimesSb(movieId: string, body: any) {
  const { key } = getEnv();
  const modifiedVal = new Date().toISOString();
  const patch = {
    showtimes: String((body as any)?.showtimes ?? '').trim(),
    modified: modifiedVal,
    update: 'NEW',
    updated_at: modifiedVal,
  };
  const res = await restFetch(`/movies?id=eq.${encodeURIComponent(String(movieId).trim())}`, {
    method: 'PATCH',
    key,
    headers: authHeaders(key),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await errFromRes(res);
  return { success: true, id: String(movieId).trim(), updated: ['showtimes', 'modified', 'update'] };
}

export async function updateShowtimesExclusiveSb(movieId: string, body: any) {
  const { key } = getEnv();
  const modifiedVal = new Date().toISOString();
  const patch = {
    showtimes: String((body as any)?.showtimes ?? '').trim(),
    is_exclusive: (body as any)?.is_exclusive ? '1' : '0',
    modified: modifiedVal,
    update: 'NEW',
    updated_at: modifiedVal,
  };
  const res = await restFetch(`/movies?id=eq.${encodeURIComponent(String(movieId).trim())}`, {
    method: 'PATCH',
    key,
    headers: authHeaders(key),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await errFromRes(res);
  return {
    success: true,
    id: String(movieId).trim(),
    updated: ['showtimes', 'is_exclusive', 'modified', 'update'],
  };
}

export async function countRowsSb(sheetNames: string[]) {
  const { key } = getEnv();
  const results: any[] = [];
  for (const name of sheetNames) {
    const n = String(name || '').trim().toLowerCase();
    if (n === 'movies') {
      const res = await restFetch(`/movies?select=id`, {
        method: 'HEAD',
        key,
        headers: authHeaders(key, 'count=exact'),
      });
      if (!res.ok) throw await errFromRes(res);
      const c = parseContentRangeTotal(res) ?? 0;
      results.push({ sheet: 'movies', headerRows: 1, lastRow: c + 1, nonEmptyDataRows: c });
    } else if (n === 'episodes') {
      const res = await restFetch(`/movie_episodes?select=id`, {
        method: 'HEAD',
        key,
        headers: authHeaders(key, 'count=exact'),
      });
      if (!res.ok) throw await errFromRes(res);
      const c = parseContentRangeTotal(res) ?? 0;
      results.push({ sheet: 'episodes', headerRows: 1, lastRow: c + 1, nonEmptyDataRows: c });
    }
  }
  return { ok: true, results };
}

export async function getEpisodesSb(movieId: string, debug?: boolean) {
  const { key } = getEnv();
  const movieIdStr = String(movieId ?? '').trim();

  const path = `/movie_episodes?select=${encodeURIComponent(EPISODE_ROW_SELECT)}&movie_id=eq.${encodeURIComponent(movieIdStr)}&order=sort_order.asc,episode_code.asc`;
  const res = await restFetch(path, { method: 'GET', key, headers: authHeaders(key) });
  if (!res.ok) throw await errFromRes(res);
  let matchedRows = await restJson<any[]>(res);

  if (!matchedRows.length && movieIdStr) {
    const movie = await getMovieSb(movieIdStr);
    const slug = String((movie as any)?.slug ?? '').trim();
    if (slug) {
      const res2 = await restFetch(
        `/movie_episodes?select=${encodeURIComponent(EPISODE_ROW_SELECT)}&movie_id=eq.${encodeURIComponent(slug)}&order=sort_order.asc,episode_code.asc`,
        { method: 'GET', key, headers: authHeaders(key) }
      );
      if (!res2.ok) throw await errFromRes(res2);
      matchedRows = await restJson<any[]>(res2);
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
  const { key } = getEnv();
  const mid = String(movieId).trim();
  const del = await restFetch(`/movie_episodes?movie_id=eq.${encodeURIComponent(mid)}`, {
    method: 'DELETE',
    key,
    headers: authHeaders(key),
  });
  if (!del.ok) throw await errFromRes(del);

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
    const ins = await restFetch(`/movie_episodes`, {
      method: 'POST',
      key,
      headers: authHeaders(key, 'return=minimal'),
      body: JSON.stringify(rows),
    });
    if (!ins.ok) throw await errFromRes(ins);
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
