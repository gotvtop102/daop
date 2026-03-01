// Sync phim hiện có (OPhim + custom đã build) sang Google Sheets.
// Chỉ export: phim mới chưa có (append) hoặc phim đã có nhưng modified mới hơn (update row + ghi đè episodes).

import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import slugify from 'slugify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

function parseWindowArray(jsContent, globalName) {
  const prefix = `window.${globalName}`;
  let s = jsContent.trim();
  if (!s.startsWith(prefix)) {
    throw new Error(`Không tìm thấy prefix ${prefix} trong file.`);
  }
  s = s.replace(new RegExp(`^${prefix}\\s*=\\s*`), '');
  s = s.replace(/;\s*$/, '');
  return JSON.parse(s);
}

async function loadLocalMovies() {
  const moviesLightPath = path.join(PUBLIC_DATA, 'movies-light.js');
  if (!(await fs.pathExists(moviesLightPath))) {
    throw new Error('Không tìm thấy public/data/movies-light.js. Hãy chạy build trước.');
  }
  const mlRaw = await fs.readFile(moviesLightPath, 'utf8');
  const light = parseWindowArray(mlRaw, 'moviesLight');

  const batchesDir = path.join(PUBLIC_DATA, 'batches');
  const moviesById = new Map();
  if (await fs.pathExists(batchesDir)) {
    const files = (await fs.readdir(batchesDir)).filter((f) => f.startsWith('batch_') && f.endsWith('.js'));
    for (const file of files) {
      const raw = await fs.readFile(path.join(batchesDir, file), 'utf8');
      try {
        const batch = parseWindowArray(raw, 'moviesBatch');
        for (const m of batch || []) {
          const idStr = String(m.id);
          moviesById.set(idStr, m);
        }
      } catch (e) {
        console.warn('   Không parse được batch', file, ':', e.message);
      }
    }
  }

  const fullMovies = light.map((m) => {
    const idStr = String(m.id);
    const full = moviesById.get(idStr);
    return full || { ...m, episodes: [] };
  });

  return fullMovies;
}

async function loadServiceAccountFromEnv() {
  const jsonEnv = process.env.GOOGLE_SHEETS_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonEnv) {
    try {
      return JSON.parse(jsonEnv);
    } catch (e) {
      console.warn('Không parse được GOOGLE_SHEETS_JSON/GOOGLE_SERVICE_ACCOUNT_JSON:', e.message || e);
    }
  }
  const keyPathEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (keyPathEnv) {
    const keyPath = path.isAbsolute(keyPathEnv) ? keyPathEnv : path.join(ROOT, keyPathEnv);
    if (await fs.pathExists(keyPath)) {
      return fs.readJson(keyPath);
    }
  }
  const defaultPath = path.join(ROOT, 'gotv-394615-89fa7961dcb3.json');
  if (await fs.pathExists(defaultPath)) {
    return fs.readJson(defaultPath);
  }
  throw new Error('Không tìm thấy service account key. Cấu hình GOOGLE_SHEETS_JSON hoặc GOOGLE_SERVICE_ACCOUNT_KEY.');
}

function colToLetter(n) {
  let s = '';
  n++;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s || 'A';
}

function derivePosterFromThumb(url) {
  if (!url) return '';
  const u = String(url);
  if (/poster\.(jpe?g|png|webp)$/i.test(u)) return u;
  const r1 = u.replace(/thumb\.(jpe?g|png|webp)$/i, 'poster.$1');
  if (r1 !== u) return r1;
  const r2 = u.replace(/-thumb\.(jpe?g|png|webp)$/i, '-poster.$1');
  if (r2 !== u) return r2;
  const r3 = u.replace(/_thumb\.(jpe?g|png|webp)$/i, '_poster.$1');
  if (r3 !== u) return r3;
  return '';
}

function expandImgUrl(url) {
  if (!url) return '';
  const u = String(url);
  if (u.startsWith('/uploads/')) return `https://img.ophim.live${u}`;
  if (u.startsWith('//')) return `https:${u}`;
  return u;
}

function buildMovieRow(movie, headers, explicitId) {
  const row = new Array(headers.length).fill('');
  const headerIndex = (name) => {
    const lower = name.toLowerCase();
    let idx = headers.findIndex((h) => h === lower);
    if (idx >= 0) return idx;
    idx = headers.findIndex((h) => h === lower.replace('_', ' '));
    return idx;
  };

  const idStr = explicitId != null ? String(explicitId) : (movie && movie.id != null ? String(movie.id) : '');
  const setIfExists = (name, val) => {
    const idx = headerIndex(name);
    if (idx >= 0 && val != null) row[idx] = String(val);
  };

  setIfExists('id', idStr);
  setIfExists('slug', movie.slug || '');
  setIfExists('title', movie.title || '');
  setIfExists('name', movie.title || '');
  setIfExists('origin_name', movie.origin_name || '');
  setIfExists('type', movie.type || '');
  setIfExists('year', movie.year || '');
  const genreNames = (movie.genre || []).map((g) => g.name || g.slug || '').filter(Boolean);
  setIfExists('genre', genreNames.join(', '));
  const countryNames = (movie.country || []).map((c) => c.name || c.slug || '').filter(Boolean);
  setIfExists('country', countryNames.join(', '));
  setIfExists('language', movie.lang_key || movie.language || '');
  setIfExists('episode_current', movie.episode_current || '');
  setIfExists('quality', movie.quality || '');
  const thumbUrl = expandImgUrl(movie.thumb || '');
  setIfExists('thumb_url', thumbUrl);
  setIfExists('thumb', thumbUrl);
  const derivedPoster = (!movie.poster && thumbUrl) ? derivePosterFromThumb(thumbUrl) : '';
  const posterUrl = expandImgUrl(movie.poster || '') || derivedPoster || thumbUrl || '';
  setIfExists('poster_url', posterUrl);
  setIfExists('poster', posterUrl);
  const desc = movie.description || movie.content || '';
  setIfExists('description', desc);
  setIfExists('content', desc);
  setIfExists('status', movie.status || '');
  setIfExists('showtimes', movie.showtimes || '');
  const tmdbId = movie.tmdb?.id || movie.tmdb_id;
  if (tmdbId) setIfExists('tmdb_id', tmdbId);
  if (Array.isArray(movie.director) && movie.director.length) {
    setIfExists('director', movie.director.join(', '));
  }
  if (Array.isArray(movie.cast) && movie.cast.length) {
    setIfExists('cast', movie.cast.join(', '));
  }
  if (Array.isArray(movie.keywords) && movie.keywords.length) {
    setIfExists('tags', movie.keywords.join(', '));
  }
  if (movie.is_exclusive) {
    setIfExists('is_exclusive', '1');
  }
  setIfExists('modified', movie.modified || movie.updated_at || '');
  if (movie.update_status) {
    setIfExists('update', movie.update_status);
  }

  // Tránh lỗi Google Sheets: mỗi ô tối đa ~50000 ký tự
  const MAX_CELL_LEN = 49000;
  for (let i = 0; i < row.length; i++) {
    const v = row[i];
    if (typeof v === 'string' && v.length > MAX_CELL_LEN) {
      row[i] = v.slice(0, MAX_CELL_LEN - 20) + '...(truncated)';
    }
  }

  return row;
}

function buildEpisodeRows(movieIdInSheet, movie, epHeaders) {
  const rows = [];
  if (!Array.isArray(movie.episodes) || movie.episodes.length === 0) return rows;

  const headerIndex = (name) => {
    const lower = name.toLowerCase();
    let idx = epHeaders.findIndex((h) => h === lower);
    if (idx >= 0) return idx;
    idx = epHeaders.findIndex((h) => h === lower.replace('_', ' '));
    return idx;
  };

  // Chỉ hỗ trợ định dạng MỚI: mỗi dòng = 1 tập trên 1 server
  const idxMovieId = headerIndex('movie_id') >= 0 ? headerIndex('movie_id') : 0;
  const idxEpCode = headerIndex('episode_code') >= 0 ? headerIndex('episode_code') : 1;
  const idxEpName = headerIndex('episode_name') >= 0 ? headerIndex('episode_name') : 2;
  const idxServerSlug = headerIndex('server_slug') >= 0 ? headerIndex('server_slug') : 3;
  const idxServerName = headerIndex('server_name') >= 0 ? headerIndex('server_name') : 4;
  const idxLinkM3U8 = headerIndex('link_m3u8') >= 0 ? headerIndex('link_m3u8') : 5;
  const idxLinkEmbed = headerIndex('link_embed') >= 0 ? headerIndex('link_embed') : 6;
  const idxLinkBackup = headerIndex('link_backup') >= 0 ? headerIndex('link_backup') : 7;
  const idxLinkVip1 = headerIndex('link_vip1');
  const idxLinkVip2 = headerIndex('link_vip2');
  const idxLinkVip3 = headerIndex('link_vip3');
  const idxLinkVip4 = headerIndex('link_vip4');
  const idxLinkVip5 = headerIndex('link_vip5');

  for (const ep of movie.episodes) {
    const serverName = ep.server_name || ep.name || ep.slug || '';
    const serverSlug = ep.slug || (serverName ? slugify(serverName, { lower: true }) : 'default');
    const list = Array.isArray(ep.server_data) ? ep.server_data : [];
    if (!list.length) continue;
    list.forEach((srv, idxEp) => {
      const row = new Array(epHeaders.length).fill('');
      row[idxMovieId] = String(movieIdInSheet);
      const epCode = srv.slug || srv.name || String(idxEp + 1);
      const epName = srv.name || srv.slug || `Tập ${epCode}`;
      row[idxEpCode] = String(epCode);
      row[idxEpName] = String(epName);
      row[idxServerSlug] = serverSlug;
      row[idxServerName] = serverName || serverSlug;
      const linkM3U8 = (srv && srv.link_m3u8) || '';
      const linkEmbed = (srv && srv.link_embed) || '';
      const linkBackup = (srv && (srv.link_backup || srv.link)) || '';
      const linkVip1 = (srv && srv.link_vip1) || '';
      const linkVip2 = (srv && srv.link_vip2) || '';
      const linkVip3 = (srv && srv.link_vip3) || '';
      const linkVip4 = (srv && srv.link_vip4) || '';
      const linkVip5 = (srv && srv.link_vip5) || '';
      if (idxLinkM3U8 >= 0) row[idxLinkM3U8] = linkM3U8;
      if (idxLinkEmbed >= 0) row[idxLinkEmbed] = linkEmbed;
      if (idxLinkBackup >= 0) row[idxLinkBackup] = linkBackup;
      if (idxLinkVip1 >= 0) row[idxLinkVip1] = linkVip1;
      if (idxLinkVip2 >= 0) row[idxLinkVip2] = linkVip2;
      if (idxLinkVip3 >= 0) row[idxLinkVip3] = linkVip3;
      if (idxLinkVip4 >= 0) row[idxLinkVip4] = linkVip4;
      if (idxLinkVip5 >= 0) row[idxLinkVip5] = linkVip5;
      rows.push(row);
    });
  }

  return rows;
}

async function main() {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) {
    throw new Error('Cần GOOGLE_SHEETS_ID trong env để ghi Google Sheets.');
  }

  console.log('1. Đọc dữ liệu phim hiện có từ build (movies-light + batches)...');
  const movies = await loadLocalMovies();
  console.log('   Tổng số phim local:', movies.length);

  console.log('2. Kết nối Google Sheets và đọc sheet movies/episodes hiện tại...');
  const key = await loadServiceAccountFromEnv();
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges: ['movies', 'episodes'],
  });
  const valueRanges = res.data.valueRanges || [];
  const moviesRows = valueRanges[0]?.values || [];
  const episodesRows = valueRanges[1]?.values || [];

  if (moviesRows.length === 0) {
    throw new Error('Sheet movies chưa có header (dòng 1). Hãy import template trước.');
  }

  const movieHeaders = moviesRows[0].map((h) => (h || '').toString().toLowerCase().trim());
  const existingMovieRows = moviesRows.slice(1);
  const epHeaders = episodesRows[0]?.map((h) => (h || '').toString().toLowerCase().trim()) || ['movie_id', 'name', 'sources'];

  const idxMovieId = movieHeaders.indexOf('id');
  const idxSlug = movieHeaders.indexOf('slug');
  const idxModified = movieHeaders.indexOf('modified');
  const idxUpdate = movieHeaders.indexOf('update');
  const idxTitle = movieHeaders.indexOf('title') >= 0 ? movieHeaders.indexOf('title') : movieHeaders.indexOf('name');
  const idxOrigin = movieHeaders.indexOf('origin_name');
  // id có thể là string (OPhim _id). Không dùng auto-increment numeric nữa.

  console.log('   Headers:', movieHeaders.join(', '));
  console.log('   idxSlug:', idxSlug, ', idxModified:', idxModified, ', idxMovieId:', idxMovieId);
  if (idxSlug < 0) {
    console.warn('   ⚠ CẢNH BÁO: Sheet movies KHÔNG có cột "slug"! Sẽ dùng title+origin_name để check trùng.');
  }

  /** slug -> { rowIndex (1-based), id (numeric), modified, update } */
  const slugToRow = new Map();
  /** title|origin_name -> { rowIndex, id, modified, update } (fallback khi không có slug) */
  const titleToRow = new Map();
  for (let i = 0; i < existingMovieRows.length; i++) {
    const row = existingMovieRows[i];
    const slugVal = idxSlug >= 0 ? (row[idxSlug] || '') : '';
    const idVal = idxMovieId >= 0 ? (row[idxMovieId] || '') : '';
    const modifiedVal = idxModified >= 0 ? (row[idxModified] || '') : '';
    const updateVal = idxUpdate >= 0 ? (row[idxUpdate] || '') : '';
    const slug = String(slugVal).toLowerCase().trim();
    const idStr = String(idVal).trim();
    const info = { rowIndex: i + 2, id: idStr, modified: String(modifiedVal).trim(), update: String(updateVal).trim() };
    if (slug) {
      slugToRow.set(slug, info);
    }
    // fallback key: title|origin_name
    const titleVal = idxTitle >= 0 ? String(row[idxTitle] || '').trim() : '';
    const originVal = idxOrigin >= 0 ? String(row[idxOrigin] || '').trim() : '';
    if (titleVal) {
      titleToRow.set((titleVal + '|' + originVal).toLowerCase(), info);
    }
  }
  console.log('   slugToRow size:', slugToRow.size, ', titleToRow size:', titleToRow.size);

  /** movie_id (string) -> [sheet row indices 0-based] trong episodes */
  const epIdxMovieId = epHeaders.indexOf('movie_id');
  const movieIdToEpRows = new Map();
  for (let i = 1; i < episodesRows.length; i++) {
    const row = episodesRows[i];
    const mid = epIdxMovieId >= 0 ? row?.[epIdxMovieId] : '';
    const idStr = mid != null ? String(mid).trim() : '';
    if (idStr) {
      if (!movieIdToEpRows.has(idStr)) movieIdToEpRows.set(idStr, []);
      movieIdToEpRows.get(idStr).push(i);
    }
  }

  if (idxModified < 0) {
    console.log('   Lưu ý: Sheet movies chưa có cột "modified". Chỉ append phim mới, không update phim đã có.');
  }
  console.log('   Số dòng movies:', existingMovieRows.length);

  const moviesToAppend = [];
  const episodesToAppend = [];
  const moviesToUpdate = [];
  const moviesToCopyAppend = [];
  const episodesToCopyAppend = [];

  let skippedCount = 0;
  for (const m of movies) {
    const slug = String(m.slug || '').toLowerCase().trim();
    const titleKey = (String(m.title || '').trim() + '||' + String(m.origin_name || '').trim()).toLowerCase();
    const localModified = String(m.modified || m.updated_at || '').trim();
    // check by slug first, then fallback to title|origin_name
    let existing = slugToRow.get(slug);
    if (!existing) {
      const titleKey = ((m.title || '') + '|' + (m.origin_name || '')).toLowerCase().trim();
      existing = titleToRow.get(titleKey) || null;
    }
    if (!existing) {
      const row = buildMovieRow(m, movieHeaders, m.id);
      moviesToAppend.push(row);
      const epRows = buildEpisodeRows(m.id, m, epHeaders);
      episodesToAppend.push(...epRows);
      continue;
    }
    if (idxModified < 0) { skippedCount++; continue; }
    const sheetModified = existing.modified || '';
    const shouldUpdate = sheetModified ? (localModified && localModified > sheetModified) : false;
    if (shouldUpdate) {
      const u = String(existing.update || '').toUpperCase().trim();
      if (idxUpdate >= 0 && (u === 'OK' || u === 'OK2')) {
        const copyMovie = { ...m, update_status: (u === 'OK2' ? 'COPY2' : 'COPY') };
        // User yêu cầu giữ nguyên id gốc cho COPY/COPY2
        const row = buildMovieRow(copyMovie, movieHeaders, existing.id || m.id);
        moviesToCopyAppend.push(row);
        // Giữ nguyên id => không append episodes (tránh đụng movie_id). Episodes chỉ update khi update in-place.
      } else {
        moviesToUpdate.push({
          movie: m,
          sheetId: existing.id,
          rowIndex: existing.rowIndex,
        });
      }
    } else {
      skippedCount++;
    }
  }
  console.log(
    '   Kết quả check trùng: append =',
    moviesToAppend.length,
    ', update =',
    moviesToUpdate.length,
    ', copy-append =',
    moviesToCopyAppend.length,
    ', skip =',
    skippedCount
  );

  const hasAppend = moviesToAppend.length > 0;
  const hasUpdate = moviesToUpdate.length > 0;
  const hasCopyAppend = moviesToCopyAppend.length > 0;
  if (!hasAppend && !hasUpdate && !hasCopyAppend) {
    console.log('3. Không có phim mới hoặc phim có cập nhật. Kết thúc.');
    return;
  }

  if (hasAppend) {
    console.log('3a. Append', moviesToAppend.length, 'phim mới và', episodesToAppend.length, 'tập...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'movies!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: moviesToAppend },
    });
    if (episodesToAppend.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'episodes!A1',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: episodesToAppend },
      });
    }
  }

  if (hasCopyAppend) {
    console.log('3a2. Append COPY', moviesToCopyAppend.length, 'phim và', episodesToCopyAppend.length, 'tập...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'movies!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: moviesToCopyAppend },
    });
    if (episodesToCopyAppend.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'episodes!A1',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: episodesToCopyAppend },
      });
    }
  }

  if (hasUpdate) {
    console.log('3b. Update', moviesToUpdate.length, 'phim (ghi đè row + episodes)...');
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const epSheet = meta.data.sheets?.find((s) => (s.properties?.title || '').toLowerCase() === 'episodes');
    const epSheetId = epSheet?.properties?.sheetId ?? 1;

    for (const { movie: m, sheetId: numericId, rowIndex } of moviesToUpdate) {
      const movieRow = buildMovieRow(m, movieHeaders, numericId);
      const lastCol = colToLetter(Math.max(0, movieHeaders.length - 1));
      const range = `movies!A${rowIndex}:${lastCol}${rowIndex}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [movieRow] },
      });
    }

    const allRowsToDelete = [];
    for (const { sheetId: numericId } of moviesToUpdate) {
      const rows = movieIdToEpRows.get(String(numericId)) || [];
      allRowsToDelete.push(...rows);
    }
    const sortedToDelete = [...new Set(allRowsToDelete)].sort((a, b) => b - a);
    if (sortedToDelete.length > 0) {
      const requests = sortedToDelete.map((rowIdx) => ({
        deleteDimension: {
          range: {
            sheetId: epSheetId,
            dimension: 'ROWS',
            startIndex: rowIdx,
            endIndex: rowIdx + 1,
          },
        },
      }));
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests },
      });
    }

    const allNewEpisodes = [];
    for (const { movie: m, sheetId: numericId } of moviesToUpdate) {
      const epRows = buildEpisodeRows(numericId, m, epHeaders);
      allNewEpisodes.push(...epRows);
    }
    if (allNewEpisodes.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'episodes!A1',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: allNewEpisodes },
      });
    }
  }

  console.log('   Hoàn tất export-to-sheets.');
}

main().catch((e) => {
  console.error('Export to sheets failed:', e?.message || e);
  process.exit(1);
});

