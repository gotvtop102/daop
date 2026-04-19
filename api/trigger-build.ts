// Vercel Serverless: gọi GitHub API để trigger workflow build-on-demand
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from './admin-guard.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!(await requireAdmin(req, res))) return;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    res.status(500).json({ error: 'Missing GITHUB_TOKEN or GITHUB_REPO' });
    return;
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${GITHUB_TOKEN.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: 'build-on-demand', client_payload: {} }),
    });
    if (!r.ok) {
      const t = await r.text();
      let errMsg = t;
      if (r.status === 401) {
        try {
          const j = JSON.parse(t);
          if (j.message === 'Bad credentials') {
            errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn. Tạo Personal Access Token (classic) mới tại GitHub → Settings → Developer settings → Personal access tokens, chọn quyền repo (full), rồi cập nhật biến trên Vercel.';
          }
        } catch {
          // keep raw t
        }
      }
      res.status(r.status).json({ error: errMsg });
      return;
    }
    res.status(200).json({ ok: true, message: 'Build triggered' });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Trigger failed' });
  }
}
