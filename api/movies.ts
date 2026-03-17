import { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

function normalizeHeader(h: any) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
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
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
  }

  const raw = String(key).trim();
  if (raw.startsWith('{')) {
    return JSON.parse(raw);
  }

  const abs = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  const file = await fs.readFile(abs, 'utf8');
  return JSON.parse(file);
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Lấy spreadsheetId và serviceAccountKey từ query params hoặc body, fallback về env
  const spreadsheetId = String(req.query.spreadsheetId || req.body?.spreadsheetId || DEFAULT_SPREADSHEET_ID || '').trim();
  const serviceAccountKey = String(req.query.serviceAccountKey || req.body?.serviceAccountKey || SERVICE_ACCOUNT_KEY || '').trim();

  if (!spreadsheetId) {
    return res.status(500).json({ error: 'Google Sheets ID not configured' });
  }

  try {
    const sheets = await getSheetsClient(serviceAccountKey);
    const { action } = req.query;

    switch (action) {
      case 'list': {
        const { type, page = '1', limit = '50', search = '' } = req.query;
        const result = await listMovies(sheets, spreadsheetId, type as string, parseInt(page as string), parseInt(limit as string), search as string);
        return res.status(200).json(result);
      }

      case 'get': {
        const { id } = req.query;
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
        const { movie_id } = req.query;
        if (!movie_id) return res.status(400).json({ error: 'Missing movie_id' });

        if (req.method === 'GET') {
          const episodes = await getEpisodes(sheets, spreadsheetId, movie_id as string);
          return res.status(200).json(episodes);
        }

        if (req.method === 'POST') {
          // Support both formats: direct array or { episodes: [...] }
          const body = req.body;
          const episodes = Array.isArray(body) ? body : (body?.episodes || []);
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
  search: string = ''
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'movies!A1:Z1000',
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

  // Search
  if (search) {
    const s = search.toLowerCase();
    movies = movies.filter((m: any) =>
      (m.title && m.title.toLowerCase().includes(s)) ||
      (m.origin_name && m.origin_name.toLowerCase().includes(s)) ||
      (m.id && m.id.toLowerCase().includes(s))
    );
  }

  const total = movies.length;
  const start = (page - 1) * limit;
  const paginated = movies.slice(start, start + limit);

  return { data: paginated, total, page, limit };
}

// Get single movie
async function getMovie(sheets: any, spreadsheetId: string, id: string) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'movies!A1:Z1000',
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
    range: 'movies!A1:Z1000',
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
async function getEpisodes(sheets: any, spreadsheetId: string, movieId: string) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'episodes!A1:Z2000',
  });

  const rows = response.data.values || [];
  if (rows.length < 2) return [];

  const headers = (rows[0] || []).map(normalizeHeader);
  const dataRows = rows.slice(1);

  const idxMovieId = headers.indexOf('movie_id');
  const episodes = dataRows
    .filter((row: any[]) => {
      const v = idxMovieId >= 0 ? row[idxMovieId] : row[0];
      return String(v ?? '') === String(movieId);
    })
    .map((row: any[]) => {
      const ep: any = {};
      headers.forEach((header: string, i: number) => {
        if (!header) return;
        ep[header] = row[i] ?? '';
      });
      return ep;
    });

  return episodes;
}

// Save episodes for a movie
async function saveEpisodes(sheets: any, spreadsheetId: string, movieId: string, episodes: any[]) {
  // First, get current episodes
  const currentEpisodes = await getEpisodes(sheets, spreadsheetId, movieId);

  // Delete existing episodes for this movie
  if (currentEpisodes.length > 0) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'episodes!A1:Z2000',
    });
    const rows = response.data.values || [];
    const headers = (rows[0] || []).map(normalizeHeader);
    const idxMovieId = headers.indexOf('movie_id');
    const dataRows = rows.slice(1);

    // Find rows to delete
    const rowsToDelete = [];
    for (let i = 0; i < dataRows.length; i++) {
      const v = idxMovieId >= 0 ? dataRows[i][idxMovieId] : dataRows[i][0];
      if (String(v ?? '') === String(movieId)) {
        rowsToDelete.push(i + 2); // +2 for header and 1-based indexing
      }
    }

    // Clear rows (reverse order to avoid shifting)
    for (const rowNum of rowsToDelete.reverse()) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `episodes!A${rowNum}:Z${rowNum}`,
      });
    }
  }

  // Add new episodes (kiểu MỚI theo docs)
  const newRows = (episodes || []).map((ep: any, index: number) => {
    const episodeCode = ep.episode_code || ep.episode || ep.code || String(index + 1);
    const episodeName = ep.episode_name || ep.name || `Tập ${episodeCode}`;
    const serverSlug = ep.server_slug || ep.server || ep.server_source || 'vietsub-1';
    const serverName = ep.server_name || ep.serverName || '';

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
  });

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
