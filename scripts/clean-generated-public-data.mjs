/**
 * Xóa artefact build trong public/ (giữ public/data/config + ophim_index.json).
 * Chạy: node scripts/clean-generated-public-data.mjs
 * Sau đó bắt buộc chạy lại npm run build trước khi deploy.
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const publicDir = path.join(ROOT, 'public');
const dataDir = path.join(publicDir, 'data');

const DATA_SUBDIRS_REMOVE = ['index', 'search', 'ver', 'home', 'lists', 'cache', 'batches', 'actors'];
const DATA_FILES_REMOVE = [
  'filters.js',
  'filters.json',
  'movies-light.js',
  'movies-manifest.json',
  'cdn.json',
  'last_modified.json',
  'last_build.json',
  'build_version.json',
  'repo_image_upload_state.json',
  '.pubjs-slugs-data-bumped.json',
  '.build-write-pubjs-log.json',
];

async function main() {
  for (const d of DATA_SUBDIRS_REMOVE) {
    const p = path.join(dataDir, d);
    if (await fs.pathExists(p)) {
      await fs.remove(p);
      console.log('removed', path.relative(ROOT, p));
    }
  }
  for (const f of DATA_FILES_REMOVE) {
    const p = path.join(dataDir, f);
    if (await fs.pathExists(p)) {
      await fs.remove(p);
      console.log('removed', path.relative(ROOT, p));
    }
  }
  const entries = await fs.readdir(dataDir, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (
      /^actors-[a-z]+\.(js|json)$/i.test(ent.name) ||
      /^actors-other\.(js|json)$/i.test(ent.name) ||
      ent.name === 'actors.js' ||
      ent.name === 'actors-index.json' ||
      ent.name === 'actors-search-index.json'
    ) {
      const p = path.join(dataDir, ent.name);
      await fs.remove(p);
      console.log('removed', path.relative(ROOT, p));
    }
  }
  for (const sub of ['the-loai', 'quoc-gia', 'nam-phat-hanh']) {
    const dir = path.join(publicDir, sub);
    if (!(await fs.pathExists(dir))) continue;
    const files = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of files) {
      if (!ent.isFile() || !ent.name.endsWith('.html') || ent.name === 'index.html') continue;
      const p = path.join(dir, ent.name);
      await fs.remove(p);
      console.log('removed', path.relative(ROOT, p));
    }
  }
  for (const f of ['sitemap.xml', 'robots.txt']) {
    const p = path.join(publicDir, f);
    if (await fs.pathExists(p)) {
      await fs.remove(p);
      console.log('removed', path.relative(ROOT, f));
    }
  }
  console.log('Done. Chạy npm run build để tạo lại dữ liệu.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
