/**
 * Ảnh phim trên CDN/GitHub (public): thumbs/{id}.webp, posters/{id}.webp — đặt tên theo id phim, không theo slug.
 * Khớp api/movies-media.ts (uploadMovieImageById) và build site.
 */

export function buildCdnMovieImageUrlById(
  r2Base: string,
  movieId: string,
  kind: 'thumb' | 'poster'
): string {
  const idStr = String(movieId || '').trim();
  const b = String(r2Base || '').replace(/\/$/, '');
  if (!idStr || !b) return '';
  const folder = kind === 'poster' ? 'posters' : 'thumbs';
  return `${b}/${folder}/${idStr}.webp`;
}

/** Fallback kiểu OPhim: domain/uploads/thumbs|posters/{id}.webp */
export function buildOphimUploadsImageUrlById(
  ophimImgDomain: string,
  movieId: string,
  kind: 'thumb' | 'poster'
): string {
  const idStr = String(movieId || '').trim();
  const base = String(ophimImgDomain || '').replace(/\/$/, '');
  if (!idStr || !base) return '';
  const folder = kind === 'poster' ? 'posters' : 'thumbs';
  return `${base}/uploads/${folder}/${idStr}.webp`;
}

/**
 * Lấy stem tên file từ URL/path (bỏ .webp/.jpg, hậu tố -thumb/-poster).
 * Dùng khi ô URL chỉ nhập mã file — với CDN hiện tại stem thường là id phim.
 */
export function extractImageFileStem(
  raw: string,
  opts: { r2Origin: string; ophimOrigin: string }
): string {
  const u = String(raw || '').trim();
  if (!u) return '';
  const r2 = String(opts.r2Origin || '').replace(/\/$/, '');
  const ophim = String(opts.ophimOrigin || '').replace(/\/$/, '');
  /** Mặc định: chuỗi thuần (vd. id phim) giữ nguyên làm stem */
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
