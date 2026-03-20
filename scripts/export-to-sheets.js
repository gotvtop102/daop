// Sync phim hiện có (OPhim + custom đã build) sang Google Sheets.
// Chỉ export: phim mới chưa có (append) hoặc phim đã có nhưng modified mới hơn (update row + ghi đè episodes).

import 'dotenv/config';
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
  const batchDir = path.join(PUBLIC_DATA, 'batches');
  const files = (await fs.readdir(batchDir)).filter((f) => /^batch_\d+_\d+\.js$/i.test(f));
  const moviesById = new Map();
  for (const f of files) {
    try {
      const raw = await fs.readFile(path.join(batchDir, f), 'utf8');
      const batch = parseWindowArray(raw, 'moviesBatch');
      for (const m of batch || []) {
        const idStr = String(m.id);
        moviesById.set(idStr, m);
      }
    } catch (e) {
      console.warn('   Skip batch file:', f, e.message);
    }
  }

  // TMDB data đã được tách riêng: tmdb_batch_<start>_<end>.js
  const tmdbFiles = (await fs.readdir(batchDir)).filter((f) => /^tmdb_batch_\d+_\d+\.js$/i.test(f));
  const tmdbById = new Map();
  for (const f of tmdbFiles) {
    try {
      const raw = await fs.readFile(path.join(batchDir, f), 'utf8');
      const batch = parseWindowArray(raw, 'moviesTmdbBatch');
      for (const m of batch || []) {
        const idStr = m && m.id != null ? String(m.id) : '';
        if (!idStr) continue;
        tmdbById.set(idStr, m);
      }
    } catch (e) {
      console.warn('   Skip tmdb batch file:', f, e.message);
    }
  }

  const out = [];
  for (const [idStr, base0] of moviesById.entries()) {
    const base = base0 || { id: String(idStr), episodes: [] };
    const t = tmdbById.get(idStr);
    if (t) {
      if (t.tmdb) base.tmdb = t.tmdb;
      if (t.imdb) base.imdb = t.imdb;
      if (t.cast) base.cast = t.cast;
      if (t.director) base.director = t.director;
      if (t.cast_meta) base.cast_meta = t.cast_meta;
      if (t.keywords) base.keywords = t.keywords;
    }
    out.push(base);
  }
  out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return out;
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
    const candidates = [];
    candidates.push(path.isAbsolute(keyPathEnv) ? keyPathEnv : path.join(ROOT, keyPathEnv));
    // Windows users sometimes set '/file.json' intending project-root-relative.
    if (keyPathEnv.startsWith('/')) {
      candidates.push(path.join(ROOT, keyPathEnv.slice(1)));
    }
    for (const p of candidates) {
      if (p && (await fs.pathExists(p))) {
        return fs.readJson(p);
      }
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

function getR2Base() {
  return String(process.env.R2_PUBLIC_URL || '').trim().replace(/\/$/, '');
}

function r2UrlById(id, folder) {
  const base = getR2Base();
  const idStr = String(id || '').trim();
  if (!base || !idStr) return '';
  return `${base}/${folder}/${idStr}.webp`;
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
  const thumbUrl = r2UrlById(movie.id, 'thumb') || expandImgUrl(movie.thumb || '');
  setIfExists('thumb_url', thumbUrl);
  setIfExists('thumb', thumbUrl);
  const derivedPoster = (!movie.poster && thumbUrl) ? derivePosterFromThumb(thumbUrl) : '';
  const posterUrl = r2UrlById(movie.id, 'poster') || expandImgUrl(movie.poster || '') || derivedPoster || thumbUrl || '';
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

function headerIndexFromHeaders(headers, name) {
  const lower = String(name || '').toLowerCase();
  let idx = headers.findIndex((h) => h === lower);
  if (idx >= 0) return idx;
  idx = headers.findIndex((h) => h === lower.replace('_', ' '));
  return idx;
}

function getEpisodeKeyFromRow(row, epHeaders) {
  const idxMovieId = headerIndexFromHeaders(epHeaders, 'movie_id') >= 0 ? headerIndexFromHeaders(epHeaders, 'movie_id') : 0;
  const idxEpCode = headerIndexFromHeaders(epHeaders, 'episode_code') >= 0 ? headerIndexFromHeaders(epHeaders, 'episode_code') : 1;
  const idxServerSlug = headerIndexFromHeaders(epHeaders, 'server_slug');
  const idxServerName = headerIndexFromHeaders(epHeaders, 'server_name');

  const movieId = String(row?.[idxMovieId] ?? '').trim();
  const epCode = String(row?.[idxEpCode] ?? '').trim();
  const serverSlug = idxServerSlug >= 0 ? String(row?.[idxServerSlug] ?? '').trim() : '';
  const serverName = idxServerName >= 0 ? String(row?.[idxServerName] ?? '').trim() : '';
  const serverKey = (serverSlug || serverName).toLowerCase();
  return `${movieId}||${epCode}||${serverKey}`;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

  /** episodeKey -> episode sheet row index (1-based) */
  const episodeKeyToSheetRow = new Map();
  for (let i = 1; i < episodesRows.length; i++) {
    const row = episodesRows[i];
    const key = getEpisodeKeyFromRow(row, epHeaders);
    if (!key) continue;
    if (!episodeKeyToSheetRow.has(key)) {
      episodeKeyToSheetRow.set(key, i + 1);
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
  const episodesToCopyUpdate = [];
  let copyEpisodesAppendCount = 0;
  let copyEpisodesOverwriteCount = 0;

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
        const copyMovieId = existing.id || m.id;
        const row = buildMovieRow(copyMovie, movieHeaders, copyMovieId);
        moviesToCopyAppend.push(row);

        // Đồng bộ episodes: add missing rows, overwrite link cells for existing rows.
        const localEpRows = buildEpisodeRows(copyMovieId, m, epHeaders);
        if (localEpRows.length) {
          const lastCol = colToLetter(Math.max(0, epHeaders.length - 1));
          const idxLinkM3U8 = headerIndexFromHeaders(epHeaders, 'link_m3u8');
          const idxLinkEmbed = headerIndexFromHeaders(epHeaders, 'link_embed');
          const idxLinkBackup = headerIndexFromHeaders(epHeaders, 'link_backup');
          const idxLinkVip1 = headerIndexFromHeaders(epHeaders, 'link_vip1');
          const idxLinkVip2 = headerIndexFromHeaders(epHeaders, 'link_vip2');
          const idxLinkVip3 = headerIndexFromHeaders(epHeaders, 'link_vip3');
          const idxLinkVip4 = headerIndexFromHeaders(epHeaders, 'link_vip4');
          const idxLinkVip5 = headerIndexFromHeaders(epHeaders, 'link_vip5');
          const linkIndices = [idxLinkM3U8, idxLinkEmbed, idxLinkBackup, idxLinkVip1, idxLinkVip2, idxLinkVip3, idxLinkVip4, idxLinkVip5].filter(
            (x) => x >= 0
          );

          for (const epRow of localEpRows) {
            const key = getEpisodeKeyFromRow(epRow, epHeaders);
            const existingSheetRow = episodeKeyToSheetRow.get(key);
            if (!existingSheetRow) {
              episodesToCopyAppend.push(epRow);
              copyEpisodesAppendCount++;
              continue;
            }

            const existingArr = episodesRows[existingSheetRow - 1] || [];
            const nextArr = [...existingArr];

            let changed = false;
            for (const idx of linkIndices) {
              const nextVal = String(epRow?.[idx] ?? '').trim();
              if (!nextVal) continue;
              const curVal = String(nextArr?.[idx] ?? '').trim();
              if (curVal !== nextVal) {
                nextArr[idx] = nextVal;
                changed = true;
              }
            }

            if (changed) {
              const range = `episodes!A${existingSheetRow}:${lastCol}${existingSheetRow}`;
              episodesToCopyUpdate.push({ range, values: [new Array(epHeaders.length).fill('').map((_, i) => nextArr[i] ?? '')] });
              copyEpisodesOverwriteCount++;
            }
          }
        }
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
    console.log('3a2a. COPY episodes overwrite:', copyEpisodesOverwriteCount);
    console.log('3a2b. COPY episodes append:', copyEpisodesAppendCount);
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'movies!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: moviesToCopyAppend },
    });

    if (episodesToCopyUpdate.length) {
      const batches = chunkArray(episodesToCopyUpdate, 100);
      for (const data of batches) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data,
          },
        });
      }
    }
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

