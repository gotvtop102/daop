/**
 * Sau khi push JSON phim lên repo pjs102: gán dataRef + pubjs_url = commit
 * cho slug bumped; đồng bộ ver.modified từ JSON phim (bust client &m=).
 * Slug không bumped: client dùng @main + ?v=builtAt; bumped: ghi ref hoặc dataRef+imageRef trong ver.
 *
 * Env: PUBJS_REPO_COMMIT = SHA sau push (bắt buộc, 7–40 hex).
 */
import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeCommitSha } from './lib/jsdelivr-ref.js';
import { applyVerEntryShas } from './lib/ver-entry.js';
import { getPubjsOutputDir, buildPubjsFileUrl, getPubjsCdnBase, getPubjsPathPrefix } from './lib/pubjs-url.js';
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

async function main() {
  const argSha = process.argv.find((a) => a.startsWith('--sha='))?.slice('--sha='.length);
  const sha = normalizeCommitSha(argSha || process.env.PUBJS_REPO_COMMIT || '');
  if (!sha) {
    console.error('Thiếu SHA hợp lệ: đặt PUBJS_REPO_COMMIT hoặc --sha=<commit>');
    process.exit(1);
  }

  if (!getPubjsCdnBase()) {
    console.error('Thiếu pubjs base — đặt PUBJS_CDN_BASE hoặc PUBJS_REPO (owner/repo).');
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

  const pubjsRoot = getPubjsOutputDir();
  const verDir = path.join(PUBLIC_DATA, 'ver');
  const verByShard = loadVerByShard(verDir);

  let updated = 0;
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
    const imgSha = normalizeCommitSha(process.env.IMAGE_REPO_COMMIT || '') || sha;
    applyVerEntryShas(entry, { dataSha: sha, imageSha: imgSha });

    const fp = path.join(pubjsRoot, shard, `${slug}.json`);
    if (!(await fs.pathExists(fp))) continue;
    try {
      const merged = JSON.parse(await fs.readFile(fp, 'utf8'));
      merged.pubjs_url = buildPubjsFileUrl(slug, null, sha);
      const mod = merged.modified != null ? String(merged.modified).trim() : merged.updated_at != null ? String(merged.updated_at).trim() : '';
      if (mod) entry.modified = mod;
      await fs.writeFile(fp, JSON.stringify(merged), 'utf8');
      updated++;
    } catch {
      /* skip */
    }
  }

  writeVerShardFiles(verDir, verByShard);

  const cdnPath = path.join(PUBLIC_DATA, 'cdn.json');
  if (await fs.pathExists(cdnPath)) {
    try {
      const cdn = JSON.parse(await fs.readFile(cdnPath, 'utf8'));
      if (!cdn.pubjs || typeof cdn.pubjs !== 'object') cdn.pubjs = {};
      cdn.pubjs.base = getPubjsCdnBase();
      cdn.pubjs.ref = 'main';
      cdn.pubjs.pathPrefix = getPubjsPathPrefix();
      await fs.writeFile(cdnPath, JSON.stringify(cdn, null, 2), 'utf8');
    } catch {
      /* keep */
    }
  }

  console.log(
    'refresh-pubjs-jsdelivr-after-push: ver ref + pubjs_url →',
    sha,
    '| slugs bumped:',
    bumped.length,
    '| file cập nhật:',
    updated
  );
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
