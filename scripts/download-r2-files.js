import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

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
  return Array.from(
    new Set(
      s
        .split(/[\n\r,\t ]+/)
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  );
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

async function streamToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function listAllKeysByPrefix(client, bucket, prefix, limit) {
  const keys = [];
  let token = undefined;
  while (true) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );
    const items = res.Contents || [];
    for (const it of items) {
      const k = it && it.Key ? String(it.Key) : '';
      if (!k) continue;
      keys.push(k);
      if (limit > 0 && keys.length >= limit) return keys;
    }
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
    if (!token) break;
  }
  return keys;
}

async function downloadKey(client, bucket, key, outDir) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return { ok: false, key: safeKey, error: 'empty key' };

  const outPath = path.join(outDir, safeKey);
  fs.ensureDirSync(path.dirname(outPath));
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: safeKey,
      })
    );
    const buf = await streamToBuffer(res.Body);
    await fs.writeFile(outPath, buf);
    return { ok: true, key: safeKey, path: outPath, bytes: buf.length };
  } catch (e) {
    return { ok: false, key: safeKey, error: e && e.message ? e.message : String(e) };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const mode = String(args.mode || 'prefix').trim();
  const prefix = String(args.prefix || '').trim();
  const keysRaw = String(args.keys || '').trim();
  const limit = Math.max(0, Number(args.limit || 0) || 0);
  const outRel = String(args.out_dir || 'tmp/r2_download').trim();
  const outDir = path.isAbsolute(outRel) ? outRel : path.join(ROOT, outRel);

  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket) {
    throw new Error('Missing R2 credentials env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)');
  }

  let keys = [];
  if (mode === 'prefix') {
    if (!prefix) throw new Error('mode=prefix requires --prefix');
    keys = await listAllKeysByPrefix(client, bucket, prefix, limit);
  } else if (mode === 'keys') {
    const list = parseList(keysRaw);
    keys = limit ? list.slice(0, limit) : list;
  } else {
    throw new Error('Invalid mode. Use prefix | keys');
  }

  console.log('R2 download mode=', mode, 'prefix=', prefix || '(n/a)', 'keys=', keys.length, 'limit=', limit || 'no');
  if (!keys.length) {
    console.log('No keys matched.');
    return;
  }

  await fs.remove(outDir);
  await fs.ensureDir(outDir);

  const concurrency = Math.max(1, Math.min(16, Number(args.concurrency || 6) || 6));
  let next = 0;
  let ok = 0;
  let fail = 0;

  const workers = Array.from({ length: Math.min(concurrency, keys.length) }, () => (async () => {
    while (true) {
      const i = next;
      next++;
      const k = keys[i];
      if (!k) break;
      const res = await downloadKey(client, bucket, k, outDir);
      if (res.ok) ok++;
      else fail++;
    }
  })());

  await Promise.all(workers);

  console.log('Downloaded ok=', ok, 'fail=', fail, 'out_dir=', outDir);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
