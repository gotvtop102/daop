/**
 * Ảnh phim: public/thumbs|posters/{shard}/{slug}.webp
 * URL công khai jsDelivr: IMAGE_CDN_BASE (không gồm @ref) + @IMAGE_CDN_REF + /IMAGE_PATH_PREFIX/thumbs|posters/...
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSlugShard2 } from './slug-shard.js';
import { resolveJsDelivrRef, commitShasEquivalent } from './jsdelivr-ref.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_IMAGES_ROOT = path.join(__dirname, '..', '..', 'public');

export function stripTrailingSlash(u) {
  return String(u || '').trim().replace(/\/+$/g, '');
}

/** Base: https://cdn.jsdelivr.net/gh/owner/repo (không có @ref, không dấu / cuối) */
export function getImageCdnBase() {
  let raw = String(process.env.IMAGE_CDN_BASE || process.env.R2_PUBLIC_URL || '').trim();
  raw = stripTrailingSlash(raw);
  if (raw.includes('@')) {
    const i = raw.indexOf('@');
    raw = stripTrailingSlash(raw.slice(0, i));
  }
  return raw;
}

export function getImageCdnRef() {
  return resolveJsDelivrRef({
    explicitVar: 'IMAGE_CDN_REF',
    repoCommitVar: 'IMAGE_REPO_COMMIT',
  });
}

export function getImagePathPrefix() {
  return String(process.env.IMAGE_PATH_PREFIX || 'public').replace(/^\/+|\/+$/g, '');
}

export function repoImageKeyForSlug(slug, folder) {
  const safe = String(slug || '').trim();
  if (!safe) return '';
  const shard = getSlugShard2(safe);
  const f = String(folder || 'thumbs').replace(/\/$/, '');
  return `${f}/${shard}/${safe}.webp`;
}

export function buildJsDelivrFileUrl(baseNoAtRef, ref, pathInRepo) {
  const b = stripTrailingSlash(baseNoAtRef);
  const r = String(ref || 'main').trim();
  const p = String(pathInRepo || '').replace(/^\/+/, '');
  if (!b || !p) return '';
  return `${b}@${r}/${p}`;
}

/**
 * @param {string} slug
 * @param {'thumbs'|'posters'} folder
 * @param {{ ref?: string, baseOverride?: string }} opts
 */
export function cdnUrlByMovieSlug(slug, folder, opts = {}) {
  const ref = opts.ref != null ? opts.ref : getImageCdnRef();
  const base = stripTrailingSlash(opts.baseOverride != null ? opts.baseOverride : getImageCdnBase());
  if (!base) return '';
  const prefix = getImagePathPrefix();
  const key = repoImageKeyForSlug(slug, folder);
  if (!key) return '';
  const pathInRepo = prefix ? `${prefix}/${key}` : key;
  // Không gắn ?v= semver: nội dung đã được định danh bởi @ref (commit/main) trên jsDelivr.
  return buildJsDelivrFileUrl(base, ref, pathInRepo);
}

/** URL thumb/poster trong pubjs đã trỏ đúng commit (ref 7 vs 40 ký tự). */
export function cdnMovieImageUrlMatchesCommit(url, slug, folder, commitSha) {
  const want = cdnUrlByMovieSlug(slug, folder, { ref: commitSha });
  const g = String(url || '').trim();
  const w = String(want || '').trim();
  if (!w) return false;
  if (g === w) return true;
  const iu = g.indexOf('@');
  const iw = w.indexOf('@');
  if (iu < 0 || iw < 0) return false;
  const restU = g.slice(iu + 1);
  const restW = w.slice(iw + 1);
  const slashU = restU.indexOf('/');
  const slashW = restW.indexOf('/');
  if (slashU < 0 || slashW < 0) return false;
  const refU = restU.slice(0, slashU);
  const pathU = restU.slice(slashU + 1);
  const pathW = restW.slice(slashW + 1);
  if (pathU !== pathW) return false;
  return commitShasEquivalent(refU, commitSha);
}

/** Key tương đối trong public/ */
export function imageKeyToAbsolutePath(key) {
  const k = String(key || '').trim().replace(/^\/+/, '');
  if (!k || k.includes('..')) return '';
  return path.join(REPO_IMAGES_ROOT, k);
}

export function repoImageKeyExists(key) {
  const abs = imageKeyToAbsolutePath(key);
  if (!abs) return false;
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

export async function writeRepoImageFile(buffer, key, _contentType = 'image/webp') {
  const abs = imageKeyToAbsolutePath(key);
  if (!abs) return null;
  await fs.ensureDir(path.dirname(abs));
  await fs.writeFile(abs, buffer);
  const base = getImageCdnBase();
  const ref = getImageCdnRef();
  const prefix = getImagePathPrefix();
  const relKey = String(key).replace(/^\/+/, '');
  if (!base) return null;
  const pathInRepo = prefix ? `${prefix}/${relKey}` : relKey;
  return buildJsDelivrFileUrl(base, ref, pathInRepo);
}

export function cdnUrlForImageKey(key) {
  const base = getImageCdnBase();
  if (!base) return '';
  const ref = getImageCdnRef();
  const prefix = getImagePathPrefix();
  const relKey = String(key).replace(/^\/+/, '');
  const pathInRepo = prefix ? `${prefix}/${relKey}` : relKey;
  return buildJsDelivrFileUrl(base, ref, pathInRepo);
}

/** @deprecated — dùng cdnUrlByMovieSlug */
export function cdnUrlByMovieId(id, folder) {
  return cdnUrlByMovieSlug(String(id || '').trim(), folder, {});
}

export function isCdnRepoImageUrl(u) {
  const base = getImageCdnBase();
  if (!base) return false;
  const s = String(u || '').trim();
  if (!s) return false;
  return s.startsWith(base + '@') || s.startsWith(base + '/');
}
