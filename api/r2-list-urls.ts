import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const MAX_KEYS_DEFAULT = 200_000;

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

function normalizeFolderToPrefix(folder: string): string {
  const s = String(folder || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\//, '');
  if (!s) return '';
  return s.endsWith('/') ? s : `${s}/`;
}

async function listKeysUnderPrefix(
  client: S3Client,
  bucket: string,
  prefix: string,
  cap: number
): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  while (true) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );
    for (const it of res.Contents || []) {
      const k = it && it.Key ? String(it.Key) : '';
      if (!k || k.endsWith('/')) continue;
      keys.push(k);
      if (cap > 0 && keys.length >= cap) return keys;
    }
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
    if (!token) break;
  }
  return keys;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket) {
    res.status(500).json({
      ok: false,
      error: 'R2 chưa cấu hình (thiếu R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME).',
    });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const foldersRaw = Array.isArray((body as any).prefixes)
    ? (body as any).prefixes
    : (body as any).prefix != null && String((body as any).prefix).trim()
      ? [(body as any).prefix]
      : [];

  const folders = Array.from(
    new Set(
      foldersRaw
        .map((x: unknown) => String(x || '').trim())
        .filter(Boolean)
        .map((x) => x.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, ''))
        .filter(Boolean)
    )
  );

  if (!folders.length) {
    res.status(400).json({ ok: false, error: 'Cần ít nhất một prefix (thư mục) trong «prefixes».' });
    return;
  }

  const publicBaseRaw = String((body as any).public_base || process.env.R2_PUBLIC_URL || '').trim();
  const publicBase = publicBaseRaw.replace(/\/$/, '');
  if (!publicBase) {
    res.status(400).json({
      ok: false,
      error: 'Thiếu public_base hoặc biến môi trường R2_PUBLIC_URL để dựng URL.',
    });
    return;
  }

  const limitRaw = Number((body as any).limit);
  const maxEnv = Math.max(0, Number(process.env.R2_LIST_MAX_KEYS || '') || 0);
  const defaultCap = MAX_KEYS_DEFAULT;
  const cap = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : maxEnv > 0 ? maxEnv : defaultCap;

  try {
    const allKeys: string[] = [];
    const seen = new Set<string>();

    for (const folder of folders) {
      const prefix = normalizeFolderToPrefix(folder);
      if (!prefix) continue;
      const keys = await listKeysUnderPrefix(client, bucket, prefix, cap - allKeys.length);
      for (const k of keys) {
        if (seen.has(k)) continue;
        seen.add(k);
        allKeys.push(k);
        if (allKeys.length >= cap) break;
      }
      if (allKeys.length >= cap) break;
    }

    allKeys.sort((a, b) => a.localeCompare(b));
    const urls = allKeys.map((k) => `${publicBase}/${k.replace(/^\//, '')}`);

    res.status(200).json({
      ok: true,
      count: urls.length,
      capped: allKeys.length >= cap,
      cap,
      urls,
    });
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      error: e && e.message ? String(e.message) : 'ListObjects R2 thất bại.',
    });
  }
}
