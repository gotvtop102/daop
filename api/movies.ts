import { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SHEETS_JSON;

function normalizeHeader(h: any) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function countNonEmptyDataRows(values: any[][]) {
  const rows = Array.isArray(values) ? values : [];
  if (rows.length < 2) {
    return { headerRows: Math.min(rows.length, 1), lastRow: rows.length, nonEmptyDataRows: 0 };
  }

  const dataRows = rows.slice(1);
  const nonEmptyDataRows = dataRows.reduce((acc: number, row: any[]) => {
    const r = Array.isArray(row) ? row : [];
    const hasData = r.some((cell) => String(cell ?? '').trim() !== '');
    return acc + (hasData ? 1 : 0);
  }, 0);

  // values.get usually returns up to the last non-empty row, but we still report it for clarity
  return { headerRows: 1, lastRow: rows.length, nonEmptyDataRows };
}

async function getSheetIdByTitle(sheets: any, spreadsheetId: string, title: string): Promise<number> {
  const t = String(title || '').trim().toLowerCase();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const found = (meta.data.sheets || []).find((s: any) => String(s?.properties?.title || '').trim().toLowerCase() === t);
  const sheetId = found?.properties?.sheetId;
  if (typeof sheetId !== 'number') {
    throw new Error(`Sheet tab not found: ${title}`);
  }
  return sheetId;
}

async function deleteRows(sheets: any, spreadsheetId: string, sheetTitle: string, startRow: number, endRow: number) {
  // Google Sheets API uses 0-based indices, endIndex is exclusive.
  // Row 1 = header => index 0. We only allow deleting from row 2 (index 1).
  const safeStartRow = Math.max(2, Math.floor(startRow));
  const safeEndRow = Math.max(safeStartRow, Math.floor(endRow));

  const sheetId = await getSheetIdByTitle(sheets, spreadsheetId, sheetTitle);
  const startIndex = safeStartRow - 1;
  const endIndex = safeEndRow;
  const deletedCount = endIndex - startIndex;

  if (deletedCount <= 0) {
    return { success: true, deleted: 0 };
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex,
              endIndex,
            },
          },
        },
      ],
    },
  });

  return {
    success: true,
    sheet: sheetTitle,
    startRow: safeStartRow,
    endRow: safeEndRow,
    deleted: deletedCount,
  };
}

async function loadServiceAccountCredentials(serviceAccountKey?: string) {
  // Ưu tiên key từ parameter (query/body), sau đó fallback về env
  const key = serviceAccountKey || SERVICE_ACCOUNT_KEY;
  
  if (!key) {
    throw new Error('Service account not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SHEETS_JSON');
  }

  let raw = String(key).trim();
  // Some env UIs store JSON as a quoted string (stringified), e.g. "{...}".
  // Try to unwrap once so downstream logic can parse JSON/base64/path correctly.
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    try {
      const unwrapped = JSON.parse(raw);
      if (typeof unwrapped === 'string' && unwrapped.trim()) {
        raw = unwrapped.trim();
      }
    } catch {
      // ignore
    }
  }

  const tryParseJson = (text: string) => {
    const t = String(text || '').trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      // Some env setups store JSON with escaped quotes: {\"type\":...}
      try {
        return JSON.parse(t.replace(/\\"/g, '"'));
      } catch {
        return null;
      }
    }
  };

  const normalizeCreds = (creds: any) => {
    if (creds && typeof creds.private_key === 'string') {
      let pk = String(creds.private_key);
      // Some env providers double-escape newlines, producing "\\n" or even "\\\\n".
      pk = pk.replace(/^"|"$/g, '');
      pk = pk.replace(/\\r\\n/g, '\n');
      pk = pk.replace(/\\n/g, '\n');
      pk = pk.replace(/\r\n/g, '\n');
      pk = pk.replace(/\n/g, '\n');
      pk = pk.trim();

      // Ensure key markers are on their own lines.
      pk = pk.replace(/-----BEGIN PRIVATE KEY-----\s*/g, '-----BEGIN PRIVATE KEY-----\n');
      pk = pk.replace(/\s*-----END PRIVATE KEY-----/g, '\n-----END PRIVATE KEY-----');

      creds.private_key = pk;
    }

    if (!creds || typeof creds !== 'object') {
      throw new Error('Invalid service account credentials: not an object');
    }
    if (!creds.type || String(creds.type) !== 'service_account') {
      throw new Error('Invalid service account credentials: type must be "service_account"');
    }
    if (!creds.client_email) {
      throw new Error('Invalid service account credentials: missing client_email');
    }
    if (!creds.private_key || typeof creds.private_key !== 'string') {
      throw new Error('Invalid service account credentials: missing private_key');
    }
    const pk2 = String(creds.private_key);
    if (!pk2.includes('BEGIN PRIVATE KEY') || !pk2.includes('END PRIVATE KEY')) {
      throw new Error('Invalid service account credentials: private_key is malformed (missing BEGIN PRIVATE KEY)');
    }
    if (pk2.includes('\\n')) {
      throw new Error('Invalid service account credentials: private_key still contains escaped newlines (\\n). Use JSON/base64 JSON with proper escaping.');
    }
    return creds;
  };

  if (raw.startsWith('{')) {
    const parsed = tryParseJson(raw);
    if (parsed) return normalizeCreds(parsed);
  }

  // Support base64-encoded JSON (useful for env vars)
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) {
      const parsed = tryParseJson(decoded);
      if (parsed) return normalizeCreds(parsed);
    }
  } catch {
    // ignore
  }

  // Treat as a file path (local only). On Windows, '/file.json' is often intended to be project-root-relative.
  const candidates: string[] = [];
  const cwd = process.cwd();
  candidates.push(path.isAbsolute(raw) ? raw : path.join(cwd, raw));
  if (raw.startsWith('/')) {
    candidates.push(path.join(cwd, raw.slice(1)));
  }

  let lastErr: any = null;
  for (const p of candidates) {
    try {
      const file = await fs.readFile(p, 'utf8');
      return normalizeCreds(JSON.parse(file));
    } catch (e: any) {
      lastErr = e;
    }
  }

  throw new Error(
    `Invalid GOOGLE_SERVICE_ACCOUNT_KEY. Provide JSON, base64 JSON, or a valid file path. Last error: ${lastErr?.message || lastErr}`
  );
}

// Initialize Google Sheets API
const getSheetsClient = async (serviceAccountKey?: string) => {
  const credentials = await loadServiceAccountCredentials(serviceAccountKey);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
};

// Movie type mapping
const MOVIE_TYPES = {
  single: 'Phim lẻ',
  series: 'Phim bộ',
  hoathinh: 'Hoạt hình',
  tvshows: 'TV Show',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Spreadsheet-Id, X-Service-Account-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Lấy spreadsheetId và serviceAccountKey từ headers / query params / body, fallback về env
  const spreadsheetId = String(
    (req.headers['x-spreadsheet-id'] as string) ||
      req.query.spreadsheetId ||
      req.body?.spreadsheetId ||
      DEFAULT_SPREADSHEET_ID ||
      ''
  ).trim();

  const envServiceAccountKey = String(SERVICE_ACCOUNT_KEY || '').trim();
  const requestServiceAccountKey = String(
    (req.headers['x-service-account-key'] as string) ||
      req.query.serviceAccountKey ||
      req.body?.serviceAccountKey ||
      ''
  ).trim();

  // On Vercel/prod, prefer server-side env credentials to avoid conflicts and key leakage.
  // Only allow request-supplied credentials if env is not configured (useful for local/dev).
  const isVercel = String(process.env.VERCEL || '').trim() !== '';
  const serviceAccountKey = (isVercel && envServiceAccountKey) ? envServiceAccountKey : (requestServiceAccountKey || envServiceAccountKey);

  if (!spreadsheetId) {
    return res.status(500).json({ error: 'Google Sheets ID not configured' });
  }

  try {
    const action = String((req.query as any)?.action || (req.body as any)?.action || '').trim();

    // Diagnostic action: validate/inspect credentials without calling Google APIs.
    if (action === 'authInfo') {
      const creds = await loadServiceAccountCredentials(serviceAccountKey);
      const pk = String((creds as any)?.private_key || '');
      const fingerprint = crypto.createHash('sha256').update(pk, 'utf8').digest('hex');
      return res.status(200).json({
        ok: true,
        source: serviceAccountKey ? 'request_or_env' : 'missing',
        type: String((creds as any)?.type || ''),
        client_email: String((creds as any)?.client_email || ''),
        project_id: String((creds as any)?.project_id || ''),
        private_key_id: String((creds as any)?.private_key_id || ''),
        private_key_length: pk.length,
        private_key_fingerprint_sha256: fingerprint,
      });
    }

    const sheets = await getSheetsClient(serviceAccountKey);

    switch (action) {
      case 'countRows': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const rawSheetNames = (req.body as any)?.sheets ?? (req.body as any)?.tabs;
        const sheetNames = (Array.isArray(rawSheetNames) ? rawSheetNames : ['movies', 'episodes'])
          .map((x: any) => String(x || '').trim())
          .filter(Boolean);

        const results = [] as any[];
        for (const sheetName of sheetNames) {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:Z`,
          });
          const values = (response.data.values || []) as any[][];
          const stats = countNonEmptyDataRows(values);
          results.push({
            sheet: sheetName,
            headerRows: stats.headerRows,
            lastRow: stats.lastRow,
            nonEmptyDataRows: stats.nonEmptyDataRows,
          });
        }

        return res.status(200).json({ success: true, sheets: results });
      }

      case 'list': {
        const { type, page = '1', limit = '50', search = '', unbuilt, copyOnly, duplicates } = req.query;
        const unbuiltOnly = String(unbuilt || '').trim() === '1' || String(unbuilt || '').trim().toLowerCase() === 'true';
        const onlyCopies = String(copyOnly || '').trim() === '1' || String(copyOnly || '').trim().toLowerCase() === 'true';
        const duplicatesOnly =
          String(duplicates || '').trim() === '1' || String(duplicates || '').trim().toLowerCase() === 'true';
        const result = await listMovies(
          sheets,
          spreadsheetId,
          type as string,
          parseInt(page as string),
          parseInt(limit as string),
          search as string,
          unbuiltOnly,
          onlyCopies,
          duplicatesOnly
        );
        return res.status(200).json(result);
      }

      case 'getBySlug': {
        const slug = (req.query as any)?.slug || (req.body as any)?.slug;
        if (!slug) return res.status(400).json({ error: 'Missing slug' });
        const movie = await getMovieBySlug(sheets, spreadsheetId, slug as string);
        return res.status(200).json(movie);
      }

      case 'normalizeCopy': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const copyId = (req.body as any)?.copyId || (req.body as any)?.id;
        const deleteCopy = Boolean((req.body as any)?.deleteCopy);
        if (!copyId) return res.status(400).json({ error: 'Missing copyId' });
        const result = await normalizeCopyToOriginal(sheets, spreadsheetId, String(copyId), { deleteCopy });
        return res.status(200).json(result);
      }

      case 'get': {
        const id = (req.query as any)?.id || (req.body as any)?.id;
        if (!id) return res.status(400).json({ error: 'Missing movie ID' });
        const movie = await getMovie(sheets, spreadsheetId, id as string);
        return res.status(200).json(movie);
      }

      case 'save': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const result = await saveMovie(sheets, spreadsheetId, req.body);
        return res.status(200).json(result);
      }

      case 'delete': {
        if (req.method !== 'DELETE') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Missing movie ID' });
        const result = await deleteMovie(sheets, spreadsheetId, id as string);
        return res.status(200).json(result);
      }

      case 'episodes': {
        const movie_id = (req.query as any)?.movie_id || (req.body as any)?.movie_id;
        if (!movie_id) return res.status(400).json({ error: 'Missing movie_id' });
        const debug =
          String((req.query as any)?.debug ?? (req.body as any)?.debug ?? '').trim() === '1' ||
          String((req.query as any)?.debug ?? (req.body as any)?.debug ?? '').trim().toLowerCase() === 'true';

        if (req.method === 'GET') {
          const episodes = await getEpisodes(sheets, spreadsheetId, movie_id as string, debug);
          return res.status(200).json(episodes);
        }

        if (req.method === 'POST') {
          // Support 2 modes:
          // - Read mode: POST with no episodes => return episodes (useful when client wants to send credentials via body)
          // - Write mode: POST with episodes => save
          const body = req.body as any;
          const rawEpisodes = Array.isArray(body) ? body : body?.episodes;
          if (!rawEpisodes) {
            const episodes = await getEpisodes(sheets, spreadsheetId, movie_id as string, debug);
            return res.status(200).json(episodes);
          }
          const episodes = Array.isArray(rawEpisodes) ? rawEpisodes : [];
          const result = await saveEpisodes(sheets, spreadsheetId, movie_id as string, episodes);
          return res.status(200).json(result);
        }

        return res.status(405).json({ error: 'Method not allowed' });
      }

      case 'deleteRows': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const sheet = String(req.body?.sheet || req.query.sheet || 'movies').trim();
        const startRow = Number(req.body?.startRow ?? req.query.startRow);
        const endRow = Number(req.body?.endRow ?? req.query.endRow);
        if (!sheet) return res.status(400).json({ error: 'Missing sheet' });
        if (!Number.isFinite(startRow) || startRow < 2) {
          return res.status(400).json({ error: 'startRow must be a number >= 2 (row 1 is header)' });
        }
        if (!Number.isFinite(endRow) || endRow < startRow) {
          return res.status(400).json({ error: 'endRow must be a number >= startRow' });
        }

        const result = await deleteRows(sheets, spreadsheetId, sheet, startRow, endRow);
        return res.status(200).json(result);
      }

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error: any) {
    console.error('Movies API Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: error.stack,
    });
  }
}

// List movies from Google Sheets
async function listMovies(
  sheets: any,
  spreadsheetId: string,
  type?: string,
  page: number = 1,
  limit: number = 50,
  search: string = '',
  unbuiltOnly: boolean = false,
  copyOnly: boolean = false,
  duplicatesOnly: boolean = false
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'movies!A:Z',
  });

  const rows = response.data.values || [];
  if (rows.length < 2) {
    return { data: [], total: 0, page, limit };
  }

  const headers = (rows[0] || []).map(normalizeHeader);
  const dataRows = rows.slice(1);

  // Convert rows to objects
  let movies = dataRows.map((row: any[], index: number) => {
    const movie: any = { _rowIndex: index + 2 };
    headers.forEach((header: string, i: number) => {
      if (!header) return;
      movie[header] = row[i] ?? '';
    });

    // Alias theo docs (không phân biệt thumb_url/thumb, poster_url/poster...)
    if (movie.thumb && !movie.thumb_url) movie.thumb_url = movie.thumb;
    if (movie.poster && !movie.poster_url) movie.poster_url = movie.poster;
    if (movie.content && !movie.description) movie.description = movie.content;
    if (movie.name && !movie.title) movie.title = movie.name;
    return movie;
  });

  // Filter by type
  if (type && type !== 'all') {
    movies = movies.filter((m: any) => String(m.type || '').trim() === String(type));
  }

  if (unbuiltOnly) {
    movies = movies.filter((m: any) => {
      const u = String(m.update || '').trim().toUpperCase();
      return u === 'NEW' || u === 'NEW2';
    });
  }

  if (copyOnly) {
    movies = movies.filter((m: any) => {
      const u = String(m.update || '').trim().toUpperCase();
      return u === 'COPY' || u === 'COPY2';
    });
  }

  if (duplicatesOnly) {
    const norm = (v: any) => String(v ?? '').trim();
    const normUpper = (v: any) => norm(v).toUpperCase();

    const idCounts = new Map<string, number>();
    const slugCounts = new Map<string, number>();
    for (const m of movies) {
      const id = norm((m as any)?.id);
      const slug = norm((m as any)?.slug);
      if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
      if (slug) slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
    }

    movies = movies.filter((m: any) => {
      const upd = normUpper(m.update);
      if (upd) return false;
      const id = norm(m.id);
      const slug = norm(m.slug);
      const dupId = !!id && (idCounts.get(id) || 0) > 1;
      const dupSlug = !!slug && (slugCounts.get(slug) || 0) > 1;
      return dupId || dupSlug;
    });
  }

  // Search
  if (search) {
    const s = search.toLowerCase();
    movies = movies.filter((m: any) =>
      (m.title && m.title.toLowerCase().includes(s)) ||
      (m.origin_name && m.origin_name.toLowerCase().includes(s)) ||
      (m.id && m.id.toLowerCase().includes(s))
    );
  }

  // Sort newest first so newly created items show up on page 1
  const toTs = (v: any) => {
    const s = String(v || '').trim();
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  };
  movies.sort((a: any, b: any) => {
    const ta = Math.max(toTs(a.modified), toTs(a.update));
    const tb = Math.max(toTs(b.modified), toTs(b.update));
    if (ta !== tb) return tb - ta;
    const ra = Number(a._rowIndex || 0);
    const rb = Number(b._rowIndex || 0);
    return rb - ra;
  });

  const total = movies.length;
  const start = (page - 1) * limit;
  const paginated = movies.slice(start, start + limit);

  return { data: paginated, total, page, limit };
}

async function getMovieBySlug(sheets: any, spreadsheetId: string, slug: string) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'movies!A:Z',
  });

  const rows = response.data.values || [];
  if (rows.length < 2) return null;

  const headers = (rows[0] || []).map(normalizeHeader);
  const dataRows = rows.slice(1);
  const idxSlug = headers.indexOf('slug');
  if (idxSlug < 0) return null;

  const s = String(slug || '').trim();
  if (!s) return null;

  const pickRow = (row: any[]) => {
    const m: any = { _rowIndex: 0 };
    headers.forEach((header: string, i: number) => {
      if (!header) return;
      m[header] = row[i] ?? '';
    });
    if (m.thumb && !m.thumb_url) m.thumb_url = m.thumb;
    if (m.poster && !m.poster_url) m.poster_url = m.poster;
    if (m.content && !m.description) m.description = m.content;
    if (m.name && !m.title) m.title = m.name;
    return m;
  };

  // Prefer original rows (not COPY/COPY2). If multiple, prefer OK/OK2.
  const candidates = dataRows
    .map((row: any[], i: number) => ({ row, i, slug: String((idxSlug >= 0 ? row[idxSlug] : '') ?? '').trim() }))
    .filter((x: { row: any[]; i: number; slug: string }) => x.slug === s);
  if (!candidates.length) return null;

  const scored = candidates
    .map((c: { row: any[]; i: number; slug: string }) => {
      const obj = pickRow(c.row);
      obj._rowIndex = c.i + 2;
      const u = String(obj.update || '').trim().toUpperCase();
      const isCopy = u === 'COPY' || u === 'COPY2';
      const isOk = u === 'OK' || u === 'OK2';
      return { obj, score: (isCopy ? 0 : 10) + (isOk ? 5 : 0) };
    })
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

  return scored[0]?.obj || null;
}

async function normalizeCopyToOriginal(
  sheets: any,
  spreadsheetId: string,
  copyId: string,
  opts?: { deleteCopy?: boolean }
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'movies!A:Z',
  });

  const rows = response.data.values || [];
  if (rows.length < 2) throw new Error('Movies sheet is empty');

  const headers = (rows[0] || []).map(normalizeHeader);
  const dataRows = rows.slice(1);
  const idxId = 0;
  const idxSlug = headers.indexOf('slug');
  const idxUpdate = headers.indexOf('update');
  if (idxSlug < 0) throw new Error('Missing slug column');
  if (idxUpdate < 0) throw new Error('Missing update column');

  const idStr = String(copyId);
  const idMatches = dataRows
    .map((r: any[], i: number) => ({ r, i, id: String(r[idxId] ?? '') }))
    .filter((x: { r: any[]; i: number; id: string }) => x.id === idStr);
  if (!idMatches.length) throw new Error('Copy movie not found');

  const pickUpdate = (row: any[]) => String(row[idxUpdate] ?? '').trim().toUpperCase();
  const copyMatch = idMatches.find((x: { r: any[]; i: number; id: string }) => {
    const u = pickUpdate(x.r);
    return u === 'COPY' || u === 'COPY2';
  });
  const copyRowIndex = (copyMatch ? copyMatch.i : idMatches[0].i);

  const copyObj: any = {};
  headers.forEach((h: string, i: number) => {
    if (!h) return;
    copyObj[h] = dataRows[copyRowIndex][i] ?? '';
  });
  const copyUpdate = String(copyObj.update || '').trim().toUpperCase();
  if (copyUpdate !== 'COPY' && copyUpdate !== 'COPY2') {
    throw new Error('Selected row is not a COPY/COPY2 movie');
  }
  const slug = String(copyObj.slug || '').trim();
  if (!slug) throw new Error('Copy row missing slug');

  // Find original: same slug, prefer OK/OK2, and never overwrite a COPY row.
  const originalCandidates = dataRows
    .map((r: any[], i: number) => {
      const obj: any = {};
      headers.forEach((h: string, j: number) => {
        if (!h) return;
        obj[h] = r[j] ?? '';
      });
      const s = String(obj.slug || '').trim();
      const u = String(obj.update || '').trim().toUpperCase();
      const isCopy = u === 'COPY' || u === 'COPY2';
      const isOk = u === 'OK' || u === 'OK2';
      return { i, obj, s, u, isCopy, isOk };
    })
    .filter((x: { s: string; isCopy: boolean }) => x.s === slug && !x.isCopy);
  if (!originalCandidates.length) throw new Error('Original movie not found for this slug');
  originalCandidates.sort((a: { isOk: boolean }, b: { isOk: boolean }) => Number(b.isOk) - Number(a.isOk));
  const original = originalCandidates[0];

  const originalId = String(original.obj.id ?? '').trim();
  if (!originalId) throw new Error('Original row missing id');

  // Overwrite original fields with copy fields but keep original id.
  const next: any = { ...original.obj, ...copyObj };
  next.id = originalId;
  next.slug = slug;
  next.modified = new Date().toISOString();
  const isFlow2 = String(original.u || '').toUpperCase().endsWith('2');
  next.update = isFlow2 ? 'NEW2' : 'NEW';

  const rowData = headers.map((h: string) => {
    const val = next[h];
    if (Array.isArray(val)) return val.join(',');
    return val || '';
  });

  const actualRow = original.i + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `movies!A${actualRow}:${String.fromCharCode(65 + headers.length - 1)}${actualRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [rowData] },
  });

  let copyDeleted = false;
  if (opts?.deleteCopy) {
    const copyActualRow = copyRowIndex + 2;
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `movies!A${copyActualRow}:Z${copyActualRow}`,
    });
    copyDeleted = true;
  }

  return {
    success: true,
    slug,
    copyId: String(copyId),
    originalId,
    originalRow: actualRow,
    copyDeleted,
  };
}

// Get single movie
async function getMovie(sheets: any, spreadsheetId: string, id: string) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'movies!A:Z',
  });

  const rows = response.data.values || [];
  if (rows.length < 2) return null;

  const headers = (rows[0] || []).map(normalizeHeader);
  const dataRows = rows.slice(1);

  // id theo docs thường là dãy số, nhưng cứ so chuỗi
  const rowIndex = dataRows.findIndex((row: any[]) => String(row[0] ?? '') === String(id));
  if (rowIndex === -1) return null;

  const movie: any = { _rowIndex: rowIndex + 2 };
  headers.forEach((header: string, i: number) => {
    if (!header) return;
    movie[header] = dataRows[rowIndex][i] ?? '';
  });

  if (movie.thumb && !movie.thumb_url) movie.thumb_url = movie.thumb;
  if (movie.poster && !movie.poster_url) movie.poster_url = movie.poster;
  if (movie.content && !movie.description) movie.description = movie.content;
  if (movie.name && !movie.title) movie.title = movie.name;

  return movie;
}

// Save movie (create or update)
async function saveMovie(sheets: any, spreadsheetId: string, movieData: any) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'movies!A:Z',
  });

  const rows = response.data.values || [];
  const headers = (rows[0] || [
    // Align theo docs/google-sheets/README.md
    'id',
    'title',
    'slug',
    'origin_name',
    'type',
    'year',
    'genre',
    'country',
    'language',
    'quality',
    'episode_current',
    'thumb_url',
    'poster_url',
    'r2_thumb',
    'r2_poster',
    'description',
    'status',
    'showtimes',
    'is_exclusive',
    'tmdb_id',
    'modified',
    'update',
  ]).map(normalizeHeader);

  // Generate ID if new movie.
  // Theo docs: id thường là dãy số; nếu thiếu build có thể tự sinh.
  const isNew = !movieData.id;
  if (isNew) {
    // fallback: dùng timestamp để tránh trùng
    movieData.id = String(Date.now());
  }
  if (!movieData.modified) {
    movieData.modified = new Date().toISOString();
  }

  if (isNew && !movieData.update) {
    movieData.update = 'NEW';
  }

  // Convert object to row array
  const rowData = headers.map((h: string) => {
    const val = movieData[h];
    if (Array.isArray(val)) return val.join(',');
    return val || '';
  });

  if (isNew) {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'movies!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [rowData] },
    });
  } else {
    // Find and update existing row
    const dataRows = rows.slice(1);
    const rowIndex = dataRows.findIndex((row: any[]) => String(row[0] ?? '') === String(movieData.id));

    if (rowIndex === -1) {
      throw new Error('Movie not found');
    }

    const actualRow = rowIndex + 2; // +1 for header, +1 for 1-based indexing
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `movies!A${actualRow}:${String.fromCharCode(65 + headers.length - 1)}${actualRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [rowData] },
    });
  }

  return { success: true, id: movieData.id, isNew };
}

// Delete movie
async function deleteMovie(sheets: any, spreadsheetId: string, id: string) {
  // Note: Actual deletion from sheet requires more complex batchUpdate
  // For now, we'll just mark it as deleted or filter it out
  const movie = await getMovie(sheets, spreadsheetId, id);
  if (!movie) return { success: false, error: 'Movie not found' };

  // Mark as deleted by clearing the row
  const actualRow = movie._rowIndex;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `movies!A${actualRow}:Z${actualRow}`,
  });

  return { success: true };
}

// Get episodes for a movie
async function getEpisodes(sheets: any, spreadsheetId: string, movieId: string, debug?: boolean) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'episodes!A1:Z2000',
  });

  const rows = response.data.values || [];
  if (rows.length < 2) {
    return debug
      ? {
          episodes: [],
          debug: {
            movieId: String(movieId ?? ''),
            reason: 'episodes sheet has no data rows',
            meta: countNonEmptyDataRows(rows),
          },
        }
      : [];
  }

  const headers = (rows[0] || []).map(normalizeHeader);
  const dataRows = rows.slice(1);

  const findFirstHeaderIndex = (candidates: string[]) => {
    for (const c of candidates) {
      const idx = headers.indexOf(c);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idxMovieId = findFirstHeaderIndex(['movie_id', 'movieid', 'movie', 'id_movie', 'movie-id']);
  const movieIdStr = String(movieId ?? '').trim();

  const matchByValue = (value: string) =>
    dataRows
      .filter((row: any[]) => {
        const v = idxMovieId >= 0 ? row[idxMovieId] : row[0];
        return String(v ?? '').trim() === value;
      })
      .map((row: any[]) => {
        const ep: any = {};
        headers.forEach((header: string, i: number) => {
          if (!header) return;
          ep[header] = row[i] ?? '';
        });
        return ep;
      });

  let matchMode: 'movie_id' | 'slug' = 'movie_id';
  let attemptedSlug: string | null = null;

  let matchedRows = matchByValue(movieIdStr);

  // Fallback: some sheets store movie slug in episodes.movie_id instead of movies.id
  if (matchedRows.length === 0 && movieIdStr) {
    try {
      const movie = await getMovie(sheets, spreadsheetId, movieIdStr);
      const slug = String((movie as any)?.slug ?? '').trim();
      if (slug) {
        attemptedSlug = slug;
        const bySlug = matchByValue(slug);
        if (bySlug.length > 0) {
          matchedRows = bySlug;
          matchMode = 'slug';
        }
      }
    } catch {
      // ignore
    }
  }

  if (!debug) return matchedRows;

  const sampleMovieIds = dataRows
    .slice(0, 20)
    .map((row: any[]) => {
      const v = idxMovieId >= 0 ? row[idxMovieId] : row[0];
      return String(v ?? '');
    })
    .filter((v: string) => v.trim() !== '');

  const norm = (v: any) => String(v ?? '').trim();
  const wanted = norm(movieIdStr);
  const hasMovieId = dataRows.some((row: any[]) => {
    const v = idxMovieId >= 0 ? row[idxMovieId] : row[0];
    return norm(v) === wanted;
  });

  const idCounts = new Map<string, number>();
  for (const row of dataRows) {
    const v = idxMovieId >= 0 ? row[idxMovieId] : row[0];
    const key = norm(v);
    if (!key) continue;
    idCounts.set(key, (idCounts.get(key) || 0) + 1);
  }
  const topMovieIds = Array.from(idCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([movie_id, count]) => ({ movie_id, count }));
  const uniqueMovieIdCount = idCounts.size;

  return {
    episodes: matchedRows,
    debug: {
      movieId: String(movieId ?? ''),
      headers,
      idxMovieId,
      matchMode,
      attemptedSlug,
      meta: countNonEmptyDataRows(rows),
      sampleMovieIds,
      hasMovieId,
      uniqueMovieIdCount,
      topMovieIds,
    },
  };
}

// Save episodes for a movie
async function saveEpisodes(sheets: any, spreadsheetId: string, movieId: string, episodes: any[]) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'episodes!A1:Z2000',
  });
  const rows = response.data.values || [];
  const headers = (rows[0] || []).map(normalizeHeader);
  const dataRows = rows.slice(1);

  const findFirstHeaderIndex = (candidates: string[]) => {
    for (const c of candidates) {
      const idx = headers.indexOf(c);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idxMovieId = findFirstHeaderIndex(['movie_id', 'movieid', 'movie', 'id_movie', 'movie-id']);

  // Delete existing episodes for this movie
  if (dataRows.length > 0) {
    const rowsToDelete = [];
    for (let i = 0; i < dataRows.length; i++) {
      const v = idxMovieId >= 0 ? dataRows[i][idxMovieId] : dataRows[i][0];
      if (String(v ?? '').trim() === String(movieId).trim()) {
        rowsToDelete.push(i + 2); // +2 for header and 1-based indexing
      }
    }

    for (const rowNum of rowsToDelete.reverse()) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `episodes!A${rowNum}:Z${rowNum}`,
      });
    }
  }

  const buildRowByHeaders = (ep: any, index: number) => {
    const episodeCode = ep.episode_code || ep.episode || ep.code || String(index + 1);
    const episodeName = ep.episode_name || ep.name || `Tập ${episodeCode}`;
    const serverSlug = ep.server_slug || ep.server || ep.server_source || 'vietsub-1';
    const serverName = ep.server_name || ep.serverName || '';

    const valueByHeader: Record<string, any> = {
      movie_id: movieId,
      movieid: movieId,
      movie: movieId,
      id_movie: movieId,
      'movie-id': movieId,
      episode_code: String(episodeCode),
      episode: String(episodeCode),
      code: String(episodeCode),
      episode_name: String(episodeName),
      name: String(episodeName),
      server_slug: String(serverSlug),
      server: String(serverSlug),
      server_name: String(serverName),
      link_m3u8: String(ep.link_m3u8 || ''),
      link_embed: String(ep.link_embed || ''),
      link_backup: String(ep.link_backup || ''),
      link_vip1: String(ep.link_vip1 || ''),
      link_vip2: String(ep.link_vip2 || ''),
      link_vip3: String(ep.link_vip3 || ''),
      link_vip4: String(ep.link_vip4 || ''),
      link_vip5: String(ep.link_vip5 || ''),
      note: String(ep.note || ''),
    };

    if (!headers.length) {
      return [
        movieId,
        String(episodeCode),
        String(episodeName),
        String(serverSlug),
        String(serverName),
        String(ep.link_m3u8 || ''),
        String(ep.link_embed || ''),
        String(ep.link_backup || ''),
        String(ep.link_vip1 || ''),
        String(ep.link_vip2 || ''),
        String(ep.link_vip3 || ''),
        String(ep.link_vip4 || ''),
        String(ep.link_vip5 || ''),
        String(ep.note || ''),
      ];
    }

    return headers.map((h: string) => {
      if (!h) return '';
      return valueByHeader[h] ?? '';
    });
  };

  // Add new episodes (kiểu MỚI theo docs)
  const newRows = (episodes || []).map((ep: any, index: number) => buildRowByHeaders(ep, index));

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'episodes!A1',
      valueInputOption: 'RAW',
      requestBody: { values: newRows },
    });
  }

  return { success: true, count: newRows.length };
}
