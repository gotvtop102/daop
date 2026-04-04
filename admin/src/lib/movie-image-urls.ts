/**
 * Ảnh phim trên CDN/repo (scripts/lib/repo-images.js + build):
 *   public/thumbs/{shard2}/{slug}.webp
 *   public/posters/{shard2}/{slug}.webp
 * shard2 = 2 ký tự đầu slug (a-z0-9), giống getSlugShard2.
 *
 * Base URL (site_settings.r2_img_domain) = jsDelivr …/public (không gồm @ref — preview admin).
 */

export function getSlugShard2(slug: string): string {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return '__';
  const ok = (c: string) => !!(c && /[a-z0-9]/.test(c));
  const a = s[0] || '_';
  const b = s[1] || '_';
  return (ok(a) ? a : '_') + (ok(b) ? b : '_');
}

/**
 * URL hiển thị khi đã có base …/public (giống đường dẫn sau khi build gán thumb/poster).
 */
export function buildCdnMovieImageUrlBySlug(
  r2PublicBase: string,
  movieSlug: string,
  kind: 'thumb' | 'poster'
): string {
  const slug = String(movieSlug || '').trim();
  const b = String(r2PublicBase || '').replace(/\/$/, '');
  if (!slug || !b) return '';
  const shard = getSlugShard2(slug);
  const folder = kind === 'poster' ? 'posters' : 'thumbs';
  return `${b}/${folder}/${shard}/${slug}.webp`;
}

/** Fallback domain OPhim: /uploads/thumbs|posters/{stem}.webp (stem thường là slug hoặc tên file gốc) */
export function buildOphimUploadsImageUrlByStem(
  ophimImgDomain: string,
  stem: string,
  kind: 'thumb' | 'poster'
): string {
  const t = String(stem || '').trim();
  const base = String(ophimImgDomain || '').replace(/\/$/, '');
  if (!t || !base) return '';
  const folder = kind === 'poster' ? 'posters' : 'thumbs';
  return `${base}/uploads/${folder}/${t}.webp`;
}

/**
 * Lấy stem tên file từ URL/path (bỏ đuôi ảnh, hậu tố -thumb/-poster).
 * Dùng cho ô URL chỉ nhập tên / slug ngắn.
 */
export function extractImageFileStem(
  raw: string,
  opts: { r2Origin: string; ophimOrigin: string }
): string {
  const u = String(raw || '').trim();
  if (!u) return '';
  const r2 = String(opts.r2Origin || '').replace(/\/$/, '');
  const ophim = String(opts.ophimOrigin || '').replace(/\/$/, '');
  let name = u;
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      const p = parsed.pathname || '';
      const underKnownDomain =
        (!!r2 && parsed.origin === r2) ||
        (!!ophim && parsed.origin === ophim);
      if (!underKnownDomain && p.indexOf('/uploads/') !== 0) {
        return u;
      }
      name = p.split('/').pop() || '';
    } catch {
      name = u.split('/').pop() || '';
    }
  } else if (u.startsWith('/')) {
    if (u.indexOf('/uploads/') !== 0) return u;
    name = u.split('/').pop() || '';
  }
  name = name.split('?')[0].split('#')[0];
  name = name.replace(/\.(jpe?g|jpg|png|webp|gif)$/i, '');
  name = name
    .replace(/[-_]?thumb$/i, '')
    .replace(/[-_]?poster$/i, '')
    .trim();
  return name;
}
