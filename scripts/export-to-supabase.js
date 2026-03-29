/**
 * Đẩy dữ liệu phim đã build (public/data/batches) lên Supabase.
 *
 * Cần: SUPABASE_ADMIN_URL (hoặc VITE_SUPABASE_ADMIN_URL), SUPABASE_ADMIN_SERVICE_ROLE_KEY
 *
 * EXPORT_TO_SUPABASE_SCOPE:
 *   - all (mặc định): toàn bộ phim trong batch
 *   - custom: chỉ phim có _from_supabase hoặc id bắt đầu ext_ (tránh đẩy nhầm batch lớn)
 *
 * EXPORT_TO_SUPABASE_ALWAYS_FULL=1: luôn upsert mọi phim + đồng bộ lại toàn bộ tập (bỏ qua tối ưu).
 * Mặc định: chỉ ghi phim mới hoặc khi trường modified trên batch khác với DB (bỏ qua upsert + tập nếu không đổi).
 *
 * EXPORT_TO_SUPABASE_BATCH: kích thước chunk upsert movies (mặc định 120, max 500).
 * EXPORT_TO_SUPABASE_UPSERT_RETRIES: số lần thử lại khi timeout/lỗi mạng (mặc định 4).
 * EXPORT_TO_SUPABASE_EP_MOVIE_BATCH: gom N phim/lượt cho delete tập + insert tập (mặc định 12, max 80).
 * EXPORT_TO_SUPABASE_EP_INSERT_CHUNK: tối đa số dòng movie_episodes mỗi request insert (mặc định 400).
 *
 * Chạy sau khi đã build (có batch-windows.json + batch_*.js).
 */
import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

function loadMoviesFromBatches() {
  const batchDir = path.join(PUBLIC_DATA, 'batches');
  const windowsPath = path.join(batchDir, 'batch-windows.json');
  if (!fs.existsSync(windowsPath)) {
    throw new Error('Thiếu batch-windows.json. Chạy npm run build trước.');
  }
  const wj = JSON.parse(fs.readFileSync(windowsPath, 'utf8'));
  const wins = wj && Array.isArray(wj.windows) ? wj.windows : [];
  if (!wins.length) throw new Error('batch-windows.json không có windows hợp lệ');

  const all = [];
  for (const w of wins) {
    const f = path.join(batchDir, `batch_${w.start}_${w.end}.js`);
    if (!fs.existsSync(f)) continue;
    const raw = fs.readFileSync(f, 'utf8');
    const jsonStr = raw
      .replace(/^window\.moviesBatch\s*=\s*/i, '')
      .replace(/;\s*$/, '');
    try {
      const arr = JSON.parse(jsonStr);
      if (Array.isArray(arr)) all.push(...arr);
    } catch {
      // skip
    }
  }
  return all;
}

function str(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x?.name ? x.name : x)).filter(Boolean).join(',');
  return String(v);
}

function genreCountry(m) {
  const g = m.genre;
  const c = m.country;
  let genreStr = '';
  let countryStr = '';
  if (Array.isArray(g)) {
    genreStr = g.map((x) => (x && typeof x === 'object' ? x.name || x.slug : x)).filter(Boolean).join(',');
  } else genreStr = str(g);
  if (Array.isArray(c)) {
    countryStr = c.map((x) => (x && typeof x === 'object' ? x.name || x.slug : x)).filter(Boolean).join(',');
  } else countryStr = str(c);
  return { genreStr, countryStr };
}

function movieToRow(m) {
  const { genreStr, countryStr } = genreCountry(m);
  const tid = m.tmdb_id != null ? m.tmdb_id : m.tmdb?.id;
  return {
    id: String(m.id),
    slug: String(m.slug || ''),
    title: String(m.title || ''),
    name: String(m.title || m.name || ''),
    origin_name: String(m.origin_name || ''),
    type: String(m.type || 'single'),
    year: String(m.year ?? ''),
    genre: genreStr,
    country: countryStr,
    language: String(m.lang_key || m.language || ''),
    quality: String(m.quality || ''),
    episode_current: String(m.episode_current || ''),
    thumb_url: String(m.thumb || m.thumb_url || ''),
    poster_url: String(m.poster || m.poster_url || ''),
    description: String(m.description || ''),
    content: String(m.description || m.content || ''),
    status: String(m.status || ''),
    chieurap: m.chieurap ? '1' : '0',
    showtimes: String(m.showtimes || ''),
    is_exclusive: m.is_exclusive ? '1' : '0',
    tmdb_id: tid != null && tid !== '' ? String(tid) : '',
    modified: String(m.modified || new Date().toISOString()),
    update: '',
    note: String(m.note || ''),
    director: Array.isArray(m.director) ? m.director.join(',') : String(m.director || ''),
    actor: Array.isArray(m.cast) ? m.cast.slice(0, 80).join(',') : String(m.actor || ''),
    tmdb_type: String(m.tmdb_type || m.tmdb?.media_type || ''),
    updated_at: new Date().toISOString(),
  };
}

/** Giống saveEpisodesSb: flatten episodes từ batch (server groups + server_data hoặc dạng phẳng). */
function flattenEpisodes(m) {
  const mid = String(m.id);
  const out = [];
  let sort = 0;
  const eps = m.episodes || [];

  for (const grp of eps) {
    if (!grp || typeof grp !== 'object') continue;
    const serverSlug = String(grp.slug || grp.server_slug || 'vietsub-1').trim() || 'vietsub-1';
    const serverName = String(grp.server_name || grp.name || serverSlug);

    const items = grp.server_data;
    if (Array.isArray(items) && items.length) {
      for (const src of items) {
        if (!src || typeof src !== 'object') continue;
        const epCode = String(src.slug || src.episode_code || src.name || sort + 1);
        const epName = String(src.name || src.episode_name || `Tập ${epCode}`);
        out.push({
          movie_id: mid,
          episode_code: epCode,
          episode_name: epName,
          server_slug: serverSlug,
          server_name: serverName,
          link_m3u8: String(src.link_m3u8 || ''),
          link_embed: String(src.link_embed || ''),
          link_backup: String(src.link_backup || ''),
          link_vip1: String(src.link_vip1 || ''),
          link_vip2: String(src.link_vip2 || ''),
          link_vip3: String(src.link_vip3 || ''),
          link_vip4: String(src.link_vip4 || ''),
          link_vip5: String(src.link_vip5 || ''),
          note: String(src.note || ''),
          sort_order: sort++,
          updated_at: new Date().toISOString(),
        });
      }
      continue;
    }

    if (grp.link_embed || grp.link_m3u8 || grp.name) {
      const epCode = String(grp.slug || grp.episode_code || sort + 1);
      const epName = String(grp.name || grp.episode_name || `Tập ${epCode}`);
      out.push({
        movie_id: mid,
        episode_code: epCode,
        episode_name: epName,
        server_slug: serverSlug,
        server_name: serverName,
        link_m3u8: String(grp.link_m3u8 || ''),
        link_embed: String(grp.link_embed || ''),
        link_backup: String(grp.link_backup || ''),
        link_vip1: String(grp.link_vip1 || ''),
        link_vip2: String(grp.link_vip2 || ''),
        link_vip3: String(grp.link_vip3 || ''),
        link_vip4: String(grp.link_vip4 || ''),
        link_vip5: String(grp.link_vip5 || ''),
        note: String(grp.note || ''),
        sort_order: sort++,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return out;
}

function filterByScope(movies, scope) {
  const s = String(scope || 'all').toLowerCase();
  if (s === 'all') return movies;
  return movies.filter((m) => {
    if (!m || m.id == null) return false;
    if (m._from_supabase) return true;
    const id = String(m.id);
    if (id.startsWith('ext_')) return true;
    return false;
  });
}

/** Chuẩn hóa modified để so sánh (ISO hoặc chuỗi gốc). */
function normalizeModified(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  return s;
}

/** Giá trị modified từ nguồn batch để so sánh; null = không tin được → luôn sync. */
function batchModifiedComparable(m) {
  if (m == null || m.modified == null) return null;
  const s = String(m.modified).trim();
  return s === '' ? null : s;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Tránh lỗi Postgres: "ON CONFLICT DO UPDATE command cannot affect row a second time"
 * xảy ra khi cùng key conflict (id) xuất hiện 2+ lần trong cùng 1 request upsert.
 * Giữ bản "mới hơn" theo modified (nếu parse được), fallback lấy bản sau.
 */
function dedupeMoviesById(movies) {
  const map = new Map();
  for (const m of movies || []) {
    if (!m || m.id == null) continue;
    const id = String(m.id);
    const prev = map.get(id);
    if (!prev) {
      map.set(id, m);
      continue;
    }
    const a = batchModifiedComparable(prev);
    const b = batchModifiedComparable(m);
    const ta = a == null ? NaN : Date.parse(String(a));
    const tb = b == null ? NaN : Date.parse(String(b));
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) {
      map.set(id, tb >= ta ? m : prev);
    } else if (!Number.isNaN(tb)) {
      map.set(id, m);
    } else {
      // Không parse được time → ưu tiên bản sau (deterministic theo thứ tự input)
      map.set(id, m);
    }
  }
  return [...map.values()];
}

/** Lỗi PostgREST/edge thường gặp khi volume lớn — đáng retry. */
function isRetryableSupabaseError(err) {
  if (!err) return false;
  const code = err.code != null ? String(err.code) : '';
  const msg = String(err.message || err.details || err.hint || err).toLowerCase();
  if (code === '57014') return true;
  return /timeout|timed out|502|503|504|connection|network|fetch failed|econnreset|etimedout|too large|payload/i.test(
    msg
  );
}

/** Supabase JS trả { data, error } — retry khi error retryable. */
async function supabaseWithRetry(label, run, retries = 4) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await run();
    if (!r.error) return r;
    last = r.error;
    if (!isRetryableSupabaseError(r.error) || attempt === retries) return r;
    const wait = Math.min(8000, 400 * 2 ** attempt);
    console.warn(`   ${label}: retry ${attempt + 1}/${retries} sau ${wait}ms —`, r.error.message || r.error);
    await sleep(wait);
  }
  return { data: null, error: last };
}

async function fetchExistingModifiedMap(supabase, ids) {
  const map = new Map();
  const chunkSize = 100;
  const unique = [...new Set(ids.map((id) => String(id)))];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabaseWithRetry('select movies (modified)', () =>
      supabase.from('movies').select('id, modified').in('id', chunk)
    );
    if (error) throw error;
    for (const row of data || []) {
      map.set(String(row.id), row.modified);
    }
  }
  return map;
}

/**
 * Upsert movies: retry từng chunk; nếu vẫn lỗi (payload/timeout) thì chia đôi chunk.
 */
async function upsertMoviesChunked(supabase, rows, minSplit = 8) {
  if (!rows.length) return;
  const r = await supabaseWithRetry('upsert movies', () =>
    supabase.from('movies').upsert(rows, { onConflict: 'id' })
  );
  if (!r.error) return;
  if (rows.length <= minSplit) {
    const msg = r.error.message || String(r.error);
    console.error('Upsert movies failed:', msg);
    throw r.error;
  }
  const mid = Math.ceil(rows.length / 2);
  await upsertMoviesChunked(supabase, rows.slice(0, mid), minSplit);
  await upsertMoviesChunked(supabase, rows.slice(mid), minSplit);
}

function movieNeedsDbWrite(m, existingModifiedMap) {
  const id = String(m.id);
  const batchMod = batchModifiedComparable(m);
  if (batchMod == null) return true;
  if (!existingModifiedMap.has(id)) return true;
  const dbMod = existingModifiedMap.get(id);
  return normalizeModified(batchMod) !== normalizeModified(dbMod);
}

async function main() {
  const url = String(process.env.SUPABASE_ADMIN_URL || process.env.VITE_SUPABASE_ADMIN_URL || '').trim();
  const key = String(process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('Thiếu SUPABASE_ADMIN_URL (hoặc VITE_SUPABASE_ADMIN_URL) hoặc SUPABASE_ADMIN_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const scope = process.env.EXPORT_TO_SUPABASE_SCOPE || 'all';
  const alwaysFull = /^1|true|yes$/i.test(String(process.env.EXPORT_TO_SUPABASE_ALWAYS_FULL || '').trim());
  const batchSize = Math.max(20, Math.min(500, Number(process.env.EXPORT_TO_SUPABASE_BATCH || 120) || 120));
  const epMovieBatch = Math.max(1, Math.min(80, Number(process.env.EXPORT_TO_SUPABASE_EP_MOVIE_BATCH || 12) || 12));
  const epInsertChunk = Math.max(50, Math.min(2000, Number(process.env.EXPORT_TO_SUPABASE_EP_INSERT_CHUNK || 400) || 400));

  console.log(
    'Export to Supabase — scope:',
    scope,
    '| incremental:',
    alwaysFull ? 'off (always full)' : 'on',
    '| movies upsert chunk:',
    batchSize,
    '| episodes: delete per',
    epMovieBatch,
    'phim, insert ≤',
    epInsertChunk,
    'dòng/request'
  );

  const all = loadMoviesFromBatches();
  console.log('   Loaded from batches:', all.length, 'movies');

  const scoped = filterByScope(all, scope);
  console.log('   After scope filter:', scoped.length, 'movies');

  const movies = dedupeMoviesById(scoped);
  const dupRemoved = scoped.length - movies.length;
  if (dupRemoved > 0) {
    console.log('   Dedupe by id: removed', dupRemoved, 'duplicates');
  }

  if (!movies.length) {
    const hint =
      String(scope || '').toLowerCase() === 'custom'
        ? ' Với batch id thường (MongoDB…) không có _from_supabase: đặt EXPORT_TO_SUPABASE_SCOPE=all.'
        : '';
    console.log('Nothing to export.' + hint);
    return;
  }

  const supabase = createClient(url, key);
  let upserted = 0;
  let epInserted = 0;
  let skippedUnchanged = 0;

  let toSync = movies;
  if (!alwaysFull) {
    const ids = movies.map((m) => m.id);
    const existingMap = await fetchExistingModifiedMap(supabase, ids);
    toSync = movies.filter((m) => movieNeedsDbWrite(m, existingMap));
    skippedUnchanged = movies.length - toSync.length;
    console.log('   Incremental: skip unchanged:', skippedUnchanged, '| will sync:', toSync.length);
  }

  for (let i = 0; i < toSync.length; i += batchSize) {
    const chunk = toSync.slice(i, i + batchSize).map(movieToRow);
    try {
      await upsertMoviesChunked(supabase, chunk);
    } catch (e) {
      console.error('Upsert movies failed:', e?.message || e);
      process.exit(1);
    }
    upserted += chunk.length;
    console.log('   Upserted movies:', upserted, '/', toSync.length);
  }

  for (let g = 0; g < toSync.length; g += epMovieBatch) {
    const group = toSync.slice(g, g + epMovieBatch);
    const mids = group.map((m) => String(m.id));
    const { error: delErr } = await supabaseWithRetry('delete movie_episodes (batch movie_id)', () =>
      supabase.from('movie_episodes').delete().in('movie_id', mids)
    );
    if (delErr) {
      console.warn('   Xóa tập theo batch thất bại, fallback từng phim:', delErr.message || delErr);
      for (const m of group) {
        const mid = String(m.id);
        const { error: d1 } = await supabaseWithRetry('delete movie_episodes (one)', () =>
          supabase.from('movie_episodes').delete().eq('movie_id', mid)
        );
        if (d1) console.warn('   Delete episodes failed', mid, d1.message);
        const rows = flattenEpisodes(m);
        for (let j = 0; j < rows.length; j += epInsertChunk) {
          const part = rows.slice(j, j + epInsertChunk);
          const { error: insErr } = await supabaseWithRetry('insert movie_episodes', () =>
            supabase.from('movie_episodes').insert(part)
          );
          if (insErr) console.warn('   Insert episodes failed', mid, insErr.message);
          else epInserted += part.length;
        }
      }
      continue;
    }

    const allEpRows = [];
    for (const m of group) {
      const fe = flattenEpisodes(m);
      for (let k = 0; k < fe.length; k++) allEpRows.push(fe[k]);
    }
    for (let j = 0; j < allEpRows.length; j += epInsertChunk) {
      const part = allEpRows.slice(j, j + epInsertChunk);
      const { error: insErr } = await supabaseWithRetry('insert movie_episodes', () =>
        supabase.from('movie_episodes').insert(part)
      );
      if (insErr) {
        console.warn('   Insert episodes chunk failed:', insErr.message);
      } else {
        epInserted += part.length;
      }
    }
  }

  console.log(
    'Done. Movies upserted:',
    upserted,
    '| skipped (unchanged):',
    skippedUnchanged,
    '| episode rows inserted:',
    epInserted
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
