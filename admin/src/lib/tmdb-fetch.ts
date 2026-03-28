/**
 * TMDB từ trình duyệt (VITE_*): hỗ trợ nhiều key, khi 429 thử key tiếp theo.
 * Cùng quy ước với scripts/build.js: VITE_TMDB_API_KEYS hoặc VITE_TMDB_API_KEY (có thể nhiều key phân cách phẩy).
 */

function parseRetryAfterMs(res: Response): number {
  const ra = res.headers.get('retry-after');
  if (!ra) return 0;
  const sec = parseInt(ra, 10);
  if (Number.isFinite(sec)) return Math.min(sec * 1000, 120_000);
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseViteTmdbKeys(): string[] {
  const env = import.meta.env as Record<string, string | undefined>;
  const rawList = env.VITE_TMDB_API_KEYS;
  const keys: string[] = [];
  if (rawList != null && String(rawList).trim() !== '') {
    for (const part of String(rawList).split(/[,;\n\r]+/)) {
      const k = part.trim();
      if (k) keys.push(k);
    }
  }
  if (keys.length === 0) {
    const single = env.VITE_TMDB_API_KEY;
    if (single != null && String(single).trim() !== '') {
      const s = String(single).trim();
      if (s.includes(',')) {
        for (const part of s.split(',')) {
          const k = part.trim();
          if (k) keys.push(k);
        }
      } else {
        keys.push(s);
      }
    }
  }
  return keys;
}

/**
 * Fetch TMDB; 429 → key kế; key cuối 429 → chờ Retry-After rồi gọi lại một lần.
 */
export async function fetchWithTmdbKeyRotation(urlForKey: (apiKey: string) => string): Promise<Response> {
  const keys = parseViteTmdbKeys();
  if (!keys.length) throw new Error('No TMDB API keys');

  for (let ki = 0; ki < keys.length; ki++) {
    const url = urlForKey(keys[ki]);
    const res = await fetch(url);
    if (res.ok) return res;

    if (res.status === 429) {
      const waitMs = parseRetryAfterMs(res);
      if (ki < keys.length - 1) {
        console.warn(`TMDB 429 rate limit, chuyển sang key ${ki + 2}/${keys.length}`);
        if (waitMs) await sleep(Math.min(waitMs, 8000));
        continue;
      }
      console.warn('TMDB 429: đã hết key dự phòng, chờ Retry-After...');
      if (waitMs) await sleep(waitMs);
      const res2 = await fetch(url);
      if (res2.ok) return res2;
      return res2;
    }

    if ((res.status === 401 || res.status === 403) && ki < keys.length - 1) {
      console.warn(`TMDB HTTP ${res.status}, thử key tiếp theo`);
      continue;
    }
    return res;
  }

  throw new Error('TMDB fetch failed');
}
