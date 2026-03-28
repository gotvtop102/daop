import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

export function isR2Configured() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

function normalizeSourceImageUrl(u: string) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (s.startsWith('/uploads/')) return `https://img.ophim.live${s}`;
  if (s.startsWith('//')) return `https:${s}`;
  return s;
}

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const key = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !key || !secret) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  });
}

async function uploadToR2(buffer: Buffer, key: string, contentType = 'image/webp') {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket) return null;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  const base = String(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return base ? `${base}/${key}` : null;
}

async function optimizeToWebp(input: Buffer) {
  return sharp(input)
    .rotate()
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
}

export async function uploadMovieImageById(sourceUrl: string, id: string, folder: 'thumbs' | 'posters') {
  const url = normalizeSourceImageUrl(String(sourceUrl || '').trim());
  const idStr = String(id || '').trim();
  if (!url || !idStr) return '';
  const base = String(process.env.R2_PUBLIC_URL || '').trim();
  if (!base) return '';
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    const optimized = await optimizeToWebp(buf);
    const key = `${folder}/${idStr}.webp`;
    const out = await uploadToR2(optimized, key, 'image/webp');
    return out || '';
  } catch {
    return '';
  }
}

/** Upload ảnh lên R2 và xóa URL khỏi payload. */
export async function applyMovieR2Uploads(movieData: any) {
  const idStr = String(movieData.id || '').trim();
  if (!idStr) return;

  const thumbSrc = String(movieData.thumb_url || movieData.thumb || '').trim();
  const posterSrc = String(movieData.poster_url || movieData.poster || '').trim() || thumbSrc;

  const hasAnyImage = !!(thumbSrc || posterSrc);
  if (hasAnyImage && !isR2Configured()) {
    throw new Error(
      'R2 chưa cấu hình (thiếu R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME/R2_PUBLIC_URL). ' +
        'Không thể lưu vì hệ thống đang chạy chế độ R2-only.'
    );
  }

  const r2Thumb = thumbSrc ? await uploadMovieImageById(thumbSrc, idStr, 'thumbs') : '';
  const r2Poster = posterSrc ? await uploadMovieImageById(posterSrc, idStr, 'posters') : '';

  if (thumbSrc && !r2Thumb) {
    throw new Error('Upload R2 thumb thất bại. Kiểm tra quyền bucket, R2_PUBLIC_URL, và link ảnh nguồn.');
  }
  if (posterSrc && !r2Poster) {
    throw new Error('Upload R2 poster thất bại. Kiểm tra quyền bucket, R2_PUBLIC_URL, và link ảnh nguồn.');
  }

  movieData.thumb_url = '';
  movieData.poster_url = '';
  movieData.thumb = '';
  movieData.poster = '';
}
