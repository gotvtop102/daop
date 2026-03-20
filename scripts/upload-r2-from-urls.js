import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

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

function parseList(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s
    .split(/[\n\r]+/)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
}

function sanitizeFilename(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const n = raw.replace(/\\/g, '/').split('/').pop() || '';
  return n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function ensureWebpFilename(name) {
  const n = sanitizeFilename(name);
  if (!n) return '';
  const base = n.replace(/\.(jpe?g|jpg|png|webp|gif)$/i, '');
  return base + '.webp';
}

function parseNameUrlPairs(raw) {
  const lines = parseList(raw);
  if (!lines.length) return [];
  const out = [];
  for (const line of lines) {
    const parts = String(line).split('|');
    if (parts.length < 2) {
      out.push({ name: '', url: line });
      continue;
    }
    const name = parts[0] != null ? String(parts[0]).trim() : '';
    const url = parts.slice(1).join('|').trim();
    out.push({ name, url });
  }
  return out;
}

function normalizeFolder(folder) {
  const f = String(folder || '').trim();
  const base = f.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!base) return 'thumbs';
  if (base !== 'thumbs' && base !== 'posters') {
    throw new Error('Invalid folder. Use thumbs | posters');
  }
  return base;
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

function isHttpUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchBuffer(url) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'daop-movie-upload-r2-from-urls',
      Accept: 'image/*,*/*;q=0.8',
    },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Fetch failed ${r.status} ${r.statusText}: ${t.slice(0, 200)}`);
  }
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

async function toWebp(buf, opts) {
  const q = Math.max(1, Math.min(100, Number(opts.quality || 70) || 70));
  const width = Math.max(0, Number(opts.width || 0) || 0);
  const height = Math.max(0, Number(opts.height || 0) || 0);

  let img = sharp(buf, { failOnError: false });
  if (width > 0 || height > 0) {
    img = img.resize(width > 0 ? width : null, height > 0 ? height : null, {
      fit: 'cover',
    });
  }
  return await img.webp({ quality: q }).toBuffer();
}

async function uploadToR2(client, bucket, key, body) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const folder = normalizeFolder(args.folder || 'thumbs');
  const ids = parseList(args.ids);
  const urls = parseList(args.urls);
  const pairsRaw = String(args.pairs || '').trim();
  const createFolders = String(args.create_folders || '').trim().toLowerCase();
  const shouldCreateFolders = createFolders === '1' || createFolders === 'true' || createFolders === 'yes' || createFolders === 'on';
  const limit = Math.max(0, Number(args.limit || 0) || 0);
  const concurrency = Math.max(1, Math.min(16, Number(args.concurrency || 6) || 6));

  const pairItems = pairsRaw ? parseNameUrlPairs(pairsRaw) : [];
  const usePairs = !!pairItems.length;

  if (!usePairs) {
    if (!ids.length) throw new Error('Missing --ids (newline separated), must match URLs order.');
    if (!urls.length) throw new Error('Missing --urls (newline separated).');
    if (ids.length !== urls.length) {
      throw new Error(`ids count (${ids.length}) must equal urls count (${urls.length})`);
    }
  }

  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket) {
    throw new Error('Missing R2 credentials env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)');
  }

  const items = usePairs
    ? pairItems.map((p) => ({ name: ensureWebpFilename(p.name), url: String(p.url || '').trim() }))
    : ids.map((id, i) => ({ name: ensureWebpFilename(String(id).trim()), url: String(urls[i]).trim() }));

  const chosen = limit ? items.slice(0, limit) : items;

  const bad = chosen.find((p) => !p.name || !p.url || !isHttpUrl(p.url));
  if (bad) {
    throw new Error(`Invalid item: name="${bad.name}" url="${bad.url}"`);
  }

  const outRel = String(args.out_log || 'tmp/r2_upload_from_urls.json');
  const outLog = path.isAbsolute(outRel) ? outRel : path.join(ROOT, outRel);
  fs.ensureDirSync(path.dirname(outLog));

  console.log('Upload R2 from URLs', { folder, count: chosen.length, concurrency, mode: usePairs ? 'pairs' : 'ids_urls' });

  if (shouldCreateFolders) {
    try {
      await uploadToR2(client, bucket, `${folder}/.keep`, Buffer.from(''));
      console.log('Created folder marker:', `${folder}/.keep`);
    } catch (e) {
      console.warn('Failed to create folder marker (ignored):', e && e.message ? e.message : String(e));
    }
  }

  let next = 0;
  const results = [];

  const workers = Array.from({ length: Math.min(concurrency, chosen.length) }, () => (async () => {
    while (true) {
      const i = next;
      next++;
      const item = chosen[i];
      if (!item) break;

      const key = `${folder}/${item.name}`;
      try {
        const src = await fetchBuffer(item.url);
        const webp = await toWebp(src, {
          quality: args.quality,
          width: args.width,
          height: args.height,
        });
        await uploadToR2(client, bucket, key, webp);
        results.push({ ok: true, name: item.name, url: item.url, key, bytes: webp.length });
      } catch (e) {
        results.push({ ok: false, name: item.name, url: item.url, key, error: e && e.message ? e.message : String(e) });
      }
    }
  })());

  await Promise.all(workers);

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  fs.writeFileSync(outLog, JSON.stringify({ folder, ok, fail, results }, null, 2));
  console.log('Done. ok=', ok, 'fail=', fail, 'log=', outLog);

  if (fail) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
