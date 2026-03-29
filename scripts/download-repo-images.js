import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');

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

function keyToAbsolutePath(key) {
  const k = String(key || '').trim().replace(/^\/+/, '');
  if (!k || k.includes('..')) return '';
  return path.join(PUBLIC_ROOT, k);
}

function listFilesRecursive(dir, baseRel, out, limit) {
  if (limit > 0 && out.length >= limit) return;
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (limit > 0 && out.length >= limit) return;
    const full = path.join(dir, e.name);
    const rel = baseRel ? `${baseRel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      listFilesRecursive(full, rel, out, limit);
    } else if (e.isFile()) {
      out.push(rel.replace(/\\/g, '/'));
    }
  }
}

function listAllKeysByPrefix(prefix, limit) {
  const p = String(prefix || '').trim();
  if (!p) return [];
  const dir = keyToAbsolutePath(p.replace(/\/$/, ''));
  if (!dir || !fs.existsSync(dir)) return [];
  const keys = [];
  listFilesRecursive(dir, p.replace(/\/$/, ''), keys, limit);
  return keys;
}

async function copyKey(key, outDir) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return { ok: false, key: safeKey, error: 'empty key' };
  const src = keyToAbsolutePath(safeKey);
  if (!src || !fs.existsSync(src)) {
    return { ok: false, key: safeKey, error: 'missing source' };
  }
  const outPath = path.join(outDir, safeKey);
  await fs.ensureDir(path.dirname(outPath));
  await fs.copy(src, outPath);
  const st = await fs.stat(outPath);
  return { ok: true, key: safeKey, path: outPath, bytes: st.size };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const mode = String(args.mode || 'prefix').trim();
  const prefix = String(args.prefix || '').trim();
  const keysRaw = String(args.keys || '').trim();
  const limit = Math.max(0, Number(args.limit || 0) || 0);
  const outRel = String(args.out_dir || 'tmp/repo_download').trim();
  const outDir = path.isAbsolute(outRel) ? outRel : path.join(ROOT, outRel);

  let keys = [];
  if (mode === 'prefix') {
    if (!prefix) throw new Error('mode=prefix requires --prefix');
    keys = listAllKeysByPrefix(prefix, limit);
  } else if (mode === 'keys') {
    const list = parseList(keysRaw);
    keys = limit ? list.slice(0, limit) : list;
  } else {
    throw new Error('Invalid mode. Use prefix | keys');
  }

  console.log('Repo copy mode=', mode, 'prefix=', prefix || '(n/a)', 'keys=', keys.length, 'limit=', limit || 'no');
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
      const res = await copyKey(k, outDir);
      if (res.ok) ok++;
      else fail++;
    }
  })());

  await Promise.all(workers);

  console.log('Copied ok=', ok, 'fail=', fail, 'out_dir=', outDir);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
