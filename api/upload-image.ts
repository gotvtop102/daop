/**
 * Vercel Serverless: upload ảnh vào repo GitHub (Banner, Slider…) — public/<folder>/...
 * POST body JSON: { image: base64String, contentType?, filename?, folder? }
 * Cần: token + repo (IMAGES_* trên Actions; hoặc GITHUB_*), IMAGE_CDN_BASE (base jsDelivr …/public)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ensurePublicFolderInRemoteRepo,
  getGithubImagesRepoConfig,
  githubPutFileBase64,
} from '../lib/github-contents.js';

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

  const { token, repo, branch } = getGithubImagesRepoConfig();
  const cdnBase = String(process.env.IMAGE_CDN_BASE || process.env.R2_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (!token || !repo || !cdnBase) {
    const missing = [];
    const hasTok = !!(process.env.IMAGES_TOKEN || process.env.GITHUB_IMAGES_TOKEN || process.env.GITHUB_TOKEN);
    const hasRepo = !!(process.env.IMAGES_REPO || process.env.GITHUB_IMAGES_REPO || process.env.GITHUB_REPO);
    if (!hasTok) missing.push('IMAGES_TOKEN / GITHUB_IMAGES_TOKEN / GITHUB_TOKEN');
    if (!hasRepo) missing.push('IMAGES_REPO / GITHUB_IMAGES_REPO / GITHUB_REPO');
    if (!cdnBase) missing.push('IMAGE_CDN_BASE');
    res.status(503).json({
      error:
        missing.length > 0
          ? `Chưa cấu hình: ${missing.join(', ')} (Vercel Environment Variables).`
          : 'Chưa cấu hình GitHub + IMAGE_CDN_BASE.',
    });
    return;
  }

  const key = `${folder}/${filename}`;
  const filePath = `public/${key}`;
  try {
    await ensurePublicFolderInRemoteRepo(repo, branch, token);
    await githubPutFileBase64({
      repo,
      path: filePath,
      branch,
      token,
      contentBase64: optimized.toString('base64'),
      message: `chore: upload image ${key}`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Upload GitHub thất bại' });
    return;
  }
  const url = `${cdnBase}/${key}`;
  res.status(200).json({ url });
}
