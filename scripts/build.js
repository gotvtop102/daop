/**
 * Build script: OPhim + Google Sheets + TMDB → static files + Supabase Admin config → JSON
 * Chạy: node scripts/build.js [--incremental]
 */
import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import slugify from 'slugify';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');
const BATCH_SIZE = 120;
const OPHIM_DELAY_MS = 200;

const OPHIM_BASE = process.env.OPHIM_BASE_URL || 'https://ophim1.com/v1/api';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;

/** Fallback: 23 thể loại + 45 quốc gia (OPhim) khi API lỗi/timeout */
const OPHIM_GENRES_FALLBACK = {
  'hanh-dong': 'Hành Động', 'tinh-cam': 'Tình Cảm', 'hai-huoc': 'Hài Hước', 'co-trang': 'Cổ Trang',
  'tam-ly': 'Tâm Lý', 'hinh-su': 'Hình Sự', 'chien-tranh': 'Chiến Tranh', 'the-thao': 'Thể Thao',
  'vo-thuat': 'Võ Thuật', 'vien-tuong': 'Viễn Tưởng', 'phieu-luu': 'Phiêu Lưu', 'khoa-hoc': 'Khoa Học',
  'kinh-di': 'Kinh Dị', 'am-nhac': 'Âm Nhạc', 'than-thoai': 'Thần Thoại', 'tai-lieu': 'Tài Liệu',
  'gia-dinh': 'Gia Đình', 'chinh-kich': 'Chính kịch', 'bi-an': 'Bí ẩn', 'hoc-duong': 'Học Đường',
  'kinh-dien': 'Kinh Điển', 'phim-18': 'Phim 18+', 'short-drama': 'Short Drama',
};
const OPHIM_COUNTRIES_FALLBACK = {
  'trung-quoc': 'Trung Quốc', 'han-quoc': 'Hàn Quốc', 'nhat-ban': 'Nhật Bản', 'thai-lan': 'Thái Lan',
  'au-my': 'Âu Mỹ', 'dai-loan': 'Đài Loan', 'hong-kong': 'Hồng Kông', 'an-do': 'Ấn Độ', 'anh': 'Anh',
  'phap': 'Pháp', 'canada': 'Canada', 'quoc-gia-khac': 'Quốc Gia Khác', 'duc': 'Đức',
  'tay-ban-nha': 'Tây Ban Nha', 'tho-nhi-ky': 'Thổ Nhĩ Kỳ', 'ha-lan': 'Hà Lan', 'indonesia': 'Indonesia',
  'nga': 'Nga', 'mexico': 'Mexico', 'ba-lan': 'Ba lan', 'uc': 'Úc', 'thuy-dien': 'Thụy Điển',
  'malaysia': 'Malaysia', 'brazil': 'Brazil', 'philippines': 'Philippines', 'bo-dao-nha': 'Bồ Đào Nha',
  'y': 'Ý', 'dan-mach': 'Đan Mạch', 'uae': 'UAE', 'na-uy': 'Na Uy', 'thuy-si': 'Thụy Sĩ',
  'chau-phi': 'Châu Phi', 'nam-phi': 'Nam Phi', 'ukraina': 'Ukraina', 'a-rap-xe-ut': 'Ả Rập Xê Út',
  'bi': 'Bỉ', 'ireland': 'Ireland', 'colombia': 'Colombia', 'phan-lan': 'Phần Lan', 'viet-nam': 'Việt Nam',
  'chile': 'Chile', 'hy-lap': 'Hy Lạp', 'nigeria': 'Nigeria', 'argentina': 'Argentina', 'singapore': 'Singapore',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

/** Fetch JSON from URL */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

const OPHIM_FETCH_TIMEOUT_MS = Number(process.env.OPHIM_FETCH_TIMEOUT_MS) || 25000;

/** Fetch JSON with timeout (tránh treo khi API chậm/không phản hồi) */
async function fetchJsonWithTimeout(url, timeoutMs = OPHIM_FETCH_TIMEOUT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

/** R2 client (S3 compatible) */
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

/** Upload buffer to R2, return public URL */
async function uploadToR2(buffer, key, contentType = 'image/webp') {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket) return null;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return base ? `${base}/${key}` : null;
}

/** Download image, convert to WebP, optional upload R2 */
async function processImage(url, slug, folder = 'thumbs') {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(buf).webp({ quality: 80 }).toBuffer();
    const key = `${folder}/${slug}.webp`;
    const r2Url = await uploadToR2(webp, key);
    return r2Url || url;
  } catch {
    return url;
  }
}

/** Giới hạn OPhim: số trang tối đa (0 = không giới hạn), số phim tối đa (0 = không giới hạn). Đặt env để tránh build quá lâu (vd: OPHIM_MAX_PAGES=5, OPHIM_MAX_MOVIES=500). */
const OPHIM_MAX_PAGES = Number(process.env.OPHIM_MAX_PAGES) || 0;
const OPHIM_MAX_MOVIES = Number(process.env.OPHIM_MAX_MOVIES) || 0;
/** Khoảng trang OPhim: cho phép chọn trang bắt đầu/kết thúc (0 = mặc định/không giới hạn). */
const OPHIM_START_PAGE = Number(process.env.OPHIM_START_PAGE) || 1;
const OPHIM_END_PAGE = Number(process.env.OPHIM_END_PAGE) || 0;

/** 1. Thu thập phim từ OPhim */
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

async function loadPreviousBuiltMoviesById() {
  try {
    const moviesLightPath = path.join(PUBLIC_DATA, 'movies-light.js');
    const batchDir = path.join(PUBLIC_DATA, 'batches');
    if (!(await fs.pathExists(batchDir))) return new Map();
    const byId = new Map();
    if (await fs.pathExists(moviesLightPath)) {
      const mlRaw = await fs.readFile(moviesLightPath, 'utf8');
      const light = parseWindowArray(mlRaw, 'moviesLight');
      for (const m of light || []) {
        if (m && m.id != null) byId.set(String(m.id), { ...m, episodes: [] });
      }
    }
    const files = (await fs.readdir(batchDir)).filter((f) => /^batch_\d+_\d+\.js$/i.test(f));
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(batchDir, f), 'utf8');
        const batch = parseWindowArray(raw, 'moviesBatch');
        for (const bm of batch || []) {
          const idStr = bm && bm.id != null ? String(bm.id) : '';
          if (!idStr) continue;
          const cur = byId.get(idStr);
          if (cur) byId.set(idStr, { ...cur, ...bm });
          else byId.set(idStr, bm);
        }
      } catch {}
    }
    return byId;
  } catch {
    return new Map();
  }
}

async function loadPreviousBuiltTmdbById() {
  try {
    const batchDir = path.join(PUBLIC_DATA, 'batches');
    if (!(await fs.pathExists(batchDir))) return new Map();
    const byId = new Map();
    const files = (await fs.readdir(batchDir)).filter((f) => /^tmdb_batch_\d+_\d+\.js$/i.test(f));
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(batchDir, f), 'utf8');
        const batch = parseWindowArray(raw, 'moviesTmdbBatch');
        for (const bm of batch || []) {
          const idStr = bm && bm.id != null ? String(bm.id) : '';
          if (!idStr) continue;
          byId.set(idStr, bm);
        }
      } catch {}
    }
    return byId;
  } catch {
    return new Map();
  }
}

async function loadOphimIndex() {
  const p = path.join(PUBLIC_DATA, 'ophim_index.json');
  try {
    if (!(await fs.pathExists(p))) return {};
    return JSON.parse(await fs.readFile(p, 'utf8')) || {};
  } catch {
    return {};
  }
}

async function saveOphimIndex(index) {
  const p = path.join(PUBLIC_DATA, 'ophim_index.json');
  try {
    await fs.writeFile(p, JSON.stringify(index || {}, null, 2), 'utf8');
  } catch {}
}

async function fetchOPhimMovies(prevMoviesById, prevIndex) {
  const list = [];
  const nextIndex = {};
  const reused = { count: 0 };
  const fetched = { count: 0 };
  let page = OPHIM_START_PAGE > 0 ? OPHIM_START_PAGE : 1;
  let fetchedPages = 0;
  const targetEnd = OPHIM_END_PAGE > 0 ? OPHIM_END_PAGE : 1;
  const step = page >= targetEnd ? -1 : 1;
  while (true) {
    if (OPHIM_MAX_PAGES > 0 && fetchedPages >= OPHIM_MAX_PAGES) {
      console.log('   OPhim: đạt giới hạn số trang:', OPHIM_MAX_PAGES, '(từ trang', OPHIM_START_PAGE, ')');
      break;
    }
    if (OPHIM_MAX_MOVIES > 0 && list.length >= OPHIM_MAX_MOVIES) {
      console.log('   OPhim: đạt giới hạn số phim:', OPHIM_MAX_MOVIES);
      break;
    }
    if (step === 1) {
      if (OPHIM_END_PAGE > 0 && page > OPHIM_END_PAGE) {
        console.log('   OPhim: đạt giới hạn khoảng trang đến:', OPHIM_END_PAGE);
        break;
      }
    } else {
      if (page < targetEnd) {
        console.log('   OPhim: đã lùi đến trang', targetEnd, 'dừng lại.');
        break;
      }
    }
    // API mặc định: 24 phim / trang (trang 1 = mới nhất)
    const url = `${OPHIM_BASE}/danh-sach/phim-moi?page=${page}&limit=24`;
    let data;
    try {
      data = await fetchJsonWithTimeout(url);
    } catch (e) {
      console.warn('OPhim list page', page, 'failed:', e.message);
      break;
    }
    const items = data?.data?.items || [];
    if (items.length === 0) break;
    console.log('   OPhim page', page, 'items:', items.length, 'total:', list.length);
    for (const item of items) {
      if (OPHIM_MAX_MOVIES > 0 && list.length >= OPHIM_MAX_MOVIES) break;
      const slug = item?.slug;
      const rawId = item?._id || item?.id || '';
      const idStr = rawId ? String(rawId) : '';
      if (!slug) continue;

      const rawModified =
        (item?.modified && typeof item.modified === 'object' && item.modified.time)
          ? item.modified.time
          : (item?.modified || item?.updated_at || item?.updatedAt || item?.createdAt || '');
      const modifiedStr = rawModified ? String(rawModified) : '';

      const prev = idStr ? prevIndex?.[idStr] : null;
      const isChanged = !idStr || !prev || (modifiedStr && prev.modified !== modifiedStr);

      if (!isChanged && idStr && prevMoviesById && prevMoviesById.has(idStr)) {
        const reusedMovie = prevMoviesById.get(idStr);
        if (reusedMovie) {
          list.push({ ...reusedMovie, _skip_tmdb: true });
          nextIndex[idStr] = { slug: slug.toString().toLowerCase(), modified: prev.modified || modifiedStr || '' };
          reused.count++;
          continue;
        }
      }

      await sleep(OPHIM_DELAY_MS);
      try {
        const detail = await fetchJsonWithTimeout(`${OPHIM_BASE}/phim/${slug}`);
        const movie = detail?.data?.item || detail?.data?.movie || detail?.data;
        if (!movie) continue;
        const cdnBase = (detail?.data?.APP_DOMAIN_CDN_IMAGE || '').replace(/\/$/, '') || 'https://img.ophim.live';
        const m = normalizeOPhimMovie(movie, slug, cdnBase);
        list.push({ ...m, _skip_tmdb: false });
        const finalId = m && m.id != null ? String(m.id) : idStr;
        if (finalId) {
          nextIndex[finalId] = { slug: m.slug || slug.toString().toLowerCase(), modified: m.modified || modifiedStr || '' };
        }
        fetched.count++;
      } catch (e) {
        console.warn('OPhim detail skip:', slug, e.message);
      }
    }
    fetchedPages++;
    page += step;
  }
  console.log('   OPhim reused:', reused.count, ', fetched detail:', fetched.count);
  await saveOphimIndex(nextIndex);
  return list;
}

function normalizeOPhimMovie(m, slug, cdnBase = 'https://img.ophim.live') {
  const rawId = m._id || m.id || `ophim_${slug}`;
  const id = String(rawId);
  const rawSlug = (m.slug || slug || '').toString().trim();
  const slugNorm = rawSlug ? rawSlug.toLowerCase() : '';
  const quality = (m.quality || '').toLowerCase();
  const is4k = /4k|uhd|2160p/.test(quality);
  const thumbRaw = m.thumb_url || m.poster_url || m.thumb || '';
  const posterRaw = m.poster_url || m.poster || m.thumb || '';
  const thumb = thumbRaw && !/^https?:\/\//i.test(thumbRaw)
    ? `${cdnBase}/uploads/movies/${thumbRaw.replace(/^\/+/, '')}`
    : thumbRaw;
  const poster = posterRaw && !/^https?:\/\//i.test(posterRaw)
    ? `${cdnBase}/uploads/movies/${posterRaw.replace(/^\/+/, '')}`
    : posterRaw;
  return {
    id,
    _id: id,
    title: m.name || m.title || '',
    origin_name: m.origin_name || m.original_title || '',
    slug: slugNorm || id,
    thumb: compactOphimImgUrl(thumb),
    poster: compactOphimImgUrl(poster),
    year: m.year || '',
    type: m.type || 'single',
    genre: m.category?.map((c) => ({ id: c.id, name: c.name, slug: c.slug || slugify(c.name, { lower: true }) })) || [],
    country: m.country?.map((c) => ({ id: c.id, name: c.name, slug: c.slug || slugify(c.name, { lower: true }) })) || [],
    lang_key: m.lang || '',
    episode_current: m.episode_current || m.episodes?.length || '1',
    quality: m.quality || '',
    is_4k: is4k,
    is_exclusive: false,
    status: '',
    showtimes: '',
    chieurap: m.chieurap || false,
    sub_docquyen: m.sub_docquyen || false,
    episodes: m.episodes || [],
    time: m.time,
    description: m.content || m.description || '',
    tmdb: m.tmdb || null,
    modified:
      (m.modified && typeof m.modified === 'object' && m.modified.time)
        ? m.modified.time
        : (m.modified || m.updated_at || new Date().toISOString()),
  };
}

const OPHIM_IMG_DOMAIN = 'https://img.ophim.live';

function compactOphimImgUrl(url) {
  if (!url) return '';
  const u = String(url).trim();
  if (!u) return '';
  const domain = OPHIM_IMG_DOMAIN.replace(/\/$/, '');
  if (u.startsWith(domain + '/')) return u.slice(domain.length);
  return u;
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

function dedupeThumbPoster(m) {
  if (!m || !m.thumb || !m.poster) return;
  const derived = derivePosterFromThumb(m.thumb);
  if (derived && String(m.poster) === String(derived)) {
    m.poster = '';
  }
}

async function loadServiceAccountFromEnv(readWrite) {
  // Ưu tiên JSON nguyên từ env (an toàn hơn, không cần commit file key)
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
  if (!readWrite) return null;
  // Fallback cũ: file JSON mặc định trong repo (không khuyến khích, chỉ dùng local)
  const defaultPath = path.join(ROOT, 'gotv-394615-89fa7961dcb3.json');
  if (await fs.pathExists(defaultPath)) {
    return fs.readJson(defaultPath);
  }
  return null;
}

/** 2. Đọc Google Sheets (hoặc Excel fallback) */
async function fetchCustomMovies() {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  const key = await loadServiceAccountFromEnv(false);
  if (sheetId && key) {
    try {
      const { google } = await import('googleapis');
      const auth = new google.auth.GoogleAuth({
        credentials: key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const res = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: sheetId,
        ranges: ['movies!A1:Z1000', 'episodes!A1:Z2000'],
      });
      const valueRanges = res.data.valueRanges || [];
      const moviesRows = valueRanges[0]?.values || [];
      const episodesRows = valueRanges[1]?.values || [];
      const movies = parseSheetMovies(moviesRows, episodesRows, { sheetId });
      return movies.filter((m) => {
        const st = (m && m._sheetUpdateStatus ? String(m._sheetUpdateStatus) : '').toUpperCase();
        return st === 'NEW' || st === 'NEW2';
      });
    } catch (e) {
      console.warn('Google Sheets fetch failed, fallback Excel (nếu có):', e.message);
    }
  }
  const xlsxPath = path.join(ROOT, 'custom_movies.xlsx');
  if (await fs.pathExists(xlsxPath)) {
    const wb = XLSX.readFile(xlsxPath);
    const moviesSheet = wb.Sheets['movies'] || wb.Sheets[wb.SheetNames[0]];
    const episodesSheet = wb.Sheets['episodes'];
    const moviesRows = XLSX.utils.sheet_to_json(moviesSheet, { header: 1 });
    const episodesRows = episodesSheet ? XLSX.utils.sheet_to_json(episodesSheet, { header: 1 }) : [];
    const movies = parseSheetMovies(moviesRows, episodesRows);
    return movies.filter((m) => {
      const st = (m && m._sheetUpdateStatus ? String(m._sheetUpdateStatus) : '').toUpperCase();
      return st === 'NEW' || st === 'NEW2';
    });
  }
  return [];
}

function parseSheetMovies(moviesRows, episodesRows, opts) {
  opts = opts || {};
  if (moviesRows.length < 2) return [];
  const headers = moviesRows[0].map((h) => (h || '').toString().toLowerCase().trim());
  const idx = (name) => {
    const i = headers.indexOf(name);
    return i >= 0 ? i : headers.indexOf(name.replace('_', ' '));
  };
  const idxUpdate = idx('update');
  const idxModified = idx('modified');
  const idxSlug = idx('slug');
  const movies = [];
  for (let i = 1; i < moviesRows.length; i++) {
    const row = moviesRows[i];
    const title = row[idx('title')] || row[idx('name')] || '';
    if (!title) continue;
    const extId = `ext_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`;
    const idValue = (row[idx('id')] ?? '').toString().trim();
    const movieId = idValue || extId;
    const slugFromSheet = (row[idx('slug')] ?? '').toString().trim();
    const baseSlug = slugFromSheet || slugify((row[idx('title')] || '').toString(), { lower: true }) || extId;
    const genre = (row[idx('genre')] || '')
      .toString()
      .split(',')
      .map((g) => ({ name: g.trim(), slug: slugify(g.trim(), { lower: true }) }));
    const country = (row[idx('country')] || '')
      .toString()
      .split(',')
      .map((c) => ({ name: c.trim(), slug: slugify(c.trim(), { lower: true }) }));
    const quality = (row[idx('quality')] || '').toString();
    const is4k = /4k|uhd|2160p/i.test(quality);
    const updateRaw = (idxUpdate >= 0 ? (row[idxUpdate] ?? '') : '').toString().trim();
    const updateStatus = updateRaw ? updateRaw.toUpperCase() : '';
    const sheetModified = (idxModified >= 0 ? (row[idxModified] ?? '') : '').toString().trim();
    const movie = {
      id: movieId,
      title: title.toString(),
      origin_name: (row[idx('origin_name')] || '').toString(),
      slug: baseSlug,
      thumb: (row[idx('thumb_url')] || row[idx('thumb')] || '').toString(),
      poster: '',
      year: (row[idx('year')] || '').toString(),
      type: (row[idx('type')] || 'single').toString(),
      genre,
      country,
      lang_key: (row[idx('lang_key')] || row[idx('language')] || '').toString(),
      episode_current: (row[idx('episode_current')] || '1').toString(),
      quality,
      modified: (idxModified >= 0 ? sheetModified : new Date().toISOString()),
      is_4k: is4k,
      is_exclusive: Boolean(row[idx('is_exclusive')]),
      status: (row[idx('status')] || '').toString(),
      showtimes: (row[idx('showtimes')] || '').toString(),
      chieurap: false,
      sub_docquyen: false,
      episodes: [],
      description: (row[idx('description')] || row[idx('content')] || '').toString(),
      tmdb_id: row[idx('tmdb_id')] ? Number(row[idx('tmdb_id')]) : null,
      cast: [],
      director: [],
      keywords: [],
    };

    // NEW/NEW2: ép modified=now để chắc chắn build lại/batch thay đổi, và lưu info để update lại sheet NEW->OK/NEW2->OK2 sau build.
    if (updateStatus === 'NEW' || updateStatus === 'NEW2') {
      movie.modified = new Date().toISOString();
      movie._sheetUpdateStatus = updateStatus;
    } else if (updateStatus) {
      movie._sheetUpdateStatus = updateStatus;
    }
    if (opts.sheetId) {
      movie._sheetId = opts.sheetId;
      movie._sheetRowNumber = i + 1;
      movie._sheetUpdateColIndex = idxUpdate;
      movie._sheetSlugColIndex = idxSlug;
      movie._sheetOriginalSlug = baseSlug;
    }

    movies.push(movie);
  }
  // Không tự sửa slug ở đây nữa. Việc chống trùng slug sẽ xử lý trong mergeMovies
  // (để xét cả trùng với OPhim), và sẽ sync ngược slug mới về sheet nếu có.
  const epHeaders = episodesRows[0]?.map((h) => (h || '').toString().toLowerCase().trim()) || [];
  const epIdx = (name) => {
    const i = epHeaders.indexOf(name);
    return i >= 0 ? i : epHeaders.indexOf(name.replace('_', ' '));
  };
  const movieIdCol = epIdx('movie_id') >= 0 ? 'movie_id' : epHeaders.find((h) => h.includes('movie'));
  const movieBySlug = Object.fromEntries(movies.map((m) => [m.slug, m]));
  const movieByTitle = Object.fromEntries(movies.map((m) => [(m.title || '').toString().trim(), m]));

  // Chỉ hỗ trợ kiểu MỚI: mỗi dòng = 1 tập trên 1 server
  const idxMovieIdCol = epHeaders.indexOf(movieIdCol);
  const idxEpCode = epIdx('episode_code') >= 0 ? epIdx('episode_code') : epIdx('episode');
  const idxEpName = epIdx('episode_name') >= 0 ? epIdx('episode_name') : epIdx('name');
  const idxServerSlug = epIdx('server_slug');
  const idxServerName = epIdx('server_name');
  const idxLinkM3U8 = epIdx('link_m3u8');
  const idxLinkEmbed = epIdx('link_embed');
  const idxLinkBackup = epIdx('link_backup');
  const idxLinkVip1 = epIdx('link_vip1');
  const idxLinkVip2 = epIdx('link_vip2');
  const idxLinkVip3 = epIdx('link_vip3');
  const idxLinkVip4 = epIdx('link_vip4');
  const idxLinkVip5 = epIdx('link_vip5');

  const serverGroupsByMovie = new Map();

  for (let i = 1; i < episodesRows.length; i++) {
    const row = episodesRows[i];
    const mid = (idxMovieIdCol >= 0 ? row[idxMovieIdCol] : row[0])?.toString()?.trim() || '';
    const movie =
      movies.find((m) => String(m.id) === String(mid) || m.slug === mid) ||
      movieByTitle[mid] ||
      (mid && movieBySlug[slugify(mid, { lower: true })]);
    if (!movie) continue;

    const epCode = (idxEpCode >= 0 ? row[idxEpCode] : '')?.toString()?.trim() || String(i);
    const epName = (idxEpName >= 0 ? row[idxEpName] : '')?.toString()?.trim() || `Tập ${epCode}`;
    const serverSlugRaw = (idxServerSlug >= 0 ? row[idxServerSlug] : '')?.toString()?.trim();
    const serverNameRaw = (idxServerName >= 0 ? row[idxServerName] : '')?.toString()?.trim();
    const serverSlug = serverSlugRaw || slugify(serverNameRaw || 'default', { lower: true }) || 'default';
    const serverName = serverNameRaw || serverSlug;

    const linkM3U8 = (idxLinkM3U8 >= 0 ? row[idxLinkM3U8] : '')?.toString()?.trim() || '';
    const linkEmbed = (idxLinkEmbed >= 0 ? row[idxLinkEmbed] : '')?.toString()?.trim() || '';
    const linkBackup = (idxLinkBackup >= 0 ? row[idxLinkBackup] : '')?.toString()?.trim() || '';
    const linkVip1 = (idxLinkVip1 >= 0 ? row[idxLinkVip1] : '')?.toString()?.trim() || '';
    const linkVip2 = (idxLinkVip2 >= 0 ? row[idxLinkVip2] : '')?.toString()?.trim() || '';
    const linkVip3 = (idxLinkVip3 >= 0 ? row[idxLinkVip3] : '')?.toString()?.trim() || '';
    const linkVip4 = (idxLinkVip4 >= 0 ? row[idxLinkVip4] : '')?.toString()?.trim() || '';
    const linkVip5 = (idxLinkVip5 >= 0 ? row[idxLinkVip5] : '')?.toString()?.trim() || '';

    const src = {
      name: epName,
      slug: slugify(epCode || epName, { lower: true }),
    };
    if (linkEmbed) src.link_embed = linkEmbed;
    if (linkM3U8) src.link_m3u8 = linkM3U8;
    if (linkBackup) src.link_backup = linkBackup;
    if (linkVip1) src.link_vip1 = linkVip1;
    if (linkVip2) src.link_vip2 = linkVip2;
    if (linkVip3) src.link_vip3 = linkVip3;
    if (linkVip4) src.link_vip4 = linkVip4;
    if (linkVip5) src.link_vip5 = linkVip5;

    let groups = serverGroupsByMovie.get(movie);
    if (!groups) {
      groups = new Map();
      serverGroupsByMovie.set(movie, groups);
    }
    let group = groups.get(serverSlug);
    if (!group) {
      group = { name: serverName, slug: serverSlug, server_name: serverName, server_data: [] };
      groups.set(serverSlug, group);
    }
    group.server_data.push(src);
  }

  for (const [movie, groups] of serverGroupsByMovie.entries()) {
    movie.episodes = movie.episodes || [];
    for (const grp of groups.values()) {
      movie.episodes.push(grp);
    }
  }
  return movies;
}

async function applySheetUpdateStatuses(movies) {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) return;

  const need = (movies || []).filter(
    (m) =>
      m &&
      (m._sheetUpdateStatus === 'NEW' || m._sheetUpdateStatus === 'NEW2') &&
      m._sheetRowNumber &&
      m._sheetUpdateColIndex >= 0
  );

  const slugFix = (movies || []).filter(
    (m) =>
      m &&
      m._sheetId &&
      m._sheetRowNumber &&
      m._sheetSlugColIndex >= 0 &&
      m._sheetOriginalSlug &&
      m.slug &&
      String(m.slug) !== String(m._sheetOriginalSlug)
  );

  if (!need.length && !slugFix.length) return;

  try {
    const key = await loadServiceAccountFromEnv(true);
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    for (const m of need) {
      const col = colToLetter(m._sheetUpdateColIndex);
      const rowNum = Number(m._sheetRowNumber);
      const range = `movies!${col}${rowNum}`;
      const newVal = m._sheetUpdateStatus === 'NEW2' ? 'OK2' : 'OK';
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [[newVal]] },
      });
    }

    for (const m of slugFix) {
      const col = colToLetter(m._sheetSlugColIndex);
      const rowNum = Number(m._sheetRowNumber);
      const range = `movies!${col}${rowNum}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [[String(m.slug)]] },
      });
    }

    if (need.length) {
      console.log('   Google Sheets: updated', need.length, 'rows update NEW/NEW2 -> OK/OK2');
    }
    if (slugFix.length) {
      console.log('   Google Sheets: updated', slugFix.length, 'rows slug (auto-fix collisions)');
    }
  } catch (e) {
    console.warn('   Google Sheets: failed to sync update statuses / slugs:', e?.message || e);
  }
}

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_LANG = 'vi-VN';

const _tmdbPersonNameViCache = new Map();

async function getTmdbPersonNameVi(personId) {
  const id = String(personId || '').trim();
  if (!id) return null;
  if (_tmdbPersonNameViCache.has(id)) return _tmdbPersonNameViCache.get(id);
  if (!TMDB_KEY) {
    _tmdbPersonNameViCache.set(id, null);
    return null;
  }
  await sleep(80);
  try {
    const res = await fetchJson(`${TMDB_BASE}/person/${id}/translations?api_key=${TMDB_KEY}`).catch(() => null);
    const arr = (res && res.translations) ? res.translations : [];
    const vi = Array.isArray(arr) ? arr.find((t) => t && t.iso_639_1 === 'vi') : null;
    const nameVi = vi && vi.data && vi.data.name ? String(vi.data.name).trim() : '';
    const out = nameVi || null;
    _tmdbPersonNameViCache.set(id, out);
    return out;
  } catch {
    _tmdbPersonNameViCache.set(id, null);
    return null;
  }
}

/** 3. Làm giàu TMDB (credits, keywords, poster khi thiếu) */
async function enrichTmdb(movies) {
  if (!TMDB_KEY) return;
  for (const m of movies) {
    const tid = m.tmdb?.id || m.tmdb_id;
    if (!tid) continue;
    const type = (m.type || 'movie') === 'single' ? 'movie' : 'tv';
    await sleep(150);
    try {
      const [detailRes, creditsRes, keywordsRes] = await Promise.all([
        fetchJson(`${TMDB_BASE}/${type}/${tid}?api_key=${TMDB_KEY}&language=${TMDB_LANG}`).catch(() => null),
        fetchJson(`${TMDB_BASE}/${type}/${tid}/credits?api_key=${TMDB_KEY}`),
        fetchJson(`${TMDB_BASE}/${type}/${tid}/keywords?api_key=${TMDB_KEY}`).catch(() => ({ keywords: [] })),
      ]);
      const castMeta = [];
      for (const c of (creditsRes.cast || []).slice(0, 15)) {
        const nameVi = await getTmdbPersonNameVi(c.id);
        castMeta.push({
          name: nameVi || c.name,
          name_vi: nameVi || null,
          name_original: c.name,
          tmdb_id: c.id,
          profile: c.profile_path ? (TMDB_IMG_BASE + c.profile_path) : null,
          tmdb_url: c.id ? `https://www.themoviedb.org/person/${c.id}` : null,
        });
      }
      const cast = castMeta.map((c) => c.name);
      const director = (creditsRes.crew || []).filter((c) => c.job === 'Director').map((c) => c.name);
      const keywords = (keywordsRes.keywords || []).map((k) => k.name);
      m.cast = m.cast?.length ? m.cast : cast;
      m.cast_meta = Array.isArray(m.cast_meta) && m.cast_meta.length ? m.cast_meta : castMeta;
      m.director = m.director?.length ? m.director : director;
      m.keywords = m.keywords?.length ? m.keywords : keywords;
      if (!m.poster && detailRes?.poster_path) {
        m.poster = TMDB_IMG_BASE + detailRes.poster_path;
      }
    } catch {}
  }
}

/** 4. Hợp nhất và xử lý ảnh (optional: upload R2) */
function mergeMovies(ophim, custom) {
  const bySlug = new Map();
  for (const m of ophim) {
    if (!m || !m.slug) continue;
    if (bySlug.has(m.slug)) {
      console.warn('   Duplicate slug from OPhim, keep first:', m.slug);
      continue;
    }
    bySlug.set(m.slug, m);
  }

  function ensureUniqueSlug(base, used) {
    const raw = (base || '').toString().trim();
    let s = raw;
    let n = 1;
    while (s && used.has(s)) {
      n++;
      s = raw + '-' + n;
    }
    return s;
  }

  const usedSlugs = new Set(bySlug.keys());

  // Custom (từ Google Sheets/Excel):
  // - NEW/NEW2: luôn được build (build mới / build lại), nhưng nếu trùng slug với OPhim/custom thì auto thêm hậu tố và sync ngược lại sheet.
  // - OK/OK2/COPY/COPY2: vẫn được dùng như nguồn custom nếu không đụng OPhim; nếu slug trùng OPhim thì giữ OPhim và bỏ qua custom.
  for (const m of custom) {
    if (!m || !m.slug) continue;
    const st = (m._sheetUpdateStatus || '').toString().toUpperCase();
    const isNew = st === 'NEW' || st === 'NEW2';

    const exists = usedSlugs.has(m.slug);
    if (exists) {
      if (isNew) {
        const old = m.slug;
        const fixed = ensureUniqueSlug(old, usedSlugs);
        if (fixed && fixed !== old) {
          m.slug = fixed;
          usedSlugs.add(fixed);
        }
      } else {
        console.warn('   Sheet movie skipped (slug collision, not NEW/NEW2):', m.slug, st || '(empty)');
        continue;
      }
    } else {
      usedSlugs.add(m.slug);
    }

    bySlug.set(m.slug, m);
  }
  const merged = Array.from(bySlug.values());

  // Validate duplicates (id/slug) to avoid corrupt batch lookup and routing.
  const seenIds = new Set();
  const seenSlugs = new Set();
  for (const m of merged) {
    const idStr = m && m.id != null ? String(m.id) : '';
    const slugStr = m && m.slug != null ? String(m.slug) : '';
    if (slugStr) {
      if (seenSlugs.has(slugStr)) console.warn('   Duplicate slug in merged output:', slugStr);
      seenSlugs.add(slugStr);
    }
    if (idStr) {
      if (seenIds.has(idStr)) console.warn('   Duplicate id in merged output:', idStr, 'slug:', slugStr);
      seenIds.add(idStr);
    }
  }

  for (const m of merged) {
    if (m && m.thumb) m.thumb = compactOphimImgUrl(m.thumb);
    dedupeThumbPoster(m);
    // Không lưu poster trong output. Poster sẽ được suy ra từ thumb ở frontend / export.
    if (m) m.poster = '';
  }
  return merged;
}

/** 5. Tạo movies-light.js (cùng thứ tự sắp xếp theo id như batch để getBatchPath tính đúng) */
function writeMoviesLight(movies) {
  const sorted = [...movies].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const light = sorted.map((m) => ({
    id: String(m.id),
    title: m.title,
    origin_name: m.origin_name || '',
    slug: m.slug,
    thumb: m.thumb,
    year: m.year,
    type: m.type,
    genre: m.genre,
    country: m.country,
    lang_key: m.lang_key,
    episode_current: m.episode_current,
    quality: m.quality,
    status: m.status || '',
    showtimes: m.showtimes || '',
    is_4k: m.is_4k,
    is_exclusive: m.is_exclusive || false,
    chieurap: m.chieurap,
    sub_docquyen: m.sub_docquyen,
    modified: m.modified,
  }));
  const content = `window.moviesLight = ${JSON.stringify(light)};`;
  fs.writeFileSync(path.join(PUBLIC_DATA, 'movies-light.js'), content, 'utf8');
}

function normalizeSearchText(s) {
  if (!s) return '';
  let t = String(s).toLowerCase();
  try {
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {}
  t = t.replace(/đ/g, 'd');
  t = t.replace(/[^a-z0-9]+/g, ' ').trim();
  return t;
}

function getShardKey2(s) {
  const t = normalizeSearchText(s);
  if (!t) return '__';
  const a = (t[0] || '').toLowerCase();
  const b = (t[1] || '_').toLowerCase();
  const ok = (c) => /[a-z0-9]/.test(c);
  const c1 = ok(a) ? a : '_';
  const c2 = ok(b) ? b : '_';
  return `${c1}${c2}`;
}

function hashStringDjb2(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}

function splitObjectBySize(keyToObj, maxBytes, keySelector) {
  const keys = Object.keys(keyToObj || {});
  if (!keys.length) return { parts: 1, buckets: [{ ...keyToObj }] };

  const rawLen = Buffer.byteLength(JSON.stringify(keyToObj), 'utf8');
  if (rawLen <= maxBytes) return { parts: 1, buckets: [{ ...keyToObj }] };

  let parts = 2;
  while (parts <= 64) {
    const buckets = Array.from({ length: parts }, () => ({}));
    for (const k of keys) {
      const sel = keySelector ? keySelector(k, keyToObj[k]) : k;
      const idx = hashStringDjb2(sel) % parts;
      buckets[idx][k] = keyToObj[k];
    }
    let ok = true;
    for (const b of buckets) {
      const len = Buffer.byteLength(JSON.stringify(b), 'utf8');
      if (len > maxBytes) { ok = false; break; }
    }
    if (ok) return { parts, buckets };
    parts *= 2;
  }
  const buckets = Array.from({ length: 64 }, () => ({}));
  for (const k of keys) {
    const sel = keySelector ? keySelector(k, keyToObj[k]) : k;
    const idx = hashStringDjb2(sel) % 64;
    buckets[idx][k] = keyToObj[k];
  }
  return { parts: 64, buckets };
}

function splitArrayBySize(arr, maxBytes, keySelector) {
  const list = Array.isArray(arr) ? arr : [];
  if (!list.length) return { parts: 1, buckets: [[]] };

  const rawLen = Buffer.byteLength(JSON.stringify(list), 'utf8');
  if (rawLen <= maxBytes) return { parts: 1, buckets: [list.slice(0)] };

  let parts = 2;
  while (parts <= 64) {
    const buckets = Array.from({ length: parts }, () => []);
    for (const it of list) {
      const sel = keySelector ? keySelector(it) : (it && (it.slug || it.id) ? String(it.slug || it.id) : '');
      const idx = hashStringDjb2(sel) % parts;
      buckets[idx].push(it);
    }
    let ok = true;
    for (const b of buckets) {
      const len = Buffer.byteLength(JSON.stringify(b), 'utf8');
      if (len > maxBytes) { ok = false; break; }
    }
    if (ok) return { parts, buckets };
    parts *= 2;
  }
  const buckets = Array.from({ length: 64 }, () => []);
  for (const it of list) {
    const sel = keySelector ? keySelector(it) : (it && (it.slug || it.id) ? String(it.slug || it.id) : '');
    const idx = hashStringDjb2(sel) % 64;
    buckets[idx].push(it);
  }
  return { parts: 64, buckets };
}

function writeIndexAndSearchShards(movies) {
  const BATCH = 120;
  const maxBytes = Math.max(50_000, parseInt(process.env.SHARD_MAX_BYTES || '300000', 10) || 300000);
  const sorted = [...movies].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const outIndexDir = path.join(PUBLIC_DATA, 'index');
  const outSlugDir = path.join(outIndexDir, 'slug');
  const outIdDir = path.join(outIndexDir, 'id');
  const outSearchDir = path.join(PUBLIC_DATA, 'search');
  const outPrefixDir = path.join(outSearchDir, 'prefix');
  fs.ensureDirSync(outSlugDir);
  fs.ensureDirSync(outIdDir);
  fs.ensureDirSync(outPrefixDir);

  const slugIndexByShard = new Map();
  const idIndexByShard = new Map();
  const searchByShard = new Map();

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    if (!m) continue;
    const idStr = m.id != null ? String(m.id) : '';
    const slugStr = m.slug != null ? String(m.slug) : '';
    if (!idStr) continue;

    const idShard = getShardKey2(idStr);
    if (!idIndexByShard.has(idShard)) idIndexByShard.set(idShard, {});
    idIndexByShard.get(idShard)[idStr] = {
      i,
      id: idStr,
      title: m.title,
      origin_name: m.origin_name || '',
      slug: slugStr,
      thumb: m.thumb,
      year: m.year,
      type: m.type,
      episode_current: m.episode_current,
      lang_key: m.lang_key,
      is_4k: m.is_4k,
      is_exclusive: m.is_exclusive || false,
      sub_docquyen: m.sub_docquyen,
      chieurap: m.chieurap,
    };

    if (slugStr) {
      const slugShard = getShardKey2(slugStr);
      if (!slugIndexByShard.has(slugShard)) slugIndexByShard.set(slugShard, {});
      slugIndexByShard.get(slugShard)[slugStr] = {
        id: idStr,
        i,
        title: m.title,
        origin_name: m.origin_name || '',
        slug: slugStr,
        thumb: m.thumb,
        year: m.year,
        type: m.type,
        episode_current: m.episode_current,
      };
    }

    const baseText = normalizeSearchText(`${m.title || ''} ${m.origin_name || ''} ${m.slug || ''}`);
    const tokens = baseText ? Array.from(new Set(baseText.split(/\s+/).filter(Boolean))) : [];
    const tokenShardSet = new Set(tokens.map(getShardKey2));
    if (slugStr) tokenShardSet.add(getShardKey2(slugStr));
    if (m.title) tokenShardSet.add(getShardKey2(m.title));

    const item = {
      id: idStr,
      title: m.title,
      origin_name: m.origin_name || '',
      slug: slugStr,
      thumb: m.thumb,
      year: m.year,
      type: m.type,
      episode_current: m.episode_current,
      _t: baseText,
    };

    tokenShardSet.forEach((k) => {
      if (!searchByShard.has(k)) searchByShard.set(k, []);
      searchByShard.get(k).push(item);
    });
  }

  const meta = { total: sorted.length, batchSize: BATCH };
  fs.writeFileSync(path.join(outIndexDir, 'meta.json'), JSON.stringify(meta), 'utf8');

  const slugMeta = { maxBytes, parts: {} };
  for (const [k, map] of slugIndexByShard.entries()) {
    const spl = splitObjectBySize(map, maxBytes, (slug) => slug);
    slugMeta.parts[k] = spl.parts;
    if (spl.parts <= 1) {
      const content = `window.DAOP = window.DAOP || {};window.DAOP.slugIndex = window.DAOP.slugIndex || {};window.DAOP.slugIndex[${JSON.stringify(k)}] = ${JSON.stringify(map)};`;
      fs.writeFileSync(path.join(outSlugDir, `${k}.js`), content, 'utf8');
      continue;
    }
    for (let p = 0; p < spl.buckets.length; p++) {
      const partObj = spl.buckets[p];
      if (!partObj || !Object.keys(partObj).length) continue;
      const content = `window.DAOP = window.DAOP || {};window.DAOP.slugIndex = window.DAOP.slugIndex || {};window.DAOP.slugIndex[${JSON.stringify(k)}] = window.DAOP.slugIndex[${JSON.stringify(k)}] || {};Object.assign(window.DAOP.slugIndex[${JSON.stringify(k)}], ${JSON.stringify(partObj)});`;
      fs.writeFileSync(path.join(outSlugDir, `${k}.${p}.js`), content, 'utf8');
    }
  }
  fs.writeFileSync(path.join(outSlugDir, 'meta.json'), JSON.stringify(slugMeta), 'utf8');
  for (const [k, map] of idIndexByShard.entries()) {
    const content = `window.DAOP = window.DAOP || {};window.DAOP.idIndex = window.DAOP.idIndex || {};window.DAOP.idIndex[${JSON.stringify(k)}] = ${JSON.stringify(map)};`;
    fs.writeFileSync(path.join(outIdDir, `${k}.js`), content, 'utf8');
  }

  const searchMeta = { maxBytes, parts: {} };
  for (const [k, arr] of searchByShard.entries()) {
    const spl = splitArrayBySize(arr, maxBytes, (it) => (it && (it.slug || it.id) ? String(it.slug || it.id) : ''));
    searchMeta.parts[k] = spl.parts;
    if (spl.parts <= 1) {
      const content = `window.DAOP = window.DAOP || {};window.DAOP.searchPrefix = window.DAOP.searchPrefix || {};window.DAOP.searchPrefix[${JSON.stringify(k)}] = ${JSON.stringify(arr)};`;
      fs.writeFileSync(path.join(outPrefixDir, `${k}.js`), content, 'utf8');
      continue;
    }
    for (let p = 0; p < spl.buckets.length; p++) {
      const partArr = spl.buckets[p];
      if (!partArr || !partArr.length) continue;
      const content = `window.DAOP = window.DAOP || {};window.DAOP.searchPrefix = window.DAOP.searchPrefix || {};window.DAOP.searchPrefix[${JSON.stringify(k)}] = (window.DAOP.searchPrefix[${JSON.stringify(k)}] || []).concat(${JSON.stringify(partArr)});`;
      fs.writeFileSync(path.join(outPrefixDir, `${k}.${p}.js`), content, 'utf8');
    }
  }
  fs.writeFileSync(path.join(outPrefixDir, 'meta.json'), JSON.stringify(searchMeta), 'utf8');
}

/** 5b. Lấy danh sách thể loại (23) + quốc gia (45) từ OPhim API, fallback danh sách tĩnh nếu API lỗi */
async function fetchOPhimGenresAndCountries() {
  const base = process.env.OPHIM_BASE_URL || 'https://ophim1.com/v1/api';
  let genreNames = { ...OPHIM_GENRES_FALLBACK };
  let countryNames = { ...OPHIM_COUNTRIES_FALLBACK };
  try {
    const [genresRes, countriesRes] = await Promise.all([
      fetchJsonWithTimeout(`${base}/the-loai`).catch(() => null),
      fetchJsonWithTimeout(`${base}/quoc-gia`).catch(() => null),
    ]);
    const genres = genresRes?.data?.items || [];
    const countries = countriesRes?.data?.items || [];
    if (genres.length) {
      genreNames = {};
      for (const g of genres) {
        if (g.slug && g.name) genreNames[g.slug] = g.name;
      }
      genreNames = { ...OPHIM_GENRES_FALLBACK, ...genreNames };
    }
    if (countries.length) {
      countryNames = {};
      for (const c of countries) {
        if (c.slug && c.name) countryNames[c.slug] = c.name;
      }
      countryNames = { ...OPHIM_COUNTRIES_FALLBACK, ...countryNames };
    }
    console.log('   OPhim genres:', Object.keys(genreNames).length, ', countries:', Object.keys(countryNames).length);
  } catch (e) {
    console.warn('   OPhim genres/countries fetch failed, using fallback:', e.message);
  }
  return { genreNames, countryNames };
}

/** 6. Tạo filters.js */
function writeFilters(movies, genreNames = {}, countryNames = {}) {
  const genreMap = {};
  const countryMap = {};
  const yearMap = {};
  const typeMap = {};
  const statusMap = {};
  const langMap = { vietsub: [], thuyetminh: [], longtieng: [], khac: [] };
  const quality4kIds = [];
  const exclusiveIds = [];
  const yearsSet = new Set();
  for (const m of movies) {
    if (m.is_4k) quality4kIds.push(m.id);
    if (m.is_exclusive) exclusiveIds.push(m.id);
    if (m.type) {
      if (!typeMap[m.type]) typeMap[m.type] = [];
      typeMap[m.type].push(m.id);
    }
    if (m.status) {
      if (!statusMap[m.status]) statusMap[m.status] = [];
      statusMap[m.status].push(m.id);
    }

    const lk = (m.lang_key || '').toString().toLowerCase();
    if (!lk) langMap.khac.push(m.id);
    else if (lk.includes('vietsub')) langMap.vietsub.push(m.id);
    else if (lk.includes('thuyết minh') || lk.includes('thuyet minh')) langMap.thuyetminh.push(m.id);
    else if (lk.includes('lồng tiếng') || lk.includes('long tieng')) langMap.longtieng.push(m.id);
    else langMap.khac.push(m.id);
    const y = (m.year || '').toString();
    if (y) {
      yearsSet.add(y);
      if (!yearMap[y]) yearMap[y] = [];
      yearMap[y].push(m.id);
    }
    for (const g of m.genre || []) {
      const s = g.slug || slugify(g.name, { lower: true });
      if (!genreMap[s]) genreMap[s] = [];
      genreMap[s].push(m.id);
      if (g.name && !genreNames[s]) genreNames[s] = g.name;
    }
    for (const c of m.country || []) {
      const s = c.slug || slugify(c.name, { lower: true });
      if (!countryMap[s]) countryMap[s] = [];
      countryMap[s].push(m.id);
      if (c.name && !countryNames[s]) countryNames[s] = c.name;
    }
  }
  const yearsArr = Array.from(yearsSet).map(Number).filter((y) => !Number.isNaN(y));
  const minYear = yearsArr.length ? Math.min(...yearsArr) : new Date().getFullYear();
  const maxYear = new Date().getFullYear();
  for (let y = minYear; y <= maxYear; y++) {
    const ys = String(y);
    if (!yearMap[ys]) yearMap[ys] = [];
  }
  const configDir = path.join(PUBLIC_DATA, 'config');
  const filterOrderPath = path.join(configDir, 'filter-order.json');
  let filterOrder = {
    rowOrder: ['year', 'genre', 'country', 'videoType', 'lang'],
    genreOrder: [],
    countryOrder: [],
    videoTypeOrder: ['tvshows', 'hoathinh', '4k', 'exclusive'],
    langOrder: ['vietsub', 'thuyetminh', 'longtieng', 'khac'],
  };
  if (fs.existsSync(filterOrderPath)) {
    try {
      const fo = JSON.parse(fs.readFileSync(filterOrderPath, 'utf8'));
      if (fo.rowOrder && Array.isArray(fo.rowOrder)) filterOrder.rowOrder = fo.rowOrder;
      if (fo.genreOrder && Array.isArray(fo.genreOrder)) filterOrder.genreOrder = fo.genreOrder;
      if (fo.countryOrder && Array.isArray(fo.countryOrder)) filterOrder.countryOrder = fo.countryOrder;
      if (fo.videoTypeOrder && Array.isArray(fo.videoTypeOrder)) filterOrder.videoTypeOrder = fo.videoTypeOrder;
      if (fo.langOrder && Array.isArray(fo.langOrder)) filterOrder.langOrder = fo.langOrder;
    } catch (_) {}
  }
  const content = `window.filtersData = ${JSON.stringify({
    genreMap,
    countryMap,
    yearMap,
    typeMap,
    statusMap,
    langMap,
    quality4kIds,
    exclusiveIds,
    genreNames,
    countryNames,
    filterOrder,
  })};`;
  fs.writeFileSync(path.join(PUBLIC_DATA, 'filters.js'), content, 'utf8');
  return { genreMap, countryMap, yearMap, genreNames, countryNames };
}

function removeMoviesLightScriptFromHtml() {
  const publicDir = path.join(ROOT, 'public');
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.html')) {
        let content = fs.readFileSync(full, 'utf8');
        const orig = content;
        content = content.replace(/\s*<script\s+[^>]*src\s*=\s*"[^\"]*\/data\/movies-light\.js"[^>]*><\/script>\s*/gi, '\n');
        if (content !== orig) fs.writeFileSync(full, content, 'utf8');
      }
    }
  }
  walk(publicDir);
  console.log('   Removed movies-light.js script tag from HTML files');
}

/** 5b. Inject site_name vào tất cả HTML (title, site-logo) để tên web đúng ngay khi load trang */
function injectSiteNameIntoHtml() {
  const configDir = path.join(PUBLIC_DATA, 'config');
  const siteSettingsPath = path.join(configDir, 'site-settings.json');
  if (!fs.existsSync(siteSettingsPath)) return;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(siteSettingsPath, 'utf8'));
  } catch {
    return;
  }
  const siteName = settings.site_name || 'DAOP Phim';
  if (siteName === 'DAOP Phim') return;

  const publicDir = path.join(ROOT, 'public');
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.html')) {
        let content = fs.readFileSync(full, 'utf8');
        const orig = content;
        content = content.replace(/DAOP Phim/g, siteName);
        if (content !== orig) fs.writeFileSync(full, content, 'utf8');
      }
    }
  }
  walk(publicDir);
  console.log('   Injected site_name "' + siteName + '" into HTML files');
}

/** 5c. Cập nhật footer: hộp bo tròn 1 dòng, hàng 2 logo+links, hàng cuối copyright */
function injectFooterIntoHtml() {
  const publicDir = path.join(ROOT, 'public');
  const flagSvg = '<span class="footer-flag" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" preserveAspectRatio="xMidYMid meet"><rect width="30" height="20" fill="#DA251D"/><path fill="#FFFF00" d="M15 4l2.47 7.6H25l-6.23 4.5 2.36 7.3L15 16.2l-6.13 4.2 2.36-7.3L5 11.6h7.53z"/></svg></span>';
  const newFooterInner = [
    '<div class="footer-vietnam-wrap"><div class="footer-vietnam-banner">' + flagSvg + ' Trường Sa &amp; Hoàng Sa là của Việt Nam!</div></div>',
    '<div class="footer-bottom">',
    '  <div class="footer-bottom-inner">',
    '    <a href="/" class="footer-logo">GoTV<span class="footer-logo-text">GoTV - Trang tổng hợp phim, video, chương trình, tư liệu giải trí đỉnh cao.</span></a>',
    '    <span class="footer-divider" aria-hidden="true"></span>',
    '    <div class="footer-links-col">',
    '      <a href="/hoi-dap.html">Hỏi - đáp</a>',
    '      <a href="/chinh-sach-bao-mat.html">Chính sách bảo mật</a>',
    '      <a href="/dieu-khoan-su-dung.html">Điều khoản sử dụng</a>',
    '    </div>',
    '  </div>',
    '</div>',
    '<p class="footer-copyright">Copyright 2018 <a href="https://gotv.top" target="_blank" rel="noopener">GoTV</a>. All rights reserved.</p>',
  ].join('\n    ');
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.html')) {
        let content = fs.readFileSync(full, 'utf8');
        const orig = content;
        content = content.replace(/Trường Sa,\s*Hoàng Sa/gi, 'Trường Sa & Hoàng Sa');
        content = content.replace(/<p>\s*<a[^>]*href="[^"]*donate[^"]*"[^>]*>Donate<\/a>\s*<\/p>\s*/gi, '');
        content = content.replace(/<p[^>]*class="footer-tmdb"[^>]*>[\s\S]*?<\/p>\s*/i, '');
        content = content.replace(/<p>[\s\S]*?Dữ liệu phim có thể từ TMDB[\s\S]*?<\/p>\s*/i, '');
        if (content.includes('footer-flag')) {
          content = content.replace(/<span class="footer-flag"[^>]*>[\s\S]*?<\/span>/gi, flagSvg);
        }
        if (content.includes('site-footer') && !content.includes('footer-vietnam-banner')) {
          content = content.replace(
            /<footer[^>]*class="site-footer"[^>]*>[\s\S]*?<\/footer>/i,
            '<footer class="site-footer">\n    ' + newFooterInner + '\n  </footer>'
          );
        }
        if (content.includes('footer-vietnam-banner') && !content.includes('footer-vietnam-wrap')) {
          content = content.replace(
            /<div class="footer-vietnam-banner">/i,
            '<div class="footer-vietnam-wrap"><div class="footer-vietnam-banner">'
          );
          content = content.replace(
            /(<div class="footer-vietnam-wrap"><div class="footer-vietnam-banner">[\s\S]*?)<\/div>\s*(<div class="footer-bottom">)/i,
            '$1</div></div>\n    $2'
          );
        }
        if (content.includes('footer-bottom') && !content.includes('footer-bottom-inner')) {
          const oldBottom = /<div class="footer-bottom">\s*<a href="[^"]*" class="footer-logo">[^<]*<\/a>\s*<div class="footer-links-col">[\s\S]*?<\/div>\s*<\/div>/i;
          const newBottom = [
            '<div class="footer-bottom">',
            '  <div class="footer-bottom-inner">',
            '    <a href="/" class="footer-logo">GoTV<span class="footer-logo-text">GoTV - Trang tổng hợp phim, video, chương trình, tư liệu giải trí đỉnh cao.</span></a>',
            '    <span class="footer-divider" aria-hidden="true"></span>',
            '    <div class="footer-links-col">',
            '      <a href="/hoi-dap.html">Hỏi - đáp</a>',
            '      <a href="/chinh-sach-bao-mat.html">Chính sách bảo mật</a>',
            '      <a href="/dieu-khoan-su-dung.html">Điều khoản sử dụng</a>',
            '    </div>',
            '  </div>',
            '</div>',
          ].join('\n    ');
          content = content.replace(oldBottom, newBottom);
        }
        if (content.includes('site-footer') && !content.includes('footer-copyright')) {
          const footerClose = content.match(/<\/footer>/i);
          if (footerClose) {
            content = content.replace(
              /\s*<\/footer>/i,
              '\n    <p class="footer-copyright">Copyright 2018 <a href="https://gotv.top" target="_blank" rel="noopener">GoTV</a>. All rights reserved.</p>\n  </footer>'
            );
          }
        }
        if (content.includes('footer-bottom') && !content.includes('footer-copyright') && content.includes('site-footer')) {
          const footerClose = content.match(/<\/footer>/i);
          if (footerClose) {
            content = content.replace(
              /(<\/div>\s*<\/div>\s*)(<\/footer>)/i,
              '$1<p class="footer-copyright">Copyright 2018 <a href="https://gotv.top" target="_blank" rel="noopener">GoTV</a>. All rights reserved.</p>\n  $2'
            );
          }
        }
        if (content !== orig) fs.writeFileSync(full, content, 'utf8');
      }
    }
  }
  walk(publicDir);
  console.log('   Injected footer into HTML files');
}

/** 5d. Thêm Tải app, Liên hệ vào nav mọi trang */
function injectNavIntoHtml() {
  const publicDir = path.join(ROOT, 'public');
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.html')) {
        let content = fs.readFileSync(full, 'utf8');
        if (content.includes('huong-dan-app')) continue;
        const prefix = content.includes('href="../') ? 'href="../' : 'href="/';
        const taiApp = '<a ' + prefix + 'huong-dan-app.html">Tải app</a>';
        const lienHe = '<a ' + prefix + 'lien-he.html">Liên hệ</a>';
        const added = taiApp + lienHe;
        if (content.includes('donate')) {
          content = content.replace(/(<a [^>]*donate[^"']*"[^>]*>Donate<\/a>)/i, '$1' + added);
        } else if (content.includes('gioi-thieu')) {
          content = content.replace(/(<a [^>]*gioi-thieu[^"']*"[^>]*>Giới thiệu<\/a>)/i, '$1' + added);
        }
        if (content.includes('huong-dan-app')) fs.writeFileSync(full, content, 'utf8');
      }
    }
  }
  walk(publicDir);
  console.log('   Injected nav (Tải app, Liên hệ) into HTML files');
}

/** 5e. Thêm màn hình Loading (logo + chữ Loading...) vào đầu body mọi trang */
function injectLoadingScreenIntoHtml() {
  const publicDir = path.join(ROOT, 'public');
  const loadingHtml = '<div id="loading-screen" class="loading-screen" aria-hidden="false"><div class="loading-screen-inner"><div class="loading-screen-logo">GoTV</div><p class="loading-screen-text">Loading...</p></div></div>';
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.html')) {
        let content = fs.readFileSync(full, 'utf8');
        if (content.includes('id="loading-screen"')) continue;
        content = content.replace(/<body(\s[^>]*)?>/i, '<body$1>\n  ' + loadingHtml);
        fs.writeFileSync(full, content, 'utf8');
      }
    }
  }
  walk(publicDir);
  console.log('   Injected loading screen into HTML files');
}

/** 6b. Tạo HTML cho từng thể loại, quốc gia, năm (để /the-loai/hanh-dong.html, /quoc-gia/trung-quoc.html... tồn tại) */
function writeCategoryPages(filters) {
  const publicDir = path.join(ROOT, 'public');
  fs.ensureDirSync(path.join(publicDir, 'the-loai'));
  fs.ensureDirSync(path.join(publicDir, 'quoc-gia'));
  fs.ensureDirSync(path.join(publicDir, 'nam-phat-hanh'));
  const theLoaiIndex = fs.readFileSync(path.join(publicDir, 'the-loai', 'index.html'), 'utf8');
  const quocGiaIndex = fs.readFileSync(path.join(publicDir, 'quoc-gia', 'index.html'), 'utf8');
  const namPhatHanhIndex = fs.readFileSync(path.join(publicDir, 'nam-phat-hanh', 'index.html'), 'utf8');
  const genres = Object.keys(filters.genreNames || filters.genreMap || {});
  const countries = Object.keys(filters.countryNames || filters.countryMap || {});
  const years = Object.keys(filters.yearMap || {});
  for (const slug of genres) {
    const safe = slug.replace(/[/\\?*:|"<>]/g, '_');
    fs.writeFileSync(path.join(publicDir, 'the-loai', safe + '.html'), theLoaiIndex, 'utf8');
  }
  for (const slug of countries) {
    const safe = slug.replace(/[/\\?*:|"<>]/g, '_');
    fs.writeFileSync(path.join(publicDir, 'quoc-gia', safe + '.html'), quocGiaIndex, 'utf8');
  }
  for (const y of years) {
    const safe = String(y).replace(/[/\\?*:|"<>]/g, '_');
    fs.writeFileSync(path.join(publicDir, 'nam-phat-hanh', safe + '.html'), namPhatHanhIndex, 'utf8');
  }
  console.log('   Category pages: the-loai', genres.length, ', quoc-gia', countries.length, ', nam-phat-hanh', years.length);
}

/** Helper: tạo light object cho renderMovieCard */
function toLightMovie(m) {
  return {
    id: String(m.id),
    title: m.title,
    origin_name: m.origin_name || '',
    slug: m.slug,
    thumb: m.thumb,
    year: m.year,
    type: m.type,
    episode_current: m.episode_current,
  };
}

/** 7. Tạo actors: index (names only) + shard theo ký tự đầu, mỗi shard có thêm movies (light) để trang diễn viên không cần movies-light.js */
function writeActors(movies) {
  const map = {};
  const names = {};
  const meta = {};
  const movieById = new Map();
  for (const m of movies) {
    movieById.set(String(m.id), toLightMovie(m));
    const castList = Array.isArray(m.cast_meta) && m.cast_meta.length
      ? m.cast_meta
      : (m.cast || []).map((n) => ({ name: n }));
    for (const c of castList) {
      const displayName = c && (c.name_vi || c.name) ? String(c.name_vi || c.name) : '';
      const slugSourceName = c && (c.name_original || c.name) ? String(c.name_original || c.name) : '';
      const s = slugify(slugSourceName, { lower: true });
      if (!s) continue;
      if (!map[s]) map[s] = [];
      map[s].push(String(m.id));
      names[s] = displayName;
      if (!meta[s] && (c.tmdb_id || c.profile || c.tmdb_url)) {
        meta[s] = {
          tmdb_id: c.tmdb_id || null,
          profile: c.profile || null,
          tmdb_url: c.tmdb_url || (c.tmdb_id ? `https://www.themoviedb.org/person/${c.tmdb_id}` : null),
        };
      }
    }
  }
  const slugs = Object.keys(names);
  // Legacy: một file đầy đủ (fallback + dùng cho incremental sau này)
  fs.writeFileSync(path.join(PUBLIC_DATA, 'actors.js'), `window.actorsData = ${JSON.stringify({ map, names, meta })};`, 'utf8');
  // Index: chỉ names (cho trang danh sách "Chọn diễn viên")
  fs.writeFileSync(
    path.join(PUBLIC_DATA, 'actors-index.js'),
    `window.actorsIndex = ${JSON.stringify({ names, meta })};`,
    'utf8'
  );
  // Shard theo ký tự đầu (a-z, other), mỗi shard có thêm movies: { slug: [light objects] }
  const byFirst = {};
  for (const slug of slugs) {
    const c = (slug[0] || '').toLowerCase();
    const key = c >= 'a' && c <= 'z' ? c : 'other';
    if (!byFirst[key]) byFirst[key] = { map: {}, names: {}, meta: {}, movies: {} };
    byFirst[key].map[slug] = map[slug];
    byFirst[key].names[slug] = names[slug];
    if (meta[slug]) byFirst[key].meta[slug] = meta[slug];
    byFirst[key].movies[slug] = (map[slug] || [])
      .map((id) => movieById.get(String(id)))
      .filter(Boolean);
  }
  const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'other'];
  for (const key of keys) {
    const data = byFirst[key] || { map: {}, names: {}, meta: {}, movies: {} };
    fs.writeFileSync(
      path.join(PUBLIC_DATA, `actors-${key}.js`),
      `window.actorsData = ${JSON.stringify(data)};`,
      'utf8'
    );
  }
  const shardCount = keys.filter((k) => byFirst[k] && Object.keys(byFirst[k].map).length > 0).length;
  console.log('   Actors: index +', shardCount, 'shards (a-z, other) + movies per shard');
}

/** 7b. Tạo actors-index.js + shards từ object { map, names }, thêm movies nếu có movies-light.js (incremental) */
function writeActorsShardsFromData(map = {}, names = {}, movieById = null, meta = {}) {
  const slugs = Object.keys(names);
  fs.writeFileSync(
    path.join(PUBLIC_DATA, 'actors-index.js'),
    `window.actorsIndex = ${JSON.stringify({ names, meta })};`,
    'utf8'
  );
  const byFirst = {};
  for (const slug of slugs) {
    const c = (slug[0] || '').toLowerCase();
    const key = c >= 'a' && c <= 'z' ? c : 'other';
    if (!byFirst[key]) byFirst[key] = { map: {}, names: {}, meta: {}, movies: {} };
    byFirst[key].map[slug] = map[slug] || [];
    byFirst[key].names[slug] = names[slug];
    if (meta && meta[slug]) byFirst[key].meta[slug] = meta[slug];
    if (movieById) {
      byFirst[key].movies[slug] = (map[slug] || [])
        .map((id) => movieById.get(String(id)))
        .filter(Boolean);
    }
  }
  const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'other'];
  for (const key of keys) {
    const data = byFirst[key] || { map: {}, names: {}, meta: {}, movies: {} };
    fs.writeFileSync(
      path.join(PUBLIC_DATA, `actors-${key}.js`),
      `window.actorsData = ${JSON.stringify(data)};`,
      'utf8'
    );
  }
  const shardCount = keys.filter((k) => byFirst[k] && Object.keys(byFirst[k].map).length > 0).length;
  console.log('   Actors (từ actors.js): index +', shardCount, 'shards', movieById ? '+ movies' : '');
}

/** 8. Tạo batch files (chỉ ghi lại batch có phim thay đổi dựa trên last_modified) */
function writeBatches(movies, prevLastModified, tmdbById) {
  const sorted = [...movies].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const batchDir = path.join(PUBLIC_DATA, 'batches');
  fs.ensureDirSync(batchDir);

  const toCoreMovie = (m) => {
    if (!m) return m;
    const {
      tmdb,
      imdb,
      cast,
      director,
      cast_meta,
      keywords,
      tmdb_id,
      _skip_tmdb,
      ...rest
    } = m;
    return { ...rest, id: String(m.id) };
  };

  const toTmdbPayload = (idStr) => {
    if (!tmdbById) return { id: idStr };
    const v = tmdbById.get(String(idStr));
    if (!v) return { id: String(idStr) };
    const out = { ...v, id: String(idStr) };
    return out;
  };

  const total = sorted.length;
  const changedBatchStarts = new Set();
  const newLastModified = {};

  for (let idx = 0; idx < sorted.length; idx++) {
    const m = sorted[idx];
    const idStr = String(m.id);
    const modified = m.modified || m.updated_at || '';
    newLastModified[idStr] = modified;
    const old = prevLastModified ? prevLastModified[idStr] : undefined;
    if (!prevLastModified || !old || old !== modified) {
      const start = Math.floor(idx / BATCH_SIZE) * BATCH_SIZE;
      changedBatchStarts.add(start);
    }
  }

  // Nếu có phim bị xóa (có trong map cũ nhưng không còn trong map mới) → ghi lại toàn bộ để tránh lệch dữ liệu.
  if (prevLastModified) {
    for (const idStr of Object.keys(prevLastModified)) {
      if (!newLastModified[idStr]) {
        console.log('   Detect removed movies, regenerate toàn bộ batch files.');
        changedBatchStarts.clear();
        for (let start = 0; start < total; start += BATCH_SIZE) {
          changedBatchStarts.add(start);
        }
        break;
      }
    }
  }

  // Nếu không có map cũ hoặc không batch nào được đánh dấu thay đổi → build full.
  if (!prevLastModified || changedBatchStarts.size === 0) {
    for (let start = 0; start < total; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, total);
      const slice = sorted.slice(start, end);
      const batch = slice.map((m) => toCoreMovie(m));
      const content = `window.moviesBatch = ${JSON.stringify(batch)};`;
      fs.writeFileSync(path.join(batchDir, `batch_${start}_${end}.js`), content, 'utf8');

      const tmdbBatch = slice.map((m) => toTmdbPayload(m && m.id != null ? String(m.id) : ''));
      const tmdbContent = `window.moviesTmdbBatch = ${JSON.stringify(tmdbBatch)};`;
      fs.writeFileSync(path.join(batchDir, `tmdb_batch_${start}_${end}.js`), tmdbContent, 'utf8');
    }
    console.log('   Đã ghi lại toàn bộ batch files (lần đầu hoặc không có thông tin last_modified trước đó).');
  } else {
    const sortedStarts = Array.from(changedBatchStarts).sort((a, b) => a - b);
    for (const start of sortedStarts) {
      const end = Math.min(start + BATCH_SIZE, total);
      const slice = sorted.slice(start, end);
      const batch = slice.map((m) => toCoreMovie(m));
      const content = `window.moviesBatch = ${JSON.stringify(batch)};`;
      fs.writeFileSync(path.join(batchDir, `batch_${start}_${end}.js`), content, 'utf8');

      const tmdbBatch = slice.map((m) => toTmdbPayload(m && m.id != null ? String(m.id) : ''));
      const tmdbContent = `window.moviesTmdbBatch = ${JSON.stringify(tmdbBatch)};`;
      fs.writeFileSync(path.join(batchDir, `tmdb_batch_${start}_${end}.js`), tmdbContent, 'utf8');
    }
    console.log('   Đã ghi lại', sortedStarts.length, 'batch files có phim mới hoặc thay đổi.');
  }

  return newLastModified;
}

/** 9. Đọc Supabase Admin và xuất config JSON */
async function exportConfigFromSupabase() {
  const url = process.env.SUPABASE_ADMIN_URL;
  const key = process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('SUPABASE_ADMIN_URL hoặc SUPABASE_ADMIN_SERVICE_ROLE_KEY chưa đặt — dùng config mặc định. Cập nhật trên Admin sẽ không xuất ra website. Thêm 2 secret này vào GitHub Actions (build-on-demand) để export đúng từ Supabase.');
    await writeDefaultConfig();
    return;
  }
  const supabase = createClient(url, key);
  const configDir = path.join(PUBLIC_DATA, 'config');
  fs.ensureDirSync(configDir);

  const today = new Date().toISOString().slice(0, 10);
  const [sources, bannersRes, sections, settings, staticPages, donate, playerSettingsRes, prerollRes] = await Promise.all([
    supabase.from('server_sources').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('ad_banners').select('*').eq('is_active', true),
    supabase.from('homepage_sections').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('site_settings').select('key, value'),
    supabase.from('static_pages').select('*'),
    supabase.from('donate_settings').select('*').limit(1).maybeSingle(),
    supabase.from('player_settings').select('key, value'),
    supabase.from('ad_preroll').select('*').eq('is_active', true).order('weight', { ascending: false }),
  ]);

  const errors = [
    [sources, 'server_sources'],
    [bannersRes, 'ad_banners'],
    [sections, 'homepage_sections'],
    [settings, 'site_settings'],
    [staticPages, 'static_pages'],
    [donate, 'donate_settings'],
    [playerSettingsRes, 'player_settings'],
    [prerollRes, 'ad_preroll'],
  ].filter(([r]) => r && r.error).map(([r, name]) => `${name}: ${r.error?.message || r.error}`);
  if (errors.length) {
    console.error('Supabase lỗi (kiểm tra SUPABASE_ADMIN_URL và SUPABASE_ADMIN_SERVICE_ROLE_KEY trong GitHub Secrets):', errors);
    throw new Error('Export config từ Supabase thất bại: ' + errors.join('; '));
  }
  console.log('Export config từ Supabase OK (sections:', (sections.data || []).length, ', settings:', (settings.data || []).length, ')');

  const banners = (bannersRes.data || []).filter((b) => {
    if (b.start_date && b.start_date > today) return false;
    if (b.end_date && b.end_date < today) return false;
    return true;
  });
  const defaultSections = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'config', 'default-sections.json'), 'utf-8')
  );
  fs.writeFileSync(path.join(configDir, 'server-sources.json'), JSON.stringify(sources.data || [], null, 2));
  fs.writeFileSync(path.join(configDir, 'banners.json'), JSON.stringify(banners, null, 2));
  const sectionsOut = (sections.data && sections.data.length)
    ? sections.data.map((s) => {
        const fc = s.filter_config && typeof s.filter_config === 'object' ? s.filter_config : {};
        return { ...s, ...fc };
      })
    : defaultSections;
  fs.writeFileSync(path.join(configDir, 'homepage-sections.json'), JSON.stringify(sectionsOut, null, 2));
  const settingsObj = Object.fromEntries((settings.data || []).map((r) => [r.key, r.value]));
  const defaultSettings = {
    site_name: 'DAOP Phim',
    logo_url: '',
    favicon_url: '',
    google_analytics_id: '',
    simple_analytics_script: '',
    twikoo_env_id: '',
    supabase_user_url: '',
    supabase_user_anon_key: '',
    player_warning_enabled: 'true',
    player_warning_text: 'Cảnh báo: Phim chứa hình ảnh đường lưỡi bò phi pháp xâm phạm chủ quyền biển đảo Việt Nam.',
    player_visible: 'true',
    movie_detail_similar_limit: '16',
    social_facebook: '',
    social_twitter: '',
    social_instagram: '',
    social_youtube: '',
    footer_content: '',
    tmdb_attribution: 'true',
    loading_screen_enabled: 'true',
    loading_screen_min_seconds: '0',
    homepage_slider: '[]',
    ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`menu_bg_${i + 1}`, ''])),
    movies_data_url: '',
    filter_row_order: JSON.stringify(['year', 'genre', 'country', 'videoType', 'lang']),
    filter_genre_order: '[]',
    filter_country_order: '[]',
    filter_video_type_order: JSON.stringify(['tvshows', 'hoathinh', '4k', 'exclusive']),
    filter_lang_order: JSON.stringify(['vietsub', 'thuyetminh', 'longtieng', 'khac']),
    theme_primary: '#58a6ff',
    theme_bg: '#0d1117',
    theme_card: '#161b22',
    theme_accent: '#58a6ff',
    theme_text: '#e6edf3',
    theme_muted: '#8b949e',
    theme_slider_title: '#ffffff',
    theme_slider_meta: 'rgba(255,255,255,0.75)',
    theme_slider_desc: 'rgba(255,255,255,0.7)',
    theme_movie_card_title: '#f85149',
    theme_movie_card_meta: '#8b949e',
    theme_header_logo: '#e6edf3',
    theme_header_link: '#e6edf3',
    theme_footer_text: '#8b949e',
    theme_section_title: '#e6edf3',
    theme_filter_label: '#8b949e',
    theme_pagination: '#e6edf3',
    theme_link: '#58a6ff',
    default_grid_cols_xs: '2',
    default_grid_cols_sm: '3',
    default_grid_cols_md: '4',
    default_grid_cols_lg: '6',
    grid_columns_extra: '8',
    default_use_poster: 'thumb',
    category_grid_cols_xs: '2',
    category_grid_cols_sm: '3',
    category_grid_cols_md: '4',
    category_grid_cols_lg: '6',
    category_grid_columns_extra: '8',
    category_use_poster: 'thumb',

    rec_grid_cols_xs: '2',
    rec_grid_cols_sm: '3',
    rec_grid_cols_md: '4',
    rec_grid_cols_lg: '6',
    rec_grid_columns_extra: '8',
    rec_use_poster: 'thumb',

    actor_grid_cols_xs: '2',
    actor_grid_cols_sm: '3',
    actor_grid_cols_md: '4',
    actor_grid_cols_lg: '6',
    actor_grid_columns_extra: '8',
    actor_use_poster: 'thumb',

    actor_detail_grid_cols_xs: '2',
    actor_detail_grid_cols_sm: '3',
    actor_detail_grid_cols_md: '4',
    actor_detail_grid_cols_lg: '6',
    actor_detail_grid_columns_extra: '8',
    actor_detail_use_poster: 'thumb',
  };
  const mergedSettings = { ...defaultSettings, ...settingsObj };
  fs.writeFileSync(path.join(configDir, 'site-settings.json'), JSON.stringify(mergedSettings, null, 2));

  const defaultRowOrder = ['year', 'genre', 'country', 'videoType', 'lang'];
  const filterRowOrder = (() => {
    try {
      const v = mergedSettings.filter_row_order;
      if (!v) return defaultRowOrder;
      const a = typeof v === 'string' ? JSON.parse(v) : v;
      return Array.isArray(a) && a.length ? a : defaultRowOrder;
    } catch {
      return defaultRowOrder;
    }
  })();
  const filterGenreOrder = (() => {
    try {
      const v = mergedSettings.filter_genre_order;
      if (!v) return [];
      const a = typeof v === 'string' ? JSON.parse(v) : v;
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  })();
  const filterCountryOrder = (() => {
    try {
      const v = mergedSettings.filter_country_order;
      if (!v) return [];
      const a = typeof v === 'string' ? JSON.parse(v) : v;
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  })();
  const defaultVideoTypeOrder = ['tvshows', 'hoathinh', '4k', 'exclusive'];
  const filterVideoTypeOrder = (() => {
    try {
      const v = mergedSettings.filter_video_type_order;
      if (!v) return defaultVideoTypeOrder;
      const a = typeof v === 'string' ? JSON.parse(v) : v;
      return Array.isArray(a) && a.length ? a : defaultVideoTypeOrder;
    } catch {
      return defaultVideoTypeOrder;
    }
  })();
  const defaultLangOrder = ['vietsub', 'thuyetminh', 'longtieng', 'khac'];
  const filterLangOrder = (() => {
    try {
      const v = mergedSettings.filter_lang_order;
      if (!v) return defaultLangOrder;
      const a = typeof v === 'string' ? JSON.parse(v) : v;
      return Array.isArray(a) && a.length ? a : defaultLangOrder;
    } catch {
      return defaultLangOrder;
    }
  })();
  const defaultListOrder = ['phim-4k', 'shows', 'hoat-hinh', 'phim-vietsub', 'phim-thuyet-minh', 'phim-long-tieng', 'phim-doc-quyen', 'phim-dang-chieu', 'phim-sap-chieu', 'phim-chieu-rap', 'the-loai', 'quoc-gia', 'nam-phat-hanh', 'dien-vien'];
  const filterListOrder = (() => {
    try {
      const v = mergedSettings.filter_list_order;
      if (!v) return defaultListOrder;
      const a = typeof v === 'string' ? JSON.parse(v) : v;
      return Array.isArray(a) && a.length ? a : defaultListOrder;
    } catch {
      return defaultListOrder;
    }
  })();
  const listOptionsMap = {
    'phim-4k': { label: 'Phim 4K', href: '/danh-sach/phim-4k.html', icon: '📺' },
    'shows': { label: 'TV Shows', href: '/shows.html', icon: '📺' },
    'hoat-hinh': { label: 'Hoạt hình', href: '/hoat-hinh.html', icon: '🎬' },
    'phim-vietsub': { label: 'Phim Vietsub', href: '/danh-sach/phim-vietsub.html', icon: '🇻🇳' },
    'phim-thuyet-minh': { label: 'Phim Thuyết minh', href: '/danh-sach/phim-thuyet-minh.html', icon: '🎙️' },
    'phim-long-tieng': { label: 'Phim Lồng tiếng', href: '/danh-sach/phim-long-tieng.html', icon: '🔊' },
    'phim-doc-quyen': { label: 'Phim Độc quyền', href: '/danh-sach/phim-doc-quyen.html', icon: '⭐' },
    'phim-dang-chieu': { label: 'Phim đang chiếu', href: '/danh-sach/phim-dang-chieu.html', icon: '🎞️' },
    'phim-sap-chieu': { label: 'Phim sắp chiếu', href: '/danh-sach/phim-sap-chieu.html', icon: '📅' },
    'phim-chieu-rap': { label: 'Phim chiếu rạp', href: '/danh-sach/phim-chieu-rap.html', icon: '🎭' },
    'the-loai': { label: 'Thể loại', href: '/the-loai/', icon: '🎬' },
    'quoc-gia': { label: 'Quốc gia', href: '/quoc-gia/', icon: '🌐' },
    'nam-phat-hanh': { label: 'Năm phát hành', href: '/nam-phat-hanh/', icon: '📅' },
    'dien-vien': { label: 'Diễn viên', href: '/dien-vien/', icon: '👤' },
  };
  const listOrderItems = filterListOrder
    .filter(id => listOptionsMap[id])
    .map(id => ({ id, ...listOptionsMap[id] }));
  const missingListIds = Object.keys(listOptionsMap).filter(id => !filterListOrder.includes(id));
  missingListIds.forEach(id => listOrderItems.push({ id, ...listOptionsMap[id] }));

  fs.writeFileSync(
    path.join(configDir, 'filter-order.json'),
    JSON.stringify({
      rowOrder: filterRowOrder,
      genreOrder: filterGenreOrder,
      countryOrder: filterCountryOrder,
      videoTypeOrder: filterVideoTypeOrder,
      langOrder: filterLangOrder,
      listOrder: filterListOrder,
    }, null, 2)
  );
  fs.writeFileSync(path.join(configDir, 'list-order.json'), JSON.stringify(listOrderItems, null, 2));

  fs.writeFileSync(path.join(configDir, 'static-pages.json'), JSON.stringify(staticPages.data || [], null, 2));
  fs.writeFileSync(path.join(configDir, 'donate.json'), JSON.stringify(donate.data || {}, null, 2));
  
  // Player settings: merge từ player_settings table
  const playerSettingsData = playerSettingsRes.data || [];
  const playerSettingsObj = {};
  for (const row of playerSettingsData) {
    try {
      playerSettingsObj[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    } catch {
      playerSettingsObj[row.key] = row.value;
    }
  }
  const defaultPlayerSettings = {
    available_players: { plyr: 'Plyr', videojs: 'Video.js', jwplayer: 'JWPlayer' },
    default_player: 'plyr',
    warning_enabled_global: true,
    warning_text: 'Cảnh báo: Phim chứa hình ảnh đường lưỡi bò phi pháp xâm phạm chủ quyền biển đảo Việt Nam.',
    link_type_labels: {
      m3u8: 'M3U8',
      embed: 'Embed',
      backup: 'Backup',
      vip1: 'VIP 1',
      vip2: 'VIP 2',
      vip3: 'VIP 3',
      vip4: 'VIP 4',
      vip5: 'VIP 5',
    },
  };
  const mergedPlayerSettings = { ...defaultPlayerSettings, ...playerSettingsObj };
  fs.writeFileSync(path.join(configDir, 'player-settings.json'), JSON.stringify(mergedPlayerSettings, null, 2));

  const prerollList = (prerollRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    video_url: p.video_url,
    image_url: p.image_url,
    duration: p.duration,
    skip_after: p.skip_after,
    weight: p.weight,
  }));
  fs.writeFileSync(path.join(configDir, 'preroll.json'), JSON.stringify(prerollList, null, 2));
}

async function writeDefaultConfig() {
  const configDir = path.join(PUBLIC_DATA, 'config');
  fs.ensureDirSync(configDir);
  const defaults = {
    'server-sources.json': [],
    'banners.json': [],
    'homepage-sections.json': JSON.parse(
      fs.readFileSync(path.join(ROOT, 'config', 'default-sections.json'), 'utf-8')
    ),
    'site-settings.json': {
      site_name: 'DAOP Phim',
      logo_url: '',
      favicon_url: '',
      google_analytics_id: '',
      simple_analytics_script: '',
      twikoo_env_id: '',
      supabase_user_url: '',
      supabase_user_anon_key: '',
      player_warning_enabled: 'true',
      player_warning_text: 'Cảnh báo: Phim chứa hình ảnh đường lưỡi bò phi pháp xâm phạm chủ quyền biển đảo Việt Nam.',
      social_facebook: '',
      social_twitter: '',
      social_instagram: '',
      social_youtube: '',
      footer_content: '',
      tmdb_attribution: 'true',
      loading_screen_enabled: 'true',
      loading_screen_min_seconds: '0',
    },
    'static-pages.json': [],
    'donate.json': { target_amount: 0, target_currency: 'VND', current_amount: 0 },
    'player-settings.json': {
      available_players: { 'plyr': 'Plyr', 'videojs': 'Video.js', 'jwplayer': 'JWPlayer' },
      default_player: 'plyr',
      warning_enabled_global: true,
      warning_text: 'Cảnh báo: Phim chứa hình ảnh đường lưỡi bò phi pháp xâm phạm chủ quyền biển đảo Việt Nam.',
    },
    'preroll.json': [],
    'filter-order.json': {
      rowOrder: ['year', 'genre', 'country', 'videoType', 'lang'],
      genreOrder: [],
      countryOrder: [],
      videoTypeOrder: ['tvshows', 'hoathinh', '4k', 'exclusive'],
      langOrder: ['vietsub', 'thuyetminh', 'longtieng', 'khac'],
      listOrder: ['phim-4k', 'shows', 'hoat-hinh', 'phim-vietsub', 'phim-thuyet-minh', 'phim-long-tieng', 'phim-doc-quyen', 'phim-dang-chieu', 'phim-sap-chieu', 'phim-chieu-rap', 'the-loai', 'quoc-gia', 'nam-phat-hanh', 'dien-vien'],
    },
    'list-order.json': [
      { id: 'phim-4k', label: 'Phim 4K', href: '/danh-sach/phim-4k.html', icon: '📺' },
      { id: 'shows', label: 'TV Shows', href: '/shows.html', icon: '📺' },
      { id: 'hoat-hinh', label: 'Hoạt hình', href: '/hoat-hinh.html', icon: '🎬' },
      { id: 'phim-vietsub', label: 'Phim Vietsub', href: '/danh-sach/phim-vietsub.html', icon: '🇻🇳' },
      { id: 'phim-thuyet-minh', label: 'Phim Thuyết minh', href: '/danh-sach/phim-thuyet-minh.html', icon: '🎙️' },
      { id: 'phim-long-tieng', label: 'Phim Lồng tiếng', href: '/danh-sach/phim-long-tieng.html', icon: '🔊' },
      { id: 'phim-doc-quyen', label: 'Phim Độc quyền', href: '/danh-sach/phim-doc-quyen.html', icon: '⭐' },
      { id: 'phim-dang-chieu', label: 'Phim đang chiếu', href: '/danh-sach/phim-dang-chieu.html', icon: '🎞️' },
      { id: 'phim-sap-chieu', label: 'Phim sắp chiếu', href: '/danh-sach/phim-sap-chieu.html', icon: '📅' },
      { id: 'phim-chieu-rap', label: 'Phim chiếu rạp', href: '/danh-sach/phim-chieu-rap.html', icon: '🎭' },
      { id: 'the-loai', label: 'Thể loại', href: '/the-loai/', icon: '🎬' },
      { id: 'quoc-gia', label: 'Quốc gia', href: '/quoc-gia/', icon: '🌐' },
      { id: 'nam-phat-hanh', label: 'Năm phát hành', href: '/nam-phat-hanh/', icon: '📅' },
      { id: 'dien-vien', label: 'Diễn viên', href: '/dien-vien/', icon: '👤' },
    ],
  };
  for (const [file, data] of Object.entries(defaults)) {
    fs.writeFileSync(path.join(configDir, file), JSON.stringify(data, null, 2));
  }
}

/** 10. Sitemap & robots */
function writeSitemap(movies) {
  const base = process.env.SITE_URL || 'https://yourdomain.com';
  let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  const pages = ['', '/phim-bo', '/phim-le', '/tim-kiem', '/gioi-thieu', '/donate', '/huong-dan-app', '/lien-he', '/hoi-dap', '/chinh-sach-bao-mat', '/dieu-khoan-su-dung'];
  for (const p of pages) xml += `<url><loc>${base}${p || '/'}</loc><changefreq>daily</changefreq></url>`;
  for (const m of movies) xml += `<url><loc>${base}/phim/${m.slug}.html</loc><changefreq>weekly</changefreq></url>`;
  xml += '</urlset>';
  fs.writeFileSync(path.join(ROOT, 'public', 'sitemap.xml'), xml);
}

function writeRobots() {
  const base = process.env.SITE_URL || 'https://yourdomain.com';
  const content = `User-agent: *
Allow: /
Sitemap: ${base}/sitemap.xml
`;
  fs.writeFileSync(path.join(ROOT, 'public', 'robots.txt'), content);
}

/** Main */
async function main() {
  const incremental = process.argv.includes('--incremental');
  const cleanOldData = process.argv.includes('--clean') || process.env.CLEAN_OLD_DATA === '1';
  console.log('Build started (incremental:', incremental, ')');

  if (!incremental && cleanOldData) {
    console.log('Cleanup: removing old generated data in public/data (keep config).');
    try {
      const batchDir = path.join(PUBLIC_DATA, 'batches');
      await fs.remove(batchDir);
      const filesToRemove = [
        'movies-light.js',
        'filters.js',
        'actors.js',
        'actors-index.js',
        'last_modified.json',
        'last_build.json',
        'build_version.json',
      ];
      for (const f of filesToRemove) {
        await fs.remove(path.join(PUBLIC_DATA, f));
      }
      // remove actor shards actors-a.js ... actors-z.js, actors-other.js
      try {
        const entries = await fs.readdir(PUBLIC_DATA);
        for (const name of entries) {
          if (/^actors-[a-z]+\.js$/i.test(name) || name === 'actors-other.js') {
            await fs.remove(path.join(PUBLIC_DATA, name));
          }
        }
      } catch {}
    } catch (e) {
      console.warn('Cleanup failed (continue):', e && e.message ? e.message : e);
    }
  }

  if (incremental) {
    await fs.ensureDir(PUBLIC_DATA);
    await fs.ensureDir(path.join(PUBLIC_DATA, 'config'));
    console.log('Incremental: export config từ Supabase + tạo lại trang thể loại/quốc gia/năm.');
    await exportConfigFromSupabase();
    injectSiteNameIntoHtml();
    injectFooterIntoHtml();
    injectNavIntoHtml();
    injectLoadingScreenIntoHtml();
    if (process.env.GENERATE_MOVIES_LIGHT !== '1') {
      try { await fs.remove(path.join(PUBLIC_DATA, 'movies-light.js')); } catch {}
    }
    const filtersPath = path.join(PUBLIC_DATA, 'filters.js');
    const filterOrderPath = path.join(PUBLIC_DATA, 'config', 'filter-order.json');
    if (await fs.pathExists(filtersPath)) {
      const raw = fs.readFileSync(filtersPath, 'utf8');
      const jsonStr = raw.replace(/^window\.filtersData\s*=\s*/, '').replace(/;\s*$/, '');
      try {
        const filters = JSON.parse(jsonStr);
        if (fs.existsSync(filterOrderPath)) {
          const fo = JSON.parse(fs.readFileSync(filterOrderPath, 'utf8'));
          filters.filterOrder = {
            rowOrder: fo.rowOrder && Array.isArray(fo.rowOrder) ? fo.rowOrder : (filters.filterOrder && filters.filterOrder.rowOrder) || ['year', 'genre', 'country', 'videoType', 'lang'],
            genreOrder: fo.genreOrder && Array.isArray(fo.genreOrder) ? fo.genreOrder : (filters.filterOrder && filters.filterOrder.genreOrder) || [],
            countryOrder: fo.countryOrder && Array.isArray(fo.countryOrder) ? fo.countryOrder : (filters.filterOrder && filters.filterOrder.countryOrder) || [],
            videoTypeOrder: fo.videoTypeOrder && Array.isArray(fo.videoTypeOrder) ? fo.videoTypeOrder : (filters.filterOrder && filters.filterOrder.videoTypeOrder) || ['tvshows', 'hoathinh', '4k', 'exclusive'],
            langOrder: fo.langOrder && Array.isArray(fo.langOrder) ? fo.langOrder : (filters.filterOrder && filters.filterOrder.langOrder) || ['vietsub', 'thuyetminh', 'longtieng', 'khac'],
          };
          fs.writeFileSync(filtersPath, `window.filtersData = ${JSON.stringify(filters)};`, 'utf8');
        }
        writeCategoryPages(filters);
      } catch (e) {
        console.warn('   Không parse được filters.js, bỏ qua writeCategoryPages:', e.message);
      }
    }
    const actorsPath = path.join(PUBLIC_DATA, 'actors.js');
    if (await fs.pathExists(actorsPath)) {
      const raw = fs.readFileSync(actorsPath, 'utf8');
      const jsonStr = raw.replace(/^window\.actorsData\s*=\s*/, '').replace(/;\s*$/, '');
      try {
        const actorsData = JSON.parse(jsonStr);
        const { map: m, names: n, meta } = actorsData;
        let movieById = null;
        const mlPath = path.join(PUBLIC_DATA, 'movies-light.js');
        if (await fs.pathExists(mlPath)) {
          const mlRaw = fs.readFileSync(mlPath, 'utf8');
          const mlStr = mlRaw.replace(/^window\.moviesLight\s*=\s*/, '').replace(/;\s*$/, '');
          try {
            const light = JSON.parse(mlStr);
            movieById = new Map();
            for (const mv of light || []) movieById.set(String(mv.id), mv);
          } catch (ee) {
            console.warn('   Không parse được movies-light.js:', ee.message);
          }
        }
        writeActorsShardsFromData(m || {}, n || {}, movieById, meta || {});
      } catch (e) {
        console.warn('   Không parse được actors.js, bỏ qua writeActorsShardsFromData:', e.message);
      }
    }
    const buildVersion = { builtAt: new Date().toISOString() };
    fs.writeFileSync(path.join(PUBLIC_DATA, 'build_version.json'), JSON.stringify(buildVersion, null, 2));
    console.log('Incremental build xong.');
    return;
  }

  await fs.ensureDir(PUBLIC_DATA);
  await fs.ensureDir(path.join(PUBLIC_DATA, 'config'));
  await fs.ensureDir(path.join(PUBLIC_DATA, 'batches'));

  if (process.env.GENERATE_MOVIES_LIGHT !== '1') {
    try { await fs.remove(path.join(PUBLIC_DATA, 'movies-light.js')); } catch {}
  }

  // Đọc last_modified của lần build trước (nếu có) để chỉ ghi lại batch thay đổi
  const lastModifiedPath = path.join(PUBLIC_DATA, 'last_modified.json');
  let prevLastModified = null;
  if (fs.existsSync(lastModifiedPath)) {
    try {
      prevLastModified = JSON.parse(fs.readFileSync(lastModifiedPath, 'utf8'));
    } catch {
      prevLastModified = null;
    }
  }

  const prevMoviesById = await loadPreviousBuiltMoviesById();
  const prevTmdbById = await loadPreviousBuiltTmdbById();
  const prevOphimIndex = await loadOphimIndex();

  console.log('1. Fetching OPhim...');
  const ophim = await fetchOPhimMovies(prevMoviesById, prevOphimIndex);
  console.log('   OPhim count:', ophim.length);

  console.log('2. Fetching custom (Sheets/Excel)...');
  const custom = await fetchCustomMovies();
  console.log('   Custom count:', custom.length);

  console.log('3. Enriching TMDB...');
  await enrichTmdb((ophim || []).filter((m) => m && !m._skip_tmdb));
  await enrichTmdb(custom);

  const tmdbById = new Map(prevTmdbById || []);
  for (const m of [...(ophim || []), ...(custom || [])]) {
    const idStr = m && m.id != null ? String(m.id) : '';
    if (!idStr) continue;
    if (m.tmdb || m.imdb || (Array.isArray(m.cast) && m.cast.length) || (Array.isArray(m.director) && m.director.length) || (Array.isArray(m.cast_meta) && m.cast_meta.length) || (Array.isArray(m.keywords) && m.keywords.length)) {
      tmdbById.set(idStr, {
        id: idStr,
        tmdb: m.tmdb || null,
        imdb: m.imdb || null,
        cast: Array.isArray(m.cast) ? m.cast : [],
        director: Array.isArray(m.director) ? m.director : [],
        cast_meta: Array.isArray(m.cast_meta) ? m.cast_meta : [],
        keywords: Array.isArray(m.keywords) ? m.keywords : [],
      });
    }
  }

  const allMovies = mergeMovies(ophim, custom);
  console.log('4. Total movies:', allMovies.length);

  console.log('4b. Fetching OPhim genres & countries...');
  const { genreNames, countryNames } = await fetchOPhimGenresAndCountries();

  console.log('5. Exporting config from Supabase Admin (để có filter-order, site-settings...)...');
  await exportConfigFromSupabase();

  console.log('5b. Injecting site_name into HTML files...');
  injectSiteNameIntoHtml();
  console.log('5c. Injecting footer into HTML files...');
  injectFooterIntoHtml();
  console.log('5d. Injecting nav into HTML files...');
  injectNavIntoHtml();
  console.log('5e. Injecting loading screen into HTML files...');
  injectLoadingScreenIntoHtml();
  console.log('5f. Removing movies-light.js script tags from HTML files...');
  removeMoviesLightScriptFromHtml();

  console.log('6. Writing movies-light.js, filters.js, actors (index + shards), batches...');
  if (process.env.GENERATE_MOVIES_LIGHT === '1') {
    writeMoviesLight(allMovies);
  }
  writeIndexAndSearchShards(allMovies);
  const filters = writeFilters(allMovies, genreNames, countryNames);
  writeCategoryPages(filters);
  writeActors(allMovies);
  const newLastModified = writeBatches(allMovies, prevLastModified || undefined, tmdbById);

  console.log('6b. Sync update status back to Google Sheets (NEW -> OK)...');
  await applySheetUpdateStatuses(custom);

  const buildVersion = { builtAt: new Date().toISOString() };
  fs.writeFileSync(path.join(PUBLIC_DATA, 'build_version.json'), JSON.stringify(buildVersion, null, 2));

  console.log('7. Writing sitemap.xml & robots.txt...');
  writeSitemap(allMovies);
  writeRobots();

  const lastBuild = { builtAt: new Date().toISOString(), movieCount: allMovies.length };
  fs.writeFileSync(path.join(PUBLIC_DATA, 'last_build.json'), JSON.stringify(lastBuild, null, 2));
  const lastModifiedOut = newLastModified || {};
  fs.writeFileSync(lastModifiedPath, JSON.stringify(lastModifiedOut, null, 2));
  console.log('Build done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
