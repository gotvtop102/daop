/**
 * Script độc lập: đọc actors.js + movies-light.js, tạo lại actors shards có trường movies.
 * Chạy: node scripts/regenerate-actors-shards.js
 * Giúp trang diễn viên hiển thị danh sách phim mà không cần phụ thuộc movies-light.js load động.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DATA = path.join(__dirname, '..', 'public', 'data');

const ACTORS_SHARD_KEYS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'other',
];

function mergeActorsMapFromShards() {
  const map = {};
  for (const key of ACTORS_SHARD_KEYS) {
    const p = path.join(PUBLIC_DATA, `actors-${key}.json`);
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const m = data && data.map;
      if (m && typeof m === 'object') Object.assign(map, m);
    } catch {
      // ignore
    }
  }
  return map;
}

function parseWindowArray(jsContent, globalName) {
  const prefix = `window.${globalName}`;
  let s = String(jsContent || '').trim();
  if (!s.startsWith(prefix)) {
    throw new Error(`Không tìm thấy prefix ${prefix} trong file.`);
  }
  s = s.replace(new RegExp(`^${prefix}\\s*=\\s*`), '');
  s = s.replace(/;\s*$/, '');
  return JSON.parse(s);
}

function toLight(m) {
  if (!m) return null;
  return {
    id: String(m.id),
    title: m.title,
    origin_name: m.origin_name,
    slug: m.slug,
    thumb: m.thumb,
    poster: m.poster,
    year: m.year,
    type: m.type,
    episode_current: m.episode_current,
    lang_key: m.lang_key,
    is_4k: !!m.is_4k,
    is_exclusive: !!m.is_exclusive,
    sub_docquyen: !!m.sub_docquyen,
    chieurap: !!m.chieurap,
  };
}

function loadMovieLightByIdFromBatches() {
  const batchDir = path.join(PUBLIC_DATA, 'batches');
  if (!fs.existsSync(batchDir)) {
    throw new Error('batches/ không tồn tại. Chạy build trước.');
  }
  const files = fs.readdirSync(batchDir).filter((f) => /^batch_\d+_\d+\.js$/i.test(f));
  const byId = new Map();
  for (const f of files) {
    const raw = fs.readFileSync(path.join(batchDir, f), 'utf8');
    let arr;
    try {
      arr = parseWindowArray(raw, 'moviesBatch');
    } catch (e) {
      console.warn('Skip batch file:', f, e.message);
      continue;
    }
    for (const m of arr || []) {
      if (!m || m.id == null) continue;
      const light = toLight(m);
      if (light) byId.set(String(light.id), light);
    }
  }
  return byId;
}

function main() {
  const actorsPath = path.join(PUBLIC_DATA, 'actors.js');

  if (!fs.existsSync(actorsPath)) {
    console.error('actors.js không tồn tại. Chạy npm run build trước.');
    process.exit(1);
  }

  const actorsRaw = fs.readFileSync(actorsPath, 'utf8');
  const actorsStr = actorsRaw.replace(/^window\.actorsData\s*=\s*/, '').replace(/;\s*$/, '');
  const actorsData = JSON.parse(actorsStr);
  let m = actorsData.map;
  const n = actorsData.names || {};
  if (!m || typeof m !== 'object' || Object.keys(m).length === 0) {
    m = mergeActorsMapFromShards();
  }
  if (!m || Object.keys(m).length === 0) {
    console.error('Không có map trong actors.js và không gộp được từ actors-*.json.');
    process.exit(1);
  }

  const movieById = loadMovieLightByIdFromBatches();

  const slugs = Object.keys(n);
  const byFirst = {};
  for (const slug of slugs) {
    const c = (slug[0] || '').toLowerCase();
    const key = c >= 'a' && c <= 'z' ? c : 'other';
    if (!byFirst[key]) byFirst[key] = { map: {}, names: {}, movies: {} };
    byFirst[key].map[slug] = m[slug] || [];
    byFirst[key].names[slug] = n[slug];
    byFirst[key].movies[slug] = (m[slug] || [])
      .map((id) => movieById.get(String(id)))
      .filter(Boolean);
  }

  const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'other'];
  for (const key of keys) {
    const data = byFirst[key] || { map: {}, names: {}, movies: {} };
    fs.writeFileSync(
      path.join(PUBLIC_DATA, `actors-${key}.js`),
      `window.actorsData = ${JSON.stringify(data)};`,
      'utf8'
    );
  }

  const shardCount = keys.filter((k) => byFirst[k] && Object.keys(byFirst[k].map).length > 0).length;
  console.log('Đã tạo lại', shardCount, 'actors shards với trường movies.');
}

main();
