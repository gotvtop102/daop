import { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const DEFAULT_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SHEETS_JSON;

function colToLetter(colIndex: number) {
  let n = Number(colIndex);
  if (!Number.isFinite(n) || n < 0) return 'A';
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function isR2Configured() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

async function updateMovieShowtimesOnly(sheets: any, spreadsheetId: string, movieId: string, body: any) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'movies!A:Z',
  });

  const rows = (response.data.values || []) as any[][];
  if (rows.length < 2) {
    throw new Error('Movies sheet has no data');
  }

  const headers = (rows[0] || []).map(normalizeHeader);
  const idxId = headers.indexOf('id');
  const idxShowtimes = headers.indexOf('showtimes');
  const idxModified = headers.indexOf('modified');
  const idxUpdate = headers.indexOf('update');

  if (idxId < 0) throw new Error('Sheet missing id column');
  if (idxShowtimes < 0) throw new Error('Sheet missing showtimes column');

  const idToFind = String(movieId ?? '').trim();
  const dataRows = rows.slice(1);
  const existingRowIndex = dataRows.findIndex((row: any[]) => String(row[idxId] ?? '').trim() === idToFind);
  if (existingRowIndex < 0) {
    throw new Error('Movie not found');
  }
  const actualRow = existingRowIndex + 2; // +1 header, +1 1-based

  const showtimesVal = String((body as any)?.showtimes ?? '').trim();
  const modifiedVal = new Date().toISOString();

  const updates: Array<{ range: string; values: any[][] }> = [];
  updates.push({ range: `movies!${colToLetter(idxShowtimes)}${actualRow}`, values: [[showtimesVal]] });
  if (idxModified >= 0) {
    updates.push({ range: `movies!${colToLetter(idxModified)}${actualRow}`, values: [[modifiedVal]] });
  }
  if (idxUpdate >= 0) {
    updates.push({ range: `movies!${colToLetter(idxUpdate)}${actualRow}`, values: [['NEW']] });
  }

  for (const u of updates) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: u.range,
      valueInputOption: 'RAW',
      requestBody: { values: u.values },
    });
  }

  return { success: true, id: idToFind, updated: ['showtimes', ...(idxModified >= 0 ? ['modified'] : []), ...(idxUpdate >= 0 ? ['update'] : [])] };
}

async function updateMovieShowtimesExclusiveOnly(sheets: any, spreadsheetId: string, movieId: string, body: any) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'movies!A:Z',
  });

  const rows = (response.data.values || []) as any[][];
  if (rows.length < 2) {
    throw new Error('Movies sheet has no data');
  }

  const headers = (rows[0] || []).map(normalizeHeader);
  const idxId = headers.indexOf('id');
  const idxShowtimes = headers.indexOf('showtimes');
  const idxIsExclusive = headers.indexOf('is_exclusive');
  const idxModified = headers.indexOf('modified');
  const idxUpdate = headers.indexOf('update');

  if (idxId < 0) throw new Error('Sheet missing id column');
  if (idxShowtimes < 0) throw new Error('Sheet missing showtimes column');
  if (idxIsExclusive < 0) throw new Error('Sheet missing is_exclusive column');

  const idToFind = String(movieId ?? '').trim();
  const dataRows = rows.slice(1);
  const existingRowIndex = dataRows.findIndex((row: any[]) => String(row[idxId] ?? '').trim() === idToFind);
  if (existingRowIndex < 0) {
    throw new Error('Movie not found');
  }
  const actualRow = existingRowIndex + 2; // +1 header, +1 1-based

  const showtimesVal = String((body as any)?.showtimes ?? '').trim();
  const isExclusiveVal = (body as any)?.is_exclusive ? '1' : '0';
  const modifiedVal = new Date().toISOString();

  const updates: Array<{ range: string; values: any[][] }> = [];
  updates.push({ range: `movies!${colToLetter(idxShowtimes)}${actualRow}`, values: [[showtimesVal]] });
  updates.push({ range: `movies!${colToLetter(idxIsExclusive)}${actualRow}`, values: [[isExclusiveVal]] });
  if (idxModified >= 0) {
    updates.push({ range: `movies!${colToLetter(idxModified)}${actualRow}`, values: [[modifiedVal]] });
  }
  if (idxUpdate >= 0) {
    updates.push({ range: `movies!${colToLetter(idxUpdate)}${actualRow}`, values: [['NEW']] });
  }

  for (const u of updates) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: u.range,
      valueInputOption: 'RAW',
      requestBody: { values: u.values },
    });
  }

  return {
    success: true,
    id: idToFind,
    updated: [
      'showtimes',
      'is_exclusive',
      ...(idxModified >= 0 ? ['modified'] : []),
      ...(idxUpdate >= 0 ? ['update'] : []),
    ],
  };
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

async function uploadMovieImageById(sourceUrl: string, id: string, folder: 'thumbs' | 'posters') {
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
      case 'get': {
        const id = (req.query as any)?.id || (req.body as any)?.id;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        const movie = await getMovie(sheets, spreadsheetId, String(id));
        if (!movie) return res.status(404).json({ error: 'Movie not found' });
        return res.status(200).json(movie);
      }

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

        return res.status(200).json({ ok: true, results });
      }

      case 'deleteRows': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const sheet = String((req.body as any)?.sheet || (req.body as any)?.tab || 'movies').trim() || 'movies';
        const startRow = Number((req.body as any)?.startRow);
        const endRow = Number((req.body as any)?.endRow);

        if (!Number.isFinite(startRow) || startRow < 2) {
          return res.status(400).json({ error: 'startRow must be a number and >= 2 (row 1 is header)' });
        }
        if (!Number.isFinite(endRow) || endRow < startRow) {
          return res.status(400).json({ error: 'endRow must be a number and >= startRow' });
        }

        const result = await deleteRows(sheets, spreadsheetId, sheet, startRow, endRow);
        return res.status(200).json(result);
      }

      case 'list': {
        const { type, page = '1', limit = '50', search = '', unbuilt, duplicates } = req.query;
        const unbuiltOnly = String(unbuilt || '').trim() === '1' || String(unbuilt || '').trim().toLowerCase() === 'true';
        const duplicatesOnly =
          String(duplicates || '').trim() === '1' || String(duplicates || '').trim().toLowerCase() === 'true';
        const result = await listMovies(
          sheets,
          spreadsheetId,
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
        const movie = await getMovieBySlug(sheets, spreadsheetId, slug as string);
        return res.status(200).json(movie);
      }

      case 'save': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const result = await saveMovie(sheets, spreadsheetId, req.body || {});
        return res.status(200).json(result);
      }

      case 'delete': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const id = (req.query as any)?.id || (req.body as any)?.id;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        const result = await deleteMovie(sheets, spreadsheetId, String(id));
        return res.status(200).json(result);
      }

      case 'updateShowtimes': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const id = (req.query as any)?.id || (req.body as any)?.id;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        const result = await updateMovieShowtimesOnly(sheets, spreadsheetId, String(id), req.body || {});
        return res.status(200).json(result);
      }

      case 'updateShowtimesExclusive': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const id = (req.query as any)?.id || (req.body as any)?.id;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        const result = await updateMovieShowtimesExclusiveOnly(sheets, spreadsheetId, String(id), req.body || {});
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

// List movies from Google Sheets
async function listMovies(
  sheets: any,
  spreadsheetId: string,
  type: string,
  page: number = 1,
  limit: number = 50,
  search: string = '',
  unbuiltOnly: boolean = false,
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
      return u === 'NEW';
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
    if (m.content && !m.description) m.description = m.content;
    if (m.name && !m.title) m.title = m.name;
    return m;
  };

  // Prefer first match (no special handling for COPY/OK statuses).
  const candidates = dataRows
    .map((row: any[], i: number) => ({ row, i, slug: String((idxSlug >= 0 ? row[idxSlug] : '') ?? '').trim() }))
    .filter((x: { row: any[]; i: number; slug: string }) => x.slug === s);
  if (!candidates.length) return null;

  const scored = candidates
    .map((c: { row: any[]; i: number; slug: string }) => {
      const obj = pickRow(c.row);
      obj._rowIndex = c.i + 2;
      return { obj, score: 1 };
    })
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

  return scored[0]?.obj || null;
}

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
    'description',
    'status',
    'chieurap',
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

  // Upload images to R2 using id-based keys (thumbs/<id>.webp, posters/<id>.webp).
  // After upload, persist R2 public URLs into thumb_url/poster_url.
  const idStr = String(movieData.id || '').trim();
  if (idStr) {
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
    // Do not persist image URLs into the sheet (thumb_url/poster_url columns removed).
    // Keep only side-effect upload to R2.
    movieData.thumb_url = '';
    movieData.poster_url = '';
    movieData.thumb = '';
    movieData.poster = '';
  }

  // Convert object to row array
  const rowData = headers.map((h: string) => {
    const val = movieData[h];
    if (Array.isArray(val)) return val.join(',');
    return val || '';
  });

  // Some clients pre-generate id for new movies.
  // If an id is provided but not found in the sheet, treat it as a new movie.
  let existingRowIndex = -1;
  if (!isNew) {
    const dataRows = rows.slice(1);
    const idToFind = String(movieData.id ?? '').trim();
    existingRowIndex = dataRows.findIndex((row: any[]) => String(row[0] ?? '').trim() === idToFind);
  }

  const shouldAppend = isNew || existingRowIndex === -1;

  if (shouldAppend) {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'movies!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [rowData] },
    });
  } else {
    // Find and update existing row
    const actualRow = existingRowIndex + 2; // +1 for header, +1 for 1-based indexing
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `movies!A${actualRow}:${String.fromCharCode(65 + headers.length - 1)}${actualRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [rowData] },
    });
  }

  return { success: true, id: movieData.id, isNew: shouldAppend };
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
