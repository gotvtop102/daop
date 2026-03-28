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

async function fetchExistingModifiedMap(supabase, ids) {
  const map = new Map();
  const chunkSize = 150;
  const unique = [...new Set(ids.map((id) => String(id)))];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase.from('movies').select('id, modified').in('id', chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(String(row.id), row.modified);
    }
  }
  return map;
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
  const batchSize = Math.max(20, Math.min(500, Number(process.env.EXPORT_TO_SUPABASE_BATCH || 150) || 150));
  const concurrency = Math.max(1, Math.min(16, Number(process.env.EXPORT_TO_SUPABASE_CONCURRENCY || 4) || 4));

  console.log(
    'Export to Supabase — scope:',
    scope,
    '| incremental:',
    alwaysFull ? 'off (always full)' : 'on',
    '| batch upsert:',
    batchSize,
    '| concurrency:',
    concurrency
  );

  const all = loadMoviesFromBatches();
  console.log('   Loaded from batches:', all.length, 'movies');

  const movies = filterByScope(all, scope);
  console.log('   After scope filter:', movies.length, 'movies');

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
    const { error } = await supabase.from('movies').upsert(chunk, { onConflict: 'id' });
    if (error) {
      console.error('Upsert movies failed:', error.message || error);
      process.exit(1);
    }
    upserted += chunk.length;
    console.log('   Upserted movies:', upserted, '/', toSync.length);
  }

  let next = 0;
  const worker = async () => {
    for (;;) {
      const j = next++;
      if (j >= toSync.length) break;
      const m = toSync[j];
      const mid = String(m.id);
      const { error: delErr } = await supabase.from('movie_episodes').delete().eq('movie_id', mid);
      if (delErr) {
        console.warn('   Delete episodes failed', mid, delErr.message);
        continue;
      }
      const rows = flattenEpisodes(m);
      if (rows.length) {
        const { error: insErr } = await supabase.from('movie_episodes').insert(rows);
        if (insErr) {
          console.warn('   Insert episodes failed', mid, insErr.message);
        } else {
          epInserted += rows.length;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, toSync.length) }, () => worker()));

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
