/**
 * Sau khi push repo ảnh: chỉ slug trong .pubjs-slugs-data-bumped.json (phim đổi trong build)
 * Ghi imageRef (hoặc ref nếu trùng data); cdn.images.ref = main; movies-light chỉ sửa dòng bumped.
 *
 * Env: IMAGE_REPO_COMMIT hoặc --sha=<commit> (7–40 hex).
 */
import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeCommitSha } from './lib/jsdelivr-ref.js';
import { applyVerEntryShas, extractDataShaFromVerEntry } from './lib/ver-entry.js';
import {
  cdnUrlByMovieSlug,
  getImageCdnBase,
  getImagePathPrefix,
} from './lib/repo-images.js';
import { getPubjsOutputDir } from './lib/pubjs-url.js';
import { getSlugShard2 } from './lib/slug-shard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');
const BUMP_FILE = path.join(PUBLIC_DATA, '.pubjs-slugs-data-bumped.json');

function loadVerByShard(verDir) {
  const verByShard = new Map();
  if (!fs.existsSync(verDir)) return verByShard;
  let files = [];
  try {
    files = fs.readdirSync(verDir).filter((f) => f.endsWith('.json'));
  } catch {
    return verByShard;
  }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(verDir, f), 'utf8'));
      if (j && typeof j === 'object') verByShard.set(f.replace(/\.json$/i, ''), j);
    } catch {}
  }
  return verByShard;
}

function writeVerShardFiles(verDir, verByShard) {
  fs.ensureDirSync(verDir);
  for (const [shard, obj] of verByShard.entries()) {
    if (!shard || !obj || !Object.keys(obj).length) continue;
    fs.writeFileSync(path.join(verDir, `${shard}.json`), JSON.stringify(obj), 'utf8');
  }
}

async function refreshMoviesLight(verByShard, sha, bumpedSet) {
  const mlPath = path.join(PUBLIC_DATA, 'movies-light.js');
  if (!(await fs.pathExists(mlPath)) || !bumpedSet.size) return 0;
  const raw = await fs.readFile(mlPath, 'utf8');
  const prefix = 'window.moviesLight = ';
  if (!raw.startsWith(prefix)) return 0;
  const jsonPart = raw.slice(prefix.length).replace(/;\s*$/, '').trim();
  let arr;
  try {
    arr = JSON.parse(jsonPart);
  } catch {
    return 0;
  }
  if (!Array.isArray(arr)) return 0;
  let n = 0;
  for (const row of arr) {
    const slug = row && row.slug != null ? String(row.slug).trim() : '';
    if (!slug || !bumpedSet.has(slug)) continue;
    const shard = getSlugShard2(slug);
    const ent = verByShard.get(shard)?.[slug];
    if (!ent) continue;
    const u = cdnUrlByMovieSlug(slug, 'thumbs', { ref: sha });
    if (u) {
      row.thumb = u;
      n++;
    }
  }
  await fs.writeFile(mlPath, `window.moviesLight = ${JSON.stringify(arr)};\n`, 'utf8');
  return n;
}

async function main() {
  const argSha = process.argv.find((a) => a.startsWith('--sha='))?.slice('--sha='.length);
  const sha = normalizeCommitSha(argSha || process.env.IMAGE_REPO_COMMIT || '');
  if (!sha) {
    console.error('Thiếu SHA hợp lệ: đặt IMAGE_REPO_COMMIT hoặc --sha=<commit>');
    process.exit(1);
  }

  if (!getImageCdnBase()) {
    console.error('Thiếu IMAGE_CDN_BASE — không build được URL ảnh.');
    process.exit(1);
  }

  let bumped = [];
  try {
    if (await fs.pathExists(BUMP_FILE)) {
      const j = JSON.parse(await fs.readFile(BUMP_FILE, 'utf8'));
      bumped = Array.isArray(j.slugs) ? j.slugs.map((s) => String(s || '').trim()).filter(Boolean) : [];
    }
  } catch {
    bumped = [];
  }

  const bumpedSet = new Set(bumped);
  if (!bumpedSet.size) {
    console.log('refresh-image-jsdelivr-after-push: không có slug bumped — bỏ qua.');
    return;
  }

  const verDir = path.join(PUBLIC_DATA, 'ver');
  const verByShard = loadVerByShard(verDir);

  const pubjsRoot = getPubjsOutputDir();
  let pubjsUpdated = 0;
  let verTouched = 0;

  for (const slug of bumped) {
    const shard = getSlugShard2(slug);
    let shardObj = verByShard.get(shard);
    if (!shardObj) {
      shardObj = {};
      verByShard.set(shard, shardObj);
    }
    if (!shardObj[slug]) shardObj[slug] = {};
    const entry = shardObj[slug];
    delete entry.data;
    delete entry.thumb;
    delete entry.poster;
    const prevDataSha = extractDataShaFromVerEntry(entry);
    applyVerEntryShas(entry, { dataSha: prevDataSha || sha, imageSha: sha });
    verTouched++;

    const fp = path.join(pubjsRoot, shard, `${slug}.json`);
    if (await fs.pathExists(fp)) {
      try {
        const merged = JSON.parse(await fs.readFile(fp, 'utf8'));
        merged.thumb = cdnUrlByMovieSlug(slug, 'thumbs', { ref: sha });
        merged.poster = cdnUrlByMovieSlug(slug, 'posters', { ref: sha });
        await fs.writeFile(fp, JSON.stringify(merged), 'utf8');
        pubjsUpdated++;
      } catch {
        /* skip */
      }
    }
  }

  writeVerShardFiles(verDir, verByShard);

  const cdnPath = path.join(PUBLIC_DATA, 'cdn.json');
  if (await fs.pathExists(cdnPath)) {
    try {
      const cdn = JSON.parse(await fs.readFile(cdnPath, 'utf8'));
      if (!cdn.images || typeof cdn.images !== 'object') cdn.images = {};
      cdn.images.base = getImageCdnBase();
      cdn.images.ref = 'main';
      cdn.images.pathPrefix = getImagePathPrefix();
      await fs.writeFile(cdnPath, JSON.stringify(cdn, null, 2), 'utf8');
    } catch {
      /* keep */
    }
  }

  const mlN = await refreshMoviesLight(verByShard, sha, bumpedSet);

  console.log(
    'refresh-image-jsdelivr-after-push: ver imageRef →',
    sha,
    '| slug bumped:',
    bumpedSet.size,
    '| ver cập nhật:',
    verTouched,
    '| pubjs file:',
    pubjsUpdated,
    '| movies-light rows:',
    mlN
  );
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
