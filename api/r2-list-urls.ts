import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGithubImagesRepoConfig, githubFetchTreeRecursive } from './lib/github-contents.js';

const MAX_KEYS_DEFAULT = 200_000;

function normalizeFolderToPrefix(folder: string): string {
  const s = String(folder || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\//, '');
  if (!s) return '';
  return s.endsWith('/') ? s : `${s}/`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { token, repo, branch } = getGithubImagesRepoConfig();
  if (!token || !repo) {
    res.status(500).json({
      ok: false,
      error: 'Thiếu token/repo ảnh (IMAGES_* hoặc GITHUB_*).',
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
        .filter((s): s is string => s.length > 0)
        .map((x) => x.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, ''))
        .filter((s): s is string => s.length > 0)
    )
  );

  if (!folders.length) {
    res.status(400).json({ ok: false, error: 'Cần ít nhất một prefix (thư mục) trong «prefixes».' });
    return;
  }

  const publicBaseRaw = String((body as any).public_base || process.env.IMAGE_CDN_BASE || process.env.R2_PUBLIC_URL || '').trim();
  const publicBase = publicBaseRaw.replace(/\/$/, '');
  if (!publicBase) {
    res.status(400).json({
      ok: false,
      error: 'Thiếu public_base hoặc biến môi trường IMAGE_CDN_BASE để dựng URL.',
    });
    return;
  }

  const limitRaw = Number((body as any).limit);
  const maxEnv = Math.max(0, Number(process.env.REPO_LIST_MAX_KEYS || process.env.R2_LIST_MAX_KEYS || '') || 0);
  const defaultCap = MAX_KEYS_DEFAULT;
  const cap = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : maxEnv > 0 ? maxEnv : defaultCap;

  try {
    const blobs = await githubFetchTreeRecursive(repo, branch, token);
    const prefixes = folders.map((f) => {
      const p = normalizeFolderToPrefix(f);
      return p.startsWith('public/') ? p : `public/${p}`;
    });

    const allKeys: string[] = [];
    const seen = new Set<string>();

    for (const item of blobs) {
      const p = item.path;
      if (!p || p.endsWith('/')) continue;
      let rel = '';
      for (const prefix of prefixes) {
        if (p.startsWith(prefix) && p.length > prefix.length) {
          rel = p.slice('public/'.length);
          break;
        }
      }
      if (!rel) continue;
      if (seen.has(rel)) continue;
      seen.add(rel);
      allKeys.push(rel);
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
      error: e && e.message ? String(e.message) : 'Liệt kê file repo thất bại.',
    });
  }
}
