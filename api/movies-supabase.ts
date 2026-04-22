import { authHeaders, errFromRes, getRestEnv, parseContentRangeTotal, restFetchByScope, restJson } from './supabase-rest.js';

/** Không gồm description/content (thường rất dài) — chỉ dùng cho list / tab trùng slug. Không select `name` (trùng title, giữ null trên DB). */
const MOVIE_LIST_SELECT =
  'id,slug,title,origin_name,poster_url,thumb_url,type,year,genre,country,language,quality,episode_current,status,showtimes,chieurap,is_exclusive,tmdb_id,modified,update,note,director,actor,tmdb_type,created_at,updated_at';

/** Tập phim: đủ field hiểnịh/sửa link, không cần uuid nội bộ nếu không dùng. */
const EPISODE_ROW_SELECT =
  'movie_id,episode_code,episode_name,server_slug,server_name,link_m3u8,link_embed,link_backup,link_vip1,link_vip2,link_vip3,link_vip4,link_vip5,note,sort_order';

function getMoviesEnv() {
  return getRestEnv('movies');
}

function getEpisodesEnv() {
  return getRestEnv('episodes');
}

export function isSupabaseMoviesConfigured() {
  const movies = getMoviesEnv();
  const episodes = getEpisodesEnv();
  return !!(movies.url && movies.key && episodes.url && episodes.key);
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

/** Sắp xếp theo modified/update mới nhất, tie-break theo _rowIndex (giống thứ tự dòng trong bảng). */
function sortMoviesByModifiedDesc(movies: any[]) {
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
  const { key } = getMoviesEnv();

  if (duplicatesOnly) {
    const rpcRes = await restFetchByScope('movies', '/rpc/movies_duplicate_slugs', {
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
    const start = (page - 1) * limit;
    const to = start + limit - 1;
    // Dùng order + Range để chỉ fetch đúng trang cần hiển thị
    // (giảm tải so với việc tải toàn bộ phim trùng slug rồi mới slice).
    const path = `/movies?select=${encodeURIComponent(MOVIE_LIST_SELECT)}&${slugFilter}${typePart}&order=modified.desc,updated_at.desc`;
    const res = await restFetchByScope('movies', path, {
      method: 'GET',
      key,
      headers: {
        ...authHeaders(key, 'count=exact'),
        Range: `${start}-${to}`,
      },
    });
    if (!res.ok) throw await errFromRes(res);
    const rows = await restJson<any[]>(res);
    const total = parseContentRangeTotal(res) ?? rows.length;
    const movies = (rows || []).map((r, i) => ({ ...rowToMovie(r), _rowIndex: start + i + 2 }));
    return { data: movies, total, page, limit };
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
  const res = await restFetchByScope('movies', `/movies?${query}`, {
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
  const { key } = getMoviesEnv();
  const sid = String(id).trim();
  const res = await restFetchByScope('movies', `/movies?select=*&id=eq.${encodeURIComponent(sid)}`, {
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
  const { key } = getMoviesEnv();
  const s = String(slug || '').trim();
  if (!s) return null;
  const res = await restFetchByScope('movies', `/movies?select=*&slug=eq.${encodeURIComponent(s)}`, {
    method: 'GET',
    key,
    headers: authHeaders(key),
  });
  if (!res.ok) throw await errFromRes(res);
  const rows = await restJson<any[]>(res);
  if (!rows?.length) return null;
  const sorted = sortMoviesByModifiedDesc(rows.map((r, i) => ({ ...rowToMovie(r), _rowIndex: i + 2 })));
  return sorted[0] || null;
}

/**
 * Chỉ `modified` / `modified.time` (không dùng `updated_at`) — cột DB khớp OPhim; cùng ý scripts/lib/movie-modified.js `extractOphimModifiedForPersist`.
 */
export function extractOphimModifiedForPersist(m: any): string {
  if (!m || typeof m !== 'object') return '';
  if (m.modified && typeof m.modified === 'object' && m.modified.time != null) {
    return String(m.modified.time).trim();
  }
  if (m.modified != null && typeof m.modified !== 'object') {
    const s = String(m.modified).trim();
    if (s) return s;
  }
  return '';
}

export function moviePayloadToRow(movieData: any) {
  const str = (v: any) => (Array.isArray(v) ? v.join(',') : v ?? '') || '';
  const row: Record<string, any> = {
    id: String(movieData.id ?? '').trim(),
    slug: str(movieData.slug),
    title: str(movieData.title),
    name: null,
    origin_name: str(movieData.origin_name),
    type: str(movieData.type),
    year: str(movieData.year),
    genre: str(movieData.genre),
    country: str(movieData.country),
    language: str(movieData.language),
    quality: str(movieData.quality),
    episode_current: str(movieData.episode_current),
    // URL ảnh có thể dựng từ slug/id + site_settings.r2_img_domain → không lưu để tránh lãng phí.
    thumb_url: null,
    poster_url: null,
    description: str(movieData.description),
    content: null,
    status: str(movieData.status),
    chieurap: boolToDbFlag(movieData.chieurap),
    showtimes: str(movieData.showtimes),
    is_exclusive: boolToDbFlag(movieData.is_exclusive),
    tmdb_id: str(movieData.tmdb_id),
    update: str(movieData.update),
    note: str(movieData.note),
    director: str(movieData.director),
    actor: str(movieData.actor),
    tmdb_type: str(movieData.tmdb_type),
    updated_at: new Date().toISOString(),
  };
  // Nếu payload không có modified hợp lệ, đừng gửi field này để tránh ghi đè DB thành chuỗi rỗng.
  const mod = extractOphimModifiedForPersist(movieData);
  if (mod) row.modified = mod;
  return row;
}

/** Dùng từ movies-supabase-save — PostgREST upsert, không dùng supabase-js */
export async function movieExistsByIdRest(id: string): Promise<boolean> {
  const { key } = getMoviesEnv();
  const res = await restFetchByScope('movies', `/movies?select=id&id=eq.${encodeURIComponent(String(id).trim())}&limit=1`, {
    method: 'GET',
    key,
    headers: authHeaders(key),
  });
  if (!res.ok) throw await errFromRes(res);
  const rows = await restJson<any[]>(res);
  return Array.isArray(rows) && rows.length > 0;
}

export async function upsertMovieRowRest(row: Record<string, any>) {
  const { key } = getMoviesEnv();
  const res = await restFetchByScope('movies', `/movies?on_conflict=id`, {
    method: 'POST',
    key,
    headers: authHeaders(key, 'resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify([row]),
  });
  if (!res.ok) throw await errFromRes(res);
}

export async function deleteMovieSb(id: string) {
  const { key: moviesKey } = getMoviesEnv();
  const { key: episodesKey } = getEpisodesEnv();
  const sid = String(id).trim();
  const delEpisodes = await restFetchByScope('episodes', `/movie_episodes?movie_id=eq.${encodeURIComponent(sid)}`, {
    method: 'DELETE',
    key: episodesKey,
    headers: authHeaders(episodesKey),
  });
  if (!delEpisodes.ok) throw await errFromRes(delEpisodes);
  const res = await restFetchByScope('movies', `/movies?id=eq.${encodeURIComponent(sid)}`, {
    method: 'DELETE',
    key: moviesKey,
    headers: authHeaders(moviesKey),
  });
  if (!res.ok) throw await errFromRes(res);
  return { success: true };
}

export async function updateShowtimesSb(movieId: string, body: any) {
  const { key } = getMoviesEnv();
  const now = new Date().toISOString();
  const patch = {
    showtimes: String((body as any)?.showtimes ?? '').trim(),
    update: 'NEW',
    updated_at: now,
  };
  const res = await restFetchByScope('movies', `/movies?id=eq.${encodeURIComponent(String(movieId).trim())}`, {
    method: 'PATCH',
    key,
    headers: authHeaders(key),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await errFromRes(res);
  return { success: true, id: String(movieId).trim(), updated: ['showtimes', 'update'] };
}

export async function updateShowtimesExclusiveSb(movieId: string, body: any) {
  const { key } = getMoviesEnv();
  const now = new Date().toISOString();
  const patch = {
    showtimes: String((body as any)?.showtimes ?? '').trim(),
    is_exclusive: (body as any)?.is_exclusive ? '1' : '0',
    update: 'NEW',
    updated_at: now,
  };
  const res = await restFetchByScope('movies', `/movies?id=eq.${encodeURIComponent(String(movieId).trim())}`, {
    method: 'PATCH',
    key,
    headers: authHeaders(key),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await errFromRes(res);
  return {
    success: true,
    id: String(movieId).trim(),
    updated: ['showtimes', 'is_exclusive', 'update'],
  };
}

export async function countRowsSb(tableNames: string[]) {
  const moviesEnv = getMoviesEnv();
  const episodesEnv = getEpisodesEnv();
  const results: any[] = [];
  for (const name of tableNames) {
    const n = String(name || '').trim().toLowerCase();
    if (n === 'movies') {
      const res = await restFetchByScope('movies', `/movies?select=id`, {
        method: 'HEAD',
        key: moviesEnv.key,
        headers: authHeaders(moviesEnv.key, 'count=exact'),
      });
      if (!res.ok) throw await errFromRes(res);
      const c = parseContentRangeTotal(res) ?? 0;
      results.push({ table: 'movies', headerRows: 1, lastRow: c + 1, nonEmptyDataRows: c });
    } else if (n === 'episodes' || n === 'movie_episodes') {
      const res = await restFetchByScope('episodes', `/movie_episodes?select=id`, {
        method: 'HEAD',
        key: episodesEnv.key,
        headers: authHeaders(episodesEnv.key, 'count=exact'),
      });
      if (!res.ok) throw await errFromRes(res);
      const c = parseContentRangeTotal(res) ?? 0;
      results.push({ table: 'movie_episodes', headerRows: 1, lastRow: c + 1, nonEmptyDataRows: c });
    }
  }
  return { ok: true, results };
}

/** Xóa toàn bộ phim và tập tương ứng (không có FK cascade vì tách project). */
export async function deleteAllMoviesSb() {
  const moviesEnv = getMoviesEnv();
  const episodesEnv = getEpisodesEnv();

  const pageSize = Math.max(200, Math.min(5000, Number(process.env.SUPABASE_DELETE_PAGE_SIZE || 1000) || 1000));
  const delChunk = Math.max(50, Math.min(2000, Number(process.env.SUPABASE_DELETE_CHUNK_SIZE || 400) || 400));

  const fetchIdsPage = async (scope: 'movies' | 'episodes', table: string, pk: string, from: number, to: number) => {
    const { key } = scope === 'movies' ? moviesEnv : episodesEnv;
    const res = await restFetchByScope(scope, `/${encodeURIComponent(table)}?select=${encodeURIComponent(pk)}&order=${encodeURIComponent(pk)}.asc`, {
      method: 'GET',
      key,
      headers: { ...authHeaders(key), Range: `${from}-${to}` },
    });
    if (!res.ok) throw await errFromRes(res);
    const rows = await restJson<any[]>(res);
    return (rows || []).map((r: any) => String(r?.[pk] ?? '').trim()).filter(Boolean);
  };

  const deleteByIds = async (scope: 'movies' | 'episodes', table: string, pk: string, ids: string[]) => {
    const { key } = scope === 'movies' ? moviesEnv : episodesEnv;
    const inParam = buildSlugInParam(ids);
    const res = await restFetchByScope(scope, `/${encodeURIComponent(table)}?${encodeURIComponent(pk)}=${encodeURIComponent(inParam)}`, {
      method: 'DELETE',
      key,
      headers: authHeaders(key),
    });
    if (!res.ok) throw await errFromRes(res);
  };

  const purgeTableByPk = async (scope: 'movies' | 'episodes', table: string, pk: string) => {
    let total = 0;
    for (;;) {
      // Luôn lấy page đầu tiên (0..pageSize-1) vì sau mỗi lần delete, dữ liệu dồn lên.
      const ids = await fetchIdsPage(scope, table, pk, 0, pageSize - 1);
      if (!ids.length) break;
      for (let i = 0; i < ids.length; i += delChunk) {
        const chunk = ids.slice(i, i + delChunk);
        await deleteByIds(scope, table, pk, chunk);
        total += chunk.length;
      }
      if (ids.length < pageSize) break;
    }
    return total;
  };

  // Xóa episodes trước để tránh “mồ côi” logic (không FK cascade).
  const deletedEpisodes = await purgeTableByPk('episodes', 'movie_episodes', 'id');
  const deletedMovies = await purgeTableByPk('movies', 'movies', 'id');
  return { success: true, deletedMovies, deletedEpisodes };
}

/** Xóa từng phim theo id (chunk) + xóa tập theo movie_id ở project Episodes. */
export async function deleteMoviesByIdsSb(ids: unknown[]) {
  const { key: moviesKey } = getMoviesEnv();
  const { key: episodesKey } = getEpisodesEnv();
  const clean = [...new Set((ids || []).map((x) => String(x ?? '').trim()).filter(Boolean))];
  if (!clean.length) return { deleted: 0, message: 'Không có id hợp lệ' };
  const chunkSize = 80;
  for (let i = 0; i < clean.length; i += chunkSize) {
    const chunk = clean.slice(i, i + chunkSize);
    const inParam = buildSlugInParam(chunk);
    const delEpisodes = await restFetchByScope('episodes', `/movie_episodes?movie_id=${encodeURIComponent(inParam)}`, {
      method: 'DELETE',
      key: episodesKey,
      headers: authHeaders(episodesKey),
    });
    if (!delEpisodes.ok) throw await errFromRes(delEpisodes);
    const res = await restFetchByScope('movies', `/movies?id=${encodeURIComponent(inParam)}`, {
      method: 'DELETE',
      key: moviesKey,
      headers: authHeaders(moviesKey),
    });
    if (!res.ok) throw await errFromRes(res);
  }
  return { deleted: clean.length, message: `Đã xóa ${clean.length} phim và tập liên quan.` };
}

export async function getEpisodesSb(movieId: string, debug?: boolean) {
  const { key } = getEpisodesEnv();
  const movieIdStr = String(movieId ?? '').trim();

  const path = `/movie_episodes?select=${encodeURIComponent(EPISODE_ROW_SELECT)}&movie_id=eq.${encodeURIComponent(movieIdStr)}&order=sort_order.asc,episode_code.asc`;
  const res = await restFetchByScope('episodes', path, { method: 'GET', key, headers: authHeaders(key) });
  if (!res.ok) throw await errFromRes(res);
  let matchedRows = await restJson<any[]>(res);

  if (!matchedRows.length && movieIdStr) {
    const movie = await getMovieSb(movieIdStr);
    const slug = String((movie as any)?.slug ?? '').trim();
    if (slug) {
      const res2 = await restFetchByScope(
        'episodes',
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
  const { key } = getEpisodesEnv();
  const mid = String(movieId).trim();
  const del = await restFetchByScope('episodes', `/movie_episodes?movie_id=eq.${encodeURIComponent(mid)}`, {
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
    const ins = await restFetchByScope('episodes', `/movie_episodes`, {
      method: 'POST',
      key,
      headers: authHeaders(key, 'return=minimal'),
      body: JSON.stringify(rows),
    });
    if (!ins.ok) throw await errFromRes(ins);
  }

  return { success: true, count: rows.length };
}

const REST_EXPORT_PAGE = 1000;

async function fetchAllRowsRestPaged(scope: 'movies' | 'episodes', relPath: string, key: string): Promise<any[]> {
  const pathBase = relPath.includes('?') ? `${relPath}&order=id.asc` : `${relPath}?order=id.asc`;
  const all: any[] = [];
  let from = 0;
  for (;;) {
    const to = from + REST_EXPORT_PAGE - 1;
    const res = await restFetchByScope(scope, pathBase, {
      method: 'GET',
      key,
      headers: {
        ...authHeaders(key),
        Range: `${from}-${to}`,
      },
    });
    if (!res.ok) throw await errFromRes(res);
    const rows = await restJson<any[]>(res);
    const chunk = Array.isArray(rows) ? rows : [];
    all.push(...chunk);
    if (chunk.length < REST_EXPORT_PAGE) break;
    from += REST_EXPORT_PAGE;
  }
  return all;
}

/** Toàn bộ dòng — dùng service role (bypass RLS). Admin UI export qua /api/movies?action=exportFull. */
export async function exportFullMovieTablesSb(tables: string[]): Promise<Record<string, any[]>> {
  const moviesEnv = getMoviesEnv();
  const episodesEnv = getEpisodesEnv();
  const want = new Set(tables.map((t) => String(t || '').trim()));
  const out: Record<string, any[]> = {};
  if (want.has('movies')) {
    out.movies = await fetchAllRowsRestPaged('movies', '/movies?select=*', moviesEnv.key);
  }
  if (want.has('movie_episodes')) {
    out.movie_episodes = await fetchAllRowsRestPaged('episodes', '/movie_episodes?select=*', episodesEnv.key);
  }
  return out;
}

const REST_IMPORT_PAGE = 800;

async function upsertRowsRestChunked(scope: 'movies' | 'episodes', table: string, onConflict: string, rows: any[]) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return 0;
  const { key } = getRestEnv(scope);
  let written = 0;
  for (let i = 0; i < list.length; i += REST_IMPORT_PAGE) {
    const chunk = list.slice(i, i + REST_IMPORT_PAGE);
    const res = await restFetchByScope(scope, `/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST',
      key,
      headers: authHeaders(key, 'resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw await errFromRes(res);
    written += chunk.length;
  }
  return written;
}

async function insertRowsRestChunked(scope: 'movies' | 'episodes', table: string, rows: any[]) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return 0;
  const { key } = getRestEnv(scope);
  let written = 0;
  for (let i = 0; i < list.length; i += REST_IMPORT_PAGE) {
    const chunk = list.slice(i, i + REST_IMPORT_PAGE);
    const res = await restFetchByScope(scope, `/${encodeURIComponent(table)}`, {
      method: 'POST',
      key,
      headers: authHeaders(key, 'return=minimal'),
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw await errFromRes(res);
    written += chunk.length;
  }
  return written;
}

async function deleteAllRowsRest(scope: 'movies' | 'episodes', table: string, columnForNotNull: string) {
  const { key } = getRestEnv(scope);
  const res = await restFetchByScope(scope, `/${encodeURIComponent(table)}?${encodeURIComponent(columnForNotNull)}=not.is.null`, {
    method: 'DELETE',
    key,
    headers: authHeaders(key),
  });
  if (!res.ok) throw await errFromRes(res);
}

export async function importFullMovieTablesSb(
  mode: 'upsert' | 'replace',
  data: { movies: any[] | null; movie_episodes: any[] | null }
) {
  const wantMovies = Array.isArray(data.movies);
  const wantEps = Array.isArray(data.movie_episodes);
  if (!wantMovies && !wantEps) return { imported: {} as Record<string, number> };

  // Replace: xóa episodes trước để tránh “mồ côi” logic; (không có FK cascade vì tách project).
  if (mode === 'replace') {
    if (wantEps) await deleteAllRowsRest('episodes', 'movie_episodes', 'movie_id');
    if (wantMovies) await deleteAllRowsRest('movies', 'movies', 'id');
  }

  const imported: Record<string, number> = {};
  if (wantMovies) {
    imported.movies = await upsertRowsRestChunked('movies', 'movies', 'id', data.movies || []);
  }
  if (wantEps) {
    // movie_episodes: upsert theo PK id (uuid). JSON exportFull có id nên upsert được.
    imported.movie_episodes = await upsertRowsRestChunked('episodes', 'movie_episodes', 'id', data.movie_episodes || []);
  }
  return { imported };
}

export function authInfoSb() {
  const moviesEnv = getMoviesEnv();
  const episodesEnv = getEpisodesEnv();
  return {
    ok: true,
    source: 'supabase',
    supabase_movies_url: moviesEnv.url ? `${moviesEnv.url.slice(0, 24)}...` : '',
    supabase_episodes_url: episodesEnv.url ? `${episodesEnv.url.slice(0, 24)}...` : '',
  };
}

async function headCountExactSb(scope: 'admin' | 'movies' | 'episodes', path: string) {
  const { key } = getRestEnv(scope);
  const res = await restFetchByScope(scope, path, {
    method: 'HEAD',
    key,
    headers: authHeaders(key, 'count=exact'),
  });
  if (!res.ok) throw await errFromRes(res);
  return parseContentRangeTotal(res) ?? 0;
}

async function getMaxUpdatedAtSb(scope: 'admin' | 'movies' | 'episodes', table: string) {
  const { key } = getRestEnv(scope);
  const t = String(table || '').trim();
  if (!t) return '';
  const res = await restFetchByScope(
    scope,
    `/${encodeURIComponent(t)}?select=updated_at&order=updated_at.desc&limit=1`,
    {
      method: 'GET',
      key,
      headers: authHeaders(key),
    }
  );
  if (!res.ok) throw await errFromRes(res);
  const rows = await restJson<any[]>(res);
  return String(rows?.[0]?.updated_at ?? '').trim();
}

async function countMoviesByTypeSb(type?: string) {
  const t = String(type || '').trim();
  const typePart = t && t !== 'all' ? `&type=eq.${encodeURIComponent(t)}` : '';
  return headCountExactSb('movies', `/movies?select=id${typePart}`);
}

async function countMoviesUnbuiltSb() {
  return headCountExactSb('movies', `/movies?select=id&update=eq.${encodeURIComponent('NEW')}`);
}

async function countMoviesDuplicatesSb() {
  const { key } = getMoviesEnv();
  const rpcRes = await restFetchByScope('movies', '/rpc/movies_duplicate_slugs', {
    method: 'POST',
    key,
    headers: authHeaders(key),
    body: JSON.stringify({}),
  });
  if (!rpcRes.ok) throw await errFromRes(rpcRes);
  const dupSlugs = await rpcRes.json();
  const slugs = (dupSlugs || []).map((r: any) => (typeof r === 'string' ? r : r?.slug)).filter(Boolean);
  if (!slugs.length) return 0;
  const slugFilter = `slug=${encodeURIComponent(buildSlugInParam(slugs))}`;
  return headCountExactSb('movies', `/movies?select=id&${slugFilter}`);
}

async function countHomepageSectionsSb() {
  return headCountExactSb('admin', `/homepage_sections?select=id`);
}

// Version để dashboard biết khi nào cần tính lại số lượng phim (tránh recompute mỗi lần poll).
export async function getDashboardVersionSb() {
  const [moviesV, sectionsV] = await Promise.all([
    getMaxUpdatedAtSb('movies', 'movies'),
    getMaxUpdatedAtSb('admin', 'homepage_sections'),
  ]);
  // Chuỗi version chỉ cần ổn định và so sánh được giữa các lần gọi.
  return `${moviesV || ''}|${sectionsV || ''}`;
}

export async function getDashboardStatsCountsSb(): Promise<Record<string, number>> {
  const [sections, movies_total, movies_series, movies_single, movies_hoathinh, movies_tvshows, movies_unbuilt, movies_duplicates] =
    await Promise.all([
      countHomepageSectionsSb(),
      countMoviesByTypeSb('all'),
      countMoviesByTypeSb('series'),
      countMoviesByTypeSb('single'),
      countMoviesByTypeSb('hoathinh'),
      countMoviesByTypeSb('tvshows'),
      countMoviesUnbuiltSb(),
      countMoviesDuplicatesSb(),
    ]);

  return {
    sections,
    movies_total,
    movies_series,
    movies_single,
    movies_hoathinh,
    movies_tvshows,
    movies_unbuilt,
    movies_duplicates,
  };
}
