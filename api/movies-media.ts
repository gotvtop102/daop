import {
  ensurePublicFolderInRemoteRepo,
  getGithubImagesRepoConfig,
  githubGetFileSha,
  githubPutFileBase64,
} from './lib/github-contents.js';

/** Lazy-load sharp (native) — import tĩnh hay gây FUNCTION_INVOCATION_FAILED trên Vercel. */
async function getSharp() {
  const m = await import('sharp');
  return m.default;
}

export function isRepoImageCdnConfigured() {
  const base = String(process.env.IMAGE_CDN_BASE || process.env.R2_PUBLIC_URL || '').trim();
  const { token, repo } = getGithubImagesRepoConfig();
  return !!(token && repo && base);
}

function normalizeSourceImageUrl(u: string) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (s.startsWith('/uploads/')) return `https://img.ophim.live${s}`;
  if (s.startsWith('//')) return `https:${s}`;
  return s;
}

async function optimizeToWebp(input: Buffer) {
  const sharp = await getSharp();
  return sharp(input)
    .rotate()
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
}

export async function uploadMovieImageById(sourceUrl: string, id: string, folder: 'thumbs' | 'posters') {
  const url = normalizeSourceImageUrl(String(sourceUrl || '').trim());
  const idStr = String(id || '').trim();
  if (!url || !idStr) return '';
  const base = String(process.env.IMAGE_CDN_BASE || process.env.R2_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (!base) return '';
  const key = `${folder}/${idStr}.webp`;
  const filePath = `public/${key}`;
  const { token, repo, branch } = getGithubImagesRepoConfig();
  if (!token || !repo) return '';

  if (await githubGetFileSha(repo, filePath, branch, token)) {
    return `${base}/${key}`;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    const optimized = await optimizeToWebp(buf);
    await githubPutFileBase64({
      repo,
      path: filePath,
      branch,
      token,
      contentBase64: optimized.toString('base64'),
      message: `chore: upload movie image ${folder}/${idStr}.webp`,
    });
    return `${base}/${key}`;
  } catch {
    return '';
  }
}

/** Upload ảnh lên repo (GitHub) và xóa URL khỏi payload — URL hiển thị lấy từ site_settings.r2_img_domain (base CDN /public). */
export async function applyMovieRepoImageUploads(movieData: any) {
  const idStr = String(movieData.id || '').trim();
  if (!idStr) return;

  const thumbSrc = String(movieData.thumb_url || movieData.thumb || '').trim();
  const posterSrc = String(movieData.poster_url || movieData.poster || '').trim() || thumbSrc;

  const hasAnyImage = !!(thumbSrc || posterSrc);
  if (hasAnyImage && !isRepoImageCdnConfigured()) {
    throw new Error(
      'Chưa cấu hình đủ token/repo ảnh (IMAGES_TOKEN+IMAGES_REPO hoặc GITHUB_TOKEN+GITHUB_REPO), nhánh tuỳ chọn, IMAGE_CDN_BASE (jsDelivr …/public).'
    );
  }

  const r2Thumb = thumbSrc ? await uploadMovieImageById(thumbSrc, idStr, 'thumbs') : '';
  const r2Poster = posterSrc ? await uploadMovieImageById(posterSrc, idStr, 'posters') : '';

  if (thumbSrc && !r2Thumb) {
    throw new Error('Upload thumb thất bại. Kiểm tra quyền token, IMAGE_CDN_BASE, và link ảnh nguồn.');
  }
  if (posterSrc && !r2Poster) {
    throw new Error('Upload poster thất bại. Kiểm tra quyền token, IMAGE_CDN_BASE, và link ảnh nguồn.');
  }

  movieData.thumb_url = '';
  movieData.poster_url = '';
  movieData.thumb = '';
  movieData.poster = '';
}

/** @deprecated dùng applyMovieRepoImageUploads */
export async function applyMovieR2Uploads(movieData: any) {
  return applyMovieRepoImageUploads(movieData);
}
