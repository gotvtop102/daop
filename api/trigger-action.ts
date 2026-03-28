// Vercel Serverless: kích hoạt GitHub Actions (repository_dispatch hoặc workflow_dispatch)
import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_REF = process.env.GITHUB_REF || 'main';

type ActionId =
  | 'build-on-demand'
  | 'update-data'
  | 'clean-rebuild'
  | 'purge-movie-data'
  | 'export-to-supabase'
  | 'core-then-tmdb'
  | 'upload-movie-images-r2'
  | 'delete-movie-images-r2'
  | 'download-r2-files'
  | 'upload-r2-from-urls';

const ACTIONS: { id: ActionId; name: string; description: string }[] = [
  { id: 'build-on-demand', name: 'Build on demand', description: 'Build incremental (config Supabase + category pages), commit & push.' },
  { id: 'update-data', name: 'Update data daily', description: 'Full build (OPhim, TMDB, Supabase…), commit & push.' },
  { id: 'clean-rebuild', name: 'Clean & Rebuild', description: 'Xóa toàn bộ dữ liệu cũ (batches, movies-light, actors…) rồi full build lại từ đầu.' },
  { id: 'purge-movie-data', name: 'Purge movie data', description: 'Xóa sạch dữ liệu phim đã build trong public/data (giữ config) để chạy update data lại từ đầu.' },
  {
    id: 'export-to-supabase',
    name: 'Export to Supabase',
    description: 'Đẩy public/data/batches lên bảng movies + movie_episodes.',
  },
  { id: 'upload-movie-images-r2', name: 'Upload movie images to R2', description: 'Tải + nén + upload thumb/poster lên R2, rồi commit upload state.' },
  { id: 'delete-movie-images-r2', name: 'Delete movie images on R2', description: 'Xóa ảnh trên R2 theo prefix/keys/movie_ids. Mặc định dry-run để an toàn.' },
  { id: 'download-r2-files', name: 'Download R2 files', description: 'Tải file từ R2 theo prefix/keys và xuất artifact (zip).' },
  { id: 'upload-r2-from-urls', name: 'Upload R2 from URLs', description: 'Upload ảnh lên R2 theo danh sách URL + movie IDs (đúng chuẩn key folder/<id>.webp).' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, actions: ACTIONS });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    res.status(500).json({ error: 'Missing GITHUB_TOKEN or GITHUB_REPO' });
    return;
  }
  const action = (req.body?.action ?? req.query?.action) as string;
  const allowed = new Set<string>([...ACTIONS.map((a) => a.id), 'core-then-tmdb']);
  if (!action || !allowed.has(action)) {
    res.status(400).json({ error: 'Invalid action. Use one of: ' + Array.from(allowed).join(', ') });
    return;
  }

  const phaseRaw = req.body?.phase ?? req.query?.phase;
  const twoPhaseRaw = req.body?.two_phase ?? req.query?.two_phase;
  const phase = phaseRaw != null ? String(phaseRaw) : '';
  const twoPhase = (twoPhaseRaw === true || twoPhaseRaw === 'true' || phase === '2');
  const uploadImagesRaw = req.body?.upload_images ?? req.query?.upload_images;
  const uploadImages = uploadImagesRaw != null ? String(uploadImagesRaw) : undefined;
  const reuploadExistingRaw = req.body?.reupload_existing ?? req.query?.reupload_existing;
  const reuploadExisting = reuploadExistingRaw != null ? String(reuploadExistingRaw) : undefined;

  const repo = GITHUB_REPO.trim();
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${GITHUB_TOKEN.trim()}`,
    'Content-Type': 'application/json',
  };

  try {
    if (action === 'build-on-demand') {
      const r = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ event_type: 'build-on-demand', client_payload: {} }),
      });
      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 401) {
          try {
            const j = JSON.parse(t);
            if (j.message === 'Bad credentials') {
              errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
            }
          } catch {
            // keep raw t
          }
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }
      res.status(200).json({ ok: true, message: 'Build on demand triggered' });
      return;
    }

    if (action === 'update-data') {
      const startPage = req.body?.start_page != null ? String(req.body.start_page) : undefined;
      const endPage = req.body?.end_page != null ? String(req.body.end_page) : undefined;
      const inputs: Record<string, string> = {};
      if (startPage !== undefined) inputs.start_page = startPage;
      if (endPage !== undefined) inputs.end_page = endPage;
      if (uploadImages !== undefined) inputs.upload_images = uploadImages;
      if (reuploadExisting !== undefined) inputs.reupload_existing = reuploadExisting;

      const url = twoPhase
        ? `https://api.github.com/repos/${repo}/actions/workflows/core-then-tmdb.yml/dispatches`
        : `https://api.github.com/repos/${repo}/actions/workflows/update-data.yml/dispatches`;
      const payload = twoPhase
        ? { ref: GITHUB_REF, inputs: Object.keys(inputs).length ? { ...inputs, clean: 'false' } : { clean: 'false' } }
        : { ref: GITHUB_REF, inputs: Object.keys(inputs).length ? inputs : undefined };

      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 404) {
          try {
            const j = JSON.parse(t);
            if (j.message?.includes('Not Found')) {
              errMsg = 'Workflow update-data.yml không tìm thấy hoặc repo chưa có Actions.';
            }
          } catch {
            // keep raw t
          }
        }
        if (r.status === 401) {
          try {
            const j = JSON.parse(t);
            if (j.message === 'Bad credentials') errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
          } catch {
            // keep raw t
          }
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }
      res.status(200).json({ ok: true, message: twoPhase ? 'Update data triggered (2-phase)' : 'Update data (full build) triggered' });
      return;
    }

    if (action === 'core-then-tmdb') {
      const startPage = req.body?.start_page != null ? String(req.body.start_page) : undefined;
      const endPage = req.body?.end_page != null ? String(req.body.end_page) : undefined;
      const clean = req.body?.clean != null ? String(req.body.clean) : undefined;
      const inputs: Record<string, string> = {};
      if (startPage !== undefined) inputs.start_page = startPage;
      if (endPage !== undefined) inputs.end_page = endPage;
      if (clean !== undefined) inputs.clean = clean;
      if (uploadImages !== undefined) inputs.upload_images = uploadImages;
      if (reuploadExisting !== undefined) inputs.reupload_existing = reuploadExisting;
      const r = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/core-then-tmdb.yml/dispatches`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ref: GITHUB_REF, inputs: Object.keys(inputs).length ? inputs : undefined }),
        }
      );
      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 404) {
          try {
            const j = JSON.parse(t);
            if (j.message?.includes('Not Found')) {
              errMsg = 'Workflow core-then-tmdb.yml không tìm thấy hoặc repo chưa có Actions.';
            }
          } catch {
            // keep raw t
          }
        }
        if (r.status === 401) {
          try {
            const j = JSON.parse(t);
            if (j.message === 'Bad credentials') errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
          } catch {
            // keep raw t
          }
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }
      res.status(200).json({ ok: true, message: 'Core then TMDB (2-phase deploy) triggered' });
      return;
    }

    if (action === 'clean-rebuild') {
      const startPage = req.body?.start_page != null ? String(req.body.start_page) : undefined;
      const endPage = req.body?.end_page != null ? String(req.body.end_page) : undefined;
      const inputs: Record<string, string> = { clean: 'true' };
      if (startPage !== undefined) inputs.start_page = startPage;
      if (endPage !== undefined) inputs.end_page = endPage;
      if (uploadImages !== undefined) inputs.upload_images = uploadImages;
      if (reuploadExisting !== undefined) inputs.reupload_existing = reuploadExisting;

      const url = twoPhase
        ? `https://api.github.com/repos/${repo}/actions/workflows/core-then-tmdb.yml/dispatches`
        : `https://api.github.com/repos/${repo}/actions/workflows/update-data.yml/dispatches`;
      const payload = twoPhase
        ? { ref: GITHUB_REF, inputs: inputs }
        : { ref: GITHUB_REF, inputs: inputs };

      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 404) {
          try {
            const j = JSON.parse(t);
            if (j.message?.includes('Not Found')) {
              errMsg = 'Workflow update-data.yml không tìm thấy hoặc repo chưa có Actions.';
            }
          } catch {
            // keep raw t
          }
        }
        if (r.status === 401) {
          try {
            const j = JSON.parse(t);
            if (j.message === 'Bad credentials') errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
          } catch {
            // keep raw t
          }
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }
      res.status(200).json({ ok: true, message: twoPhase ? 'Clean & Rebuild triggered (2-phase)' : 'Clean & Rebuild triggered (xóa dữ liệu cũ + full build)' });
      return;
    }

    if (action === 'purge-movie-data') {
      const r = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/purge-movie-data.yml/dispatches`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ref: GITHUB_REF }),
        }
      );
      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 404) {
          errMsg = 'Workflow purge-movie-data.yml không tìm thấy.';
        }
        if (r.status === 401) {
          try {
            const j = JSON.parse(t);
            if (j.message === 'Bad credentials') errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
          } catch {}
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }
      res.status(200).json({ ok: true, message: 'Purge movie data triggered (xóa sạch public/data movie output)' });
      return;
    }

    if (action === 'export-to-supabase') {
      const r = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ event_type: 'export-to-supabase', client_payload: {} }),
      });
      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 401) {
          try {
            const j = JSON.parse(t);
            if (j.message === 'Bad credentials') errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
          } catch {
            // keep raw t
          }
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }
      res.status(200).json({ ok: true, message: 'Export to Supabase triggered' });
      return;
    }

    if (action === 'upload-movie-images-r2') {
      const inputs: Record<string, string> = {};
      const pick = (k: string) => (req.body?.[k] ?? req.query?.[k]);

      const keys = [
        'mode',
        'quality',
        'thumb_quality',
        'poster_quality',
        'thumb_width',
        'thumb_height',
        'poster_width',
        'poster_height',
        'limit',
        'concurrency',
        'force_slugs',
        'reupload_existing',
      ];

      for (const k of keys) {
        const v = pick(k);
        if (v != null && String(v).trim() !== '') inputs[k] = String(v);
      }

      const r = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/upload-movie-images-r2.yml/dispatches`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ref: GITHUB_REF, inputs: Object.keys(inputs).length ? inputs : undefined }),
        }
      );

      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 404) {
          errMsg = 'Workflow upload-movie-images-r2.yml không tìm thấy hoặc repo chưa có Actions.';
        }
        if (r.status === 401) {
          errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }

      res.status(200).json({ ok: true, message: 'Upload movie images to R2 triggered' });
      return;
    }

    if (action === 'delete-movie-images-r2') {
      const inputs: Record<string, string> = {};
      const pick = (k: string) => (req.body?.[k] ?? req.query?.[k]);

      const keys = [
        'mode',
        'prefix',
        'keys',
        'movie_ids',
        'kind',
        'dry_run',
        'limit',
      ];

      for (const k of keys) {
        const v = pick(k);
        if (v != null && String(v).trim() !== '') inputs[k] = String(v);
      }

      const r = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/delete-movie-images-r2.yml/dispatches`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ref: GITHUB_REF, inputs: Object.keys(inputs).length ? inputs : undefined }),
        }
      );

      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 404) {
          errMsg = 'Workflow delete-movie-images-r2.yml không tìm thấy hoặc repo chưa có Actions.';
        }
        if (r.status === 401) {
          errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }

      res.status(200).json({ ok: true, message: 'Delete movie images on R2 triggered' });
      return;
    }

    if (action === 'download-r2-files') {
      const inputs: Record<string, string> = {};
      const pick = (k: string) => (req.body?.[k] ?? req.query?.[k]);

      const keys = ['mode', 'prefix', 'keys', 'limit', 'concurrency'];
      for (const k of keys) {
        const v = pick(k);
        if (v != null && String(v).trim() !== '') inputs[k] = String(v);
      }

      const r = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/download-r2-files.yml/dispatches`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ref: GITHUB_REF, inputs: Object.keys(inputs).length ? inputs : undefined }),
        }
      );

      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 404) {
          errMsg = 'Workflow download-r2-files.yml không tìm thấy hoặc repo chưa có Actions.';
        }
        if (r.status === 401) {
          errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }

      res.status(200).json({ ok: true, message: 'Download R2 files triggered' });
      return;
    }

    if (action === 'upload-r2-from-urls') {
      const inputs: Record<string, string> = {};
      const pick = (k: string) => (req.body?.[k] ?? req.query?.[k]);

      const keys = ['folder', 'pairs', 'ids', 'urls', 'quality', 'width', 'height', 'limit', 'concurrency'];
      for (const k of keys) {
        const v = pick(k);
        if (v != null && String(v).trim() !== '') inputs[k] = String(v);
      }

      const r = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/upload-r2-from-urls.yml/dispatches`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ref: GITHUB_REF, inputs: Object.keys(inputs).length ? inputs : undefined }),
        }
      );

      if (!r.ok) {
        const t = await r.text();
        let errMsg = t;
        if (r.status === 404) {
          errMsg = 'Workflow upload-r2-from-urls.yml không tìm thấy hoặc repo chưa có Actions.';
        }
        if (r.status === 401) {
          errMsg = 'GITHUB_TOKEN không hợp lệ hoặc hết hạn.';
        }
        res.status(r.status).json({ error: errMsg });
        return;
      }

      res.status(200).json({ ok: true, message: 'Upload R2 from URLs triggered' });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Trigger failed' });
  }
}
