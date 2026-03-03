import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

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

function sanitizeR2Name(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const n = raw.replace(/\\/g, '/').split('/').pop() || '';
  return n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
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

async function uploadToR2(buffer, key, contentType) {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket) return false;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return true;
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
    if (e === 'png') return await img.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    if (e === 'webp') return await img.webp({ quality: q }).toBuffer();
    return await img.jpeg({ quality: q, mozjpeg: true }).toBuffer();
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
    if (!fs.existsSync(statePath)) return { version: 1, uploaded: {} };
    const j = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!j || typeof j !== 'object') return { version: 1, uploaded: {} };
    if (!j.uploaded || typeof j.uploaded !== 'object') j.uploaded = {};
    if (!j.version) j.version = 1;
    return j;
  } catch {
    return { version: 1, uploaded: {} };
  }
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
  const reuploadExisting = parseBool(args.reupload_existing, false);

  const limit = args.limit != null ? Math.max(0, Number(args.limit)) : 0;
  const concurrency = Math.max(1, Math.min(32, Number(args.concurrency || 6)));

  const stateRel = args.state_file || 'public/data/r2_upload_state.json';
  const statePath = path.isAbsolute(stateRel) ? stateRel : path.join(ROOT, stateRel);
  const state = loadState(statePath);

  const missing = [];
  if (!process.env.R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID');
  if (!process.env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!process.env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!process.env.R2_BUCKET_NAME) missing.push('R2_BUCKET_NAME');
  if (!process.env.R2_PUBLIC_URL) missing.push('R2_PUBLIC_URL');
  if (missing.length) throw new Error('Missing env: ' + missing.join(', '));

  let moviesToProcess = [];
  if (forceSlugSet) {
    const sample = Array.from(forceSlugSet).slice(0, 12);
    console.log('force_slugs parsed:', forceSlugSet.size, sample.length ? `sample=${sample.join(', ')}` : '');

    const ophimBase = String(args.ophim_base || process.env.OPHIM_BASE_URL || 'https://ophim1.com/v1/api').replace(/\/$/, '');
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

  let done = 0;
  let skipped = 0;
  let uploaded = 0;
  let failed = 0;
  const failureSamples = [];

  let writeQueue = Promise.resolve();
  const enqueueStateWrite = () => {
    writeQueue = writeQueue.then(() => {
      fs.ensureDirSync(path.dirname(statePath));
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    });
    return writeQueue;
  };

  const tasks = [];
  if (wantThumb) tasks.push('thumb');
  if (wantPoster) tasks.push('poster');

  const processOne = async (m) => {
    const idStr = m && m.id != null ? String(m.id) : '';
    if (!idStr) return;

    const slugStr = normalizeSlugLike(m && (m.slug || '') ? String(m.slug) : '');
    const inForceList = !!(forceSlugSet && slugStr && forceSlugSet.has(slugStr));
    const row = state.uploaded[idStr] || {};

    for (const kind of tasks) {
      const already = row && row[kind] && row[kind].ok;
      if (already && !(inForceList && reuploadExisting)) {
        skipped++;
        continue;
      }

      const rawUrl = kind === 'thumb'
        ? (m.thumb || '')
        : (m.poster || derivePosterFromThumb(m.thumb || '') || '');
      const url = normalizeSourceUrl(rawUrl);
      if (!url) {
        skipped++;
        continue;
      }

      let res;
      try {
        res = await fetch(url);
      } catch (e) {
        failed++;
        state.uploaded[idStr] = state.uploaded[idStr] || {};
        const reason = e && e.message ? `fetch_failed:${e.message}` : 'fetch_failed';
        state.uploaded[idStr][kind] = { ok: false, at: Date.now(), reason };
        if (failureSamples.length < 8) failureSamples.push({ id: idStr, kind, url, reason });
        continue;
      }

      if (!res.ok) {
        failed++;
        state.uploaded[idStr] = state.uploaded[idStr] || {};
        const reason = `http_${res.status}`;
        state.uploaded[idStr][kind] = { ok: false, at: Date.now(), reason };
        if (failureSamples.length < 8) failureSamples.push({ id: idStr, kind, url, reason });
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || '';
      const ext = guessExtFromContentType(ct) || guessExtFromUrl(url) || 'jpg';
      let fromUrlName = '';
      try {
        fromUrlName = sanitizeR2Name((new URL(url).pathname || '').split('/').pop() || '');
      } catch {
        fromUrlName = '';
      }
      const filename = fromUrlName || sanitizeR2Name(`${idStr}-${kind}.${ext}`) || `${idStr}-${kind}.${ext}`;

      const q = kind === 'thumb' ? thumbQuality : posterQuality;
      const w = kind === 'thumb' ? thumbW : posterW;
      const h = kind === 'thumb' ? thumbH : posterH;

      const optimized = await optimizeAndResize(buf, ext, { quality: q, width: w, height: h });
      const folder = kind === 'thumb' ? 'thumbs' : 'posters';
      const key = `${folder}/${filename}`;

      try {
        await uploadToR2(optimized, key, contentTypeFromExt(ext));
        uploaded++;
        state.uploaded[idStr] = state.uploaded[idStr] || {};
        state.uploaded[idStr][kind] = { ok: true, at: Date.now(), key, bytes: optimized.length };
      } catch (e) {
        failed++;
        state.uploaded[idStr] = state.uploaded[idStr] || {};
        const reason = e && e.message ? e.message : 'upload_failed';
        state.uploaded[idStr][kind] = { ok: false, at: Date.now(), reason };
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

  if (failureSamples.length) {
    console.log('Failure samples (first ' + failureSamples.length + '):');
    for (const f of failureSamples) {
      console.log('-', f.id + ':' + f.kind, f.reason, f.url);
    }
  }

  console.log('Done. uploaded=', uploaded, 'skipped=', skipped, 'failed=', failed, 'state=', statePath);
  return;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
