import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import sharp from 'sharp';
import {
  getImageCdnBase,
  repoImageKeyExists,
  cdnUrlForImageKey,
  writeRepoImageFile,
  isCdnRepoImageUrl,
} from './lib/repo-images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

/** State: REPO_IMAGE_STATE_PRETTY=1 (hoặc R2_STATE_PRETTY) → JSON đẹp; cảnh báo file state lớn. */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

async function uploadToRepo(buffer, key, contentType) {
  const url = await writeRepoImageFile(buffer, key, contentType);
  return !!url;
}

async function headUrlOk(url, timeoutMs = 8000) {
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

function contentTypeFromExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function normalizeSourceUrl(url) {
  if (!url) return '';
  const u = String(url).trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/uploads/')) {
    const base = String(process.env.OPHIM_IMG_DOMAIN || 'https://img.ophim.live').replace(/\/$/, '');
    return base + u;
  }
  return u;
}

function normalizeOphimCdnUrl(raw, cdnBase) {
  if (!raw) return '';
  const u = String(raw).trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/uploads/')) {
    const base = String(process.env.OPHIM_IMG_DOMAIN || 'https://img.ophim.live').replace(/\/$/, '');
    return base + u;
  }

  // Some OPhim responses return only a filename like "xxx-thumb.jpg"
  const ophimBase = String(process.env.OPHIM_IMG_DOMAIN || 'https://img.ophim.live').replace(/\/$/, '');
  const looksLikeFilename = !u.includes('/') && /\.(jpe?g|png|webp|gif)$/i.test(u);
  if (ophimBase && looksLikeFilename) {
    return ophimBase + '/uploads/movies/' + u.replace(/^\/+/, '');
  }

  const base = String(cdnBase || '').replace(/\/$/, '');
  if (base) return base + '/' + u.replace(/^\/+/, '');
  return u;
}

async function optimizeAndResize(buf, ext, opts) {
  const e = String(ext || '').toLowerCase();
  if (e === 'gif') return buf;

  let img;
  try {
    img = sharp(buf, { failOn: 'none' }).rotate();
  } catch {
    return buf;
  }

  const w = opts && opts.width ? Number(opts.width) : 0;
  const h = opts && opts.height ? Number(opts.height) : 0;
  if (w > 0 || h > 0) {
    img = img.resize(w > 0 ? w : null, h > 0 ? h : null, { fit: 'cover', withoutEnlargement: true });
  }

  const q = opts && opts.quality ? Math.max(1, Math.min(100, Number(opts.quality))) : 80;
  try {
    return await img.webp({ quality: q }).toBuffer();
  } catch {
    return buf;
  }
}

function loadMovieListFromBatches() {
  const batchDir = path.join(PUBLIC_DATA, 'batches');
  const windowsPath = path.join(batchDir, 'batch-windows.json');
  if (!fs.existsSync(windowsPath)) throw new Error('Missing batch-windows.json: ' + windowsPath);
  const wj = JSON.parse(fs.readFileSync(windowsPath, 'utf8'));
  const wins = wj && Array.isArray(wj.windows) ? wj.windows : [];
  if (!wins.length) throw new Error('Invalid windows in batch-windows.json');

  const all = [];
  for (const w of wins) {
    const f = path.join(batchDir, `batch_${w.start}_${w.end}.js`);
    if (!fs.existsSync(f)) continue;
    const raw = fs.readFileSync(f, 'utf8');
    const jsonStr = raw
      .replace(/^window\.moviesBatch\s*=\s*/i, '')
      .replace(/;\s*$/, '');
    try {
      const arr = JSON.parse(jsonStr);
      if (Array.isArray(arr)) all.push(...arr);
    } catch {
      // skip
    }
  }
  return all;
}

function loadState(statePath) {
  try {
    if (!fs.existsSync(statePath)) return { version: 2, uploaded: {} };
    const raw = fs.readFileSync(statePath, 'utf8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return { version: 2, uploaded: {} };
    if (!j.uploaded || typeof j.uploaded !== 'object') j.uploaded = {};
    if (!j.version) j.version = 1;
    return j;
  } catch {
    return { version: 2, uploaded: {} };
  }
}

const STATE_MASK_THUMB = 1;
const STATE_MASK_POSTER = 2;

function kindToMask(kind) {
  return kind === 'thumb' ? STATE_MASK_THUMB : (kind === 'poster' ? STATE_MASK_POSTER : 0);
}

function isStateOk(state, idStr, kind) {
  if (!state || !state.uploaded || !idStr) return false;
  const row = state.uploaded[idStr];
  if (row == null) return false;
  const mask = kindToMask(kind);
  if (!mask) return false;
  // v2: number bitmask
  if (typeof row === 'number') return (row & mask) === mask;
  // v1: object { thumb:{ok}, poster:{ok} }
  if (typeof row === 'object') return !!(row[kind] && row[kind].ok);
  return false;
}

function markStateOk(state, idStr, kind, meta) {
  if (!state || !state.uploaded || !idStr) return;
  const mask = kindToMask(kind);
  if (!mask) return;
  const minimal = /^1|true|yes$/i.test(String(process.env.REPO_IMAGE_STATE_MINIMAL || '').trim());
  const row = state.uploaded[idStr];

  if (minimal) {
    const prevMask = typeof row === 'number'
      ? row
      : (typeof row === 'object'
        ? ((row.thumb && row.thumb.ok) ? STATE_MASK_THUMB : 0) | ((row.poster && row.poster.ok) ? STATE_MASK_POSTER : 0)
        : 0);
    state.version = 2;
    state.uploaded[idStr] = (prevMask | mask);
    return;
  }

  // Legacy verbose mode (keeps metadata for debugging)
  if (typeof row !== 'object' || row == null || typeof row === 'number') {
    state.uploaded[idStr] = {};
  }
  state.uploaded[idStr][kind] = { ok: true, at: Date.now(), ...(meta || {}) };
}

function markStateFail(state, idStr, kind, reason) {
  const keepFailed = /^1|true|yes$/i.test(String(process.env.REPO_IMAGE_STATE_KEEP_FAILED || '').trim());
  if (!keepFailed) return;
  if (!state || !state.uploaded || !idStr) return;
  if (typeof state.uploaded[idStr] === 'number') {
    // v2 minimal: don't store failure details
    return;
  }
  state.uploaded[idStr] = state.uploaded[idStr] && typeof state.uploaded[idStr] === 'object'
    ? state.uploaded[idStr]
    : {};
  state.uploaded[idStr][kind] = { ok: false, at: Date.now(), reason: String(reason || 'failed') };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function logRepoImageStateStats(label, state, statePath) {
  const entries = state && state.uploaded && typeof state.uploaded === 'object'
    ? Object.keys(state.uploaded).length
    : 0;
  let bytes = 0;
  try {
    if (fs.existsSync(statePath)) bytes = fs.statSync(statePath).size;
  } catch {
    /* ignore */
  }
  const warnMb = Math.max(1, Number(process.env.REPO_IMAGE_STATE_WARN_MB || process.env.R2_STATE_WARN_MB || 40) || 40);
  const warnN = Math.max(1000, Number(process.env.REPO_IMAGE_STATE_WARN_ENTRIES || process.env.R2_STATE_WARN_ENTRIES || 400000) || 400000);
  console.log(`   [repo_image_upload_state] ${label}: ${entries} movie id(s), file ~${formatBytes(bytes)} (${statePath})`);
  if (bytes > warnMb * 1024 * 1024) {
    console.warn(`   [repo_image_upload_state] Cảnh báo: file state > ~${warnMb} MiB — xem xóa key cũ (delete-movie-images-repo) hoặc tách repo.`);
  }
  if (entries > warnN) {
    console.warn(`   [repo_image_upload_state] Cảnh báo: > ${warnN} id trong state — theo dõi dung lượng file.`);
  }
}

function stringifyState(state) {
  const pretty = /^1|true|yes$/i.test(String(process.env.REPO_IMAGE_STATE_PRETTY || process.env.R2_STATE_PRETTY || '').trim());
  const minimal = /^1|true|yes$/i.test(String(process.env.REPO_IMAGE_STATE_MINIMAL || '').trim());
  if (minimal) {
    // Ensure v2 bitmask format to keep file small.
    const out = { version: 2, uploaded: {} };
    for (const [id, row] of Object.entries((state && state.uploaded) || {})) {
      if (!id) continue;
      if (typeof row === 'number') {
        if (row) out.uploaded[id] = row;
        continue;
      }
      if (row && typeof row === 'object') {
        const mask = ((row.thumb && row.thumb.ok) ? STATE_MASK_THUMB : 0) | ((row.poster && row.poster.ok) ? STATE_MASK_POSTER : 0);
        if (mask) out.uploaded[id] = mask;
      }
    }
    return pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
  }
  return pretty ? JSON.stringify(state, null, 2) : JSON.stringify(state);
}

function parseSlugList(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const parts = s
    .split(/[,\n\r\t ]+/)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return new Set(parts);
}

function normalizeSlugLike(raw) {
  if (!raw) return '';
  let s = String(raw).trim().toLowerCase();
  if (!s) return '';

  // strip common wrappers when slugs are pasted from JSON/CSV or copied with quotes
  while (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('`') && s.endsWith('`'))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^[\[\(\{\s]+/, '').replace(/[\]\)\}\s]+$/, '').trim();
  s = s.replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '').trim();

  s = s.replace(/^https?:\/\/[^/]+/i, '');
  s = s.replace(/\?.*$/, '');
  s = s.replace(/#.*$/, '');
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  s = s.replace(/\.html$/i, '');
  if (s.startsWith('phim/')) s = s.slice('phim/'.length);
  return s;
}

function normalizeSlugSet(set) {
  if (!set) return null;
  const out = new Set();
  for (const v of set) {
    const n = normalizeSlugLike(v);
    if (n) out.add(n);
  }
  return out.size ? out : null;
}

function parseBool(raw, fallback) {
  if (raw == null) return !!fallback;
  const s = String(raw).trim().toLowerCase();
  if (!s) return !!fallback;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n' || s === 'off') return false;
  return !!fallback;
}


async function fetchOphimDetailBySlug(base, slug) {
  const b = String(base || '').replace(/\/$/, '');
  const s = normalizeSlugLike(slug);
  if (!b || !s) return null;

  const url = `${b}/phim/${encodeURIComponent(s)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ophim_http_${res.status}`);
  const detail = await res.json().catch(() => null);

  const movie = detail?.data?.item || detail?.data?.movie || detail?.data || null;
  if (!movie) return null;

  const cdnBase = String(detail?.data?.APP_DOMAIN_CDN_IMAGE || '').replace(/\/$/, '');

  const idStr = (movie?._id != null ? String(movie._id)
    : (movie?.id != null ? String(movie.id)
      : (movie?.movie_id != null ? String(movie.movie_id) : '')));

  const thumbRaw = movie?.thumb_url || movie?.thumb || '';
  const posterRaw = movie?.poster_url || movie?.poster || '';
  const thumb = normalizeOphimCdnUrl(thumbRaw, cdnBase);
  const poster = normalizeOphimCdnUrl(posterRaw, cdnBase);
  return {
    id: idStr || s,
    slug: s,
    thumb,
    poster,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const mode = (args.mode || 'thumb,poster').toString();
  const wantThumb = mode.split(',').map((s) => s.trim()).includes('thumb');
  const wantPoster = mode.split(',').map((s) => s.trim()).includes('poster');

  const thumbQuality = Number(args.thumb_quality || args.quality || 70);
  const posterQuality = Number(args.poster_quality || args.quality || 70);
  const thumbW = Number(args.thumb_width || 238);
  const thumbH = Number(args.thumb_height || 344);
  const posterW = Number(args.poster_width || 486);
  const posterH = Number(args.poster_height || 274);

  const forceSlugSet = normalizeSlugSet(parseSlugList(args.force_slugs));
  const reuploadExisting = parseBool(args.reupload_existing, false)
    || parseBool(process.env.REPO_IMAGE_REUPLOAD_EXISTING, false)
    || parseBool(process.env.R2_REUPLOAD_EXISTING, false);

  const ophimBase = String(args.ophim_base || process.env.OPHIM_BASE_URL || 'https://ophim1.com/v1/api').replace(/\/$/, '');
  const fallbackOphim = parseBool(args.fallback_ophim, true);
  const ophimCacheBySlug = new Map();

  console.log(
    'Args:',
    JSON.stringify(
      {
        mode,
        reupload_existing_arg: args.reupload_existing != null ? String(args.reupload_existing) : null,
        REPO_IMAGE_REUPLOAD_EXISTING_env: process.env.REPO_IMAGE_REUPLOAD_EXISTING != null ? String(process.env.REPO_IMAGE_REUPLOAD_EXISTING) : null,
        reuploadExisting,
        fallbackOphim,
        forceSlugs: forceSlugSet ? forceSlugSet.size : 0,
        limit: args.limit != null ? String(args.limit) : '',
        concurrency: args.concurrency != null ? String(args.concurrency) : '',
      },
      null,
      2
    )
  );

  const limit = args.limit != null ? Math.max(0, Number(args.limit)) : 0;
  const concurrency = Math.max(1, Math.min(32, Number(args.concurrency || 6)));

  const stateRel = args.state_file || 'public/data/repo_image_upload_state.json';
  const statePath = path.isAbsolute(stateRel) ? stateRel : path.join(ROOT, stateRel);
  const state = loadState(statePath);

  if (!getImageCdnBase()) {
    throw new Error('Missing IMAGE_CDN_BASE (hoặc R2_PUBLIC_URL legacy) — base jsDelivr …/public');
  }

  logRepoImageStateStats('loaded', state, statePath);

  let moviesToProcess = [];
  if (forceSlugSet) {
    const sample = Array.from(forceSlugSet).slice(0, 12);
    console.log('force_slugs parsed:', forceSlugSet.size, sample.length ? `sample=${sample.join(', ')}` : '');

    console.log('Using OPhim base:', ophimBase);

    const slugs = Array.from(forceSlugSet);
    const picked = limit ? slugs.slice(0, limit) : slugs;
    const out = [];
    for (const slug of picked) {
      try {
        const m = await fetchOphimDetailBySlug(ophimBase, slug);
        if (m) out.push(m);
      } catch (e) {
        console.warn('OPhim detail skip:', slug, e && e.message ? e.message : String(e));
      }
    }
    moviesToProcess = out.filter((m) => m && m.id != null);

    console.log('Movies loaded:', moviesToProcess.length);
    if (!moviesToProcess.length) {
      throw new Error('force_slugs provided but OPhim returned no movies. Check slugs and OPHIM_BASE_URL/ophim_base.');
    }
  } else {
    const movies = loadMovieListFromBatches();
    console.log('Movies loaded:', movies.length);
    const moviesFiltered = (movies || []).filter((m) => m && m.id != null);
    moviesToProcess = limit ? moviesFiltered.slice(0, limit) : moviesFiltered;
  }

  // Prune state to current movie ids to prevent unbounded growth.
  const prune = /^1|true|yes$/i.test(String(process.env.REPO_IMAGE_STATE_PRUNE || '').trim());
  if (prune) {
    const keep = new Set();
    for (const m of moviesToProcess) {
      const idStr = m && m.id != null ? String(m.id) : '';
      if (idStr) keep.add(idStr);
    }
    const before = Object.keys(state.uploaded || {}).length;
    for (const id of Object.keys(state.uploaded || {})) {
      if (!keep.has(id)) delete state.uploaded[id];
    }
    const after = Object.keys(state.uploaded || {}).length;
    if (after !== before) {
      console.log(`   [repo_image_upload_state] pruned: ${before} -> ${after} (keep current batches only)`);
    }
  }

  let done = 0;
  let skipped = 0;
  let skippedAlready = 0;
  let skippedNoUrl = 0;
  let skippedNoId = 0;
  let uploaded = 0;
  let failed = 0;
  const failureSamples = [];

  let writeQueue = Promise.resolve();
  const enqueueStateWrite = () => {
    writeQueue = writeQueue.then(() => {
      fs.ensureDirSync(path.dirname(statePath));
      fs.writeFileSync(statePath, stringifyState(state), 'utf8');
    });
    return writeQueue;
  };

  const tasks = [];
  if (wantThumb) tasks.push('thumb');
  if (wantPoster) tasks.push('poster');

  const processOne = async (m) => {
    const idStr = m && m.id != null ? String(m.id) : '';
    if (!idStr) {
      skipped++;
      skippedNoId++;
      return;
    }

    // When build is a partial page-range without clean, CORE batches may preserve older movies.
    // If user asks to reupload existing images, we only force reupload for movies from the current fetch range.
    const forceThisMovie = !!reuploadExisting && !(m && m._image_preserved);

    const slugStr = normalizeSlugLike(m && (m.slug || '') ? String(m.slug) : '');
    const inForceList = !!(forceSlugSet && slugStr && forceSlugSet.has(slugStr));
    const row = state.uploaded[idStr];

    const getOphimSource = async () => {
      if (!fallbackOphim) return null;
      if (!ophimBase) return null;
      if (!slugStr) return null;
      if (ophimCacheBySlug.has(slugStr)) return ophimCacheBySlug.get(slugStr);
      try {
        const got = await fetchOphimDetailBySlug(ophimBase, slugStr);
        ophimCacheBySlug.set(slugStr, got);
        return got;
      } catch {
        ophimCacheBySlug.set(slugStr, null);
        return null;
      }
    };

    for (const kind of tasks) {
      const folderEarly = kind === 'thumb' ? 'thumbs' : 'posters';
      const objectKeyEarly = `${folderEarly}/${idStr}.webp`;

      const already = isStateOk(state, idStr, kind);
      // Reupload existing: only force for current-range movies.
      // For preserved movies, don't skip if the file is actually missing.
      if (already && !forceThisMovie && repoImageKeyExists(objectKeyEarly)) {
        skipped++;
        skippedAlready++;
        continue;
      }

      if (!forceThisMovie && repoImageKeyExists(objectKeyEarly)) {
        markStateOk(state, idStr, kind, { key: objectKeyEarly, skip: 'file_exists' });
        skipped++;
        skippedAlready++;
        continue;
      }

      // If images are stored in a different repo/CDN, local file may not exist.
      // When enabled, do a cheap HEAD check against the public CDN and skip uploads when already present.
      const remoteHeadCheck =
        (process.env.REPO_IMAGE_REMOTE_HEAD_CHECK === '1' || process.env.REPO_IMAGE_REMOTE_HEAD_CHECK === 'true');
      if (!forceThisMovie && remoteHeadCheck && !row?.[kind]?.ok) {
        const remoteUrl = cdnUrlForImageKey(objectKeyEarly);
        if (remoteUrl) {
          const ok = await headUrlOk(remoteUrl, Number(process.env.REPO_IMAGE_REMOTE_HEAD_TIMEOUT_MS || '8000'));
          if (ok) {
            markStateOk(state, idStr, kind, { key: objectKeyEarly, skip: 'remote_exists' });
            skipped++;
            skippedAlready++;
            continue;
          }
        }
      }

      let rawUrl = kind === 'thumb'
        ? (m.thumb_url || m.thumb || '')
        : (m.poster_url || m.poster || derivePosterFromThumb(m.thumb_url || m.thumb || '') || '');

      // If source is missing or points to CDN url, try fallback to OPhim by slug.
      if (!rawUrl || isCdnRepoImageUrl(rawUrl)) {
        const ophim = await getOphimSource();
        if (ophim) {
          rawUrl = kind === 'thumb'
            ? (ophim.thumb || '')
            : (ophim.poster || derivePosterFromThumb(ophim.thumb || '') || '');
        }
      }

      const url = normalizeSourceUrl(rawUrl);
      if (!url) {
        // If we're reuploading (or forcing uploads) and still have no source URL,
        // treat as a failure so it's visible (instead of being silently skipped).
        if (forceThisMovie || inForceList) {
          failed++;
          markStateFail(state, idStr, kind, 'no_source_url');
          if (failureSamples.length < 8) failureSamples.push({ id: idStr, kind, url: '', reason: 'no_source_url' });
        } else {
          skipped++;
          skippedNoUrl++;
        }
        continue;
      }

      let res;
      try {
        res = await fetch(url);
      } catch (e) {
        failed++;
        const reason = e && e.message ? `fetch_failed:${e.message}` : 'fetch_failed';
        markStateFail(state, idStr, kind, reason);
        if (failureSamples.length < 8) failureSamples.push({ id: idStr, kind, url, reason });
        continue;
      }

      if (!res.ok) {
        failed++;
        const reason = `http_${res.status}`;
        markStateFail(state, idStr, kind, reason);
        if (failureSamples.length < 8) failureSamples.push({ id: idStr, kind, url, reason });
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || '';
      const ext = guessExtFromContentType(ct) || guessExtFromUrl(url) || 'jpg';

      const q = kind === 'thumb' ? thumbQuality : posterQuality;
      const w = kind === 'thumb' ? thumbW : posterW;
      const h = kind === 'thumb' ? thumbH : posterH;

      const optimized = await optimizeAndResize(buf, ext, { quality: q, width: w, height: h });
      const folder = kind === 'thumb' ? 'thumbs' : 'posters';
      const key = `${folder}/${idStr}.webp`;

      try {
        await uploadToRepo(optimized, key, 'image/webp');
        uploaded++;
        markStateOk(state, idStr, kind, { key, bytes: optimized.length });
      } catch (e) {
        failed++;
        const reason = e && e.message ? e.message : 'upload_failed';
        markStateFail(state, idStr, kind, reason);
        if (failureSamples.length < 8) failureSamples.push({ id: idStr, kind, url, reason });
      }
    }
  };

  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, moviesToProcess.length || 1) }, () => (async () => {
    while (true) {
      const i = nextIndex;
      nextIndex++;
      const m = moviesToProcess[i];
      if (!m) break;
      await processOne(m);
      done++;
      if (done % 200 === 0) {
        console.log(`Progress: ${done}/${moviesToProcess.length} uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
        await enqueueStateWrite();
      }
    }
  })());

  await Promise.all(workers);

  await enqueueStateWrite();
  await writeQueue;
  logRepoImageStateStats('saved', state, statePath);

  if (failureSamples.length) {
    console.log('Failure samples (first ' + failureSamples.length + '):');
    for (const f of failureSamples) {
      console.log('-', f.id + ':' + f.kind, f.reason, f.url);
    }
  }

  console.log(
    'Done. uploaded=',
    uploaded,
    'skipped=',
    skipped,
    '(already=',
    skippedAlready,
    'no_url=',
    skippedNoUrl,
    'no_id=',
    skippedNoId,
    ') failed=',
    failed,
    'state=',
    statePath
  );
  return;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
