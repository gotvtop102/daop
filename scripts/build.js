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

function buildAutoSliderSlides(allMovies, opts) {
  opts = opts || {};
  const n = Math.max(1, Math.min(50, Number(opts.count) || 5));
  const sorted = [...(allMovies || [])].sort((a, b) => {
    const ma = a && a.modified ? String(a.modified) : '';
    const mb = b && b.modified ? String(b.modified) : '';
    if (mb && ma && mb !== ma) return mb.localeCompare(ma);
    const ya = Number(a && a.year) || 0;
    const yb = Number(b && b.year) || 0;
    if (yb !== ya) return yb - ya;
    return String(b && b.id ? b.id : '').localeCompare(String(a && a.id ? a.id : ''));
  });

  const derivePoster = (url) => {
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
  };

  return sorted.slice(0, n).map((m, i) => {
    const slug = m && (m.slug || m.id) ? String(m.slug || m.id) : '';
    const linkUrl = slug ? ('/phim/' + slug + '.html') : '';
    const derivedPoster = (!m.poster && m.thumb) ? derivePoster(m.thumb) : '';
    const imgRaw = (m.poster || derivedPoster || m.thumb || '').toString();
    const title = (m.title || m.origin_name || '').toString();
    const countryName = Array.isArray(m.country) && m.country[0] ? (m.country[0].name || '') : '';
    const genreNames = Array.isArray(m.genre) ? m.genre.map((g) => (g && g.name) ? g.name : '').filter(Boolean) : [];
    return {
      image_url: imgRaw,
      link_url: linkUrl,
      title,
      year: m.year != null ? String(m.year) : undefined,
      country: countryName || undefined,
      episode_current: m.episode_current || undefined,
      genres: genreNames.length ? genreNames : undefined,
      sort_order: i,
      enabled: true,
    };
  });
}

function writeAutoSliderFile(allMovies) {
  try {
    const siteSettingsPath = path.join(PUBLIC_DATA, 'config', 'site-settings.json');
    let settings = {};
    try {
      if (fs.existsSync(siteSettingsPath)) settings = JSON.parse(fs.readFileSync(siteSettingsPath, 'utf8')) || {};
    } catch {
      settings = {};
    }
    const count = Number(settings.homepage_slider_auto_latest_count);
    const slides = buildAutoSliderSlides(allMovies || [], { count });
    const outPath = path.join(PUBLIC_DATA, 'home', 'homepage-slider-auto.json');
    fs.ensureDirSync(path.dirname(outPath));
    fs.writeFileSync(outPath, JSON.stringify(slides, null, 2), 'utf8');
  } catch (e) {
    console.warn('   writeAutoSliderFile failed (continue):', e && e.message ? e.message : e);
  }
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

function validateShardMetaFiles(metaPath, dirPath, filenameBuilder) {
  if (!fs.existsSync(metaPath)) throw new Error('Missing meta file: ' + metaPath);
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const parts = (meta && meta.parts) || {};
  for (const k of Object.keys(parts)) {
    const p = parseInt(parts[k], 10) || 1;
    if (p <= 1) {
      const f = path.join(dirPath, filenameBuilder(k));
      if (!fs.existsSync(f)) throw new Error('Missing shard file: ' + f);
      continue;
    }
    for (let i = 0; i < p; i++) {
      const f = path.join(dirPath, filenameBuilder(k, i));
      if (!fs.existsSync(f)) throw new Error('Missing shard part: ' + f);
    }
  }
}

function validateBatchWindowsAndFiles(allMovies, opts) {
  opts = opts || {};
  const validateTmdb = opts.validateTmdb !== false;
  const batchDir = path.join(PUBLIC_DATA, 'batches');
  const windowsPath = path.join(batchDir, 'batch-windows.json');
  if (!fs.existsSync(windowsPath)) throw new Error('Missing batch windows: ' + windowsPath);
  const wj = JSON.parse(fs.readFileSync(windowsPath, 'utf8'));
  const wins = wj && Array.isArray(wj.windows) ? wj.windows : [];
  const total = wj && typeof wj.total === 'number' ? wj.total : -1;
  if (!wins.length) throw new Error('batch-windows.json has empty windows');
  if (total !== (allMovies ? allMovies.length : total)) {
    throw new Error('batch-windows.json total mismatch: ' + total + ' vs movies ' + (allMovies ? allMovies.length : 'n/a'));
  }
  let cur = 0;
  for (const w of wins) {
    if (!w || typeof w.start !== 'number' || typeof w.end !== 'number') throw new Error('Invalid window entry');
    if (w.start !== cur) throw new Error('Non-contiguous window start: ' + w.start + ' expected ' + cur);
    if (w.end <= w.start) throw new Error('Invalid window range: ' + w.start + ' -> ' + w.end);
    if (w.end > total) throw new Error('Window end exceeds total: ' + w.end + ' > ' + total);
    const core = path.join(batchDir, `batch_${w.start}_${w.end}.js`);
    const tmdb = path.join(batchDir, `tmdb_batch_${w.start}_${w.end}.js`);
    if (!fs.existsSync(core)) throw new Error('Missing batch file: ' + core);
    if (validateTmdb && !fs.existsSync(tmdb)) throw new Error('Missing tmdb batch file: ' + tmdb);
    cur = w.end;
  }
  if (cur !== total) throw new Error('Windows do not cover total: ' + cur + ' != ' + total);
  return { windows: wins, total };
}

function loadBatchWindowsOrThrow() {
  const windowsPath = path.join(PUBLIC_DATA, 'batches', 'batch-windows.json');
  if (!fs.existsSync(windowsPath)) throw new Error('Missing batch windows: ' + windowsPath);
  const wj = JSON.parse(fs.readFileSync(windowsPath, 'utf8'));
  const wins = wj && Array.isArray(wj.windows) ? wj.windows : [];
  const total = wj && typeof wj.total === 'number' ? wj.total : -1;
  if (!wins.length || total < 0) throw new Error('Invalid batch-windows.json');
  return { windows: wins, total };
}

function validateIdIndexPointersSample(allMovies, sampleCount = 200, opts) {
  opts = opts || {};
  const validateTmdb = opts.validateTmdb !== false;
  const idDir = path.join(PUBLIC_DATA, 'index', 'id');
  const batchDir = path.join(PUBLIC_DATA, 'batches');
  if (!fs.existsSync(idDir)) throw new Error('Missing id index dir: ' + idDir);

  const sorted = [...(allMovies || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!sorted.length) return;

  const picks = [];
  const n = Math.min(sampleCount, sorted.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(i * (sorted.length - 1) / Math.max(1, n - 1));
    picks.push(sorted[idx]);
  }

  const shards = new Map();
  for (const m of picks) {
    const idStr = m && m.id != null ? String(m.id) : '';
    if (!idStr) continue;
    const shard = getShardKey2(idStr);
    if (shards.has(shard)) continue;
    const f = path.join(idDir, `${shard}.js`);
    if (!fs.existsSync(f)) throw new Error('Missing id shard: ' + f);
    const raw = fs.readFileSync(f, 'utf8');
    const jsonStr = raw
      .replace(/^window\.DAOP\s*=\s*window\.DAOP\s*\|\|\s*\{\};\s*window\.DAOP\.idIndex\s*=\s*window\.DAOP\.idIndex\s*\|\|\s*\{\};\s*window\.DAOP\.idIndex\[[^\]]+\]\s*=\s*/i, '')
      .replace(/;\s*$/, '');
    shards.set(shard, JSON.parse(jsonStr));
  }

  for (const m of picks) {
    const idStr = m && m.id != null ? String(m.id) : '';
    if (!idStr) continue;
    const shard = getShardKey2(idStr);
    const map = shards.get(shard);
    const row = map ? map[idStr] : null;
    if (!row) throw new Error('idIndex missing id: ' + idStr);
    if (!row.b) throw new Error('idIndex missing batch pointer (b) for id: ' + idStr);
    if (validateTmdb && !row.t) throw new Error('idIndex missing tmdb batch pointer (t) for id: ' + idStr);
    const core = path.join(batchDir, String(row.b));
    if (!fs.existsSync(core)) throw new Error('Pointer batch missing: ' + core);
    if (validateTmdb) {
      const tmdb = path.join(batchDir, String(row.t));
      if (!fs.existsSync(tmdb)) throw new Error('Pointer tmdb batch missing: ' + tmdb);
    }
  }
}

function validateBuildOutputs(allMovies) {
  const validate = process.env.VALIDATE_BUILD;
  if (validate === '0' || validate === 'false') return;

  console.log('8. Validating build outputs...');

  const moviesLightPath = path.join(PUBLIC_DATA, 'movies-light.js');
  if (process.env.GENERATE_MOVIES_LIGHT !== '1' && fs.existsSync(moviesLightPath)) {
    throw new Error('movies-light.js should not exist when GENERATE_MOVIES_LIGHT!=1');
  }

  const filtersPath = path.join(PUBLIC_DATA, 'filters.js');
  if (!fs.existsSync(filtersPath)) throw new Error('Missing filters.js');
  const filtersRaw = fs.readFileSync(filtersPath, 'utf8');
  if (!/\"langMap\"\s*:\s*\{/.test(filtersRaw)) throw new Error('filters.js missing langMap');

  const validateTmdb = !(process.env.SKIP_TMDB === '1' || process.env.SKIP_TMDB === 'true')
    || (process.env.VALIDATE_TMDB === '1' || process.env.VALIDATE_TMDB === 'true');
  validateBatchWindowsAndFiles(allMovies, { validateTmdb });

  validateShardMetaFiles(
    path.join(PUBLIC_DATA, 'index', 'slug', 'meta.json'),
    path.join(PUBLIC_DATA, 'index', 'slug'),
    (k, p) => (p == null ? `${k}.js` : `${k}.${p}.js`)
  );
  validateShardMetaFiles(
    path.join(PUBLIC_DATA, 'search', 'prefix', 'meta.json'),
    path.join(PUBLIC_DATA, 'search', 'prefix'),
    (k, p) => (p == null ? `${k}.js` : `${k}.${p}.js`)
  );

  validateIdIndexPointersSample(
    allMovies,
    parseInt(process.env.VALIDATE_SAMPLE_COUNT || '200', 10) || 200,
    { validateTmdb }
  );

  console.log('   Validation OK');
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
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return base ? `${base}/${key}` : null;
}

function sanitizeR2Name(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const n = raw.replace(/\\/g, '/').split('/').pop() || '';
  return n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function guessExtFromContentType(ct) {
  const t = String(ct || '').toLowerCase();
  if (t.includes('image/png')) return 'png';
  if (t.includes('image/webp')) return 'webp';
  if (t.includes('image/gif')) return 'gif';
  if (t.includes('image/jpeg') || t.includes('image/jpg')) return 'jpg';
  return '';
}

function guessExtFromUrl(u) {
  try {
    const p = new URL(u).pathname || '';
    const base = p.split('/').pop() || '';
    const m = base.match(/\.([a-zA-Z0-9]{2,5})$/);
    const ext = m ? m[1].toLowerCase() : '';
    if (ext === 'jpeg') return 'jpg';
    if (ext === 'jpg' || ext === 'png' || ext === 'webp' || ext === 'gif') return ext;
    return '';
  } catch {
    return '';
  }
}

async function optimizeImageBuffer(buf, ext) {
  const e = String(ext || '').toLowerCase();
  if (e === 'gif') return buf;
  try {
    const img = sharp(buf, { failOn: 'none' }).rotate();
    return await img.webp({ quality: 80 }).toBuffer();
  } catch {
    return buf;
  }
}

/** Download image, optimize/compress, optional upload R2 (keep original filename) */
async function processImage(url, slug, folder = 'thumbs') {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());

    const ct = res.headers.get('content-type') || '';
    const ext = guessExtFromContentType(ct) || guessExtFromUrl(url) || 'jpg';
    const fromUrlName = sanitizeR2Name((new URL(url).pathname || '').split('/').pop() || '');
    const baseName = (fromUrlName || sanitizeR2Name(`${slug}.${ext}`) || `${slug}.${ext}`)
      .replace(/\.(jpe?g|jpg|png|webp)$/i, '');
    const filename = (baseName || slug) + (String(ext).toLowerCase() === 'gif' ? '.gif' : '.webp');

    const optimized = await optimizeImageBuffer(buf, ext);
    const key = `${folder}/${filename}`;
    const r2Url = await uploadToR2(optimized, key, String(ext).toLowerCase() === 'gif' ? 'image/gif' : 'image/webp');
    return r2Url || url;
  } catch {
    return url;
  }
}

/** Giới hạn OPhim: số trang tối đa (0 = không giới hạn), số phim tối đa (0 = không giới hạn). Đặt env để tránh build quá lâu (vd: OPHIM_MAX_PAGES=5, OPHIM_MAX_MOVIES=500). */
const OPHIM_MAX_PAGES = Number(process.env.OPHIM_MAX_PAGES) || 0;
const OPHIM_MAX_MOVIES = Number(process.env.OPHIM_MAX_MOVIES) || 0;
/** Khoảng trang OPhim: cho phép chọn trang bắt đầu/kết thúc (0 = mặc định/không giới hạn). */
const OPHIM_START_PAGE_RAW = process.env.OPHIM_START_PAGE;
const OPHIM_END_PAGE_RAW = process.env.OPHIM_END_PAGE;
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
    // movies-light.js (nếu có) chỉ dùng để bổ sung field cho các phim đã tồn tại trong batch.
    // Tránh trường hợp movies-light.js còn giữ id cũ nhưng batch/index đã bị dọn, gây lệch filters vs idIndex.
    if (await fs.pathExists(moviesLightPath)) {
      try {
        const mlRaw = await fs.readFile(moviesLightPath, 'utf8');
        const light = parseWindowArray(mlRaw, 'moviesLight');
        for (const m of light || []) {
          const idStr = m && m.id != null ? String(m.id) : '';
          if (!idStr) continue;
          const cur = byId.get(idStr);
          if (!cur) continue;
          byId.set(idStr, { ...m, ...cur });
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

async function fetchOPhimMovies(prevMoviesById, prevIndex, cleanOldData = false) {
  const list = [];
  const isPageRange = (OPHIM_START_PAGE > 1) || (OPHIM_END_PAGE > 0);
  const effectiveMaxPages = isPageRange ? 0 : OPHIM_MAX_PAGES;
  const effectiveMaxMovies = isPageRange ? 0 : OPHIM_MAX_MOVIES;
  const isPartialRange =
    isPageRange ||
    (effectiveMaxPages > 0) ||
    (effectiveMaxMovies > 0);

  const nextIndex = isPartialRange && prevIndex && typeof prevIndex === 'object'
    ? { ...prevIndex }
    : {};
  const reused = { count: 0 };
  const fetched = { count: 0 };
  let page = OPHIM_START_PAGE > 0 ? OPHIM_START_PAGE : 1;
  let fetchedPages = 0;
  const hasEnd = OPHIM_END_PAGE > 0;
  const targetEnd = hasEnd ? OPHIM_END_PAGE : Infinity;
  const step = hasEnd && page >= targetEnd ? -1 : 1;
  console.log(
    '   OPhim paging:',
    'start=', OPHIM_START_PAGE,
    'end=', OPHIM_END_PAGE,
    'max_pages=', effectiveMaxPages,
    'max_movies=', effectiveMaxMovies,
    'direction=', (step === -1 ? 'backward' : 'forward'),
    'clean_old_data=', cleanOldData ? 1 : 0
  );
  if (OPHIM_END_PAGE === 1 && OPHIM_END_PAGE_RAW != null && String(OPHIM_END_PAGE_RAW).trim() === '1') {
    console.warn(
      '   WARNING: OPHIM_END_PAGE=1 đang giới hạn fetch chỉ đến trang 1. ' +
      'Chỉ nên dùng khi bạn chủ đích fetch trang 1 (hoặc range về 1). ' +
      'Nếu mục tiêu là unlimited, hãy đặt OPHIM_END_PAGE=0.'
    );
  }
  while (true) {
    if (effectiveMaxPages > 0 && fetchedPages >= effectiveMaxPages) {
      console.log('   OPhim: đạt giới hạn số trang:', effectiveMaxPages, '(từ trang', OPHIM_START_PAGE, ')');
      break;
    }
    if (effectiveMaxMovies > 0 && list.length >= effectiveMaxMovies) {
      console.log('   OPhim: đạt giới hạn số phim:', effectiveMaxMovies);
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
      const slug = item?.slug;
      const rawId = item?._id || item?.id || '';
      const idStr = rawId ? String(rawId) : '';
      if (!slug || !idStr) continue;

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
          const reusedStatus = (reusedMovie.status || '').toString().trim();
          const reusedShowtimes = (reusedMovie.showtimes || '').toString().trim();
          const itemStatus = (item && item.status != null) ? String(item.status).trim() : '';
          const itemShowtimes = (item && item.showtimes != null) ? String(item.showtimes).trim() : '';
          const canBackfill = (!reusedStatus && itemStatus) || (!reusedShowtimes && itemShowtimes);
          const shouldRefetchDetail = (!reusedStatus && !itemStatus) && (!reusedShowtimes && !itemShowtimes);

          if (canBackfill && !shouldRefetchDetail) {
            list.push({
              ...reusedMovie,
              status: reusedStatus || itemStatus,
              showtimes: reusedShowtimes || itemShowtimes,
              _skip_tmdb: true,
            });
            nextIndex[idStr] = { slug: slug.toString().toLowerCase(), modified: prev.modified || modifiedStr || '' };
            reused.count++;
            continue;
          }

          if (reusedStatus || reusedShowtimes) {
            list.push({ ...reusedMovie, _skip_tmdb: true });
            nextIndex[idStr] = { slug: slug.toString().toLowerCase(), modified: prev.modified || modifiedStr || '' };
            reused.count++;
            continue;
          }

          // Nếu phim cũ thiếu status/showtimes (do build cũ normalize lỗi) => ép fetch detail lại.
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

  // Nếu build chỉ fetch một phần range trang (vd: 20->10) thì KHÔNG được làm mất phim cũ.
  // Ta merge (union) với dữ liệu đã build trước đó dựa trên ophim_index.json.
  if (isPartialRange && !cleanOldData && prevMoviesById && prevIndex && typeof prevIndex === 'object') {
    try {
      const fetchedIds = new Set();
      for (const m of list || []) {
        const idStr = m && m.id != null ? String(m.id) : '';
        if (idStr) fetchedIds.add(idStr);
      }

      let preserved = 0;
      for (const [idStr, prevMovie] of prevMoviesById.entries()) {
        if (!idStr) continue;
        if (fetchedIds.has(idStr)) continue;
        if (!prevIndex[idStr]) continue; // chỉ preserve phim OPhim
        if (!prevMovie) continue;
        list.push({ ...prevMovie, _skip_tmdb: true });
        preserved++;
      }
      if (preserved > 0) {
        console.log('   OPhim preserved from previous build:', preserved);
      }
    } catch (e) {
      console.warn('   OPhim preserve previous movies failed (continue):', e && e.message ? e.message : e);
    }
  }

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
    status: (m.status || '').toString(),
    showtimes: (m.showtimes || '').toString(),
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
  const parseOnOff = (v, defaultVal) => {
    if (v == null || v === '') return !!defaultVal;
    const t = String(v).trim().toLowerCase();
    if (t === '0' || t === 'false' || t === 'off' || t === 'no' || t === 'n' || t === 'none') return false;
    if (t === '1' || t === 'true' || t === 'on' || t === 'yes' || t === 'y' || t === 'ok') return true;
    // fallback: number
    const n = Number(t);
    if (!Number.isNaN(n)) return n !== 0;
    // fallback: non-empty string means true
    return true;
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
      is_exclusive: parseOnOff(row[idx('is_exclusive')], false),
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

    // NEW/NEW2: ép modified=now để chắc chắn build lại/batch thay đổi, và lưu info để update lại sheet NEW->OK/NEW2 sau build.
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

const TMDB_CACHE_DIR = path.join(PUBLIC_DATA, 'cache', 'tmdb');
const TMDB_CACHE_ENABLED = (process.env.TMDB_CACHE !== '0' && process.env.TMDB_CACHE !== 'false');
const TMDB_CACHE_TTL_DAYS = Number(process.env.TMDB_CACHE_TTL_DAYS || 7);
const TMDB_CACHE_TTL_MS = Number.isFinite(TMDB_CACHE_TTL_DAYS) ? (TMDB_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) : (7 * 24 * 60 * 60 * 1000);
const TMDB_CONCURRENCY = Math.max(1, Math.min(32, Number(process.env.TMDB_CONCURRENCY || 6)));
const TMDB_CACHE_SHARDS = Math.max(1, Math.min(256, Number(process.env.TMDB_CACHE_SHARDS || 200)));

function safeJsonRead(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function tmdbCacheShardIndex(key) {
  const s = String(key || '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h |= 0;
  }
  const idx = Math.abs(h) % TMDB_CACHE_SHARDS;
  return idx;
}

function tmdbCacheShardPath(idx) {
  const safe = String(idx).padStart(3, '0');
  return path.join(TMDB_CACHE_DIR, `shard_${safe}.json`);
}

const _tmdbShardMem = new Map();
const _tmdbShardLocks = new Map();

async function withShardLock(idx, fn) {
  const prev = _tmdbShardLocks.get(idx) || Promise.resolve();
  const next = prev.then(fn, fn);
  _tmdbShardLocks.set(idx, next.catch(() => {}));
  return next;
}

function loadTmdbShardFile(p) {
  const j = safeJsonRead(p);
  if (!j || typeof j !== 'object') return { version: 1, entries: {} };
  if (!j.version) j.version = 1;
  if (!j.entries || typeof j.entries !== 'object') j.entries = {};
  return j;
}

async function tmdbFetchJsonCached(url, cacheKey) {
  if (!TMDB_CACHE_ENABLED) return fetchJson(url);

  const key = String(cacheKey || '').trim();
  if (!key) return fetchJson(url);

  const idx = tmdbCacheShardIndex(key);
  const p = tmdbCacheShardPath(idx);
  const now = Date.now();

  try {
    fs.ensureDirSync(TMDB_CACHE_DIR);
  } catch {}

  // Fast path: memory cache
  const mem = _tmdbShardMem.get(idx);
  if (mem && mem.entries && mem.entries[key] && mem.entries[key].at) {
    const fresh = (now - Number(mem.entries[key].at)) <= TMDB_CACHE_TTL_MS;
    if (fresh) return mem.entries[key].data;
  }

  // Load shard from disk (serialized)
  await withShardLock(idx, async () => {
    if (_tmdbShardMem.has(idx)) return;
    try {
      const shard = await fs.pathExists(p) ? loadTmdbShardFile(p) : { version: 1, entries: {} };
      _tmdbShardMem.set(idx, shard);
    } catch {
      _tmdbShardMem.set(idx, { version: 1, entries: {} });
    }
  });

  const shard = _tmdbShardMem.get(idx) || { version: 1, entries: {} };
  const hit = shard.entries && shard.entries[key];
  if (hit && hit.at) {
    const fresh = (now - Number(hit.at)) <= TMDB_CACHE_TTL_MS;
    if (fresh) return hit.data;
  }

  // Miss -> fetch
  const data = await fetchJson(url);

  // Write back (serialized)
  await withShardLock(idx, async () => {
    const s2 = _tmdbShardMem.get(idx) || { version: 1, entries: {} };
    s2.entries = s2.entries && typeof s2.entries === 'object' ? s2.entries : {};
    s2.entries[key] = { at: Date.now(), data };

    // Opportunistic cleanup (remove expired entries to keep shards small)
    try {
      const cutoff = Date.now() - TMDB_CACHE_TTL_MS;
      const entries = s2.entries;
      for (const k of Object.keys(entries)) {
        const e = entries[k];
        if (!e || !e.at || Number(e.at) < cutoff) delete entries[k];
      }
    } catch {}

    _tmdbShardMem.set(idx, s2);
    try {
      fs.writeFileSync(p, JSON.stringify(s2), 'utf8');
    } catch {}
  });

  return data;
}

const _tmdbPersonNameViCache = new Map();

async function getTmdbPersonNameVi(personId) {
  const id = String(personId || '').trim();
  if (!id) return null;
  if (_tmdbPersonNameViCache.has(id)) return _tmdbPersonNameViCache.get(id);
  if (!TMDB_KEY) {
    _tmdbPersonNameViCache.set(id, null);
    return null;
  }
  await sleep(40);
  try {
    const res = await tmdbFetchJsonCached(
      `${TMDB_BASE}/person/${id}/translations?api_key=${TMDB_KEY}`,
      `person_${id}_translations`
    ).catch(() => null);
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
  if (!TMDB_KEY) {
    console.warn('TMDB_API_KEY is missing -> skip TMDB enrich (cast/director/keywords will be empty).');
    return;
  }
  const list = Array.isArray(movies) ? movies : [];
  let nextIndex = 0;
  const workerCount = Math.min(TMDB_CONCURRENCY, list.length || 1);
  const workers = Array.from({ length: workerCount }, () => (async () => {
    while (true) {
      const i = nextIndex;
      nextIndex++;
      const m = list[i];
      if (!m) break;

      const tid = m.tmdb?.id || m.tmdb_id;
      if (!tid) continue;
      const type = (m.type || 'movie') === 'single' ? 'movie' : 'tv';
      await sleep(40);
      try {
        const baseKey = `${type}_${tid}`;
        const [detailRes, creditsRes, keywordsRes] = await Promise.all([
          tmdbFetchJsonCached(`${TMDB_BASE}/${type}/${tid}?api_key=${TMDB_KEY}&language=${TMDB_LANG}`, `${baseKey}_detail_${TMDB_LANG}`).catch(() => null),
          tmdbFetchJsonCached(`${TMDB_BASE}/${type}/${tid}/credits?api_key=${TMDB_KEY}`, `${baseKey}_credits`),
          tmdbFetchJsonCached(`${TMDB_BASE}/${type}/${tid}/keywords?api_key=${TMDB_KEY}`, `${baseKey}_keywords`).catch(() => ({ keywords: [] })),
        ]);

        const castList = (creditsRes && Array.isArray(creditsRes.cast)) ? creditsRes.cast.slice(0, 15) : [];
        const castMeta = [];

        let castNext = 0;
        const castWorkers = Array.from({ length: Math.min(3, castList.length || 1) }, () => (async () => {
          while (true) {
            const ci = castNext;
            castNext++;
            const c = castList[ci];
            if (!c) break;
            const nameVi = await getTmdbPersonNameVi(c.id);
            castMeta[ci] = {
              name: nameVi || c.name,
              name_vi: nameVi || null,
              name_original: c.name,
              tmdb_id: c.id,
              profile: c.profile_path ? (TMDB_IMG_BASE + c.profile_path) : null,
              tmdb_url: c.id ? `https://www.themoviedb.org/person/${c.id}` : null,
            };
          }
        })());
        await Promise.all(castWorkers);

        const castMetaCompact = castMeta.filter(Boolean);
        const cast = castMetaCompact.map((c) => c.name);
        const director = (creditsRes && Array.isArray(creditsRes.crew)) ? creditsRes.crew.filter((c) => c.job === 'Director').map((c) => c.name) : [];
        const keywords = (keywordsRes && Array.isArray(keywordsRes.keywords)) ? keywordsRes.keywords.map((k) => k.name) : [];
        m.cast = m.cast?.length ? m.cast : cast;
        m.cast_meta = Array.isArray(m.cast_meta) && m.cast_meta.length ? m.cast_meta : castMetaCompact;
        m.director = m.director?.length ? m.director : director;
        m.keywords = m.keywords?.length ? m.keywords : keywords;
        if (!m.poster && detailRes?.poster_path) {
          m.poster = TMDB_IMG_BASE + detailRes.poster_path;
        }
      } catch {}
    }
  })());

  await Promise.all(workers);
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

function pickMovieLight(m) {
  if (!m) return null;
  return {
    id: String(m.id),
    title: m.title,
    origin_name: m.origin_name || '',
    slug: m.slug,
    thumb: m.thumb,
    poster: m.poster,
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
  };
}

function modifiedTs(m) {
  const v = m && m.modified ? Date.parse(String(m.modified)) : NaN;
  return Number.isNaN(v) ? 0 : v;
}

function parseCsvSet(s) {
  const raw = String(s || '').trim();
  if (!raw) return null;
  const arr = raw.split(',').map((x) => String(x).trim()).filter(Boolean);
  return arr.length ? new Set(arr.map((x) => x.toLowerCase())) : null;
}

function isOn(settingValue, defaultOn) {
  if (settingValue == null || settingValue === '') return !!defaultOn;
  const v = String(settingValue).trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  return !!defaultOn;
}

function writeHomeSectionsData(movies) {
  const configPath = path.join(PUBLIC_DATA, 'config', 'homepage-sections.json');
  if (!fs.existsSync(configPath)) return;
  const siteSettingsPath = path.join(PUBLIC_DATA, 'config', 'site-settings.json');
  let siteSettings = {};
  try {
    if (fs.existsSync(siteSettingsPath)) siteSettings = JSON.parse(fs.readFileSync(siteSettingsPath, 'utf8')) || {};
  } catch {}

  const homeDir = path.join(PUBLIC_DATA, 'home');
  const outPath = path.join(homeDir, 'home-sections-data.json');
  const enabled = isOn(siteSettings.home_prebuild_enabled, true);
  if (!enabled) {
    try { fs.removeSync(outPath); } catch {}
    return;
  }

  const globalLimitRaw = Number(siteSettings.home_prebuild_limit || 24);
  const globalLimit = Math.max(1, Math.min(50, Number.isFinite(globalLimitRaw) ? globalLimitRaw : 24));

  const enableSeries = isOn(siteSettings.home_prebuild_enable_series, true);
  const enableSingle = isOn(siteSettings.home_prebuild_enable_single, true);
  const enableHoathinh = isOn(siteSettings.home_prebuild_enable_hoathinh, true);
  const enableTvshows = isOn(siteSettings.home_prebuild_enable_tvshows, true);
  const enableYear = isOn(siteSettings.home_prebuild_enable_year, true);
  const enableGenre = isOn(siteSettings.home_prebuild_enable_genre, true);
  const enableCountry = isOn(siteSettings.home_prebuild_enable_country, true);

  const enableQuality4k = isOn(siteSettings.home_prebuild_enable_quality_4k, true);
  const enableStatusCurrent = isOn(siteSettings.home_prebuild_enable_status_current, true);
  const enableStatusUpcoming = isOn(siteSettings.home_prebuild_enable_status_upcoming, true);
  const enableStatusTheater = isOn(siteSettings.home_prebuild_enable_status_theater, true);
  const enableExclusive = isOn(siteSettings.home_prebuild_enable_exclusive, true);
  const enableVietsub = isOn(siteSettings.home_prebuild_enable_vietsub, true);
  const enableThuyetminh = isOn(siteSettings.home_prebuild_enable_thuyetminh, true);
  const enableLongtieng = isOn(siteSettings.home_prebuild_enable_longtieng, true);

  const allowYears = parseCsvSet(siteSettings.home_prebuild_years);
  const allowGenres = parseCsvSet(siteSettings.home_prebuild_genres);
  const allowCountries = parseCsvSet(siteSettings.home_prebuild_countries);

  let sections;
  try {
    sections = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return;
  }
  const list = Array.isArray(movies) ? movies : [];
  const sortedByModified = [...list].sort((a, b) => modifiedTs(b) - modifiedTs(a));

  const out = [];
  for (const sec of sections) {
    if (!sec || sec.is_active === false) continue;
    const st = String(sec.source_type || '').trim().toLowerCase();
    const rawSv = String(sec.source_value || '').trim();
    let sv = rawSv.toLowerCase();

    if (st === 'status') {
      // Backward compatibility: admin may store status section value as list-page URL.
      // Normalize to one of: current | upcoming | theater
      if (sv.includes('phim-dang-chieu')) sv = 'current';
      else if (sv.includes('phim-sap-chieu')) sv = 'upcoming';
      else if (sv.includes('phim-chieu-rap')) sv = 'theater';
    }

    if (st === 'type') {
      if (sv === 'series' && !enableSeries) continue;
      if (sv === 'single' && !enableSingle) continue;
      if (sv === 'hoathinh' && !enableHoathinh) continue;
      if (sv === 'tvshows' && !enableTvshows) continue;
    }
    if (st === 'year') {
      if (!enableYear) continue;
      const y = String(sec.source_value || '').trim().toLowerCase();
      if (allowYears && y && !allowYears.has(y)) continue;
    }
    if (st === 'genre') {
      if (!enableGenre) continue;
      if (allowGenres && sv && !allowGenres.has(sv)) continue;
    }
    if (st === 'country') {
      if (!enableCountry) continue;
      if (allowCountries && sv && !allowCountries.has(sv)) continue;
    }

    if (st === 'quality_4k') {
      if (!enableQuality4k) continue;
    }
    if (st === 'exclusive') {
      if (!enableExclusive) continue;
    }
    if (st === 'vietsub') {
      if (!enableVietsub) continue;
    }
    if (st === 'thuyetminh') {
      if (!enableThuyetminh) continue;
    }
    if (st === 'longtieng') {
      if (!enableLongtieng) continue;
    }
    if (st === 'status') {
      if (sv === 'current' && !enableStatusCurrent) continue;
      if (sv === 'upcoming' && !enableStatusUpcoming) continue;
      if (sv === 'theater' && !enableStatusTheater) continue;
    }

    const secLimitRaw = Number(sec.limit_count || 0);
    const secLimit = Number.isFinite(secLimitRaw) && secLimitRaw > 0 ? secLimitRaw : globalLimit;
    const limit = Math.max(1, Math.min(50, secLimit));
    let picked = [];

    if (st === 'manual' && Array.isArray(sec.manual_movies) && sec.manual_movies.length) {
      const wanted = sec.manual_movies.map((x) => String(x)).filter(Boolean);
      const wantedSet = new Set(wanted);
      const byId = new Map();
      for (const m of sortedByModified) byId.set(String(m.id), m);
      for (const id of wanted) {
        const mv = byId.get(id);
        if (mv) picked.push(mv);
        if (picked.length >= limit) break;
      }
      if (picked.length < limit) {
        for (const mv of sortedByModified) {
          if (wantedSet.has(String(mv.id))) continue;
          picked.push(mv);
          if (picked.length >= limit) break;
        }
      }
    } else {
      for (const m of sortedByModified) {
        let ok = false;
        if (st === 'type') ok = String(m.type || '').toLowerCase() === sv;
        else if (st === 'year') ok = String(m.year || '') === String(sec.source_value || '');
        else if (st === 'genre') ok = Array.isArray(m.genre) && m.genre.some((g) => String(g.slug || '').toLowerCase() === sv);
        else if (st === 'country') ok = Array.isArray(m.country) && m.country.some((c) => String(c.slug || '').toLowerCase() === sv);
        else if (st === 'status') {
          const statusRaw = (m.status || '').toString().trim();
          const statusKey = statusRaw ? statusRaw.toLowerCase() : '';
          const showtimes = (m.showtimes || '').toString().toLowerCase();
          if (sv === 'theater') {
            ok = !!m.chieurap;
          } else if (sv === 'upcoming') {
            ok =
              statusKey.includes('sắp') ||
              statusKey.includes('sap') ||
              statusKey.includes('upcoming') ||
              statusKey.includes('soon') ||
              statusKey === 'trailer' ||
              statusKey.includes('trailer') ||
              showtimes.includes('sắp') ||
              showtimes.includes('sap');
          } else if (sv === 'current') {
            ok =
              statusKey.includes('đang') ||
              statusKey.includes('dang') ||
              statusKey === 'ongoing' ||
              statusKey.includes('ongoing') ||
              statusKey.includes('current') ||
              statusKey.includes('on going') ||
              statusKey.includes('cập nhật') ||
              statusKey.includes('cap nhat');
          } else {
            ok = statusKey === sv;
          }
        }
        else if (st === 'quality_4k') ok = !!m.is_4k;
        else if (st === 'exclusive') {
          const subDocQuyenRaw = m && m.sub_docquyen != null ? String(m.sub_docquyen).trim().toLowerCase() : '';
          ok =
            !!m.is_exclusive ||
            m.sub_docquyen === true ||
            subDocQuyenRaw === '1' ||
            subDocQuyenRaw === 'true' ||
            subDocQuyenRaw === 'yes' ||
            subDocQuyenRaw === 'on' ||
            subDocQuyenRaw === 'ok';
        } else if (st === 'vietsub') {
          const lk = String(m.lang_key || '').toLowerCase();
          const lkNorm = normalizeSearchText(lk);
          ok = lkNorm.includes('vietsub');
        } else if (st === 'thuyetminh') {
          const lk = String(m.lang_key || '').toLowerCase();
          const lkNorm = normalizeSearchText(lk);
          ok = lkNorm.includes('thuyet minh');
        } else if (st === 'longtieng') {
          const lk = String(m.lang_key || '').toLowerCase();
          const lkNorm = normalizeSearchText(lk);
          ok = lkNorm.includes('long tieng');
        }
        if (ok) picked.push(m);
        if (picked.length >= limit) break;
      }
    }

    out.push({
      ...sec,
      ids: picked.map((x) => x && x.id).filter(Boolean),
      movies: picked.map(pickMovieLight).filter(Boolean),
    });
  }

  fs.ensureDirSync(homeDir);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
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

function writeIndexAndSearchShards(movies, batchPtrById) {
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
    const ptr = batchPtrById ? batchPtrById.get(idStr) : null;
    idIndexByShard.get(idShard)[idStr] = {
      i,
      id: idStr,
      b: ptr && ptr.b ? ptr.b : '',
      t: ptr && ptr.t ? ptr.t : '',
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
    const q = (m.quality || '').toString().toLowerCase();
    const is4k = !!m.is_4k || /4k|uhd|2160p/.test(q);
    if (is4k) quality4kIds.push(m.id);
    const subDocQuyenRaw = m && m.sub_docquyen != null ? String(m.sub_docquyen).trim().toLowerCase() : '';
    const isExclusive =
      !!m.is_exclusive ||
      m.sub_docquyen === true ||
      subDocQuyenRaw === '1' ||
      subDocQuyenRaw === 'true' ||
      subDocQuyenRaw === 'yes' ||
      subDocQuyenRaw === 'on' ||
      subDocQuyenRaw === 'ok';
    if (isExclusive) exclusiveIds.push(m.id);
    if (m.type) {
      if (!typeMap[m.type]) typeMap[m.type] = [];
      typeMap[m.type].push(m.id);
    }
    const statusRaw = (m.status || '').toString().trim();
    const statusKey = statusRaw ? statusRaw.toLowerCase() : '';
    if (statusRaw) {
      if (!statusMap[statusRaw]) statusMap[statusRaw] = [];
      statusMap[statusRaw].push(m.id);
    }

    if (!statusMap.current) statusMap.current = [];
    if (!statusMap.upcoming) statusMap.upcoming = [];
    if (!statusMap.theater) statusMap.theater = [];

    const showtimes = (m.showtimes || '').toString().toLowerCase();
    const isTheater = !!m.chieurap || statusKey.includes('chiếu rạp') || statusKey.includes('chieu rap') || showtimes.includes('rạp') || showtimes.includes('rap');
    if (isTheater) statusMap.theater.push(m.id);

    const isUpcoming =
      statusKey.includes('sắp') ||
      statusKey.includes('sap') ||
      statusKey.includes('upcoming') ||
      statusKey.includes('soon') ||
      statusKey === 'trailer' ||
      statusKey.includes('trailer') ||
      showtimes.includes('sắp') ||
      showtimes.includes('sap');
    if (isUpcoming) statusMap.upcoming.push(m.id);

    const isCurrent =
      statusKey.includes('đang') ||
      statusKey.includes('dang') ||
      statusKey === 'ongoing' ||
      statusKey.includes('ongoing') ||
      statusKey.includes('current') ||
      statusKey.includes('on going') ||
      statusKey.includes('cập nhật') ||
      statusKey.includes('cap nhat');
    if (isCurrent) statusMap.current.push(m.id);

    const lk = (m.lang_key || '').toString().toLowerCase();
    const lkNorm = normalizeSearchText(lk);
    if (!lkNorm) {
      langMap.khac.push(m.id);
    } else {
      let any = false;
      if (lkNorm.includes('vietsub')) {
        langMap.vietsub.push(m.id);
        any = true;
      }
      if (lkNorm.includes('thuyet minh')) {
        langMap.thuyetminh.push(m.id);
        any = true;
      }
      if (lkNorm.includes('long tieng')) {
        langMap.longtieng.push(m.id);
        any = true;
      }
      if (!any) langMap.khac.push(m.id);
    }
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
  if (slugs.length === 0) {
    const total = Array.isArray(movies) ? movies.length : 0;
    const withCast = (Array.isArray(movies) ? movies : []).filter((m) =>
      (Array.isArray(m?.cast_meta) && m.cast_meta.length) || (Array.isArray(m?.cast) && m.cast.length)
    ).length;
    console.warn(`Actors output is empty (0 actors). Movies=${total}, moviesWithCast=${withCast}. Common cause: TMDB enrich skipped (missing TMDB_API_KEY or SKIP_TMDB).`);
  }
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
function writeBatches(movies, prevLastModified, tmdbById, prevTmdbById) {
  const writeCore = !(process.env.TMDB_ONLY === '1' || process.env.TMDB_ONLY === 'true');
  const writeTmdb = !(process.env.SKIP_TMDB === '1' || process.env.SKIP_TMDB === 'true');
  const sorted = [...movies].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const batchDir = path.join(PUBLIC_DATA, 'batches');
  fs.ensureDirSync(batchDir);

  let forcedWindows = null;
  if (!writeCore && writeTmdb) {
    forcedWindows = loadBatchWindowsOrThrow();
    if (forcedWindows.total !== sorted.length) {
      const windowsPath = path.join(batchDir, 'batch-windows.json');
      throw new Error(
        'TMDB_ONLY requires movie total to match existing batch windows: ' +
          forcedWindows.total +
          ' vs ' +
          sorted.length +
          '. This means your existing batches are out-of-sync with ' +
          windowsPath +
          '.\n' +
          'Fix: run the CORE phase (TMDB_ONLY=0) to regenerate batches/windows, or ensure the TMDB_ONLY job uses the exact same public/data output (artifact) from the CORE job. ' +
          'Do NOT mix an old batch-windows.json with a partially-updated batches folder.'
      );
    }
  }

  const BASE_BATCH = Math.max(10, parseInt(process.env.BASE_BATCH_SIZE || String(BATCH_SIZE || 120), 10) || 120);
  const MAX_BATCH_BYTES = Math.max(50_000, parseInt(process.env.BATCH_MAX_BYTES || '300000', 10) || 300000);
  const windowsPath = path.join(batchDir, 'batch-windows.json');

  const toCoreMovie = (m) => {
    if (!m) return m;
    const {
      imdb,
      cast,
      director,
      cast_meta,
      keywords,
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
  const newLastModified = {};
  const batchPtrById = new Map();

  function isWindowsValid(wins, expectedTotal) {
    if (!Array.isArray(wins) || !wins.length) return false;
    let cur = 0;
    for (const w of wins) {
      if (!w || typeof w.start !== 'number' || typeof w.end !== 'number') return false;
      if (!Number.isInteger(w.start) || !Number.isInteger(w.end)) return false;
      if (w.start !== cur) return false;
      if (w.end <= w.start) return false;
      if (w.end > expectedTotal) return false;
      cur = w.end;
    }
    return cur === expectedTotal;
  }

  function buildWindowsBySize(from, to) {
    const out = [];
    for (let baseStart = from; baseStart < to; baseStart += BASE_BATCH) {
      const baseEnd = Math.min(baseStart + BASE_BATCH, to);
      const slice = sorted.slice(baseStart, baseEnd);

      let curStart = baseStart;
      let cur = [];
      for (let j = 0; j < slice.length; j++) {
        const m = slice[j];
        const next = cur.concat([toCoreMovie(m)]);
        const bytes = Buffer.byteLength(JSON.stringify(next), 'utf8');
        if (cur.length > 0 && bytes > MAX_BATCH_BYTES) {
          out.push({ start: curStart, end: baseStart + j });
          curStart = baseStart + j;
          cur = [];
        }
        cur.push(toCoreMovie(m));
      }
      if (cur.length) out.push({ start: curStart, end: baseEnd });
    }
    return out;
  }

  // Windows strategy:
  // - First build: create windows by size cap and persist.
  // - Subsequent builds (updates): reuse existing windows so updates do not re-split by size;
  //   changed batches may exceed MAX_BATCH_BYTES.
  // - If total increases: extend windows for new tail using size cap.
  // - If movies removed (handled below): force full regen and rebuild windows.
  // - TMDB_ONLY: MUST reuse existing windows exactly, never rebuild or overwrite windows.
  let windows = [];
  if (forcedWindows && Array.isArray(forcedWindows.windows) && forcedWindows.windows.length) {
    windows = forcedWindows.windows.slice(0);
  } else {
    let prevWindowsTotal = 0;
    if (prevLastModified && fs.existsSync(windowsPath)) {
      try {
        const wj = JSON.parse(fs.readFileSync(windowsPath, 'utf8'));
        const wins = wj && Array.isArray(wj.windows) ? wj.windows : [];
        prevWindowsTotal = typeof wj.total === 'number' ? wj.total : 0;
        if (isWindowsValid(wins, Math.min(total, prevWindowsTotal || total))) {
          windows = wins.slice(0);
        }
      } catch {}
    }
    if (!windows.length) {
      windows = buildWindowsBySize(0, total);
    } else if (windows.length && windows[windows.length - 1].end < total) {
      const from = windows[windows.length - 1].end;
      const extra = buildWindowsBySize(from, total);
      if (extra.length) windows = windows.concat(extra);
    }
  }

  for (let idx = 0; idx < sorted.length; idx++) {
    const m = sorted[idx];
    const idStr = m.id != null ? String(m.id) : '';
    const modified = m.modified || m.updated_at || '';
    newLastModified[idStr] = modified;
  }

  // Nếu có phim bị xóa (có trong map cũ nhưng không còn trong map mới) → ghi lại toàn bộ để tránh lệch dữ liệu.
  // TMDB_ONLY: không được tự rebuild windows trong phase này.
  if (prevLastModified && !forcedWindows) {
    for (const idStr of Object.keys(prevLastModified)) {
      if (!newLastModified[idStr]) {
        console.log('   Detect removed movies, regenerate toàn bộ batch files.');
        prevLastModified = null;
        windows = buildWindowsBySize(0, total);
        break;
      }
    }
  }

  let rewrittenCore = 0;
  let rewrittenTmdb = 0;
  for (const w of windows) {
    const start = w.start;
    const end = w.end;
    const slice = sorted.slice(start, end);

    const coreFile = `batch_${start}_${end}.js`;
    const tmdbFile = `tmdb_batch_${start}_${end}.js`;
    const corePath = path.join(batchDir, coreFile);
    const tmdbPath = path.join(batchDir, tmdbFile);

    // 1) Xác định slice có phim thay đổi theo last_modified (dùng chung cho core + tmdb)
    let sliceHasModifiedChange = !prevLastModified;
    if (!sliceHasModifiedChange && prevLastModified) {
      for (const m of slice) {
        const idStr = m && m.id != null ? String(m.id) : '';
        if (!idStr) continue;
        const modified = m.modified || m.updated_at || '';
        const old = prevLastModified ? prevLastModified[idStr] : undefined;
        if (!old || old !== modified) {
          sliceHasModifiedChange = true;
          break;
        }
      }
    }

    // 2) Quyết định ghi core
    let shouldWriteCore = false;
    if (writeCore) {
      shouldWriteCore = sliceHasModifiedChange;
      if (!shouldWriteCore && !fs.existsSync(corePath)) shouldWriteCore = true;
    }

    // 3) Quyết định ghi tmdb
    // - SKIP_TMDB: không ghi tmdb batch (để tránh tạo file "id-only" làm phase-2 bị skip)
    // - TMDB_ONLY: chỉ ghi tmdb batch, và chỉ ghi các batch có payload TMDB đổi / thiếu so với build trước.
    let shouldWriteTmdb = false;
    if (writeTmdb) {
      if (!fs.existsSync(tmdbPath)) {
        shouldWriteTmdb = true;
      } else if (!prevLastModified) {
        // first build (hoặc không có last_modified) => ghi tất cả
        shouldWriteTmdb = true;
      } else if (!prevTmdbById || typeof prevTmdbById.get !== 'function') {
        // không có dữ liệu tmdb trước đó => fallback theo last_modified
        shouldWriteTmdb = sliceHasModifiedChange;
      } else {
        for (const m of slice) {
          const idStr = m && m.id != null ? String(m.id) : '';
          if (!idStr) continue;
          const prevPayload = prevTmdbById.get(idStr);
          const curPayload = tmdbById && typeof tmdbById.get === 'function' ? tmdbById.get(idStr) : undefined;
          // Nếu trước đó chưa có payload, hoặc hiện tại có thêm dữ liệu => cần ghi lại batch
          if (!prevPayload && curPayload) { shouldWriteTmdb = true; break; }
          // Nếu hiện tại mất payload (hiếm) => cũng ghi để đồng bộ
          if (prevPayload && !curPayload) { shouldWriteTmdb = true; break; }
          // So sánh nội dung (nhẹ) để detect thay đổi TMDB
          if (prevPayload && curPayload) {
            try {
              if (JSON.stringify(prevPayload) !== JSON.stringify(curPayload)) {
                shouldWriteTmdb = true;
                break;
              }
            } catch {
              // fallback theo last_modified
              if (sliceHasModifiedChange) { shouldWriteTmdb = true; break; }
            }
          }
        }
      }
    }

    for (const m of slice) {
      const idStr = m && m.id != null ? String(m.id) : '';
      if (!idStr) continue;
      batchPtrById.set(idStr, { b: coreFile, t: tmdbFile });
    }

    if (shouldWriteCore) {
      const batch = slice.map((m) => toCoreMovie(m));
      const content = `window.moviesBatch = ${JSON.stringify(batch)};`;
      fs.writeFileSync(corePath, content, 'utf8');
      rewrittenCore++;
    }

    if (shouldWriteTmdb) {
      const tmdbBatch = slice.map((m) => toTmdbPayload(m && m.id != null ? String(m.id) : ''));
      const tmdbContent = `window.moviesTmdbBatch = ${JSON.stringify(tmdbBatch)};`;
      fs.writeFileSync(tmdbPath, tmdbContent, 'utf8');
      rewrittenTmdb++;
    }
  }

  if (!prevLastModified) {
    console.log('   Đã ghi lại toàn bộ batch files (lần đầu hoặc không có thông tin last_modified trước đó).');
  } else {
    console.log('   Đã ghi lại', rewrittenCore, 'core batch files có phim mới hoặc thay đổi.');
    if (writeTmdb) console.log('   Đã ghi lại', rewrittenTmdb, 'tmdb batch files có TMDB thay đổi.');
  }

  // TMDB_ONLY: không ghi đè windows, vì core batch files đang theo windows của core phase.
  if (!forcedWindows) {
    try {
      fs.writeFileSync(
        windowsPath,
        JSON.stringify({
          baseBatchSize: BASE_BATCH,
          maxBytes: MAX_BATCH_BYTES,
          total,
          windows,
        }, null, 2)
      );
    } catch {}
  }

  return { newLastModified, batchPtrById };
}

/** 9. Đọc Supabase Admin và xuất config JSON */
async function exportConfigFromSupabase() {
  const url = process.env.SUPABASE_ADMIN_URL;
  const key = process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('SUPABASE_ADMIN_URL hoặc SUPABASE_ADMIN_SERVICE_ROLE_KEY chưa đặt — dùng config mặc định. Cập nhật trên Admin sẽ không xuất ra website. Thêm 2 secret này vào GitHub Actions (build-on-demand) để export đúng từ Supabase.');
    try {
      const configDir = path.join(PUBLIC_DATA, 'config');
      const hasExisting = await fs.pathExists(path.join(configDir, 'site-settings.json'));
      if (hasExisting) {
        console.warn('Config đã tồn tại (public/data/config). Bỏ qua ghi đè default để tránh reset settings.');
        return;
      }
    } catch {}
    await writeDefaultConfig();
    return;
  }
  const supabase = createClient(url, key);
  const configDir = path.join(PUBLIC_DATA, 'config');
  fs.ensureDirSync(configDir);

  const today = new Date().toISOString().slice(0, 10);
  const [bannersRes, sections, settings, staticPages, donate, playerSettingsRes, prerollRes] = await Promise.all([
    supabase.from('ad_banners').select('*').eq('is_active', true),
    supabase.from('homepage_sections').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('site_settings').select('key, value'),
    supabase.from('static_pages').select('*'),
    supabase.from('donate_settings').select('*').limit(1).maybeSingle(),
    supabase.from('player_settings').select('key, value'),
    supabase.from('ad_preroll').select('*').eq('is_active', true).order('weight', { ascending: false }),
  ]);

  const errors = [
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
    r2_img_domain: 'https://pub-62eef44669df48e4bca5388a38e69522.r2.dev',
    ophim_img_domain: 'https://img.ophim.live',
    theme_light_bg: '#eef2f5',
    home_prebuild_enabled: 'true',
    home_prebuild_limit: '24',
    home_prebuild_enable_series: 'true',
    home_prebuild_enable_single: 'true',
    home_prebuild_enable_hoathinh: 'true',
    home_prebuild_enable_tvshows: 'true',
    home_prebuild_enable_year: 'true',
    home_prebuild_years: '',
    home_prebuild_enable_genre: 'true',
    home_prebuild_genres: '',
    home_prebuild_enable_country: 'true',
    home_prebuild_countries: '',
    home_prebuild_enable_quality_4k: 'true',
    home_prebuild_enable_status_current: 'true',
    home_prebuild_enable_status_upcoming: 'true',
    home_prebuild_enable_status_theater: 'true',
    home_prebuild_enable_exclusive: 'true',
    home_prebuild_enable_vietsub: 'true',
    home_prebuild_enable_thuyetminh: 'true',
    home_prebuild_enable_longtieng: 'true',
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
    homepage_slider_display_mode: 'manual',
    homepage_slider_auto_latest_count: '5',
    ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`menu_bg_${i + 1}`, ''])),
    movies_data_url: '',
    filter_row_order: JSON.stringify(['year', 'genre', 'country', 'videoType', 'lang']),
    filter_genre_order: JSON.stringify([]),
    filter_country_order: JSON.stringify([]),
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

  // Merge static pages: ưu tiên dữ liệu từ Supabase, nhưng giữ lại các page_key không có trong Supabase từ file hiện tại
  const existingStaticPagesPath = path.join(configDir, 'static-pages.json');
  let mergedStaticPages = staticPages.data || [];
  
  if (fs.existsSync(existingStaticPagesPath)) {
    try {
      const existingContent = fs.readFileSync(existingStaticPagesPath, 'utf8');
      const existingPages = JSON.parse(existingContent);
      if (Array.isArray(existingPages)) {
        const supabaseKeys = new Set(mergedStaticPages.map(p => p.page_key));
        // Thêm các page từ file hiện tại mà không có trong Supabase
        for (const page of existingPages) {
          if (page.page_key && !supabaseKeys.has(page.page_key)) {
            mergedStaticPages.push(page);
          }
        }
      }
    } catch (e) {
      console.warn('Không thể đọc/parse static-pages.json hiện tại, sử dụng dữ liệu từ Supabase:', e.message);
    }
  }
  
  fs.writeFileSync(path.join(configDir, 'static-pages.json'), JSON.stringify(mergedStaticPages, null, 2));
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
    'banners.json': [],
    'homepage-sections.json': JSON.parse(
      fs.readFileSync(path.join(ROOT, 'config', 'default-sections.json'), 'utf-8')
    ),
    'site-settings.json': {
      site_name: 'DAOP Phim',
      logo_url: '',
      favicon_url: '',
      home_prebuild_enabled: 'true',
      home_prebuild_limit: '24',
      home_prebuild_enable_series: 'true',
      home_prebuild_enable_single: 'true',
      home_prebuild_enable_hoathinh: 'true',
      home_prebuild_enable_tvshows: 'true',
      home_prebuild_enable_year: 'true',
      home_prebuild_years: '',
      home_prebuild_enable_genre: 'true',
      home_prebuild_genres: '',
      home_prebuild_enable_country: 'true',
      home_prebuild_countries: '',
      home_prebuild_enable_quality_4k: 'true',
      home_prebuild_enable_status_current: 'true',
      home_prebuild_enable_status_upcoming: 'true',
      home_prebuild_enable_status_theater: 'true',
      home_prebuild_enable_exclusive: 'true',
      home_prebuild_enable_vietsub: 'true',
      home_prebuild_enable_thuyetminh: 'true',
      home_prebuild_enable_longtieng: 'true',
      google_analytics_id: '',
      simple_analytics_script: '',
      twikoo_env_id: '',
      supabase_user_url: '',
      supabase_user_anon_key: '',
      social_facebook: '',
      social_twitter: '',
      social_instagram: '',
      social_youtube: '',
      detail_hide_header_default: 'false',
      watch_hide_header_default: 'false',
      footer_content: '',
      tmdb_attribution: 'true',
      loading_screen_enabled: 'true',
      loading_screen_min_seconds: '0',
    },
    'static-pages.json': [],
    'donate.json': {
      target_amount: 0,
      target_currency: 'VND',
      current_amount: 0,
      paypal_link: '',
      bank_info: [],
      crypto_addresses: [],
      methods: [
        { type: 'paypal', custom_label: '', url: '', note: '' },
        { type: 'btc', custom_label: '', url: '', note: '' },
        { type: 'eth', custom_label: '', url: '', note: '' },
        { type: 'ltc', custom_label: '', url: '', note: '' },
        { type: 'usdt_trc20', custom_label: '', url: '', note: '' },
        { type: 'usdt_erc20', custom_label: '', url: '', note: '' },
        { type: 'bnb_bep20', custom_label: '', url: '', note: '' },
        { type: 'sol', custom_label: '', url: '', note: '' },
      ],
    },
    'player-settings.json': {
      available_players: { 'plyr': 'Plyr', 'videojs': 'Video.js', 'jwplayer': 'JWPlayer' },
      default_player: 'plyr',
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

  const isPartialOphimRange =
    (OPHIM_START_PAGE > 1) ||
    (OPHIM_END_PAGE > 0) ||
    (OPHIM_MAX_PAGES > 0) ||
    (OPHIM_MAX_MOVIES > 0);

  const strictGuards = (process.env.STRICT_BUILD_GUARDS === '1' || process.env.STRICT_BUILD_GUARDS === 'true');
  if (!incremental && cleanOldData && isPartialOphimRange) {
    const msg =
      'CLEAN_OLD_DATA=1 đang bật cùng với giới hạn OPhim (start/end/max_pages/max_movies). ' +
      'Build sẽ chỉ giữ dữ liệu trong phạm vi fetch hiện tại và có thể làm mất phim ngoài phạm vi. ' +
      'Nếu bạn muốn giữ đủ dữ liệu qua nhiều lần chạy theo range, hãy chạy CLEAN_OLD_DATA=0.';
    if (strictGuards) {
      throw new Error('STRICT_BUILD_GUARDS: ' + msg);
    }
    console.warn('WARNING:', msg);
  }

  if (!incremental && cleanOldData && OPHIM_END_PAGE === 1) {
    const msg =
      'Bạn đang bật CLEAN_OLD_DATA=1 và đồng thời OPHIM_END_PAGE=1. ' +
      'Đây là cấu hình rất dễ làm mất phim cũ (vì chỉ fetch đến trang 1 rồi dọn dữ liệu cũ). ' +
      'Nếu bạn chỉ muốn refresh trang 1 nhưng vẫn giữ phim cũ: hãy đặt CLEAN_OLD_DATA=0.';
    if (strictGuards) {
      throw new Error('STRICT_BUILD_GUARDS: ' + msg);
    }
    console.warn('WARNING:', msg);
  }

  if (!incremental && cleanOldData) {
    console.log('Cleanup: removing old generated data in public/data (keep config).');
    try {
      const batchDir = path.join(PUBLIC_DATA, 'batches');
      await fs.remove(batchDir);
      const homeDir = path.join(PUBLIC_DATA, 'home');
      await fs.remove(homeDir);
      const indexDir = path.join(PUBLIC_DATA, 'index');
      await fs.remove(indexDir);
      const searchDir = path.join(PUBLIC_DATA, 'search');
      await fs.remove(searchDir);
      const cacheDir = path.join(PUBLIC_DATA, 'cache');
      await fs.remove(cacheDir);
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
    console.log('Incremental: export config từ Supabase + tạo lại trang thể loại/quốc gia/năm + rebuild filters/actors từ batch hiện có.');
    await exportConfigFromSupabase();
    injectSiteNameIntoHtml();
    injectFooterIntoHtml();
    injectNavIntoHtml();
    injectLoadingScreenIntoHtml();
    if (process.env.GENERATE_MOVIES_LIGHT !== '1') {
      try { await fs.remove(path.join(PUBLIC_DATA, 'movies-light.js')); } catch {}
    }

    // Incremental: rebuild filters.js và actors.js từ dữ liệu batch hiện có để phim mới xuất hiện trên các trang danh sách
    const loadedMovies = await loadPreviousBuiltMoviesById();
    if (loadedMovies && loadedMovies.size > 0) {
      const allMovies = Array.from(loadedMovies.values());
      console.log('   Incremental: rebuild filters từ', allMovies.length, 'phim trong batch hiện có.');
      const { genreNames, countryNames } = await fetchOPhimGenresAndCountries();
      const filters = writeFilters(allMovies, genreNames, countryNames);
      writeCategoryPages(filters);
      writeActors(allMovies);
    } else {
      // Fallback: chỉ tạo lại trang từ filters.js hiện có (hành vi cũ)
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

  const skipTmdb = (process.env.SKIP_TMDB === '1' || process.env.SKIP_TMDB === 'true');
  const tmdbOnly = (process.env.TMDB_ONLY === '1' || process.env.TMDB_ONLY === 'true');

  // TMDB_ONLY phase (2-phase): KHÔNG được fetch lại OPhim/Custom vì có thể làm thay đổi tổng số phim,
  // dẫn tới mismatch với batch-windows.json. Phase này chỉ enrich TMDB và ghi tmdb_batch_*.
  if (tmdbOnly) {
    if (skipTmdb) {
      console.log('TMDB_ONLY: SKIP_TMDB đang bật, không có gì để làm.');
      return;
    }
    if (!prevMoviesById || prevMoviesById.size === 0) {
      throw new Error('TMDB_ONLY requires existing built movies in public/data/batches (prevMoviesById is empty). Run CORE/full build first.');
    }

    let allMovies = Array.from(prevMoviesById.values());
    console.log('TMDB_ONLY: loaded movies from existing batches:', allMovies.length);
    try {
      const wins = loadBatchWindowsOrThrow();
      if (wins && typeof wins.total === 'number' && wins.total > 0 && wins.total !== allMovies.length) {
        const moviesLightPath = path.join(PUBLIC_DATA, 'movies-light.js');
        if (await fs.pathExists(moviesLightPath)) {
          try {
            const mlRaw = await fs.readFile(moviesLightPath, 'utf8');
            const light = parseWindowArray(mlRaw, 'moviesLight');
            if (Array.isArray(light) && light.length === wins.total) {
              allMovies = light;
              console.log('TMDB_ONLY: fallback to movies-light.js:', allMovies.length);
            }
          } catch {}
        }
      }
    } catch {}

    const forceTmdb = (process.env.FORCE_TMDB === '1' || process.env.FORCE_TMDB === 'true');
    const shouldEnrich = (m) => {
      if (!m) return false;
      const tid = (m.tmdb && m.tmdb.id) || m.tmdb_id;
      if (!tid) return false;
      if (forceTmdb) return true;
      const idStr = m && m.id != null ? String(m.id) : '';
      if (!idStr) return true;
      if (!prevTmdbById || typeof prevTmdbById.get !== 'function') return true;
      const prev = prevTmdbById.get(idStr);
      if (!prev) return true;
      const prevTid = prev && prev.tmdb ? prev.tmdb.id : null;
      if (prevTid != null && String(prevTid) !== String(tid)) return true;
      return false;
    };

    const need = (allMovies || []).filter(shouldEnrich);
    console.log('TMDB_ONLY: movies to enrich:', need.length);
    await enrichTmdb(need);

    const tmdbById = new Map(prevTmdbById || []);
    for (const m of allMovies) {
      const idStr = m && m.id != null ? String(m.id) : '';
      if (!idStr) continue;
      const hasAnyTmdbField =
        !!m.tmdb ||
        !!m.imdb ||
        (Array.isArray(m.cast) && m.cast.length) ||
        (Array.isArray(m.director) && m.director.length) ||
        (Array.isArray(m.cast_meta) && m.cast_meta.length) ||
        (Array.isArray(m.keywords) && m.keywords.length);
      if (!hasAnyTmdbField) continue;

      const prev = tmdbById.get(idStr);
      tmdbById.set(idStr, {
        id: idStr,
        tmdb: m.tmdb || (prev && prev.tmdb) || null,
        imdb: m.imdb || (prev && prev.imdb) || null,
        cast: (Array.isArray(m.cast) && m.cast.length) ? m.cast : ((prev && Array.isArray(prev.cast)) ? prev.cast : []),
        director: (Array.isArray(m.director) && m.director.length) ? m.director : ((prev && Array.isArray(prev.director)) ? prev.director : []),
        cast_meta: (Array.isArray(m.cast_meta) && m.cast_meta.length) ? m.cast_meta : ((prev && Array.isArray(prev.cast_meta)) ? prev.cast_meta : []),
        keywords: (Array.isArray(m.keywords) && m.keywords.length) ? m.keywords : ((prev && Array.isArray(prev.keywords)) ? prev.keywords : []),
      });
    }

    console.log('Writing TMDB batches only...');
    writeBatches(allMovies, prevLastModified || undefined, tmdbById, prevTmdbById);

    // Rebuild actors từ TMDB payload: CORE phase (SKIP_TMDB) thường không có cast/cast_meta,
    // và core batches còn strip các field này. Nếu không rebuild ở đây, /dien-vien sẽ rỗng.
    try {
      const mergedMovies = allMovies.map((m) => {
        const idStr = m && m.id != null ? String(m.id) : '';
        const t = idStr ? tmdbById.get(idStr) : null;
        if (!t) return m;
        return {
          ...m,
          tmdb: t.tmdb || m.tmdb,
          imdb: t.imdb || m.imdb,
          cast: (Array.isArray(t.cast) && t.cast.length) ? t.cast : (m.cast || []),
          director: (Array.isArray(t.director) && t.director.length) ? t.director : (m.director || []),
          cast_meta: (Array.isArray(t.cast_meta) && t.cast_meta.length) ? t.cast_meta : (m.cast_meta || []),
          keywords: (Array.isArray(t.keywords) && t.keywords.length) ? t.keywords : (m.keywords || []),
        };
      });
      writeActors(mergedMovies);
    } catch (e) {
      console.warn('TMDB_ONLY: rebuild actors failed (continue):', e && e.message ? e.message : e);
    }

    const buildVersion = { builtAt: new Date().toISOString() };
    fs.writeFileSync(path.join(PUBLIC_DATA, 'build_version.json'), JSON.stringify(buildVersion, null, 2));
    console.log('TMDB_ONLY build done.');
    return;
  }

  console.log('1. Fetching OPhim...');
  const ophim = await fetchOPhimMovies(prevMoviesById, prevOphimIndex, cleanOldData);
  console.log('   OPhim count:', ophim.length);

  console.log('2. Fetching custom (Sheets/Excel)...');
  const custom = await fetchCustomMovies();
  console.log('   Custom count:', custom.length);
  if (!skipTmdb) {
    console.log('3. Enriching TMDB...');
    if (tmdbOnly) {
      const forceTmdb = (process.env.FORCE_TMDB === '1' || process.env.FORCE_TMDB === 'true');
      const shouldEnrich = (m) => {
        if (!m) return false;
        const tid = (m.tmdb && m.tmdb.id) || m.tmdb_id;
        if (!tid) return false;
        if (forceTmdb) return true;
        const idStr = m && m.id != null ? String(m.id) : '';
        if (!idStr) return true;
        if (!prevTmdbById || typeof prevTmdbById.get !== 'function') return true;
        const prev = prevTmdbById.get(idStr);
        if (!prev) return true;
        const prevTid = prev && prev.tmdb ? prev.tmdb.id : null;
        if (prevTid != null && String(prevTid) !== String(tid)) return true;
        // Nếu phim không đổi so với last_modified và đã có payload TMDB trước đó => bỏ qua gọi TMDB.
        if (prevLastModified && typeof prevLastModified === 'object') {
          const curMod = m.modified || m.updated_at || '';
          const oldMod = prevLastModified[idStr];
          if (oldMod && curMod && String(oldMod) === String(curMod)) {
            return false;
          }
        }
        return true;
      };
      const needOphim = (ophim || []).filter(shouldEnrich);
      const needCustom = (custom || []).filter(shouldEnrich);
      console.log('   TMDB_ONLY: movies to enrich:', needOphim.length + needCustom.length);
      await enrichTmdb(needOphim);
      await enrichTmdb(needCustom);
    } else {
      await enrichTmdb((ophim || []).filter((m) => m && !m._skip_tmdb));
      await enrichTmdb(custom);
    }
  } else {
    console.log('3. Enriching TMDB... (SKIP_TMDB)');
  }

  const tmdbById = new Map(prevTmdbById || []);
  for (const m of [...(ophim || []), ...(custom || [])]) {
    const idStr = m && m.id != null ? String(m.id) : '';
    if (!idStr) continue;
    const hasAnyTmdbField =
      !!m.tmdb ||
      !!m.imdb ||
      (Array.isArray(m.cast) && m.cast.length) ||
      (Array.isArray(m.director) && m.director.length) ||
      (Array.isArray(m.cast_meta) && m.cast_meta.length) ||
      (Array.isArray(m.keywords) && m.keywords.length);
    if (!hasAnyTmdbField) continue;

    const prev = tmdbById.get(idStr);
    tmdbById.set(idStr, {
      id: idStr,
      tmdb: m.tmdb || (prev && prev.tmdb) || null,
      imdb: m.imdb || (prev && prev.imdb) || null,
      cast: (Array.isArray(m.cast) && m.cast.length) ? m.cast : ((prev && Array.isArray(prev.cast)) ? prev.cast : []),
      director: (Array.isArray(m.director) && m.director.length) ? m.director : ((prev && Array.isArray(prev.director)) ? prev.director : []),
      cast_meta: (Array.isArray(m.cast_meta) && m.cast_meta.length) ? m.cast_meta : ((prev && Array.isArray(prev.cast_meta)) ? prev.cast_meta : []),
      keywords: (Array.isArray(m.keywords) && m.keywords.length) ? m.keywords : ((prev && Array.isArray(prev.keywords)) ? prev.keywords : []),
    });
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
  const batchRes = writeBatches(allMovies, prevLastModified || undefined, tmdbById, prevTmdbById);
  const newLastModified = batchRes && batchRes.newLastModified ? batchRes.newLastModified : batchRes;

  writeHomeSectionsData(allMovies);
  writeAutoSliderFile(allMovies);
  const batchPtrById = batchRes && batchRes.batchPtrById ? batchRes.batchPtrById : null;

  writeIndexAndSearchShards(allMovies, batchPtrById);
  const filters = writeFilters(allMovies, genreNames, countryNames);
  writeCategoryPages(filters);
  writeActors(allMovies);

  try {
    fs.writeFileSync(path.join(PUBLIC_DATA, 'last_modified.json'), JSON.stringify(newLastModified, null, 2));
  } catch {}

  console.log('6b. Sync update status back to Google Sheets (NEW -> OK)...');
  await applySheetUpdateStatuses(custom);

  const buildVersion = { builtAt: new Date().toISOString() };
  fs.writeFileSync(path.join(PUBLIC_DATA, 'build_version.json'), JSON.stringify(buildVersion, null, 2));

  console.log('7. Writing sitemap.xml & robots.txt...');
  writeSitemap(allMovies);
  writeRobots();

  if (process.env.VALIDATE_BUILD !== '0' && process.env.VALIDATE_BUILD !== 'false') {
    validateBuildOutputs(allMovies);
  }

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
