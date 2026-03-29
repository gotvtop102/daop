/**
 * Ảnh phim trong repo: public/thumbs|posters/<id>.webp — cùng cấu trúc key như R2 cũ (không có tiền tố public/).
 * URL công khai: IMAGE_CDN_BASE + "/" + key (vd jsDelivr: .../gh/user/repo@branch/public).
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_IMAGES_ROOT = path.join(__dirname, '..', '..', 'public');

/** Base CDN (vd https://cdn.jsdelivr.net/gh/owner/repo@main/public) — không dấu /. */
export function getImageCdnBase() {
  const raw = String(process.env.IMAGE_CDN_BASE || process.env.R2_PUBLIC_URL || '').trim();
  return raw.replace(/\/$/, '');
}

/** Key dạng thumbs/xxx.webp — đường dẫn tuyệt đối trong repo */
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
  return base ? `${base}/${String(key).replace(/^\//, '')}` : null;
}

export function cdnUrlForImageKey(key) {
  const base = getImageCdnBase();
  if (!base) return '';
  return `${base}/${String(key).replace(/^\//, '')}`;
}

export function cdnUrlByMovieId(id, folder) {
  const base = getImageCdnBase();
  const idStr = String(id || '').trim();
  if (!base || !idStr) return '';
  return `${base}/${folder}/${idStr}.webp`;
}

/** URL đã trỏ tới CDN/repo ảnh (để tránh fetch lại từ chính CDN) */
export function isCdnRepoImageUrl(u) {
  const base = getImageCdnBase();
  if (!base) return false;
  const s = String(u || '').trim();
  if (!s) return false;
  return s.startsWith(base + '/');
}
