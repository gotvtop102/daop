/**
 * Vercel Serverless: upload ảnh lên R2 (Banner, Slider...).
 * POST body JSON: { image: base64String, contentType?: "image/jpeg" | "image/png" | "image/webp" }
 * Trả về: { url: string } hoặc { error: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const MAX_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function sanitizeFilename(name: string) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const n = raw.replace(/\\/g, '/').split('/').pop() || '';
  return n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function sanitizeFolder(folder: string) {
  const raw = String(folder || '').trim();
  if (!raw) return 'uploads';
  const cleaned = raw
    .replace(/\\/g, '/')
    .replace(/\.+/g, '.')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .replace(/\/$/, '');
  const safe = cleaned
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .join('/');
  return safe || 'uploads';
}

async function optimizeImage(buffer: Buffer, contentType: string) {
  if (contentType === 'image/gif') return buffer;
  try {
    const sharp = (await import('sharp')).default;
    const img = sharp(buffer, { failOn: 'none' }).rotate();
    return await img.webp({ quality: 80 }).toBuffer();
  } catch {
    return buffer;
  }
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

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = req.body as { image?: string; contentType?: string; filename?: string; folder?: string };
  const base64 = body?.image;
  if (!base64 || typeof base64 !== 'string') {
    res.status(400).json({ error: 'Thiếu field image (base64)' });
    return;
  }
  let contentType = (body.contentType || 'image/jpeg').toLowerCase();
  if (!ALLOWED_TYPES.includes(contentType)) contentType = 'image/jpeg';
  const ext = contentType === 'image/gif' ? 'gif' : 'webp';
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    res.status(400).json({ error: 'Base64 không hợp lệ' });
    return;
  }
  if (buffer.length > MAX_SIZE) {
    res.status(400).json({ error: 'Ảnh tối đa 4MB' });
    return;
  }

  const folder = sanitizeFolder(body?.folder || 'uploads');
  const rawFilename = sanitizeFilename(body?.filename || `image.${ext}`);
  const filename = ext === 'webp'
    ? (rawFilename.replace(/\.(jpe?g|jpg|png|webp)$/i, '') + '.webp')
    : rawFilename;
  if (!filename) {
    res.status(400).json({ error: 'Thiếu filename hoặc filename không hợp lệ' });
    return;
  }

  const optimized = await optimizeImage(buffer, contentType);
  if (ext === 'webp') contentType = 'image/webp';

  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket) {
    const missing = [];
    if (!process.env.R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID');
    if (!process.env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
    if (!process.env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
    if (!process.env.R2_BUCKET_NAME) missing.push('R2_BUCKET_NAME');
    if (!process.env.R2_PUBLIC_URL) missing.push('R2_PUBLIC_URL');
    const msg = missing.length
      ? `Chưa cấu hình R2. Thiếu biến môi trường: ${missing.join(', ')}. Vui lòng thêm vào Vercel Environment Variables.`
      : 'Chưa cấu hình R2. Vui lòng thêm các biến R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL vào Vercel Environment Variables.';
    res.status(503).json({ error: msg });
    return;
  }
  const key = `${folder}/${filename}`;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: optimized,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Upload R2 thất bại' });
    return;
  }
  const baseUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  const url = baseUrl ? `${baseUrl}/${key}` : '';
  res.status(200).json({ url });
}
