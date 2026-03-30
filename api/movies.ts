import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  authInfoSb,
  getDashboardStatsCountsSb,
  getDashboardVersionSb,
  countRowsSb,
  deleteAllMoviesSb,
  deleteMovieSb,
  deleteMoviesByIdsSb,
  exportFullMovieTablesSb,
  getEpisodesSb,
  getMovieBySlugSb,
  getMovieSb,
  isSupabaseMoviesConfigured,
  listMoviesSb,
  saveEpisodesSb,
  updateShowtimesExclusiveSb,
  updateShowtimesSb,
} from './movies-supabase.js';

type DashboardStatsCache = {
  version: string;
  stats: Record<string, number>;
  ts: number;
};

let dashboardStatsCache: DashboardStatsCache | null = null;
let dashboardVersionCacheTs = 0;
let dashboardVersionCacheValue: string = '';

const DASHBOARD_VERSION_CACHE_TTL_MS = 25_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isSupabaseMoviesConfigured()) {
    return res.status(500).json({
      error:
        'Chưa cấu hình Supabase cho API phim: SUPABASE_ADMIN_SERVICE_ROLE_KEY và URL (SUPABASE_ADMIN_URL hoặc VITE_SUPABASE_ADMIN_URL).',
    });
  }

  try {
    const action = String((req.query as any)?.action || (req.body as any)?.action || '').trim();

    if (action === 'authInfo') {
      return res.status(200).json(authInfoSb());
    }

    switch (action) {
      case 'get': {
        const id = (req.query as any)?.id || (req.body as any)?.id;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        const movie = await getMovieSb(String(id));
        if (!movie) return res.status(404).json({ error: 'Movie not found' });
        return res.status(200).json(movie);
      }

      case 'countRows': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const rawTableNames = (req.body as any)?.tables ?? (req.body as any)?.sheets ?? (req.body as any)?.tabs;
        const tableNames = (Array.isArray(rawTableNames) ? rawTableNames : ['movies', 'episodes'])
          .map((x: any) => String(x || '').trim())
          .filter(Boolean);
        const out = await countRowsSb(tableNames);
        return res.status(200).json(out);
      }

      case 'dashboardStats': {
        // Cache theo "version" để giảm số query count exact khi DB chưa có thay đổi.
        // Version lấy từ max(updated_at) của movies và homepage_sections.
        const now = Date.now();
        try {
          if (now - dashboardVersionCacheTs < DASHBOARD_VERSION_CACHE_TTL_MS && dashboardVersionCacheValue) {
            if (dashboardStatsCache && dashboardStatsCache.version === dashboardVersionCacheValue) {
              return res.status(200).json({
                ok: true,
                changed: false,
                version: dashboardVersionCacheValue,
                stats: dashboardStatsCache.stats,
              });
            }
          }
        } catch {
          /* ignore cache read errors */
        }

        const version = await getDashboardVersionSb();
        dashboardVersionCacheTs = now;
        dashboardVersionCacheValue = version;

        if (dashboardStatsCache && dashboardStatsCache.version === version) {
          return res.status(200).json({
            ok: true,
            changed: false,
            version,
            stats: dashboardStatsCache.stats,
          });
        }

        const stats = await getDashboardStatsCountsSb();
        dashboardStatsCache = { version, stats, ts: now };

        return res.status(200).json({
          ok: true,
          changed: true,
          version,
          stats,
        });
      }

      case 'exportFull': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const raw = (req.body as any)?.tables;
        const list = Array.isArray(raw)
          ? raw.map((x: any) => String(x || '').trim()).filter(Boolean)
          : ['movies', 'movie_episodes'];
        const allowed = list.filter((t) => t === 'movies' || t === 'movie_episodes');
        if (!allowed.length) {
          return res.status(400).json({ error: 'tables phải gồm movies và/hoặc movie_episodes' });
        }
        const data = await exportFullMovieTablesSb(allowed);
        return res.status(200).json({ ok: true, data });
      }

      case 'deleteRows': {
        return res.status(400).json({
          error: 'deleteRows không còn hỗ trợ. Dùng action deleteIds hoặc deleteAll (tab Supabase phim trên GitHub Actions).',
        });
      }

      case 'deleteIds': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const rawIds = (req.body as any)?.ids;
        const ids = Array.isArray(rawIds) ? rawIds : [];
        const out = await deleteMoviesByIdsSb(ids);
        return res.status(200).json({ ok: true, ...out });
      }

      case 'deleteAll': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const phrase = String((req.body as any)?.confirmPhrase || '').trim();
        if (phrase !== 'XOA HET PHIM SUPABASE') {
          return res.status(400).json({ error: 'Cụm xác nhận không đúng (XOA HET PHIM SUPABASE).' });
        }
        await deleteAllMoviesSb();
        return res.status(200).json({ ok: true, message: 'Đã xóa toàn bộ phim; tập (movie_episodes) đã CASCADE.' });
      }

      case 'list': {
        const { type, page = '1', limit = '50', search = '', unbuilt, duplicates } = req.query;
        const unbuiltOnly = String(unbuilt || '').trim() === '1' || String(unbuilt || '').trim().toLowerCase() === 'true';
        const duplicatesOnly =
          String(duplicates || '').trim() === '1' || String(duplicates || '').trim().toLowerCase() === 'true';
        const result = await listMoviesSb(
          String(type || 'all'),
          Number(page) || 1,
          Number(limit) || 50,
          String(search || ''),
          unbuiltOnly,
          duplicatesOnly
        );
        return res.status(200).json(result);
      }

      case 'getBySlug': {
        const slug = (req.query as any)?.slug || (req.body as any)?.slug;
        if (!slug) return res.status(400).json({ error: 'Missing slug' });
        const movie = await getMovieBySlugSb(slug as string);
        return res.status(200).json(movie);
      }

      case 'save': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const { saveMovieSb } = await import('./movies-supabase-save.js');
        const result = await saveMovieSb(req.body || {});
        return res.status(200).json(result);
      }

      case 'delete': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const id = (req.query as any)?.id || (req.body as any)?.id;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        const result = await deleteMovieSb(String(id));
        return res.status(200).json(result);
      }

      case 'updateShowtimes': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const id = (req.query as any)?.id || (req.body as any)?.id;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        const result = await updateShowtimesSb(String(id), req.body || {});
        return res.status(200).json(result);
      }

      case 'updateShowtimesExclusive': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const id = (req.query as any)?.id || (req.body as any)?.id;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        const result = await updateShowtimesExclusiveSb(String(id), req.body || {});
        return res.status(200).json(result);
      }

      case 'episodes': {
        const movieId = (req.query as any)?.movie_id || (req.body as any)?.movie_id;
        if (!movieId) return res.status(400).json({ error: 'Missing movie_id' });
        const episodesPayload = (req.body as any)?.episodes;
        const debug = !!(req.body as any)?.debug;

        if (Array.isArray(episodesPayload)) {
          if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
          }
          const result = await saveEpisodesSb(String(movieId), episodesPayload);
          return res.status(200).json(result);
        }

        const result = await getEpisodesSb(String(movieId), debug);
        return res.status(200).json(result);
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    console.error('API movies error:', e?.message || e);
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}
