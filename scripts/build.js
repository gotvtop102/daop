/**
 * Build script: OPhim + Supabase/Excel (phim custom) + TMDB → static files + Supabase Admin config → JSON
 * Chạy: node scripts/build.js [--incremental]
 */
import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { gzipSync, gunzipSync, constants as zlibConstants } from 'node:zlib';
import { fileURLToPath } from 'url';
import { randomBytes } from 'node:crypto';
import fetch from 'node-fetch';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import slugify from 'slugify';
import {
  getImageCdnBase,
  repoImageKeyExists,
  writeRepoImageFile,
  cdnUrlByMovieSlug,
  repoImageKeyForSlug,
  getImageCdnRef,
  getImagePathPrefix,
} from './lib/repo-images.js';
import { getSlugShard2, getIdShard3 } from './lib/slug-shard.js';
import { normalizeCommitSha } from './lib/jsdelivr-ref.js';
import { extractMovieModifiedCanonical, extractOphimModifiedForPersist } from './lib/movie-modified.js';
import { isPubjsCanonicalUnchanged } from './lib/pubjs-bump-compare.js';
import {
  getPubjsOutputDir,
  getPubjsCdnBase,
  getPubjsCdnRef,
  getPubjsPathPrefix,
  buildPubjsFileUrl,
} from './lib/pubjs-url.js';
import {
  removeMoviesLightScriptFromHtml as libRemoveMoviesLightScriptFromHtml,
  injectSiteNameIntoHtml as libInjectSiteNameIntoHtml,
  injectFooterIntoHtml as libInjectFooterIntoHtml,
  injectNavIntoHtml as libInjectNavIntoHtml,
  injectLoadingScreenIntoHtml as libInjectLoadingScreenIntoHtml,
  injectHomeLcpPreloadIntoHtml as libInjectHomeLcpPreloadIntoHtml,
} from './lib/html-injectors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');
const ACTORS_DATA_DIR = path.join(PUBLIC_DATA, 'actors');
const BATCH_SIZE = 120;
const BATCH_MAX_BYTES_DEFAULT = 300_000;

/**
 * P2-1: số phim “mục tiêu” mỗi cửa sổ batch (trước khi cắt theo byte).
 * Ít file hơn → tăng; mỗi request tải nặng hơn → giảm hoặc giảm BATCH_MAX_BYTES.
 */
function getBaseBatchSizeFromEnv() {
  const raw = parseInt(process.env.BASE_BATCH_SIZE || String(BATCH_SIZE), 10);
  const n = Number.isFinite(raw) && raw > 0 ? raw : BATCH_SIZE;
  return Math.max(10, Math.min(1000, n));
}

/** Trần kích thước mỗi file batch core (JSON); vượt thì tách cửa sổ nhỏ hơn. */
function getBatchMaxBytesFromEnv() {
  const raw = parseInt(process.env.BATCH_MAX_BYTES || String(BATCH_MAX_BYTES_DEFAULT), 10);
  const n = Number.isFinite(raw) && raw > 0 ? raw : BATCH_MAX_BYTES_DEFAULT;
  return Math.max(50_000, Math.min(2_000_000, n));
}

const SHARD_MAX_BYTES_DEFAULT = 300_000;
/** Số bucket tối đa khi hash-split một shard (slug + search prefix: 2 ký tự; idIndex: 3 ký tự). Client tải `parts` file .0…N-1 — không đặt quá cao. */
const SHARD_SPLIT_MAX_PARTS = 256;

/** Trần byte mỗi file shard (slug, idIndex, search prefix); đồng bộ với client lazy load. */
function getShardMaxBytesFromEnv() {
  const raw = parseInt(process.env.SHARD_MAX_BYTES || String(SHARD_MAX_BYTES_DEFAULT), 10);
  const n = Number.isFinite(raw) && raw > 0 ? raw : SHARD_MAX_BYTES_DEFAULT;
  return Math.max(50_000, Math.min(2_000_000, n));
}

/** Token quá ngắn không đưa vào `search/prefix` (tránh shard rác). */
function getSearchPrefixMinTokenLenFromEnv() {
  const raw = parseInt(process.env.SEARCH_PREFIX_MIN_TOKEN_LEN || '2', 10);
  const n = Number.isFinite(raw) && raw > 0 ? raw : 2;
  return Math.max(1, Math.min(20, n));
}

/**
 * Tối đa số từ (sau chuẩn hóa) mỗi phim gán vào prefix shards; 0 = không cắt.
 * Catalog lớn: thử 32–64 để giảm trùng lặp trong các file prefix.
 */
function getSearchPrefixMaxTokensFromEnv() {
  const raw = parseInt(process.env.SEARCH_PREFIX_MAX_TOKENS ?? '0', 10);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  if (raw === 0) return 0;
  return Math.min(500, raw);
}

const OPHIM_DELAY_MS = 200;
const OPHIM_DETAIL_CONCURRENCY = Math.max(1, Math.min(12, parseInt(process.env.OPHIM_DETAIL_CONCURRENCY || '1', 10) || 1));
const OPHIM_DETAIL_DELAY_MS = Math.max(0, parseInt(process.env.OPHIM_DETAIL_DELAY_MS || String(OPHIM_DELAY_MS), 10) || 0);

const OPHIM_BASE = process.env.OPHIM_BASE_URL || 'https://ophim1.com/v1/api';
const TMDB_BASE = 'https://api.themoviedb.org/3';

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

function fmtBuildMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Đo thời gian bước build async (P2-2). */
async function timeBuildPhase(label, fn) {
  const t0 = Date.now();
  console.log(`[TIMING] → ${label}`);
  try {
    const result = await fn();
    console.log(`[TIMING] ✓ ${label}: ${fmtBuildMs(Date.now() - t0)}`);
    return result;
  } catch (e) {
    console.log(`[TIMING] ✗ ${label}: ${fmtBuildMs(Date.now() - t0)} (error)`);
    throw e;
  }
}

/** Đo thời gian bước build đồng bộ. */
function timeBuildPhaseSync(label, fn) {
  const t0 = Date.now();
  console.log(`[TIMING] → ${label}`);
  try {
    const result = fn();
    console.log(`[TIMING] ✓ ${label}: ${fmtBuildMs(Date.now() - t0)}`);
    return result;
  } catch (e) {
    console.log(`[TIMING] ✗ ${label}: ${fmtBuildMs(Date.now() - t0)} (error)`);
    throw e;
  }
}

function parseBooleanFlag(v, defaultVal = false) {
  if (v == null || v === '') return !!defaultVal;
  const t = String(v).trim().toLowerCase();
  if (t === '0' || t === 'false' || t === 'off' || t === 'no' || t === 'n' || t === 'none') return false;
  if (t === '1' || t === 'true' || t === 'on' || t === 'yes' || t === 'y' || t === 'ok') return true;
  const n = Number(t);
  if (!Number.isNaN(n)) return n !== 0;
  return true;
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

function writeHomeBootstrapFile() {
  try {
    const siteSettingsPath = path.join(PUBLIC_DATA, 'config', 'site-settings.json');
    const homepageSectionsPath = path.join(PUBLIC_DATA, 'config', 'homepage-sections.json');
    const homeSectionsDataPath = path.join(PUBLIC_DATA, 'home', 'home-sections-data.json');
    const sliderAutoPath = path.join(PUBLIC_DATA, 'home', 'homepage-slider-auto.json');
    const buildVersionPath = path.join(PUBLIC_DATA, 'build_version.json');

    let siteSettings = null;
    let homepageSections = null;
    let homeSectionsData = null;
    let sliderAuto = null;
    let buildVersion = null;

    try {
      if (fs.existsSync(siteSettingsPath)) siteSettings = JSON.parse(fs.readFileSync(siteSettingsPath, 'utf8')) || null;
    } catch {}
    try {
      if (fs.existsSync(homepageSectionsPath)) homepageSections = JSON.parse(fs.readFileSync(homepageSectionsPath, 'utf8')) || null;
    } catch {}
    try {
      if (fs.existsSync(homeSectionsDataPath)) homeSectionsData = JSON.parse(fs.readFileSync(homeSectionsDataPath, 'utf8')) || null;
    } catch {}
    try {
      if (fs.existsSync(sliderAutoPath)) sliderAuto = JSON.parse(fs.readFileSync(sliderAutoPath, 'utf8')) || null;
    } catch {}
    try {
      if (fs.existsSync(buildVersionPath)) buildVersion = JSON.parse(fs.readFileSync(buildVersionPath, 'utf8')) || null;
    } catch {}

    const out = {
      buildVersion,
      siteSettings,
      homepageSections,
      homeSectionsData,
      sliderAuto,
    };

    const outPath = path.join(PUBLIC_DATA, 'home', 'home-bootstrap.json');
    fs.ensureDirSync(path.dirname(outPath));
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  } catch (e) {
    console.warn('   writeHomeBootstrapFile failed (continue):', e && e.message ? e.message : e);
  }
}

async function ensureRepoImagesForNewCustomMovies(_customMovies) {
  // Không ghi URL ảnh ngược lại nguồn tùy chỉnh; ảnh nằm trong public/ + batch build.
}

async function uploadMovieImageToRepoBySlug(url, slug, folder) {
  const u = String(url || '').trim();
  const slugStr = String(slug || '').trim();
  if (!u || !slugStr) return '';
  try {
    const res = await fetch(u);
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    const ext = guessExtFromContentType(ct) || guessExtFromUrl(u) || 'jpg';
    const optimized = await optimizeImageBuffer(buf, ext);
    const key = repoImageKeyForSlug(slugStr, folder);
    const out = await writeRepoImageFile(optimized, key, 'image/webp');
    return out || '';
  } catch {
    return '';
  }
}

async function ensureRepoImagesForAllMovies(movies) {
  const base = getImageCdnBase();
  if (!base) {
    console.warn('IMAGE_CDN_BASE not configured (jsDelivr base ending with /public). Images will be broken in CDN-only mode.');
    return;
  }
  const list = Array.isArray(movies) ? movies : [];
  if (!list.length) return;

  async function headOk(url, timeoutMs = 12000) {
    const u = String(url || '').trim();
    if (!u) return false;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(u, { method: 'HEAD', signal: ac.signal });
      return !!res && res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  // IMPORTANT: Không dùng build.js để tải/nén ảnh nữa.
  // Build chỉ rewrite thumb/poster sang CDN theo id để tránh tốn thời gian (6a).
  // Nếu bạn thực sự muốn build.js download + optimize + ghi public/ thì phải bật FORCE_REPO_IMAGE_DOWNLOAD=1.
  const forceDownload = (process.env.FORCE_REPO_IMAGE_DOWNLOAD === '1' || process.env.FORCE_REPO_IMAGE_DOWNLOAD === 'true');
  if (!forceDownload) {
    for (const m of list) {
      const slugStr = m && m.slug != null ? String(m.slug).trim() : '';
      if (!slugStr) continue;
      m.thumb = cdnUrlByMovieSlug(slugStr, 'thumbs', {});
      m.poster = cdnUrlByMovieSlug(slugStr, 'posters', {});
    }
    console.log('6a. Repo/CDN images: rewrite URLs only (skip download/optimize). Set FORCE_REPO_IMAGE_DOWNLOAD=1 to enable download.');

    // Optional: verify CDN/assets repo có đủ ảnh không (HEAD request).
    const validate =
      (process.env.VALIDATE_CDN_IMAGES === '1' || process.env.VALIDATE_CDN_IMAGES === 'true');
    if (validate) {
      const sample = Math.max(0, parseInt(process.env.CDN_IMAGE_VALIDATE_SAMPLE || '200', 10) || 200);
      const total = list.length;
      const picks = [];
      const n = sample <= 0 ? total : Math.min(sample, total);
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(i * (total - 1) / Math.max(1, n - 1));
        picks.push(list[idx]);
      }
      const concurrency = Math.max(1, Math.min(20, Number(process.env.CDN_IMAGE_VALIDATE_CONCURRENCY || 10)));
      let next = 0;
      let missingThumb = 0;
      let missingPoster = 0;
      const missing = [];
      const workers = Array.from({ length: Math.min(concurrency, picks.length) }, () => (async () => {
        while (true) {
          const i = next++;
          const m = picks[i];
          if (!m) break;
          const slugStr = m && m.slug != null ? String(m.slug).trim() : '';
          if (!slugStr) continue;
          const tUrl = cdnUrlByMovieSlug(slugStr, 'thumbs', {});
          const pUrl = cdnUrlByMovieSlug(slugStr, 'posters', {});
          const tOk = await headOk(tUrl);
          const pOk = await headOk(pUrl);
          if (!tOk) missingThumb++;
          if (!pOk) missingPoster++;
          if (!tOk || !pOk) {
            const mid = m && m.id != null ? String(m.id) : '';
            if (missing.length < 30) missing.push({ id: mid, slug: slugStr, thumb: !tOk, poster: !pOk });
          }
        }
      })());
      await Promise.all(workers);
      console.log(`   CDN validate: checked ${picks.length}/${total} movies (sample). Missing thumbs=${missingThumb}, posters=${missingPoster}`);
      if (missing.length) {
        console.warn('   CDN validate: examples of missing:', missing);
      }
    }
    return;
  }

  const concurrency = Math.max(1, Math.min(10, Number(process.env.REPO_IMAGE_UPLOAD_CONCURRENCY || process.env.R2_UPLOAD_CONCURRENCY || 6)));
  let next = 0;
  console.log('6a. Ensuring repo/CDN images (id-based) for all movies:', list.length);

  const workers = Array.from({ length: Math.min(concurrency, list.length) }, () => (async () => {
    while (true) {
      const i = next;
      next++;
      const m = list[i];
      if (!m) break;
      const slugStr = m && m.slug != null ? String(m.slug).trim() : '';
      if (!slugStr) continue;

      const desiredThumb = cdnUrlByMovieSlug(slugStr, 'thumbs', {});
      const desiredPoster = cdnUrlByMovieSlug(slugStr, 'posters', {});

      const thumbSrc = String(m.thumb_url || m.thumb || '').trim();
      const posterSrc = String(m.poster_url || m.poster || derivePosterFromThumb(thumbSrc) || thumbSrc || '').trim();

      const thumbKey = repoImageKeyForSlug(slugStr, 'thumbs');
      const posterKey = repoImageKeyForSlug(slugStr, 'posters');

      if (thumbSrc && !String(thumbSrc).includes(`/${slugStr}.webp`)) {
        const already = repoImageKeyExists(thumbKey);
        if (!already) {
          await uploadMovieImageToRepoBySlug(thumbSrc, slugStr, 'thumbs');
        }
      }
      if (posterSrc && !String(posterSrc).includes(`/${slugStr}.webp`)) {
        const already = repoImageKeyExists(posterKey);
        if (!already) {
          await uploadMovieImageToRepoBySlug(posterSrc, slugStr, 'posters');
        }
      }

      m.thumb = desiredThumb;
      m.poster = desiredPoster;
    }
  })());

  await Promise.all(workers);
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

function loadVerByShard(verDir) {
  const verByShard = new Map();
  if (!fs.existsSync(verDir)) return verByShard;
  let files = [];
  try {
    files = fs.readdirSync(verDir).filter((f) => f.endsWith('.json'));
  } catch {
    return verByShard;
  }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(verDir, f), 'utf8'));
      if (j && typeof j === 'object') verByShard.set(f.replace(/\.json$/i, ''), j);
    } catch {}
  }
  return verByShard;
}

function writeVerShardFiles(verDir, byShard, touchedShards = null) {
  fs.ensureDirSync(verDir);
  for (const [shard, obj] of byShard.entries()) {
    if (!shard || !obj || !Object.keys(obj).length) continue;
    if (touchedShards && !touchedShards.has(shard)) continue;
    const fp = path.join(verDir, `${shard}.json`);
    const nextRaw = JSON.stringify(obj);
    if (fs.existsSync(fp)) {
      try {
        const prevRaw = fs.readFileSync(fp, 'utf8');
        if (prevRaw === nextRaw) continue;
      } catch {}
    }
    fs.writeFileSync(fp, nextRaw, 'utf8');
  }
}

/**
 * Chọn @ref jsDelivr cho pubjs / ảnh trong JSON build (luôn @main).
 * Pin SHA theo commit **không** làm trong build — tránh CI đặt PUBJS_REPO_COMMIT/IMAGE_REPO_COMMIT
 * khiến hàng loạt phim vừa đổi nhận ref mới; ghi SHA vào ver + pubjs_url sau push: refresh-pubjs-jsdelivr-after-push / refresh-image-jsdelivr-after-push.
 */
function pickPerMovieJsDelivrRefs() {
  return { dataRef: 'main', thumbRef: 'main', posterRef: 'main' };
}

function writeCdnConfigJson() {
  const out = {
    images: {
      base: getImageCdnBase(),
      ref: getImageCdnRef(),
      pathPrefix: getImagePathPrefix(),
    },
    pubjs: {
      base: getPubjsCdnBase(),
      ref: getPubjsCdnRef(),
      pathPrefix: getPubjsPathPrefix(),
    },
  };
  const next = JSON.stringify(out, null, 2);
  const p = path.join(PUBLIC_DATA, 'cdn.json');
  try {
    if (fs.existsSync(p)) {
      const prev = fs.readFileSync(p, 'utf8');
      if (prev === next) return;
    }
  } catch {}
  fs.ensureDirSync(PUBLIC_DATA);
  fs.writeFileSync(p, next, 'utf8');
}

function mergeMovieWithTmdbMap(m, tmdbById) {
  const idStr = m && m.id != null ? String(m.id) : '';
  if (!idStr) return { ...m };
  const t = tmdbById && typeof tmdbById.get === 'function' ? tmdbById.get(idStr) : null;
  if (!t) return { ...m, id: idStr };
  return {
    ...m,
    id: idStr,
    tmdb: t.tmdb || m.tmdb,
    imdb: t.imdb || m.imdb,
    cast: Array.isArray(t.cast) && t.cast.length ? t.cast : m.cast || [],
    director: Array.isArray(t.director) && t.director.length ? t.director : m.director || [],
    cast_meta: Array.isArray(t.cast_meta) && t.cast_meta.length ? t.cast_meta : m.cast_meta || [],
    keywords: Array.isArray(t.keywords) && t.keywords.length ? t.keywords : m.keywords || [],
  };
}

/**
 * Hai chuỗi modified đã normalize có cùng thời điểm (Date) không — tránh run 2 ghi ver vì khác format.
 * Rỗng một phía: không coi là “đổi OPhim” (ledger lần 1 thường rỗng, lần 2 mới có từ API).
 */
function ophimModifiedMeaningfullyChanged(prevNorm, curNorm) {
  const p = String(prevNorm || '').trim();
  const c = String(curNorm || '').trim();
  if (p === c) return false;
  if (!p || !c) return false;
  const tp = Date.parse(p);
  const tc = Date.parse(c);
  if (Number.isFinite(tp) && Number.isFinite(tc)) return tp !== tc;
  return p !== c;
}

/** Ledger chỉ tin cho bust ver OPhim khi do build ghi — tránh last_modified.json seed/commit (timestamp cũ ≠ API) ghi ver cả đống lần đầu. */
const LAST_MODIFIED_LEDGER_FLAG = '__buildLedger';

function isTrustedLastModifiedLedgerForVer(o) {
  if (o == null || typeof o !== 'object') return false;
  if (o[LAST_MODIFIED_LEDGER_FLAG] !== true) return false;
  for (const k of Object.keys(o)) {
    if (k !== LAST_MODIFIED_LEDGER_FLAG) return true;
  }
  return false;
}

function serializeLastModifiedJson(idToModifiedMap) {
  return JSON.stringify({ [LAST_MODIFIED_LEDGER_FLAG]: true, ...idToModifiedMap }, null, 2);
}

function writeLastModifiedIfChanged(absPath, idToModifiedMap) {
  const next = serializeLastModifiedJson(idToModifiedMap);
  try {
    if (fs.existsSync(absPath)) {
      const prev = fs.readFileSync(absPath, 'utf8');
      if (prev === next) return false;
    }
  } catch {}
  fs.writeFileSync(absPath, next, 'utf8');
  return true;
}

/** Bỏ field nội bộ build (prefix `_`) khỏi JSON pubjs — tránh lệch canonical vs file cũ / lộ metadata. */
function stripInternalKeysForPubjsOutput(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (k.startsWith('_')) delete out[k];
  }
  return out;
}

function normalizePubjsDiskRaw(raw) {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trimEnd();
}

/**
 * Chỉ ghi pubjs khi file mới, payload canonical đổi, hoặc thumb/poster/pubjs_url đổi.
 * Tránh ghi lại cả thư mục khi chỉ khác thứ tự key của JSON.stringify(merged).
 */
function pubjsNeedsDiskWrite(hadReadableFile, prevRaw, nextPubjsJson, merged, pubjsPayloadChanged) {
  if (!hadReadableFile || !prevRaw) return true;
  const pr = normalizePubjsDiskRaw(prevRaw);
  const nr = normalizePubjsDiskRaw(nextPubjsJson);
  if (pr === nr) return false;
  if (pubjsPayloadChanged) return true;
  try {
    const old = JSON.parse(pr);
    const urlsMatch =
      String(old.thumb || '') === String(merged.thumb || '') &&
      String(old.poster || '') === String(merged.poster || '') &&
      String(old.pubjs_url || '') === String(merged.pubjs_url || '');
    return !urlsMatch;
  } catch {
    return true;
  }
}

function normalizeModifiedValue(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';

  let input = s;
  // Format OPhim: "YYYY-MM-DD HH:mm:ss" -> chuyển về ISO UTC
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(s)) {
    input = s.replace(' ', 'T') + 'Z';
  } else if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(s)) {
    // Thiếu Z nhưng có T -> giả định UTC nếu không có thông tin múi giờ
    if (!s.includes('Z') && !s.includes('+') && !/-\d{2}:\d{2}$/.test(s)) {
      input = s + 'Z';
    }
  }

  const t = Date.parse(input);
  if (Number.isFinite(t)) {
    try {
      const d = new Date(t);
      // Bỏ qua mili giây để tránh lệch giữa các nguồn
      d.setMilliseconds(0);
      return d.toISOString();
    } catch {
      return s;
    }
  }
  return s;
}

/** Số dòng cast tối đa trong mỗi file JSON phim (pubjs). */
const MAX_CAST_PUBJS = 18;

/**
 * Đảm bảo mỗi JSON phim luôn có cast: string[] và cast_meta: object[] (tối thiểu { name, name_original }) để client / actors build dùng thống nhất.
 */
function normalizeMovieCastForPubjs(m, maxCast = MAX_CAST_PUBJS) {
  if (!m || typeof m !== 'object') return m;
  const cap = Math.max(1, Math.min(40, Number(maxCast) || MAX_CAST_PUBJS));

  let metaOut = [];
  if (Array.isArray(m.cast_meta) && m.cast_meta.length) {
    metaOut = m.cast_meta
      .filter((c) => c && typeof c === 'object')
      .slice(0, cap)
      .map((c) => ({ ...c }));
  }

  let castOut = [];
  if (metaOut.length) {
    castOut = metaOut
      .map((c) => String(c.name_vi || c.name || c.name_original || '').trim())
      .filter(Boolean);
  }

  if (!castOut.length) {
    if (Array.isArray(m.cast) && m.cast.length) {
      castOut = m.cast
        .map((x) => {
          if (x == null) return '';
          if (typeof x === 'string') return x.trim();
          if (typeof x === 'object' && x && x.name != null) return String(x.name).trim();
          return String(x).trim();
        })
        .filter(Boolean)
        .slice(0, cap);
    } else if (typeof m.cast === 'string' && String(m.cast).trim()) {
      castOut = ophimNameListToStrings(m.cast).slice(0, cap);
    } else if (m.actor != null) {
      castOut = ophimNameListToStrings(m.actor).slice(0, cap);
    }
  }

  if (metaOut.length && (!castOut.length || castOut.length !== metaOut.length)) {
    castOut = metaOut
      .map((c) => String(c.name_vi || c.name || c.name_original || '').trim())
      .filter(Boolean)
      .slice(0, cap);
  }

  if (castOut.length > cap) castOut = castOut.slice(0, cap);
  if (metaOut.length > cap) metaOut = metaOut.slice(0, cap);

  if (castOut.length && !metaOut.length) {
    metaOut = castOut.map((name) => ({
      name,
      name_vi: null,
      name_original: name,
    }));
  }

  m.cast = castOut;
  m.cast_meta = metaOut;
  return m;
}

/**
 * Ghi JSON phim vào pubjs-output (đồng bộ pjs102 qua push repo ngoài),
 * public/data/ver/*.json: build chỉ ghi token `b` khi cần bust @main (OPhim đổi / admin NEW); **không** ghi SHA ref ở đây.
 * SHA ref trong ver do refresh-pubjs sau push, chỉ cho slug trong `.pubjs-slugs-data-bumped.json` (= pubjs “build lại”, mặc định không gồm phim mới lần đầu).
 * movies-manifest.json, cdn.json
 * @returns {{ newLastModified: Object, batchPtrById: null }}
 */
function writePubjsMoviesAndVer(movies, prevLastModified, tmdbById) {
  const pubjsRoot = getPubjsOutputDir();
  const verDir = path.join(PUBLIC_DATA, 'ver');
  fs.ensureDirSync(pubjsRoot);
  fs.ensureDirSync(verDir);

  /** Một token / lần gọi — gắn vào ver.{slug}.b cho &m= khi @main (không nhân bản modified OPhim trong ver). */
  const verBustToken = randomBytes(8).toString('hex');

  const sorted = [...movies].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const newLastModified = {};
  const verByShard = loadVerByShard(verDir);
  const touchedVerShards = new Set();
  const manifest = [];
  /**
   * Bump list → refresh ghi ref/commit vào ver. Cần: (đã có file pubjs || PUBJS_BUMP_NEW_SLUGS=1)
   * và (OPhim modified đổi || Admin có cờ cột update || PUBJS_BUMP_NEW_SLUGS=1)
   * và (diskWriteNeeded || OPhim modified đổi) — tránh bump chỉ TMDB; vẫn bump khi chỉ đổi modified OPhim mà canonical không ghi disk.
   */
  const dataBumpedSlugs = [];
  const bumpBrandNewPubjs = /^1|true|yes$/i.test(String(process.env.PUBJS_BUMP_NEW_SLUGS || '').trim());
  const writeDebug = /^1|true|yes$/i.test(String(process.env.PUBJS_BUILD_WRITE_DEBUG || '').trim());
  const debugEntries = [];
  let pubjsWrote = 0;
  let pubjsSkipped = 0;

  for (const m of sorted) {
    const idStr = m && m.id != null ? String(m.id) : '';
    const slug = m && m.slug != null ? String(m.slug).trim() : '';
    if (!idStr || !slug) continue;

    const merged = normalizeMovieCastForPubjs(mergeMovieWithTmdbMap(m, tmdbById));
    const prevMod = prevLastModified && prevLastModified[idStr] != null ? normalizeModifiedValue(prevLastModified[idStr]) : '';
    let curModRaw = extractOphimModifiedForPersist(merged);
    if (!curModRaw) curModRaw = extractMovieModifiedCanonical(merged);
    /** Chỉ từ nguồn phim hiện tại — không copy ledger/seed vào đây (copy vào last_modified khiến lần build sau API có modified ≠ ledger → bust ver cả đống). */
    const ledgerMod = normalizeModifiedValue(curModRaw);
    let curMod = ledgerMod;
    if (!curMod && prevMod) curMod = prevMod;
    merged.modified = curMod;
    newLastModified[idStr] = ledgerMod;

    const hasPrevLedger = isTrustedLastModifiedLedgerForVer(prevLastModified);
    const hadPrevId = hasPrevLedger && Object.prototype.hasOwnProperty.call(prevLastModified, idStr);
    const prevModStored = hadPrevId ? normalizeModifiedValue(prevLastModified[idStr]) : '';
    const ophimVerReason =
      hasPrevLedger && hadPrevId && ophimModifiedMeaningfullyChanged(prevModStored, ledgerMod);
    /** Bất kỳ cờ update nào từ Admin/Supabase (NEW, …) → được coi là “Admin” cho bump refresh. */
    const adminBumpForRefresh = !!(m && m._from_supabase && String(m._customUpdateStatus || '').trim());
    const adminNewVerReason =
      !!(m && m._from_supabase && String(m._customUpdateStatus || '').toUpperCase() === 'NEW');

    const shard = getSlugShard2(slug);
    const fp = path.join(pubjsRoot, shard, `${slug}.json`);

    const { dataRef, thumbRef, posterRef } = pickPerMovieJsDelivrRefs();

    merged.thumb = cdnUrlByMovieSlug(slug, 'thumbs', { ref: thumbRef });
    merged.poster = cdnUrlByMovieSlug(slug, 'posters', { ref: posterRef });
    merged.pubjs_url = buildPubjsFileUrl(slug, null, dataRef);

    const mergedForPubjs = stripInternalKeysForPubjsOutput(merged);
    const nextPubjsJson = JSON.stringify(mergedForPubjs);
    let prevRaw = '';
    const hadPubjsFile = fs.existsSync(fp);
    if (hadPubjsFile) {
      try {
        prevRaw = fs.readFileSync(fp, 'utf8');
      } catch {
        prevRaw = '';
      }
    }
    const prevNorm = normalizePubjsDiskRaw(prevRaw);
    const hadReadablePrev = hadPubjsFile && !!prevNorm;
    let pubjsPayloadChanged = true;
    if (hadReadablePrev) {
      pubjsPayloadChanged = !isPubjsCanonicalUnchanged(mergedForPubjs, prevNorm);
    }
    const diskWriteNeeded = pubjsNeedsDiskWrite(hadReadablePrev, prevNorm, nextPubjsJson, merged, pubjsPayloadChanged);
    const bumpSourceReason = ophimVerReason || adminBumpForRefresh || bumpBrandNewPubjs;
    /** OPhim đổi modified có thể không làm đổi canonical (đã bỏ modified khỏi so) — vẫn bump để refresh/ref theo nguồn OPhim. */
    if (
      (hadPubjsFile || bumpBrandNewPubjs) &&
      bumpSourceReason &&
      (diskWriteNeeded || ophimVerReason)
    ) {
      dataBumpedSlugs.push(slug);
    }
    if (diskWriteNeeded) {
      fs.ensureDirSync(path.dirname(fp));
      fs.writeFileSync(fp, nextPubjsJson, 'utf8');
      pubjsWrote++;
    } else {
      pubjsSkipped++;
    }

    m.thumb = merged.thumb;
    m.poster = merged.poster;
    if (merged.pubjs_url) m.pubjs_url = merged.pubjs_url;

    /** ver `b`: admin NEW hoặc OPhim modified đổi (đã tính ophimVerReason / adminNewVerReason phía trên). */
    const verWrite = adminNewVerReason || ophimVerReason;

    if (verWrite) {
      if (!verByShard.has(shard)) verByShard.set(shard, {});
      const shardObj = verByShard.get(shard);
      const prevEntry = shardObj && shardObj[slug] && typeof shardObj[slug] === 'object' ? shardObj[slug] : {};
      prevEntry.b = verBustToken;
      shardObj[slug] = prevEntry;
      touchedVerShards.add(shard);
    }

    if (writeDebug && debugEntries.length < 300) {
      let skipReason = '';
      if (!diskWriteNeeded) {
        if (normalizePubjsDiskRaw(prevRaw) === normalizePubjsDiskRaw(nextPubjsJson)) skipReason = 'bytes_identical';
        else if (!pubjsPayloadChanged) skipReason = 'canonical_unchanged_urls_match';
        else skipReason = 'other';
      }
      debugEntries.push({
        slug,
        diskWriteNeeded,
        hadPubjsFile,
        pubjsPayloadChanged,
        verWrite: !!verWrite,
        bumpRefresh:
          (hadPubjsFile || bumpBrandNewPubjs) &&
          bumpSourceReason &&
          (diskWriteNeeded || ophimVerReason),
        ophimVerReason: !!ophimVerReason,
        adminBumpForRefresh: !!adminBumpForRefresh,
        skipReason: diskWriteNeeded ? '' : skipReason,
      });
    }

    manifest.push({ id: idStr, slug, shard, modified: curMod });
  }

  if (touchedVerShards.size) {
    writeVerShardFiles(verDir, verByShard, touchedVerShards);
  }
  const manifestPath = path.join(PUBLIC_DATA, 'movies-manifest.json');
  const nextMoviesJson = JSON.stringify(manifest);
  let prevMoviesJson = null;
  try {
    if (fs.existsSync(manifestPath)) {
      const pm = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      prevMoviesJson = JSON.stringify(pm.movies || []);
    }
  } catch {}
  if (prevMoviesJson !== nextMoviesJson) {
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ movies: manifest, updatedAt: new Date().toISOString() }),
      'utf8'
    );
  }
  writeCdnConfigJson();

  const bumpPath = path.join(PUBLIC_DATA, '.pubjs-slugs-data-bumped.json');
  const nextBumpSlugsJson = JSON.stringify(dataBumpedSlugs);
  let prevBumpSlugsJson = null;
  try {
    if (fs.existsSync(bumpPath)) {
      const bj = JSON.parse(fs.readFileSync(bumpPath, 'utf8'));
      prevBumpSlugsJson = JSON.stringify(bj.slugs || []);
    }
  } catch {}
  try {
    if (prevBumpSlugsJson !== nextBumpSlugsJson) {
      fs.writeFileSync(
        bumpPath,
        JSON.stringify({ slugs: dataBumpedSlugs, updatedAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
    }
  } catch {}

  if (writeDebug) {
    try {
      fs.writeFileSync(
        path.join(PUBLIC_DATA, '.build-write-pubjs-log.json'),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            env: { PUBJS_BUILD_WRITE_DEBUG: '1' },
            summary: {
              pubjsWrote,
              pubjsSkipped,
              bumpSlugs: dataBumpedSlugs.length,
              verTouchedShards: touchedVerShards.size,
            },
            hint: 'Đặt PUBJS_BUILD_WRITE_DEBUG=0 hoặc bỏ env để không ghi file này.',
            entriesSample: debugEntries,
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {}
  }

  console.log('   Pubjs JSON:', manifest.length, '→', pubjsRoot, '| ghi:', pubjsWrote, '| giữ:', pubjsSkipped);
  console.log('   Pubjs bump (refresh ref):', dataBumpedSlugs.length, 'slugs — mới mặc định không bump (PUBJS_BUMP_NEW_SLUGS=1 nếu cần)');
  console.log('   Ver shards ghi (có thay đổi):', touchedVerShards.size, '| map:', verByShard.size, '→', verDir);
  return { newLastModified, batchPtrById: null };
}

async function loadAllMoviesFromPubjsManifest() {
  const manifestPath = path.join(PUBLIC_DATA, 'movies-manifest.json');
  const pubjsRoot = getPubjsOutputDir();
  if (!(await fs.pathExists(manifestPath))) return [];
  let list = [];
  try {
    const j = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    list = j.movies || [];
  } catch {
    return [];
  }
  const out = [];
  const chunk = 80;
  for (let c = 0; c < list.length; c += chunk) {
    const batch = list.slice(c, c + chunk);
    const parts = await Promise.all(
      batch.map(async (row) => {
        const fp = path.join(pubjsRoot, row.shard || getSlugShard2(row.slug), `${row.slug}.json`);
        if (!(await fs.pathExists(fp))) return null;
        try {
          return JSON.parse(await fs.readFile(fp, 'utf8'));
        } catch {
          return null;
        }
      })
    );
    for (const p of parts) if (p) out.push(p);
  }
  return out;
}

function validateMoviesManifestPubjs(allMovies) {
  const p = path.join(PUBLIC_DATA, 'movies-manifest.json');
  if (!fs.existsSync(p)) throw new Error('Missing movies-manifest.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const list = j.movies || [];
  const n = (allMovies || []).length;
  if (list.length !== n) {
    console.warn('   validate: manifest movies', list.length, 'vs allMovies', n);
  }
  const pubjsRoot = getPubjsOutputDir();
  const sample = Math.min(40, list.length);
  for (let i = 0; i < sample; i++) {
    const row = list[i];
    if (!row || !row.slug) throw new Error('Invalid manifest row');
    const fp = path.join(pubjsRoot, row.shard || getSlugShard2(row.slug), `${row.slug}.json`);
    if (!fs.existsSync(fp)) throw new Error('Missing pubjs JSON: ' + fp);
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

function loadIdIndexShardMapFromDisk(idDir, shardKey) {
  const metaPath = path.join(idDir, 'meta.json');
  let meta = null;
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      meta = null;
    }
  }
  const partCount = meta && meta.parts && meta.parts[shardKey] != null
    ? parseInt(meta.parts[shardKey], 10)
    : 1;
  const parts = Number.isFinite(partCount) && partCount > 0 ? partCount : 1;

  if (parts <= 1) {
    const f = path.join(idDir, `${shardKey}.js`);
    if (!fs.existsSync(f)) throw new Error('Missing id shard: ' + f);
    const raw = fs.readFileSync(f, 'utf8');
    const jsonStr = raw
      .replace(/^window\.DAOP\s*=\s*window\.DAOP\s*\|\|\s*\{\};\s*window\.DAOP\.idIndex\s*=\s*window\.DAOP\.idIndex\s*\|\|\s*\{\};\s*window\.DAOP\.idIndex\[[^\]]+\]\s*=\s*/i, '')
      .replace(/;\s*$/, '');
    return JSON.parse(jsonStr);
  }

  const merged = {};
  for (let p = 0; p < parts; p++) {
    const f = path.join(idDir, `${shardKey}.${p}.js`);
    if (!fs.existsSync(f)) throw new Error('Missing id shard part: ' + f);
    const raw = fs.readFileSync(f, 'utf8');
    const m = raw.match(/Object\.assign\([^,]+,\s*(\{[\s\S]*\})\)\s*;?\s*$/);
    if (!m) throw new Error('Bad id shard part format: ' + f);
    Object.assign(merged, JSON.parse(m[1]));
  }
  return merged;
}

function validateIdIndexPointersSample(allMovies, sampleCount = 200) {
  const idDir = path.join(PUBLIC_DATA, 'index', 'id');
  const pubjsRoot = getPubjsOutputDir();
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
    const shard = getIdShard3(idStr);
    if (shards.has(shard)) continue;
    shards.set(shard, loadIdIndexShardMapFromDisk(idDir, shard));
  }

  for (const m of picks) {
    const idStr = m && m.id != null ? String(m.id) : '';
    if (!idStr) continue;
    const shard = getIdShard3(idStr);
    const map = shards.get(shard);
    const row = map ? map[idStr] : null;
    if (!row) throw new Error('idIndex missing id: ' + idStr);
    if (!row.slug) throw new Error('idIndex missing slug for id: ' + idStr);
    const sShard = getSlugShard2(row.slug);
    const fp = path.join(pubjsRoot, sShard, `${row.slug}.json`);
    if (!fs.existsSync(fp)) throw new Error('Missing pubjs JSON for id ' + idStr + ': ' + fp);
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

  validateMoviesManifestPubjs(allMovies);

  validateShardMetaFiles(
    path.join(PUBLIC_DATA, 'index', 'slug', 'meta.json'),
    path.join(PUBLIC_DATA, 'index', 'slug'),
    (k, p) => (p == null ? `${k}.js` : `${k}.${p}.js`)
  );
  validateShardMetaFiles(
    path.join(PUBLIC_DATA, 'index', 'id', 'meta.json'),
    path.join(PUBLIC_DATA, 'index', 'id'),
    (k, p) => (p == null ? `${k}.js` : `${k}.${p}.js`)
  );
  validateShardMetaFiles(
    path.join(PUBLIC_DATA, 'search', 'prefix', 'meta.json'),
    path.join(PUBLIC_DATA, 'search', 'prefix'),
    (k, p) => (p == null ? `${k}.js` : `${k}.${p}.js`)
  );

  validateIdIndexPointersSample(allMovies, parseInt(process.env.VALIDATE_SAMPLE_COUNT || '200', 10) || 200);

  console.log('   Validation OK');
}

function sanitizeImageFilename(name) {
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

/** Download image, optimize/compress, ghi public/ + URL jsDelivr */
async function processImage(url, slug, folder = 'thumbs') {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());

    const ct = res.headers.get('content-type') || '';
    const ext = guessExtFromContentType(ct) || guessExtFromUrl(url) || 'jpg';

    const optimized = await optimizeImageBuffer(buf, ext);
    const slugStr = String(slug || '').trim();
    if (!slugStr) return url;
    const key = repoImageKeyForSlug(slugStr, folder);
    const out = await writeRepoImageFile(optimized, key, 'image/webp');
    return out || url;
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
    const manifestPath = path.join(PUBLIC_DATA, 'movies-manifest.json');
    const pubjsRoot = getPubjsOutputDir();
    if (!(await fs.pathExists(manifestPath))) return new Map();
    let list = [];
    try {
      const j = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      list = j.movies || [];
    } catch {
      return new Map();
    }
    const byId = new Map();
    for (const row of list) {
      if (!row || !row.slug) continue;
      const fp = path.join(pubjsRoot, row.shard || getSlugShard2(row.slug), `${row.slug}.json`);
      if (!(await fs.pathExists(fp))) continue;
      try {
        const m = JSON.parse(await fs.readFile(fp, 'utf8'));
        const idStr = m && m.id != null ? String(m.id) : '';
        if (!idStr) continue;
        byId.set(idStr, m);
      } catch {}
    }
    return byId;
  } catch {
    return new Map();
  }
}

async function loadPreviousBuiltTmdbById() {
  const byId = new Map();
  const manifestPath = path.join(PUBLIC_DATA, 'movies-manifest.json');
  const pubjsRoot = getPubjsOutputDir();
  if (!(await fs.pathExists(manifestPath))) return byId;
  let list = [];
  try {
    const j = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    list = j.movies || [];
  } catch {
    return byId;
  }
  for (const row of list) {
    if (!row || !row.slug) continue;
    const fp = path.join(pubjsRoot, row.shard || getSlugShard2(row.slug), `${row.slug}.json`);
    if (!(await fs.pathExists(fp))) continue;
    try {
      const m = JSON.parse(await fs.readFile(fp, 'utf8'));
      const idStr = m && m.id != null ? String(m.id) : '';
      if (!idStr) continue;
      byId.set(idStr, {
        id: idStr,
        tmdb: m.tmdb,
        imdb: m.imdb,
        cast: m.cast,
        director: m.director,
        cast_meta: m.cast_meta,
        keywords: m.keywords,
      });
    } catch {}
  }
  return byId;
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
  function parseEpisodeCurrentCount(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return 0;
    const m1 = s.match(/(\d+)\s*\/\s*\d+/);
    if (m1) return parseInt(m1[1], 10);
    const m2 = s.match(/(?:t\u1EADp|tap|ep|ph\u1EA7n|phan|season|m\u00F9a)\s*(\d+)/);
    if (m2) return parseInt(m2[1], 10);
    const nums = s.match(/\d+/g);
    if (nums) {
      for (const num of nums) {
        const n = parseInt(num, 10);
        if (n >= 1900 && n <= 2099) continue;
        if (n > 0) return n;
      }
    }
    return 0;
  }

  function extractPlayableEpisodeCount(movie) {
    const eps = Array.isArray(movie && movie.episodes) ? movie.episodes : [];
    let count = 0;
    for (const grp of eps) {
      const rows = Array.isArray(grp && grp.server_data) ? grp.server_data : [];
      for (const src of rows) {
        if (!src || typeof src !== 'object') continue;
        const hasPlayableLink = !!(
          src.link_m3u8 ||
          src.link_embed ||
          src.link_backup ||
          src.link_vip1 ||
          src.link_vip2 ||
          src.link_vip3 ||
          src.link_vip4 ||
          src.link_vip5
        );
        if (hasPlayableLink) count++;
      }
    }
    return count;
  }
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
    const detailQueue = [];
    for (const item of items) {
      const slug = item?.slug;
      const rawId = item?._id || item?.id || '';
      const idStr = rawId ? String(rawId) : '';
      if (!slug || !idStr) continue;

      const modifiedStr = extractMovieModifiedCanonical(item);

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
          const shouldRefetchDetail =
            ((!reusedStatus && !itemStatus) && (!reusedShowtimes && !itemShowtimes));

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

      // Detail fetch: có thể chạy song song (pool) để giảm thời gian build.
      detailQueue.push({
        slug: slug.toString().toLowerCase(),
        idStr,
        modifiedStr,
      });
    }

    if (detailQueue.length) {
      const concurrency = Math.max(1, Math.min(OPHIM_DETAIL_CONCURRENCY, detailQueue.length));
      let next = 0;
      const workers = Array.from({ length: concurrency }, () => (async () => {
        while (true) {
          const i = next++;
          const job = detailQueue[i];
          if (!job) break;
          if (OPHIM_DETAIL_DELAY_MS > 0) await sleep(OPHIM_DETAIL_DELAY_MS);
          const slug = job.slug;
          try {
            const detail = await fetchJsonWithTimeout(`${OPHIM_BASE}/phim/${slug}`);
            const movie = detail?.data?.item || detail?.data?.movie || detail?.data;
            if (!movie) continue;
            const cdnBase = (detail?.data?.APP_DOMAIN_CDN_IMAGE || '').replace(/\/$/, '') || 'https://img.ophim.live';
            const m = normalizeOPhimMovie(movie, slug, cdnBase);
            list.push({ ...m, _skip_tmdb: false });
            const finalId = m && m.id != null ? String(m.id) : job.idStr;
            if (finalId) {
              nextIndex[finalId] = { slug: m.slug || slug, modified: m.modified || job.modifiedStr || '' };
            }
            fetched.count++;
          } catch (e) {
            console.warn('OPhim detail skip:', slug, e && e.message ? e.message : String(e));
          }
        }
      })());
      await Promise.all(workers);
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
        // Preserve movies outside the current fetch range.
        // Mark them so the image uploader can avoid force-reuploading them when reupload_existing is enabled.
        list.push({ ...prevMovie, _skip_tmdb: true, _image_preserved: true });
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

/** OPhim detail: actor | director là mảng chuỗi hoặc một chuỗi tên cách nhau dấu phẩy. */
function ophimNameListToStrings(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s) return [];
  return s.split(/[,，;|]/).map((t) => t.trim()).filter(Boolean);
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
  const cast = ophimNameListToStrings(m.actor);
  const director = ophimNameListToStrings(m.director);
  return {
    id,
    _id: id,
    title: m.name || m.title || '',
    origin_name: m.origin_name || m.original_title || '',
    slug: slugNorm || id,
    thumb: thumb,
    poster: poster,
    year: m.year || '',
    type: m.type || 'single',
    genre: m.category?.map((c) => ({
      id: c.id,
      name: c.name,
      slug: normalizeTaxonomySlug(c.slug, c.name) || slugify(c.name, { lower: true, strict: true }),
    })) || [],
    country: m.country?.map((c) => ({
      id: c.id,
      name: c.name,
      slug: normalizeTaxonomySlug(c.slug, c.name) || slugify(c.name, { lower: true, strict: true }),
    })) || [],
    lang_key: m.lang || '',
    episode_current: m.episode_current || m.episodes?.length || '1',
    quality: m.quality || '',
    is_4k: is4k,
    is_exclusive: false,
    status: (m.status || '').toString(),
    showtimes: (m.showtimes || '').toString(),
    chieurap: parseBooleanFlag(m.chieurap, false),
    sub_docquyen: m.sub_docquyen || false,
    episodes: m.episodes || [],
    time: m.time,
    description: m.content || m.description || '',
    tmdb: m.tmdb || null,
    modified: extractOphimModifiedForPersist(m),
    cast,
    director,
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

/** Chuyển dữ liệu Supabase Admin (movies + movie_episodes) sang cùng dạng object như parseCustomMoviesFromExcelRows. */
function buildMoviesFromSupabase(movieRows, epRows) {
  const movies = [];
  for (const row of movieRows || []) {
    if (!row) continue;
    const title = String(row.title || row.name || '').trim();
    if (!title) continue;
    const movieId =
      String(row.id != null ? row.id : '').trim() || `ext_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const slugFromDb = String(row.slug || '').trim();
    const baseSlug = slugFromDb || slugify(title, { lower: true }) || movieId;
    const genre = String(row.genre || '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean)
      .map((g) => ({ name: g, slug: normalizeTaxonomySlug('', g) || slugify(g, { lower: true, strict: true }) }));
    const country = String(row.country || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => ({ name: c, slug: normalizeTaxonomySlug('', c) || slugify(c, { lower: true, strict: true }) }));
    const quality = String(row.quality || '').trim();
    const is4k = /4k|uhd|2160p/i.test(quality);
    const updateRaw = String(row.update ?? row['update'] ?? '').trim();
    const updateStatus = updateRaw ? updateRaw.toUpperCase() : '';
    const sheetModified = String(row.modified || '').trim();

    // Cột `modified` = thời điểm OPhim (export/sync). Không fallback `updated_at` — mỗi lần chạm DB `updated_at` đổi sẽ làm lệch OPhim.
    const effectiveModified = sheetModified;

    const movie = {
      id: movieId,
      title,
      origin_name: String(row.origin_name || '').trim(),
      slug: baseSlug,
      thumb: String(row.thumb_url || row.thumb || '').trim(),
      poster: String(row.poster_url || row.poster || '').trim(),
      _from_supabase: true,
      year: String(row.year || '').trim(),
      type: String(row.type || 'single').trim() || 'single',
      genre,
      country,
      lang_key: String(row.lang_key || row.language || '').trim(),
      episode_current: String(row.episode_current || '1').trim(),
      quality,
      modified: effectiveModified,
      is_4k: is4k,
      is_exclusive: parseBooleanFlag(row.is_exclusive, false),
      status: String(row.status || '').trim(),
      showtimes: String(row.showtimes || '').trim(),
      chieurap: parseBooleanFlag(row.chieurap, false),
      sub_docquyen: false,
      episodes: [],
      description: String(row.description || row.content || '').trim(),
      tmdb_id: row.tmdb_id != null && String(row.tmdb_id).trim() !== '' ? Number(row.tmdb_id) : null,
      cast: [],
      director: [],
      keywords: [],
    };

    if (updateStatus === 'NEW') {
      movie._customUpdateStatus = updateStatus;
    } else if (updateStatus) {
      movie._customUpdateStatus = updateStatus;
    }
    movie._supabaseOriginalSlug = baseSlug;

    movies.push(movie);
  }

  const movieById = Object.fromEntries(movies.map((m) => [String(m.id), m]));
  const movieBySlug = Object.fromEntries(movies.map((m) => [m.slug, m]));
  const movieByTitle = Object.fromEntries(movies.map((m) => [(m.title || '').toString().trim(), m]));
  const serverGroupsByMovie = new Map();

  for (const er of epRows || []) {
    if (!er) continue;
    const mid = String(er.movie_id ?? '').trim();
    const movie =
      movieById[mid] ||
      movies.find((m) => String(m.id) === String(mid) || m.slug === mid) ||
      movieByTitle[mid] ||
      (mid && movieBySlug[slugify(mid, { lower: true })]);
    if (!movie) continue;

    const epCode = String(er.episode_code || '').trim() || '1';
    const epName = String(er.episode_name || '').trim() || `Tập ${epCode}`;
    const serverSlugRaw = String(er.server_slug || '').trim();
    const serverNameRaw = String(er.server_name || '').trim();
    const serverSlug = serverSlugRaw || slugify(serverNameRaw || 'default', { lower: true }) || 'default';
    const serverName = serverNameRaw || serverSlug;

    const linkM3U8 = String(er.link_m3u8 || '').trim();
    const linkEmbed = String(er.link_embed || '').trim();
    const linkBackup = String(er.link_backup || '').trim();
    const linkVip1 = String(er.link_vip1 || '').trim();
    const linkVip2 = String(er.link_vip2 || '').trim();
    const linkVip3 = String(er.link_vip3 || '').trim();
    const linkVip4 = String(er.link_vip4 || '').trim();
    const linkVip5 = String(er.link_vip5 || '').trim();

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

async function fetchCustomMoviesFromSupabase() {
  const url = String(process.env.SUPABASE_ADMIN_URL || process.env.VITE_SUPABASE_ADMIN_URL || '').trim();
  const key = String(process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key);
    // Build cần toàn bộ phim (cần range vì PostgREST giới hạn 1000 dòng/request)
    const movieRows = [];
    for (let page = 0; ; page++) {
      const { data, error } = await supabase.from('movies').select('*').order('id').range(page * 1000, (page + 1) * 1000 - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      movieRows.push(...data);
      if (data.length < 1000) break;
    }

    // Build cần toàn bộ tập (cần range vì có thể lên tới chục ngàn dòng)
    const epRows = [];
    for (let page = 0; ; page++) {
      const { data, error } = await supabase.from('movie_episodes').select('*').order('movie_id').order('sort_order').range(page * 1000, (page + 1) * 1000 - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      epRows.push(...data);
      if (data.length < 1000) break;
    }
    return buildMoviesFromSupabase(movieRows || [], epRows || []);
    } catch (e) {
    console.warn('Supabase custom movies fetch failed, fallback Excel (nếu có):', e.message || e);
    return null;
    }
  }

/** 2. Đọc Supabase Admin (ưu tiên) hoặc Excel fallback */
async function fetchCustomMovies() {
  const fromDb = await fetchCustomMoviesFromSupabase();
  if (fromDb !== null) return fromDb;
  const xlsxPath = path.join(ROOT, 'custom_movies.xlsx');
  if (await fs.pathExists(xlsxPath)) {
    const wb = XLSX.readFile(xlsxPath);
    const moviesSheet = wb.Sheets['movies'] || wb.Sheets[wb.SheetNames[0]];
    const episodesSheet = wb.Sheets['episodes'];
    const moviesRows = XLSX.utils.sheet_to_json(moviesSheet, { header: 1 });
    const episodesRows = episodesSheet ? XLSX.utils.sheet_to_json(episodesSheet, { header: 1 }) : [];
    const movies = parseCustomMoviesFromExcelRows(moviesRows, episodesRows);
    return movies;
  }
  return [];
}

function parseCustomMoviesFromExcelRows(moviesRows, episodesRows) {
  if (moviesRows.length < 2) return [];
  const headers = moviesRows[0].map((h) => (h || '').toString().toLowerCase().trim());
  const idx = (name) => {
    const i = headers.indexOf(name);
    return i >= 0 ? i : headers.indexOf(name.replace('_', ' '));
  };
  const idxUpdate = idx('update');
  const idxModified = idx('modified');
  const idxSlug = idx('slug');
  const idxThumbUrl = idx('thumb_url');
  const idxPosterUrl = idx('poster_url');
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
      .map((g) => ({ name: g.trim(), slug: normalizeTaxonomySlug('', g.trim()) || slugify(g.trim(), { lower: true, strict: true }) }));
    const country = (row[idx('country')] || '')
      .toString()
      .split(',')
      .map((c) => ({ name: c.trim(), slug: normalizeTaxonomySlug('', c.trim()) || slugify(c.trim(), { lower: true, strict: true }) }));
    const quality = (row[idx('quality')] || '').toString();
    const is4k = /4k|uhd|2160p/i.test(quality);
    const updateRaw = (idxUpdate >= 0 ? (row[idxUpdate] ?? '') : '').toString().trim();
    const updateStatus = updateRaw ? updateRaw.toUpperCase() : '';
    const sheetModified = (idxModified >= 0 ? (row[idxModified] ?? '') : '').toString().trim();

    const sheetThumbUrl = (idxThumbUrl >= 0 ? (row[idxThumbUrl] ?? '') : '').toString().trim();
    const sheetPosterUrl = (idxPosterUrl >= 0 ? (row[idxPosterUrl] ?? '') : '').toString().trim();
    const sheetThumb = (row[idx('thumb')] ?? '').toString().trim();
    const sheetPoster = (row[idx('poster')] ?? '').toString().trim();
    const thumbPick = sheetThumb || '';
    const posterPick = sheetPoster || '';
    const movie = {
      id: movieId,
      title: title.toString(),
      origin_name: (row[idx('origin_name')] || '').toString(),
      slug: baseSlug,
      // URL nguồn từ Excel. Build ghi ảnh vào public/ và ghi đè thumb/poster bằng URL CDN theo id.
      thumb: sheetThumbUrl || thumbPick,
      poster: sheetPosterUrl || posterPick,
      _from_xlsx: true,
      year: (row[idx('year')] || '').toString(),
      type: (row[idx('type')] || 'single').toString(),
      genre,
      country,
      lang_key: (row[idx('lang_key')] || row[idx('language')] || '').toString(),
      episode_current: (row[idx('episode_current')] || '1').toString(),
      quality,
      modified: idxModified >= 0 ? sheetModified : '',
      is_4k: is4k,
      is_exclusive: parseBooleanFlag(row[idx('is_exclusive')], false),
      status: (row[idx('status')] || '').toString(),
      showtimes: (row[idx('showtimes')] || '').toString(),
      chieurap: parseBooleanFlag(row[idx('chieurap')], false),
      sub_docquyen: false,
      episodes: [],
      description: (row[idx('description')] || row[idx('content')] || '').toString(),
      tmdb_id: row[idx('tmdb_id')] ? Number(row[idx('tmdb_id')]) : null,
      cast: [],
      director: [],
      keywords: [],
    };

    if (updateStatus === 'NEW') {
      movie._customUpdateStatus = updateStatus;
    } else if (updateStatus) {
      movie._customUpdateStatus = updateStatus;
    }

    movies.push(movie);
  }
  // Không tự sửa slug ở đây nữa. Việc chống trùng slug sẽ xử lý trong mergeMovies
  // (để xét cả trùng với OPhim), và sẽ sync ngược slug mới về Supabase nếu có.
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

/**
 * Sau build: ghi ngược lên bảng `movies` (không ghi URL ảnh, chỉ metadata):
 * - Xóa cờ cột `update` (NEW); `updated_at` = giờ build; `modified` chỉ khi có giá trị OPhim trên object merge (không ghi `now`).
 * - Đồng bộ `slug` nếu merge đã đổi slug (tránh trùng OPhim)
 */
async function applySupabaseUpdateStatuses(custom) {
  const url = String(process.env.SUPABASE_ADMIN_URL || process.env.VITE_SUPABASE_ADMIN_URL || '').trim();
  const key = String(process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return;

  const need = (custom || []).filter(
    (m) => m && m._from_supabase && String(m._customUpdateStatus || '').toUpperCase() === 'NEW'
  );

  const slugFix = (custom || []).filter(
    (m) =>
      m &&
      m._from_supabase &&
      m._supabaseOriginalSlug &&
      m.slug &&
      String(m.slug) !== String(m._supabaseOriginalSlug)
  );

  if (!need.length && !slugFix.length) return;

  try {
    const supabase = createClient(url, key);
    const now = new Date().toISOString();

    for (const m of need) {
      const modOut = extractOphimModifiedForPersist(m);
      const patch = { update: '', updated_at: now };
      if (modOut) patch.modified = modOut;
      await supabase.from('movies').update(patch).eq('id', String(m.id));
    }
    for (const m of slugFix) {
      await supabase.from('movies').update({ slug: String(m.slug), updated_at: now }).eq('id', String(m.id));
    }
    if (need.length) {
      console.log('   Supabase: cleared update flag (NEW) for', need.length, 'movies');
    }
    if (slugFix.length) {
      console.log('   Supabase: synced slug for', slugFix.length, 'movies');
    }
  } catch (e) {
    console.warn('   Supabase: failed to sync update statuses / slugs:', e?.message || e);
  }
}

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_LANG = 'vi-VN';

/**
 * Nhiều key (theo thứ tự ưu tiên):
 * - TMDB_API_KEYS — phân cách phẩy / xuống dòng
 * - TMDB_API_KEY — một key, hoặc nhiều key phân cách bằng dấu phẩy (tiện cho GitHub Secrets một dòng)
 */
function parseTmdbApiKeys() {
  const raw = process.env.TMDB_API_KEYS;
  const keys = [];
  if (raw != null && String(raw).trim() !== '') {
    for (const part of String(raw).split(/[,;\n\r]+/)) {
      const k = part.trim();
      if (k) keys.push(k);
    }
  }
  if (keys.length === 0) {
    const single = process.env.TMDB_API_KEY;
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

const TMDB_KEYS = parseTmdbApiKeys();

function parseRetryAfterMs(res) {
  const ra = res.headers.get('retry-after');
  if (!ra) return 0;
  const sec = parseInt(ra, 10);
  if (Number.isFinite(sec)) return Math.min(sec * 1000, 120_000);
  const t = Date.parse(ra);
  if (Number.isFinite(t)) return Math.max(0, Math.min(t - Date.now(), 120_000));
  return 0;
}

/**
 * Gọi TMDB, khi 429 thử key tiếp theo trong TMDB_KEYS.
 * urlBuilder: (apiKey) => full URL
 */
async function fetchJsonWithTmdbKeys(urlBuilder) {
  const keys = TMDB_KEYS;
  if (!keys.length) throw new Error('No TMDB API keys');

  for (let ki = 0; ki < keys.length; ki++) {
    const url = urlBuilder(keys[ki]);
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 404) return null;

    if (res.status === 429) {
      const waitMs = parseRetryAfterMs(res);
      if (ki < keys.length - 1) {
        console.warn(`TMDB 429 rate limit, chuyển sang key ${ki + 2}/${keys.length}`);
        if (waitMs) await sleep(Math.min(waitMs, 8000));
        continue;
      }
      console.warn('TMDB 429: đã hết key dự phòng, chờ Retry-After và thử lại...');
      if (waitMs) await sleep(waitMs);
      const res2 = await fetch(url);
      if (res2.ok) return res2.json();
      if (res2.status === 404) return null;
      if (res2.status === 429) {
        throw new Error(`HTTP 429: ${url}`);
      }
      if (!res2.ok) throw new Error(`HTTP ${res2.status}: ${url}`);
      return res2.json();
    }

    if ((res.status === 401 || res.status === 403) && ki < keys.length - 1) {
      console.warn(`TMDB HTTP ${res.status}, thử key tiếp theo (${ki + 2}/${keys.length})`);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${url}`);
  }
  throw new Error('TMDB fetch failed');
}

const TMDB_CACHE_DIR = path.join(PUBLIC_DATA, 'cache', 'tmdb');
const TMDB_CACHE_ENABLED = (process.env.TMDB_CACHE !== '0' && process.env.TMDB_CACHE !== 'false');
const _ttlRaw = Number(process.env.TMDB_CACHE_TTL_DAYS ?? 365);
const TMDB_CACHE_TTL_DAYS = Number.isFinite(_ttlRaw) && _ttlRaw > 0 && _ttlRaw <= 365 ? _ttlRaw : 365;
const TMDB_CACHE_TTL_MS = TMDB_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
const TMDB_CONCURRENCY = Math.max(1, Math.min(32, Number(process.env.TMDB_CONCURRENCY || 6)));
/** Số file shard (1–256): tăng khi catalog lớn để mỗi file nhỏ hơn / ít contention ghi. */
const TMDB_CACHE_SHARDS = Math.max(1, Math.min(256, Number(process.env.TMDB_CACHE_SHARDS || 200)));
const TMDB_CACHE_PRUNE = (process.env.TMDB_CACHE_PRUNE !== '0' && process.env.TMDB_CACHE_PRUNE !== 'false');
const TMDB_CACHE_GZIP = (process.env.TMDB_CACHE_GZIP !== '0' && process.env.TMDB_CACHE_GZIP !== 'false');

function pruneTmdbDetailForCache(data) {
  if (!data || typeof data !== 'object') return data;
  return { poster_path: data.poster_path != null ? data.poster_path : null };
}

function pruneTmdbCreditsForCache(data) {
  if (!data || typeof data !== 'object') return data;
  const cast = Array.isArray(data.cast)
    ? data.cast.slice(0, 18).map((c) => ({
      id: c && c.id,
      name: c && c.name,
      profile_path: c && c.profile_path != null ? c.profile_path : null,
    }))
    : [];
  const crew = Array.isArray(data.crew)
    ? data.crew
      .filter((c) => c && c.job === 'Director')
      .map((c) => ({ job: c.job, name: c.name }))
    : [];
  return { cast, crew };
}

function pruneTmdbKeywordsForCache(data) {
  if (!data || typeof data !== 'object') return data;
  const keywords = Array.isArray(data.keywords)
    ? data.keywords.map((k) => ({ name: k && k.name }))
    : [];
  return { keywords };
}

function pruneTmdbPersonTranslationsForCache(data) {
  if (!data || typeof data !== 'object') return data;
  const translations = Array.isArray(data.translations)
    ? data.translations.map((t) => {
      const name = t && t.data && t.data.name != null ? t.data.name : '';
      return {
        iso_639_1: t && t.iso_639_1,
        data: { name },
      };
    })
    : [];
  return { translations };
}

/** Giảm dung lượng cache: chỉ giữ field enrichTmdb / getTmdbPersonNameVi cần (tương thích khi đọc entry cũ đầy đủ). */
function pruneTmdbCacheEntry(cacheKey, data) {
  if (!TMDB_CACHE_PRUNE) return data;
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return data;
  const key = String(cacheKey || '');
  if (key.startsWith('person_') && key.endsWith('_translations')) {
    return pruneTmdbPersonTranslationsForCache(data);
  }
  if (key.endsWith('_keywords')) {
    return pruneTmdbKeywordsForCache(data);
  }
  if (key.endsWith('_credits')) {
    return pruneTmdbCreditsForCache(data);
  }
  if (key.includes('_detail_')) {
    return pruneTmdbDetailForCache(data);
  }
  return data;
}

function parseTmdbShardFileBuffer(buf) {
  if (!buf || !buf.length) return null;
  let text;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      text = gunzipSync(buf).toString('utf8');
    } catch {
      return null;
    }
  } else {
    text = buf.toString('utf8');
  }
  try {
    return JSON.parse(text);
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
  try {
    const buf = fs.readFileSync(p);
    const j = parseTmdbShardFileBuffer(buf);
  if (!j || typeof j !== 'object') return { version: 1, entries: {} };
  if (!j.version) j.version = 1;
  if (!j.entries || typeof j.entries !== 'object') j.entries = {};
  return j;
  } catch {
    return { version: 1, entries: {} };
  }
}

async function tmdbFetchJsonCached(urlBuilder, cacheKey) {
  const fetchMiss = () => fetchJsonWithTmdbKeys(urlBuilder);
  if (!TMDB_CACHE_ENABLED) return fetchMiss();

  const key = String(cacheKey || '').trim();
  if (!key) return fetchMiss();

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

  // Miss -> fetch (sleep chỉ khi thực sự gọi API, cache hit không cần rate-limit)
  await sleep(40);
  const rawData = await fetchMiss();
  const data = pruneTmdbCacheEntry(key, rawData);

  // Write back (serialized; gzip optional — tương thích đọc JSON thuần cũ)
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
      const json = JSON.stringify(s2);
      const out = TMDB_CACHE_GZIP
        ? gzipSync(Buffer.from(json, 'utf8'), { level: zlibConstants.Z_BEST_SPEED })
        : json;
      fs.writeFileSync(p, out);
    } catch {}
  });

  return data;
}

const _tmdbPersonNameViCache = new Map();

async function getTmdbPersonNameVi(personId) {
  const id = String(personId || '').trim();
  if (!id) return null;
  if (_tmdbPersonNameViCache.has(id)) return _tmdbPersonNameViCache.get(id);
  if (!TMDB_KEYS.length) {
    _tmdbPersonNameViCache.set(id, null);
    return null;
  }
  try {
    const res = await tmdbFetchJsonCached(
      (k) => `${TMDB_BASE}/person/${id}/translations?api_key=${encodeURIComponent(k)}`,
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
  if (!TMDB_KEYS.length) {
    console.warn('TMDB_API_KEY / TMDB_API_KEYS is missing -> skip TMDB enrich (cast/director/keywords will be empty).');
    return;
  }
  if (TMDB_KEYS.length > 1) {
    console.log('   TMDB:', TMDB_KEYS.length, 'API key(s) — khi 429 sẽ chuyển key tiếp theo.');
  }
  if (TMDB_CACHE_ENABLED) {
    console.log(
      '   TMDB disk cache:',
      path.relative(ROOT, TMDB_CACHE_DIR) || 'cache/tmdb',
      '| TTL',
      `${TMDB_CACHE_TTL_DAYS}d`,
      '| shards',
      TMDB_CACHE_SHARDS,
      '| prune',
      TMDB_CACHE_PRUNE,
      '| gzip',
      TMDB_CACHE_GZIP
    );
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
      try {
        const baseKey = `${type}_${tid}`;
        const [detailRes, creditsRes, keywordsRes] = await Promise.all([
          tmdbFetchJsonCached((k) => `${TMDB_BASE}/${type}/${tid}?api_key=${encodeURIComponent(k)}&language=${TMDB_LANG}`, `${baseKey}_detail_${TMDB_LANG}`).catch(() => null),
          tmdbFetchJsonCached((k) => `${TMDB_BASE}/${type}/${tid}/credits?api_key=${encodeURIComponent(k)}`, `${baseKey}_credits`),
          tmdbFetchJsonCached((k) => `${TMDB_BASE}/${type}/${tid}/keywords?api_key=${encodeURIComponent(k)}`, `${baseKey}_keywords`).catch(() => ({ keywords: [] })),
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
        // OPhim thường gửi cast_meta không có profile — nếu giữ sẽ mất ảnh TMDB; khi credits TMDB có dữ liệu thì ưu tiên cast_meta từ TMDB.
        if (castMetaCompact.length > 0) {
          m.cast_meta = castMetaCompact;
          m.cast = cast;
        } else {
          m.cast = m.cast?.length ? m.cast : cast;
          m.cast_meta = Array.isArray(m.cast_meta) && m.cast_meta.length ? m.cast_meta : castMetaCompact;
        }
        m.director = m.director?.length ? m.director : director;
        m.keywords = m.keywords?.length ? m.keywords : keywords;
        if (!m.poster && detailRes?.poster_path) {
          m.poster = TMDB_IMG_BASE + detailRes.poster_path;
        }
        m._tmdb_checked = true;
      } catch {}
    }
  })());

  await Promise.all(workers);
}

/** 4. Hợp nhất và xử lý ảnh (optional: ghi public/ + CDN) */
function mergeMovies(ophim, custom) {
  const getModTs = (m) => {
    if (!m) return 0;
    const v = extractMovieModifiedCanonical(m);
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  };

  const isEmptyVal = (v) => {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  };

  const mergeCustomAndOphim = (customMovie, ophimMovie) => {
    if (!customMovie) return ophimMovie;
    if (!ophimMovie) return customMovie;

    const cTs = getModTs(customMovie);
    const oTs = getModTs(ophimMovie);

    // Phim có bản Supabase/Admin: toàn bộ trường bạn chỉnh luôn là nguồn chính.
    const base = { ...customMovie };

    if (oTs > cTs) {
      // OPhim mới hơn: giữ metadata Supabase; đồng bộ phần phát sóng từ OPhim.
      base._supabaseExportEpisodesOnly = true;
      const cur = ophimMovie.episode_current;
      if (cur != null && String(cur).trim() !== '') {
        base.episode_current = String(cur).trim();
      }
      const oEps = ophimMovie.episodes;
      if (Array.isArray(oEps) && oEps.length > 0) {
        try {
          base.episodes = structuredClone(oEps);
        } catch {
          base.episodes = JSON.parse(JSON.stringify(oEps));
        }
      }
      if (isEmptyVal(base.cast) && !isEmptyVal(ophimMovie.cast)) base.cast = ophimMovie.cast;
      if (isEmptyVal(base.director) && !isEmptyVal(ophimMovie.director)) base.director = ophimMovie.director;
      if (isEmptyVal(base.showtimes) && !isEmptyVal(ophimMovie.showtimes)) base.showtimes = ophimMovie.showtimes;
    } else {
      base._supabaseExportEpisodesOnly = false;
      // OPhim cũ hơn hoặc bằng: điền chỗ trống từ OPhim (giữ hành vi cũ).
      for (const [k, v] of Object.entries(ophimMovie)) {
        if (!(k in base) || isEmptyVal(base[k])) {
          base[k] = v;
        }
      }
    }

    if (base.id != null) base.id = String(base.id);
    return base;
  };

  const ophimById = new Map();
  for (const m of ophim || []) {
    const idStr = m && m.id != null ? String(m.id) : '';
    if (!idStr) continue;
    const cur = ophimById.get(idStr);
    if (!cur) {
      ophimById.set(idStr, m);
      continue;
    }
    const curTs = getModTs(cur);
    const nextTs = getModTs(m);
    if (nextTs > curTs) ophimById.set(idStr, m);
    else console.warn('   Duplicate id from OPhim, keep newer/first:', idStr);
  }

  const customById = new Map();
  for (const m of custom || []) {
    const idStr = m && m.id != null ? String(m.id) : '';
    if (!idStr) continue;
    const cur = customById.get(idStr);
    if (!cur) {
      customById.set(idStr, m);
      continue;
    }
    const curTs = getModTs(cur);
    const nextTs = getModTs(m);
    if (nextTs > curTs) customById.set(idStr, m);
    else console.warn('   Duplicate id from custom source, keep newer/first:', idStr);
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

  const allIds = new Set([...ophimById.keys(), ...customById.keys()]);
  const mergedById = new Map();
  for (const idStr of allIds) {
    const cm = customById.get(idStr);
    const om = ophimById.get(idStr);
    if (cm && om) {
      const out = mergeCustomAndOphim(cm, om);
      mergedById.set(idStr, out);
    } else {
      const only = (cm || om);
      if (only) mergedById.set(idStr, { ...only, id: String(idStr) });
    }
  }

  // Create stable output order: keep existing behavior (sort by id like batches will later do).
  const mergedRaw = Array.from(mergedById.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const bySlug = new Map();
  for (const m of mergedRaw) {
    if (!m || !m.slug) continue;
    if (bySlug.has(m.slug)) {
      console.warn('   Duplicate slug in merged output, keep first:', m.slug);
      continue;
    }
    bySlug.set(m.slug, m);
  }

  const usedSlugs = new Set(bySlug.keys());

  // Custom (Supabase / Excel):
  // - NEW: luôn được build (build mới / build lại), nhưng nếu trùng slug với OPhim/custom thì auto thêm hậu tố và sync trạng thái về nguồn (Supabase).
  for (const m of custom) {
    if (!m || !m.slug) continue;
    const st = (m._customUpdateStatus || '').toString().toUpperCase();
    const isNew = st === 'NEW';
    const idStr = m && m.id != null ? String(m.id) : '';

    const existingBySlug = usedSlugs.has(m.slug) ? bySlug.get(m.slug) : null;
    const isSelfSlug = !!(
      existingBySlug &&
      idStr &&
      existingBySlug.id != null &&
      String(existingBySlug.id) === idStr
    );
    const exists = !!existingBySlug && !isSelfSlug;
    if (exists) {
      if (isNew) {
        const old = m.slug;
        const fixed = ensureUniqueSlug(old, usedSlugs);
        if (fixed && fixed !== old) {
          m.slug = fixed;
          usedSlugs.add(fixed);
        }
      } else {
        console.warn('   Custom movie skipped (slug collision, not NEW):', m.slug, st || '(empty)');
        continue;
      }
    } else {
      usedSlugs.add(m.slug);
    }

    // If this custom id already exists in merged output, keep merged record.
    // This loop is only for slug normalization of custom entries.
    if (idStr && mergedById.has(idStr)) {
      const cur = mergedById.get(idStr);
      if (cur && cur.slug !== m.slug) {
        const prevSlug = cur.slug;
        cur.slug = m.slug;
        if (prevSlug && bySlug.get(prevSlug) === cur) {
          bySlug.delete(prevSlug);
        }
      }
      bySlug.set(m.slug, cur || m);
    } else {
      bySlug.set(m.slug, m);
    }
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
    dedupeThumbPoster(m);
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
          ok = !!m.is_exclusive;
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

function normalizeTaxonomySlug(rawSlug, fallbackName = '') {
  let base = String(rawSlug || '').trim().toLowerCase();
  if (!base && fallbackName) base = String(fallbackName || '').trim().toLowerCase();
  if (!base) return '';
  try {
    if (base.normalize) base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {}
  base = base.replace(/đ/g, 'd');
  // OPhim/slugify đôi khi để lại biến thể dj cho ký tự đ (vd: gia-djinh) -> gộp về d.
  base = base.replace(/(^|-)dj(?=[a-z0-9])/g, '$1d');
  base = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  return base;
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

function warnShardBucketsOverLimit(kind, shardKey, maxBytes, buckets) {
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const len = Buffer.byteLength(JSON.stringify(b), 'utf8');
    if (len <= maxBytes) continue;
    const n = b && typeof b === 'object' && !Array.isArray(b) ? Object.keys(b).length : (Array.isArray(b) ? b.length : 0);
    console.warn(
      `[P2-1] Shard vượt SHARD_MAX_BYTES (${kind} key=${JSON.stringify(shardKey)} part=${i} ~${len}B > ${maxBytes}B, ~${n} keys/items). ` +
        'Tăng SHARD_MAX_BYTES hoặc giảm payload index/search.'
    );
  }
}

function splitObjectBySize(keyToObj, maxBytes, keySelector, debugShardKey = '') {
  const keys = Object.keys(keyToObj || {});
  if (!keys.length) return { parts: 1, buckets: [{ ...keyToObj }] };

  const rawLen = Buffer.byteLength(JSON.stringify(keyToObj), 'utf8');
  if (rawLen <= maxBytes) return { parts: 1, buckets: [{ ...keyToObj }] };

  let parts = 2;
  while (parts <= SHARD_SPLIT_MAX_PARTS) {
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
  const buckets = Array.from({ length: SHARD_SPLIT_MAX_PARTS }, () => ({}));
  for (const k of keys) {
    const sel = keySelector ? keySelector(k, keyToObj[k]) : k;
    const idx = hashStringDjb2(sel) % SHARD_SPLIT_MAX_PARTS;
    buckets[idx][k] = keyToObj[k];
  }
  if (debugShardKey) warnShardBucketsOverLimit('slug|id', debugShardKey, maxBytes, buckets);
  return { parts: SHARD_SPLIT_MAX_PARTS, buckets };
}

function splitArrayBySize(arr, maxBytes, keySelector, debugShardKey = '') {
  const list = Array.isArray(arr) ? arr : [];
  if (!list.length) return { parts: 1, buckets: [[]] };

  const rawLen = Buffer.byteLength(JSON.stringify(list), 'utf8');
  if (rawLen <= maxBytes) return { parts: 1, buckets: [list.slice(0)] };

  let parts = 2;
  while (parts <= SHARD_SPLIT_MAX_PARTS) {
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
  const buckets = Array.from({ length: SHARD_SPLIT_MAX_PARTS }, () => []);
  for (const it of list) {
    const sel = keySelector ? keySelector(it) : (it && (it.slug || it.id) ? String(it.slug || it.id) : '');
    const idx = hashStringDjb2(sel) % SHARD_SPLIT_MAX_PARTS;
    buckets[idx].push(it);
  }
  if (debugShardKey) warnShardBucketsOverLimit('search', debugShardKey, maxBytes, buckets);
  return { parts: SHARD_SPLIT_MAX_PARTS, buckets };
}

function writeIndexAndSearchShards(movies, _batchPtrUnused) {
  const indexBatchSize = getBaseBatchSizeFromEnv();
  const maxBytes = getShardMaxBytesFromEnv();
  console.log(
    '   [P2-1] Index/search shards: SHARD_MAX_BYTES =',
    maxBytes,
    '| hash split tối đa',
    SHARD_SPLIT_MAX_PARTS,
    'bucket/shard'
  );
  const SEARCH_PREFIX_MIN_TOKEN_LEN = getSearchPrefixMinTokenLenFromEnv();
  const SEARCH_PREFIX_MAX_TOKENS = getSearchPrefixMaxTokensFromEnv();
  console.log(
    '   [P2-1] Search prefix: SEARCH_PREFIX_MIN_TOKEN_LEN =',
    SEARCH_PREFIX_MIN_TOKEN_LEN,
    '| SEARCH_PREFIX_MAX_TOKENS =',
    SEARCH_PREFIX_MAX_TOKENS === 0 ? '(0 = không giới hạn)' : SEARCH_PREFIX_MAX_TOKENS
  );
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

    const idShard = getIdShard3(idStr);
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
    let tokenWords = baseText ? baseText.split(/\s+/).filter(Boolean) : [];
    tokenWords = Array.from(new Set(tokenWords));
    tokenWords = tokenWords.filter((t) => String(t).length >= SEARCH_PREFIX_MIN_TOKEN_LEN);
    if (SEARCH_PREFIX_MAX_TOKENS > 0 && tokenWords.length > SEARCH_PREFIX_MAX_TOKENS) {
      tokenWords = tokenWords.slice(0, SEARCH_PREFIX_MAX_TOKENS);
    }
    const tokenShardSet = new Set(tokenWords.map(getShardKey2));
    if (slugStr) tokenShardSet.add(getShardKey2(slugStr));
    if (m.title) tokenShardSet.add(getShardKey2(m.title));

    const item = {
      id: idStr,
      title: m.title,
      origin_name: m.origin_name || '',
      slug: slugStr,
      thumb: m.thumb,
      year: m.year,
      episode_current: m.episode_current,
      _t: baseText,
    };

    tokenShardSet.forEach((k) => {
      if (!searchByShard.has(k)) searchByShard.set(k, []);
      searchByShard.get(k).push(item);
    });
  }

  const meta = { total: sorted.length, batchSize: indexBatchSize, baseBatchSize: indexBatchSize };
  fs.writeFileSync(path.join(outIndexDir, 'meta.json'), JSON.stringify(meta), 'utf8');

  const slugMeta = { maxBytes, parts: {} };
  for (const [k, map] of slugIndexByShard.entries()) {
    const spl = splitObjectBySize(map, maxBytes, (slug) => slug, k);
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

  const idMeta = { maxBytes, parts: {} };
  for (const [k, map] of idIndexByShard.entries()) {
    const spl = splitObjectBySize(map, maxBytes, (idKey) => idKey, k);
    idMeta.parts[k] = spl.parts;
    if (spl.parts <= 1) {
    const content = `window.DAOP = window.DAOP || {};window.DAOP.idIndex = window.DAOP.idIndex || {};window.DAOP.idIndex[${JSON.stringify(k)}] = ${JSON.stringify(map)};`;
    fs.writeFileSync(path.join(outIdDir, `${k}.js`), content, 'utf8');
      continue;
    }
    for (let p = 0; p < spl.buckets.length; p++) {
      const partObj = spl.buckets[p];
      if (!partObj || !Object.keys(partObj).length) continue;
      const content =
        `window.DAOP = window.DAOP || {};window.DAOP.idIndex = window.DAOP.idIndex || {};` +
        `window.DAOP.idIndex[${JSON.stringify(k)}] = window.DAOP.idIndex[${JSON.stringify(k)}] || {};` +
        `Object.assign(window.DAOP.idIndex[${JSON.stringify(k)}], ${JSON.stringify(partObj)});`;
      fs.writeFileSync(path.join(outIdDir, `${k}.${p}.js`), content, 'utf8');
    }
  }
  fs.writeFileSync(path.join(outIdDir, 'meta.json'), JSON.stringify(idMeta), 'utf8');

  const searchMeta = {
    maxBytes,
    parts: {},
    searchOpts: {
      minTokenLen: SEARCH_PREFIX_MIN_TOKEN_LEN,
      maxTokensPerMovie: SEARCH_PREFIX_MAX_TOKENS,
    },
  };
  for (const [k, arr] of searchByShard.entries()) {
    const spl = splitArrayBySize(arr, maxBytes, (it) => (it && (it.slug || it.id) ? String(it.slug || it.id) : ''), k);
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
        const s = normalizeTaxonomySlug(g.slug, g.name);
        if (s && g.name) genreNames[s] = g.name;
      }
      genreNames = { ...OPHIM_GENRES_FALLBACK, ...genreNames };
    }
    if (countries.length) {
      countryNames = {};
      for (const c of countries) {
        const s = normalizeTaxonomySlug(c.slug, c.name);
        if (s && c.name) countryNames[s] = c.name;
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
  const showtimesIds = [];
  const yearsSet = new Set();
  for (const m of movies) {
    const q = (m.quality || '').toString().toLowerCase();
    const is4k = !!m.is_4k || /4k|uhd|2160p/.test(q);
    if (is4k) quality4kIds.push(m.id);
    if (m.is_exclusive) exclusiveIds.push(m.id);
    const st = (m.showtimes || '').toString().trim();
    if (st && m.id != null) showtimesIds.push(String(m.id));
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
    const isTheater = !!m.chieurap;
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
      const s = normalizeTaxonomySlug(g.slug, g.name) || slugify(g.name, { lower: true, strict: true });
      if (!s) continue;
      if (!genreMap[s]) genreMap[s] = [];
      genreMap[s].push(m.id);
      if (g.name && !genreNames[s]) genreNames[s] = g.name;
    }
    for (const c of m.country || []) {
      const s = normalizeTaxonomySlug(c.slug, c.name) || slugify(c.name, { lower: true, strict: true });
      if (!s) continue;
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
  const filtersData = {
    genreMap,
    countryMap,
    yearMap,
    typeMap,
    statusMap,
    langMap,
    quality4kIds,
    exclusiveIds,
    showtimesIds,
    genreNames,
    countryNames,
    filterOrder,
  };
  const content = `window.filtersData = ${JSON.stringify(filtersData)};`;
  fs.writeFileSync(path.join(PUBLIC_DATA, 'filters.js'), content, 'utf8');
  // JSON version để client fetch nhanh hơn (gzip/brotli) và giảm parse/execute JS.
  fs.writeFileSync(path.join(PUBLIC_DATA, 'filters.json'), JSON.stringify(filtersData), 'utf8');
  writeListsFacetMini(filtersData);
  return { genreMap, countryMap, yearMap, genreNames, countryNames };
}

/** JSON nhẹ: thể loại ngôn ngữ / 4K / trạng chiếu — fetch nhanh hơn filters.json khi chỉ cần facet này. */
function writeListsFacetMini(filtersData) {
  try {
    const dir = path.join(PUBLIC_DATA, 'lists');
    fs.ensureDirSync(dir);
    const sm = (filtersData && filtersData.statusMap) || {};
    const mini = {
      updatedAt: new Date().toISOString(),
      langMap: filtersData.langMap,
      quality4kIds: filtersData.quality4kIds || [],
      exclusiveIds: filtersData.exclusiveIds || [],
      showtimesIds: filtersData.showtimesIds || [],
      statusCurrent: sm.current || [],
      statusUpcoming: sm.upcoming || [],
      statusTheater: sm.theater || [],
    };
    fs.writeFileSync(path.join(dir, 'facets-mini.json'), JSON.stringify(mini), 'utf8');
  } catch (e) {
    console.warn('   writeListsFacetMini:', e && e.message ? e.message : e);
  }
}

function removeMoviesLightScriptFromHtml() {
  return libRemoveMoviesLightScriptFromHtml({
    rootDir: ROOT,
    publicDir: path.join(ROOT, 'public'),
  });
}

/** 5b. Inject site_name vào tất cả HTML (title, site-logo) để tên web đúng ngay khi load trang */
function injectSiteNameIntoHtml() {
  return libInjectSiteNameIntoHtml({
    rootDir: ROOT,
    publicDir: path.join(ROOT, 'public'),
    publicDataDir: PUBLIC_DATA,
  });
}

/** 5c. Cập nhật footer: hộp bo tròn 1 dòng, hàng 2 logo+links, hàng cuối copyright */
function injectFooterIntoHtml() {
  return libInjectFooterIntoHtml({
    rootDir: ROOT,
    publicDir: path.join(ROOT, 'public'),
  });
}

/** 5d. Thêm Tải app, Liên hệ vào nav mọi trang */
function injectNavIntoHtml() {
  return libInjectNavIntoHtml({
    rootDir: ROOT,
    publicDir: path.join(ROOT, 'public'),
  });
}

/** 5e. Thêm màn hình Loading (logo + chữ Loading...) vào đầu body mọi trang */
function injectLoadingScreenIntoHtml() {
  return libInjectLoadingScreenIntoHtml({
    rootDir: ROOT,
    publicDir: path.join(ROOT, 'public'),
  });
}

/** Preload + preconnect ảnh LCP slider trang chủ (sau khi có site-settings + homepage-slider-auto). */
function injectHomeLcpPreloadIntoHtml() {
  return libInjectHomeLcpPreloadIntoHtml({
    rootDir: ROOT,
    publicDir: path.join(ROOT, 'public'),
  });
}

/**
 * Minify JS/CSS trang public + data/filters.js, actors.js, movies-light.js (PageSpeed).
 * Bật khi: MINIFY_ASSETS=1 | true | yes, hoặc mặc định trên GitHub Actions (GITHUB_ACTIONS=true).
 * Tắt: MINIFY_ASSETS=0 | false | no — cần devDependency esbuild.
 */
function shouldMinifyPublicAssets() {
  const v = process.env.MINIFY_ASSETS;
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return process.env.GITHUB_ACTIONS === 'true';
}

async function maybeMinifyPublicAssets() {
  if (!shouldMinifyPublicAssets()) return;
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch (e) {
    console.warn('   Minify bị bỏ qua: cài esbuild (npm i -D esbuild).', e && e.message ? e.message : e);
    return;
  }

  const targets = [];
  const jsDir = path.join(ROOT, 'public', 'js');
  if (await fs.pathExists(jsDir)) {
    for (const name of await fs.readdir(jsDir)) {
      if (name.endsWith('.js')) targets.push(path.join(jsDir, name));
    }
  }
  const cssDir = path.join(ROOT, 'public', 'css');
  if (await fs.pathExists(cssDir)) {
    for (const name of await fs.readdir(cssDir)) {
      if (name.endsWith('.css')) targets.push(path.join(cssDir, name));
    }
  }
  for (const baseName of ['filters.js', 'movies-light.js']) {
    const p = path.join(PUBLIC_DATA, baseName);
    if (await fs.pathExists(p)) targets.push(p);
  }
  const actorsMainJs = path.join(ACTORS_DATA_DIR, 'actors.js');
  if (await fs.pathExists(actorsMainJs)) targets.push(actorsMainJs);

  if (!targets.length) return;

  const t0 = Date.now();
  let bytesIn = 0;
  let bytesOut = 0;
  let ok = 0;
  for (const filePath of targets) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 3_500_000) {
        console.warn('   Minify bỏ qua (file quá lớn):', path.relative(ROOT, filePath));
        continue;
      }
      const input = await fs.readFile(filePath, 'utf8');
      bytesIn += input.length;
      const ext = path.extname(filePath).toLowerCase();
      const loader = ext === '.css' ? 'css' : 'js';
      const out = await esbuild.transform(input, {
        minify: true,
        target: 'es2017',
        legalComments: 'none',
        loader,
      });
      await fs.writeFile(filePath, out.code, 'utf8');
      bytesOut += out.code.length;
      ok++;
    } catch (e) {
      console.warn('   Minify bỏ qua file:', path.relative(ROOT, filePath), e && e.message ? e.message : e);
    }
  }
  console.log(
    '   Minified ' +
      ok +
      '/' +
      targets.length +
      ' file(s) (~' +
      Math.round(bytesIn / 1024) +
      ' KiB → ~' +
      Math.round(bytesOut / 1024) +
      ' KiB) ' +
      fmtBuildMs(Date.now() - t0)
  );
}

/**
 * Gắn ?v=<builtAt> vào mọi thẻ script /data/filters.js trong HTML.
 * Trang chủ đã dùng build_version để bust cache JSON; các trang danh mục trước đây load filters.js
 * với max-age dài nên CDN/trình duyệt giữ window.filtersData cũ sau khi cập nhật dữ liệu.
 */
function injectFiltersJsCacheBustIntoHtml(publicDir, builtAt) {
  const enc = encodeURIComponent(String(builtAt || '').trim());
  if (!enc) return;
  const suffix = '?v=' + enc;
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.html')) {
        let html = fs.readFileSync(p, 'utf8');
        const next = html.replace(
          /(src\s*=\s*["'])([^"']*\/data\/filters\.js)(\?[^"']*)?(["'])/gi,
          (_, a, urlPath, _oldQ, endQ) => a + urlPath + suffix + endQ
        );
        if (next !== html) fs.writeFileSync(p, next, 'utf8');
      }
    }
  }
  walk(publicDir);
}

/** 6b. Tạo HTML cho từng thể loại, quốc gia, năm (để /the-loai/hanh-dong.html, /quoc-gia/trung-quoc.html... tồn tại) */
function writeCategoryPages(filters) {
  const publicDir = path.join(ROOT, 'public');
  fs.ensureDirSync(path.join(publicDir, 'the-loai'));
  fs.ensureDirSync(path.join(publicDir, 'quoc-gia'));
  fs.ensureDirSync(path.join(publicDir, 'nam-phat-hanh'));

  // Cleanup stale generated pages to avoid keeping old `filters.js` heavy tags.
  function cleanupDir(dirPath, keepFiles) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!ent.name.endsWith('.html')) continue;
        if (keepFiles && keepFiles.indexOf(ent.name) >= 0) continue;
        fs.removeSync(path.join(dirPath, ent.name));
      }
    } catch {}
  }
  cleanupDir(path.join(publicDir, 'the-loai'), ['index.html']);
  cleanupDir(path.join(publicDir, 'quoc-gia'), ['index.html']);
  cleanupDir(path.join(publicDir, 'nam-phat-hanh'), ['index.html']);

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

const ACTORS_SHARD_KEYS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'other',
];

/** Gộp map từ actors-{a-z|other}.json khi actors.js chỉ còn names+meta (tránh một file >25 MiB trên Cloudflare Pages). */
function mergeActorsMapFromShards() {
  const map = {};
  for (const key of ACTORS_SHARD_KEYS) {
    const p = path.join(ACTORS_DATA_DIR, `actors-${key}.json`);
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const m = data && data.map;
      if (m && typeof m === 'object') Object.assign(map, m);
    } catch {
      // ignore
    }
  }
  return map;
}

/** 7. Tạo actors: index (names only) + shard theo ký tự đầu, mỗi shard có thêm movies (light) để trang diễn viên không cần movies-light.js */
function writeActors(movies) {
  fs.ensureDirSync(ACTORS_DATA_DIR);
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
      const pp = c && c.profile_path != null ? String(c.profile_path).trim() : '';
      const profileAbs = c && c.profile
        ? String(c.profile).trim()
        : (pp ? TMDB_IMG_BASE + (pp.startsWith('/') ? pp : `/${pp}`) : null);
      const thumbStr = m.thumb != null ? String(m.thumb).trim() : '';
      const posterStr = m.poster != null ? String(m.poster).trim() : '';
      const profileFallback = !profileAbs && (thumbStr || posterStr) ? thumbStr || posterStr : null;
      const profileOut = profileAbs || profileFallback;
      const tid = c && c.tmdb_id != null ? c.tmdb_id : null;
      const tmdbUrl = c && c.tmdb_url ? String(c.tmdb_url) : (tid ? `https://www.themoviedb.org/person/${tid}` : null);
      if (tid || profileOut || tmdbUrl) {
        const next = { tmdb_id: tid || null, profile: profileOut || null, tmdb_url: tmdbUrl || null };
        if (!meta[s]) meta[s] = next;
        else {
          if (!meta[s].profile && next.profile) meta[s].profile = next.profile;
          if (!meta[s].tmdb_id && next.tmdb_id) meta[s].tmdb_id = next.tmdb_id;
          if (!meta[s].tmdb_url && next.tmdb_url) meta[s].tmdb_url = next.tmdb_url;
        }
      }
    }
  }
  const slugs = Object.keys(names);
  if (slugs.length === 0) {
    const total = Array.isArray(movies) ? movies.length : 0;
    const withCast = (Array.isArray(movies) ? movies : []).filter((m) =>
      (Array.isArray(m?.cast_meta) && m.cast_meta.length) || (Array.isArray(m?.cast) && m.cast.length)
    ).length;
    console.warn(
      `Actors output is empty (0 actors). Movies=${total}, moviesWithCast=${withCast}. ` +
        'Nguyên nhân thường gặp: thiếu TMDB_API_KEY; OPhim detail không có actor (build cũ); chạy full build sau khi cập nhật normalize OPhim.'
    );
  }
  // JSON: nhẹ hơn JS khi host hỗ trợ gzip/brotli, dùng cho fetch trên client
  fs.writeFileSync(
    path.join(ACTORS_DATA_DIR, 'actors-index.json'),
    JSON.stringify({ names, meta }),
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
  for (const key of ACTORS_SHARD_KEYS) {
    const data = byFirst[key] || { map: {}, names: {}, meta: {}, movies: {} };
    fs.writeFileSync(
      path.join(ACTORS_DATA_DIR, `actors-${key}.js`),
      `window.actorsData = ${JSON.stringify(data)};`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(ACTORS_DATA_DIR, `actors-${key}.json`),
      JSON.stringify(data),
      'utf8'
    );
  }
  const shardCount = ACTORS_SHARD_KEYS.filter((k) => byFirst[k] && Object.keys(byFirst[k].map).length > 0).length;
  console.log('   Actors: index +', shardCount, 'shards (a-z, other) + movies per shard →', path.relative(ROOT, ACTORS_DATA_DIR));
}

/** 7b. Tạo actors-index.js + shards từ object { map, names }, thêm movies nếu có movies-light.js (incremental) */
function writeActorsShardsFromData(map = {}, names = {}, movieById = null, meta = {}) {
  fs.ensureDirSync(ACTORS_DATA_DIR);
  const slugs = Object.keys(names);
  fs.writeFileSync(
    path.join(ACTORS_DATA_DIR, 'actors-index.json'),
    JSON.stringify({ names, meta }),
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
  for (const key of ACTORS_SHARD_KEYS) {
    const data = byFirst[key] || { map: {}, names: {}, meta: {}, movies: {} };
    fs.writeFileSync(
      path.join(ACTORS_DATA_DIR, `actors-${key}.js`),
      `window.actorsData = ${JSON.stringify(data)};`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(ACTORS_DATA_DIR, `actors-${key}.json`),
      JSON.stringify(data),
      'utf8'
    );
  }
  const shardCount = ACTORS_SHARD_KEYS.filter((k) => byFirst[k] && Object.keys(byFirst[k].map).length > 0).length;
  console.log('   Actors (từ actors.js): index +', shardCount, 'shards', movieById ? '+ movies' : '', '→', path.relative(ROOT, ACTORS_DATA_DIR));
}

function hydrateMoviesWithTmdbPayload(movies, tmdbById) {
  if (!Array.isArray(movies) || movies.length === 0) return [];
  if (!tmdbById || typeof tmdbById.get !== 'function') return movies;
  return movies.map((m) => {
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
  /** Chỉ các cột dùng cho JSON tĩnh — tránh kéo cột/thêm cột tương lai không cần (giảm payload & row “phình”). */
  const selBanners =
    'id,title,image_url,link_url,html_code,position,start_date,end_date,is_active,priority';
  const selSections =
    'id,title,display_type,source_type,source_value,filter_config,manual_movies,limit_count,more_link,sort_order,is_active';
  const selStatic = 'page_key,content,apk_link,apk_tv_link,testflight_link';
  const selDonateWithMethods =
    'target_amount,target_currency,current_amount,paypal_link,methods,bank_info,crypto_addresses';
  const selDonateLegacy =
    'target_amount,target_currency,current_amount,paypal_link,bank_info,crypto_addresses';
  const selPreroll = 'id,name,video_url,image_url,duration,skip_after,weight,roll,is_active';

  /** DB thiếu cột methods: docs/supabase/migrate-donate-settings-add-methods.sql */
  async function fetchDonateSettingsRow() {
    let r = await supabase.from('donate_settings').select(selDonateWithMethods).limit(1).maybeSingle();
    if (r.error) {
      const msg = String(r.error.message || r.error || '');
      if (msg.includes('methods') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
        console.warn(
          'Supabase donate_settings: cột methods chưa có — export không gồm methods (chạy migration hoặc thêm cột jsonb methods).'
        );
        r = await supabase.from('donate_settings').select(selDonateLegacy).limit(1).maybeSingle();
      }
    }
    return r;
  }

  const [bannersRes, sections, settings, staticPages, playerSettingsRes, prerollRes] = await Promise.all([
    supabase.from('ad_banners').select(selBanners).eq('is_active', true),
    supabase.from('homepage_sections').select(selSections).eq('is_active', true).order('sort_order'),
    supabase.from('site_settings').select('key,value'),
    supabase.from('static_pages').select(selStatic),
    supabase.from('player_settings').select('key,value'),
    supabase.from('ad_preroll').select(selPreroll).eq('is_active', true).order('weight', { ascending: false }),
  ]);

  const donate = await fetchDonateSettingsRow();

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
    r2_img_domain: '',
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

    /** Popup quảng cáo (position popup trong ad_banners). Tắt: ad_popup_enabled = false */
    ad_popup_enabled: 'true',
    ad_popup_delay_ms: '3000',
    ad_popup_cooldown_hours: '12',
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
  const defaultListOrder = ['lich-chieu', 'phim-4k', 'shows', 'hoat-hinh', 'phim-vietsub', 'phim-thuyet-minh', 'phim-long-tieng', 'phim-doc-quyen', 'phim-dang-chieu', 'phim-sap-chieu', 'phim-chieu-rap', 'the-loai', 'quoc-gia', 'nam-phat-hanh', 'dien-vien'];
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
    'lich-chieu': { label: 'Lịch chiếu', href: '/chu-de/lich-chieu.html', icon: '📅' },
    'phim-4k': { label: 'Phim 4K', href: '/chu-de/phim-4k.html', icon: '📺' },
    'shows': { label: 'TV Shows', href: '/shows.html', icon: '📺' },
    'hoat-hinh': { label: 'Hoạt hình', href: '/hoat-hinh.html', icon: '🎬' },
    'phim-vietsub': { label: 'Phim Vietsub', href: '/chu-de/phim-vietsub.html', icon: '🇻🇳' },
    'phim-thuyet-minh': { label: 'Phim Thuyết minh', href: '/chu-de/phim-thuyet-minh.html', icon: '🎙️' },
    'phim-long-tieng': { label: 'Phim Lồng tiếng', href: '/chu-de/phim-long-tieng.html', icon: '🔊' },
    'phim-doc-quyen': { label: 'Phim Độc quyền', href: '/chu-de/phim-doc-quyen.html', icon: '⭐' },
    'phim-dang-chieu': { label: 'Phim đang chiếu', href: '/chu-de/phim-dang-chieu.html', icon: '🎞️' },
    'phim-sap-chieu': { label: 'Phim sắp chiếu', href: '/chu-de/phim-sap-chieu.html', icon: '📅' },
    'phim-chieu-rap': { label: 'Phim chiếu rạp', href: '/chu-de/phim-chieu-rap.html', icon: '🎭' },
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

  // Sanitize + dedupe: tránh xuất JSON lỗi hoặc item thiếu page_key
  // - loại bỏ item không hợp lệ
  // - nếu trùng page_key, ưu tiên item xuất hiện sau (Supabase đã được push trước, file cũ chỉ bổ sung key thiếu)
  try {
    const byKey = new Map();
    for (const p of (Array.isArray(mergedStaticPages) ? mergedStaticPages : [])) {
      if (!p || typeof p !== 'object') continue;
      const k = String(p.page_key || '').trim();
      if (!k) continue;
      byKey.set(k, p);
    }
    mergedStaticPages = Array.from(byKey.values()).sort((a, b) => String(a.page_key).localeCompare(String(b.page_key)));
  } catch (e) {
    console.warn('Sanitize static-pages failed (continue):', e && e.message ? e.message : e);
  }
  
  fs.writeFileSync(path.join(configDir, 'static-pages.json'), JSON.stringify(mergedStaticPages, null, 2));
  const defaultDonateMethods = [
    { type: 'paypal', custom_label: '', url: '', note: '' },
    { type: 'btc', custom_label: '', url: '', note: '' },
    { type: 'eth', custom_label: '', url: '', note: '' },
    { type: 'ltc', custom_label: '', url: '', note: '' },
    { type: 'usdt_trc20', custom_label: '', url: '', note: '' },
    { type: 'usdt_erc20', custom_label: '', url: '', note: '' },
    { type: 'bnb_bep20', custom_label: '', url: '', note: '' },
    { type: 'sol', custom_label: '', url: '', note: '' },
  ];
  const donateRaw = donate.data && typeof donate.data === 'object' ? donate.data : {};
  const donateOut = {
    ...donateRaw,
    methods:
      Array.isArray(donateRaw.methods) && donateRaw.methods.length > 0 ? donateRaw.methods : defaultDonateMethods,
  };
  fs.writeFileSync(path.join(configDir, 'donate.json'), JSON.stringify(donateOut, null, 2));
  
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
    player_config: {
      loop: false,
      muted: false,
      preload: 'metadata',
      autoplay: false,
      controls: true,
      playback_speed_enabled: true,
      playback_speed_default: 1,
      playback_speed_options: [0.5, 0.75, 1, 1.25, 1.5, 2],
      seek_step_seconds: 10,
      hls_quality_enabled: true,
      hls_js_cdn: 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js',
      hls_start_level: -1,
      hls_cap_level_to_player_size: true,
      midroll_vast: '',
      preroll_vast: '',
      postroll_vast: '',
      midroll_source: 'video',
      preroll_source: 'video',
      midroll_enabled: false,
      postroll_source: 'video',
      preroll_enabled: true,
      postroll_enabled: false,
      jwplayer_license_key: '',
      midroll_max_per_video: 2,
      midroll_interval_seconds: 600,
      midroll_min_watch_seconds: 120,
    },
  };
  const mergedPlayerSettings = { ...defaultPlayerSettings, ...playerSettingsObj };
  fs.writeFileSync(path.join(configDir, 'player-settings.json'), JSON.stringify(mergedPlayerSettings, null, 2));

  const allAds = (prerollRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    video_url: p.video_url,
    image_url: p.image_url,
    duration: p.duration,
    skip_after: p.skip_after,
    weight: p.weight,
    roll: p.roll || 'pre',
  }));
  const preAds = allAds.filter((a) => (a.roll || 'pre') === 'pre');
  const midAds = allAds.filter((a) => (a.roll || 'pre') === 'mid');
  const postAds = allAds.filter((a) => (a.roll || 'pre') === 'post');
  fs.writeFileSync(path.join(configDir, 'preroll.json'), JSON.stringify(preAds, null, 2));
  fs.writeFileSync(path.join(configDir, 'midroll.json'), JSON.stringify(midAds, null, 2));
  fs.writeFileSync(path.join(configDir, 'postroll.json'), JSON.stringify(postAds, null, 2));
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
      listOrder: ['lich-chieu', 'phim-4k', 'shows', 'hoat-hinh', 'phim-vietsub', 'phim-thuyet-minh', 'phim-long-tieng', 'phim-doc-quyen', 'phim-dang-chieu', 'phim-sap-chieu', 'phim-chieu-rap', 'the-loai', 'quoc-gia', 'nam-phat-hanh', 'dien-vien'],
    },
    'list-order.json': [
      { id: 'lich-chieu', label: 'Lịch chiếu', href: '/chu-de/lich-chieu.html', icon: '📅' },
      { id: 'phim-4k', label: 'Phim 4K', href: '/chu-de/phim-4k.html', icon: '📺' },
      { id: 'shows', label: 'TV Shows', href: '/shows.html', icon: '📺' },
      { id: 'hoat-hinh', label: 'Hoạt hình', href: '/hoat-hinh.html', icon: '🎬' },
      { id: 'phim-vietsub', label: 'Phim Vietsub', href: '/chu-de/phim-vietsub.html', icon: '🇻🇳' },
      { id: 'phim-thuyet-minh', label: 'Phim Thuyết minh', href: '/chu-de/phim-thuyet-minh.html', icon: '🎙️' },
      { id: 'phim-long-tieng', label: 'Phim Lồng tiếng', href: '/chu-de/phim-long-tieng.html', icon: '🔊' },
      { id: 'phim-doc-quyen', label: 'Phim Độc quyền', href: '/chu-de/phim-doc-quyen.html', icon: '⭐' },
      { id: 'phim-dang-chieu', label: 'Phim đang chiếu', href: '/chu-de/phim-dang-chieu.html', icon: '🎞️' },
      { id: 'phim-sap-chieu', label: 'Phim sắp chiếu', href: '/chu-de/phim-sap-chieu.html', icon: '📅' },
      { id: 'phim-chieu-rap', label: 'Phim chiếu rạp', href: '/chu-de/phim-chieu-rap.html', icon: '🎭' },
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
  const buildT0 = Date.now();

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
      await fs.remove(path.join(PUBLIC_DATA, 'batches'));
      await fs.remove(path.join(PUBLIC_DATA, 'ver'));
      const homeDir = path.join(PUBLIC_DATA, 'home');
      await fs.remove(homeDir);
      const indexDir = path.join(PUBLIC_DATA, 'index');
      await fs.remove(indexDir);
      const searchDir = path.join(PUBLIC_DATA, 'search');
      await fs.remove(searchDir);
      await fs.remove(path.join(PUBLIC_DATA, 'lists'));
      const cacheDir = path.join(PUBLIC_DATA, 'cache');
      await fs.remove(cacheDir);
      const filesToRemove = [
        'movies-light.js',
        'filters.js',
        'filters.json',
        'repo_image_upload_state.json',
        'last_modified.json',
        'last_build.json',
        'build_version.json',
        'movies-manifest.json',
        'cdn.json',
      ];
      for (const f of filesToRemove) {
        await fs.remove(path.join(PUBLIC_DATA, f));
      }
      await fs.remove(ACTORS_DATA_DIR).catch(() => {});
      // legacy: actors từng nằm ngay public/data/
      try {
        const entries = await fs.readdir(PUBLIC_DATA);
        for (const name of entries) {
          if (/^actors-[a-z]+\.js$/i.test(name) || name === 'actors-other.js' || name === 'actors.js') {
            await fs.remove(path.join(PUBLIC_DATA, name));
          }
          if (/^actors-[a-z]+\.json$/i.test(name) || name === 'actors-other.json' || name === 'actors-index.json') {
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
    console.log('Incremental: export config từ Supabase + tạo lại trang thể loại/quốc gia/năm + rebuild filters/actors từ pubjs hiện có.');
    await exportConfigFromSupabase();
    injectSiteNameIntoHtml();
    injectFooterIntoHtml();
    injectNavIntoHtml();
    injectLoadingScreenIntoHtml();
    if (process.env.GENERATE_MOVIES_LIGHT !== '1') {
      try { await fs.remove(path.join(PUBLIC_DATA, 'movies-light.js')); } catch {}
    }

    // Incremental: rebuild filters.js và actors.js từ pubjs hiện có
    const loadedMovies = await loadPreviousBuiltMoviesById();
    if (loadedMovies && loadedMovies.size > 0) {
      const allMovies = Array.from(loadedMovies.values());
      console.log('   Incremental: rebuild filters từ', allMovies.length, 'phim (pubjs).');
      const { genreNames, countryNames } = await fetchOPhimGenresAndCountries();
      const filters = writeFilters(allMovies, genreNames, countryNames);
      writeCategoryPages(filters);
      const prevTmdbById = await loadPreviousBuiltTmdbById();
      writeActors(hydrateMoviesWithTmdbPayload(allMovies, prevTmdbById));
      console.log('   Incremental: index/search + home-sections từ pubjs (cùng nguồn với filters/actors).');
      timeBuildPhaseSync('incremental: writeIndex + search', () => writeIndexAndSearchShards(allMovies, null));
      writeHomeSectionsData(allMovies);
      writeAutoSliderFile(allMovies);
    } else {
      console.warn(
        'Incremental: không đọc được phim từ movies-manifest + pubjs-output — chỉ cập nhật category từ filters.js/actors nếu có file. ' +
          'Để rebuild filters/actors đúng: chạy full hoặc two_phase trước, hoặc giữ pubjs-output trên máy CI.'
      );
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
      const actorsPath = path.join(ACTORS_DATA_DIR, 'actors-index.json');
      if (await fs.pathExists(actorsPath)) {
        const raw = fs.readFileSync(actorsPath, 'utf8');
        try {
          const actorsData = JSON.parse(raw);
          let m = actorsData.map;
          const n = actorsData.names || {};
          const meta = actorsData.meta || {};
          if (!m || typeof m !== 'object' || Object.keys(m).length === 0) {
            m = mergeActorsMapFromShards();
          }
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
    injectFiltersJsCacheBustIntoHtml(path.join(ROOT, 'public'), buildVersion.builtAt);
    timeBuildPhaseSync('incremental: home-bootstrap (build version)', () => writeHomeBootstrapFile());
    injectHomeLcpPreloadIntoHtml();
    await maybeMinifyPublicAssets();
    console.log('Incremental build xong.');
    console.log('[TIMING] Total (incremental):', fmtBuildMs(Date.now() - buildT0));
    return;
  }

  await fs.ensureDir(PUBLIC_DATA);
  await fs.ensureDir(path.join(PUBLIC_DATA, 'config'));
  await fs.ensureDir(path.join(PUBLIC_DATA, 'ver'));
  await fs.ensureDir(getPubjsOutputDir());

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

  // TMDB_ONLY: đọc pubjs từ manifest, enrich TMDB, ghi lại pubjs + ver (pin SHA khi có env); đồng bộ filters/home như full build.
  if (tmdbOnly) {
    if (skipTmdb) {
      console.log('TMDB_ONLY: SKIP_TMDB đang bật, không có gì để làm.');
      await maybeMinifyPublicAssets();
      console.log('[TIMING] Total (TMDB_ONLY skip):', fmtBuildMs(Date.now() - buildT0));
      return;
    }

    const tLoad = Date.now();
    let allMovies = await loadAllMoviesFromPubjsManifest();
    if (!allMovies.length && prevMoviesById && prevMoviesById.size) {
      allMovies = Array.from(prevMoviesById.values());
    }
    if (!allMovies.length) {
      throw new Error(
        'TMDB_ONLY: thiếu pubjs — cần pubjs-output/<shard>/*.json và public/data/movies-manifest.json ' +
          '(từ lần build CORE với SKIP_TMDB=1, full build, hoặc artifact CI sau bước 1). ' +
          'Chỉ clone repo không có pubjs-output (thường không commit) thì không chạy được một mình pha TMDB.'
      );
    }
    console.log(
      'TMDB_ONLY: một pha — dùng pubjs + manifest sẵn có (sau CORE / full trên cùng runner hoặc restore artifact).'
    );
    console.log('TMDB_ONLY: loaded movies from pubjs:', allMovies.length);
    console.log('[TIMING] ✓ TMDB_ONLY: load pubjs:', fmtBuildMs(Date.now() - tLoad));

    /**
     * Pha TMDB_ONLY (sau CORE có SKIP_TMDB): pubjs đã có tmdb id + đôi khi cast_meta OPhim không ảnh.
     * Skip phim đã enrich đầy đủ (cast_meta có profile ảnh TMDB) để tránh lặp lại ~1600 phim mỗi lần chạy.
     * Phim chưa có cast_meta hoặc cast_meta không có ảnh profile → vẫn cần gọi TMDB để enrich.
     */
    const forceTmdb = (process.env.FORCE_TMDB === '1' || process.env.FORCE_TMDB === 'true');
    const _dbg = { no_tid: 0, no_prev: 0, tid_changed: 0, prevtid_null: 0, no_lm: 0, ts_mismatch: 0, skipped: 0 };
    const need = (allMovies || []).filter((m) => {
      if (!m) return false;
      const tid = (m.tmdb && m.tmdb.id) || m.tmdb_id;
      if (!tid) { _dbg.no_tid++; return false; }
      if (forceTmdb) return true;

      const idStr = m.id != null ? String(m.id) : '';

      if (idStr && prevTmdbById && typeof prevTmdbById.get === 'function') {
        const prev = prevTmdbById.get(idStr);
        if (prev) {
          const prevTid = (prev.tmdb && prev.tmdb.id) || null;
          if (prevTid != null && String(prevTid) !== String(tid)) {
            _dbg.tid_changed++; return true; // Đổi TMDB ID => phải chạy lại
          }
          if (tid != null && prevTid == null) {
            _dbg.prevtid_null++; return true; // Chưa từng có data TMDB => phải chạy lại
          }

          // Dùng flag _tmdb_enriched trong last_modified.json để phân biệt:
          // - CORE (SKIP_TMDB) ghi false  → bỏ qua timestamp shortcut, phải enrich
          // - TMDB_ONLY/full build ghi true → có thể dùng timestamp để skip
          if (prevLastModified && prevLastModified._tmdb_enriched === true) {
            const curMod = String(m.modified || m.updated_at || '');
            const oldMod = String(prevLastModified[idStr] || '');
            if (oldMod && curMod && oldMod === curMod) {
              _dbg.skipped++; return false; // TMDB đã enrich, timestamp không đổi -> Bỏ qua
            }
            _dbg.ts_mismatch++;
          } else {
            _dbg.no_lm++;
          }
          // _tmdb_enriched false/undefined → lọt xuống để enrich (sau CORE, hoặc build cũ không có flag)
        } else {
          _dbg.no_prev++;
        }
      } else {
        _dbg.no_prev++;
      }

      return true;
    });
    console.log(
      `TMDB_ONLY filter: no_tid=${_dbg.no_tid} skipped=${_dbg.skipped} | enrich_reason:` +
      ` no_prev=${_dbg.no_prev} prevtid_null=${_dbg.prevtid_null} tid_changed=${_dbg.tid_changed}` +
      ` no_lm_flag=${_dbg.no_lm} ts_mismatch=${_dbg.ts_mismatch}`
    );
    console.log('TMDB_ONLY: movies to enrich:', need.length, '(skipped', allMovies.length - need.length, 'already enriched)');
    await timeBuildPhase('TMDB_ONLY: enrich TMDB', () => enrichTmdb(need));

    const tmdbById = new Map(prevTmdbById || []);
    const tmdbIdSeen = new Set();
    for (const m of allMovies) {
      const idStr = m && m.id != null ? String(m.id) : '';
      if (!idStr) continue;
      const tid = (m.tmdb && m.tmdb.id) || m.tmdb_id;
      // Luôn ghi phim có tmdb_id vào tmdbById, kể cả khi TMDB trả về rỗng.
      // Nếu không ghi, lần chạy sau prevTmdbById.get() = null → enrich lại vô hạn.
      if (!tid) continue;
      tmdbIdSeen.add(idStr);
      const prev = tmdbById.get(idStr);
      tmdbById.set(idStr, {
        id: idStr,
        tmdb: m.tmdb || (prev && prev.tmdb) || { id: tid },
        imdb: m.imdb || (prev && prev.imdb) || null,
        cast: (Array.isArray(m.cast) && m.cast.length) ? m.cast : ((prev && Array.isArray(prev.cast)) ? prev.cast : []),
        director: (Array.isArray(m.director) && m.director.length) ? m.director : ((prev && Array.isArray(prev.director)) ? prev.director : []),
        cast_meta: (Array.isArray(m.cast_meta) && m.cast_meta.length) ? m.cast_meta : ((prev && Array.isArray(prev.cast_meta)) ? prev.cast_meta : []),
        keywords: (Array.isArray(m.keywords) && m.keywords.length) ? m.keywords : ((prev && Array.isArray(prev.keywords)) ? prev.keywords : []),
      });
    }

    console.log('Writing TMDB pubjs + ver...');
    let newLastModifiedTmdb = null;
    timeBuildPhaseSync('TMDB_ONLY: writePubjsMoviesAndVer', () => {
      const r = writePubjsMoviesAndVer(allMovies, prevLastModified || undefined, tmdbById);
      newLastModifiedTmdb = r && r.newLastModified ? r.newLastModified : null;
    });
    try {
      // Tự build last_modified.json đầy đủ từ toàn bộ allMovies.
      // KHÔNG dùng newLastModifiedTmdb (chỉ là delta phim thay đổi) vì sẽ làm mất
      // timestamp của các phim "giữ nguyên" → lần sau chúng lại bị enrich lại vô hạn.
      const lmFull = Object.assign({}, prevLastModified || {});
      for (const m of allMovies) {
        const midStr = m && m.id != null ? String(m.id) : '';
        if (!midStr) continue;
        const rawMod = m.modified || m.updated_at || '';
        if (rawMod) lmFull[midStr] = rawMod;
      }
      lmFull._tmdb_enriched = true;
      fs.writeFileSync(lastModifiedPath, JSON.stringify(lmFull, null, 2));
    } catch {}

    timeBuildPhaseSync('TMDB_ONLY: writeIndex + search', () => writeIndexAndSearchShards(allMovies, null));

    // Rebuild actors từ TMDB payload
    try {
      const tActors = Date.now();
      console.log('[TIMING] → TMDB_ONLY: writeActors');
      writeActors(hydrateMoviesWithTmdbPayload(allMovies, tmdbById));
      console.log('[TIMING] ✓ TMDB_ONLY: writeActors:', fmtBuildMs(Date.now() - tActors));
    } catch (e) {
      console.warn('TMDB_ONLY: rebuild actors failed (continue):', e && e.message ? e.message : e);
    }

    // Giống full build 6c+6e: lịch chiếu / filters / trang chủ dựa trên allMovies đã có cast_meta TMDB.
    await timeBuildPhase('TMDB_ONLY: filters + category + home sections', async () => {
      const { genreNames, countryNames } = await fetchOPhimGenresAndCountries();
      const f = writeFilters(allMovies, genreNames, countryNames);
      writeCategoryPages(f);
      writeHomeSectionsData(allMovies);
      writeAutoSliderFile(allMovies);
      writeHomeBootstrapFile();
      injectHomeLcpPreloadIntoHtml();
    });

    const buildVersion = { builtAt: new Date().toISOString() };
    fs.writeFileSync(path.join(PUBLIC_DATA, 'build_version.json'), JSON.stringify(buildVersion, null, 2));
    injectFiltersJsCacheBustIntoHtml(path.join(ROOT, 'public'), buildVersion.builtAt);
    timeBuildPhaseSync('TMDB_ONLY: refresh home-bootstrap (build version)', () => writeHomeBootstrapFile());
    await maybeMinifyPublicAssets();
    console.log(
      'TMDB_ONLY: một pha hoàn tất — pubjs/filters/home/index/actors đã khớp; không cập nhật OPhim trong lần chạy này.'
    );
    console.log('TMDB_ONLY build done.');
    console.log('[TIMING] Total (TMDB_ONLY):', fmtBuildMs(Date.now() - buildT0));
    return;
  }

  console.log('1. Fetching OPhim...');
  const ophim = await timeBuildPhase('1. OPhim (fetch list + detail)', () =>
    fetchOPhimMovies(prevMoviesById, prevOphimIndex, cleanOldData)
  );
  console.log('   OPhim count:', ophim.length);

  console.log('2. Fetching custom (Supabase / Excel)...');
  const custom = await timeBuildPhase('2. Custom (Supabase / Excel)', () => fetchCustomMovies());
  console.log('   Custom count:', custom.length);

  // NEW: ảnh custom (metadata trong DB / batch, không ghi URL ngược Excel)
  await timeBuildPhase('2b. Repo images (custom new)', () => ensureRepoImagesForNewCustomMovies(custom));
  if (!skipTmdb) {
    console.log('3. Enriching TMDB...');
    await timeBuildPhase('3. TMDB enrich', async () => {
      const forceTmdb = (process.env.FORCE_TMDB === '1' || process.env.FORCE_TMDB === 'true');
      const shouldEnrich = (m) => {
        if (!m) return false;
        if (m._skip_tmdb) return false;
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
        if (tid != null && prevTid == null) return true;
        // Nếu phim không đổi so với last_modified và đã có payload TMDB trước đó => bỏ qua gọi TMDB.
        if (prevLastModified && typeof prevLastModified === 'object') {
          const rawMod = m.modified || m.updated_at || '';
          const curMod = normalizeModifiedValue(rawMod);
          const oldMod = normalizeModifiedValue(prevLastModified[idStr]);
          if (oldMod && curMod && oldMod === curMod) {
            return false;
          }
        }
        return true;
      };
      const needOphim = (ophim || []).filter(shouldEnrich);
      const needCustom = (custom || []).filter(shouldEnrich);
      console.log('   Movies to enrich TMDB:', needOphim.length + needCustom.length, '(OPhim:', needOphim.length, '| Custom:', needCustom.length, ')');
      await enrichTmdb(needOphim);
      await enrichTmdb(needCustom);
    });
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
      tmdb_checked: m._tmdb_checked || (prev && prev.tmdb_checked) || false,
    });
  }

  const allMovies = timeBuildPhaseSync('4. merge movies (ophim + custom)', () => mergeMovies(ophim, custom));
  console.log('4. Total movies:', allMovies.length);

  console.log('4b. Fetching OPhim genres & countries...');
  const { genreNames, countryNames } = await timeBuildPhase('4b. OPhim genres + countries', () =>
    fetchOPhimGenresAndCountries()
  );

  await timeBuildPhase('5. Supabase export + HTML inject', async () => {
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
  });

  console.log('6. Writing movies-light.js, filters.js, actors (index + shards), ver + pubjs indexes...');
  if (process.env.GENERATE_MOVIES_LIGHT === '1') {
    timeBuildPhaseSync('6. movies-light.js (optional)', () => writeMoviesLight(allMovies));
  }
  // CDN: thumb/poster vào public/ + URL jsDelivr trong output.
  await timeBuildPhase('6a. Repo/CDN images (all movies)', () => ensureRepoImagesForAllMovies(allMovies));
  const batchRes = timeBuildPhaseSync('6b. writePubjsMoviesAndVer', () =>
    writePubjsMoviesAndVer(allMovies, prevLastModified || undefined, tmdbById)
  );
  const newLastModified = batchRes && batchRes.newLastModified ? batchRes.newLastModified : batchRes;

  timeBuildPhaseSync('6c. home sections + auto slider', () => {
  writeHomeSectionsData(allMovies);
  writeAutoSliderFile(allMovies);
  writeHomeBootstrapFile();
  injectHomeLcpPreloadIntoHtml();
  });

  timeBuildPhaseSync('6d. writeIndex + search shards', () => writeIndexAndSearchShards(allMovies, null));
  timeBuildPhaseSync('6e. filters + category pages + actors', () => {
    const f = writeFilters(allMovies, genreNames, countryNames);
    writeCategoryPages(f);
  writeActors(hydrateMoviesWithTmdbPayload(allMovies, tmdbById));
  });

  try {
    writeLastModifiedIfChanged(path.join(PUBLIC_DATA, 'last_modified.json'), newLastModified);
  } catch {}

  console.log('6b. Sync update status back to Supabase (NEW → blank, slug if needed)...');
  await timeBuildPhase('6f. Supabase sync (update status)', () => applySupabaseUpdateStatuses(custom));

  const buildVersion = { builtAt: new Date().toISOString() };
  fs.writeFileSync(path.join(PUBLIC_DATA, 'build_version.json'), JSON.stringify(buildVersion, null, 2));
  injectFiltersJsCacheBustIntoHtml(path.join(ROOT, 'public'), buildVersion.builtAt);
  // home-bootstrap.json embed buildVersion — phải ghi lại sau build_version để trang chủ bust cache section đúng bản build mới.
  timeBuildPhaseSync('6g. refresh home-bootstrap (build version)', () => writeHomeBootstrapFile());

  console.log('7. Writing sitemap.xml & robots.txt...');
  timeBuildPhaseSync('7. sitemap + robots', () => {
  writeSitemap(allMovies);
  writeRobots();
  });

  if (process.env.VALIDATE_BUILD !== '0' && process.env.VALIDATE_BUILD !== 'false') {
    timeBuildPhaseSync('validate build outputs', () => validateBuildOutputs(allMovies));
  }

  const lastBuild = { builtAt: new Date().toISOString(), movieCount: allMovies.length };
  fs.writeFileSync(path.join(PUBLIC_DATA, 'last_build.json'), JSON.stringify(lastBuild, null, 2));
  // Ghi _tmdb_enriched: true/false vào last_modified để TMDB_ONLY pha sau biết trạng thái.
  // CORE (skipTmdb=true): false → TMDB_ONLY sẽ enrich lại toàn bộ.
  // Full build (skipTmdb=false): true → TMDB_ONLY (nếu chạy) có thể dựa vào timestamp.
  const lastModifiedOut = Object.assign({}, newLastModified || {}, { _tmdb_enriched: !skipTmdb });
  fs.writeFileSync(lastModifiedPath, JSON.stringify(lastModifiedOut, null, 2));
  await maybeMinifyPublicAssets();
  if (skipTmdb) {
    console.warn(
      'SKIP_TMDB (pha 1 / CORE): chưa gọi TMDB — cast_meta/keywords có thể thiếu; ảnh diễn viên phụ thuộc TMDB sẽ đầy sau pha 2. ' +
        'Hai pha: chạy thêm TMDB_ONLY=1 trên cùng pubjs-output + public/data đã build, hoặc dùng full build (bỏ SKIP_TMDB).'
    );
  }
  console.log('Build done.');
  console.log('[TIMING] Total (full build):', fmtBuildMs(Date.now() - buildT0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
