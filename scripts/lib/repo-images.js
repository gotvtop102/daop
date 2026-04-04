/**
 * Ảnh phim: public/thumbs|posters/{shard}/{slug}.webp
 * URL công khai jsDelivr: IMAGE_CDN_BASE (không gồm @ref) + @IMAGE_CDN_REF + /IMAGE_PATH_PREFIX/thumbs|posters/...
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSlugShard2 } from './slug-shard.js';
import { resolveJsDelivrRef } from './jsdelivr-ref.js';

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
