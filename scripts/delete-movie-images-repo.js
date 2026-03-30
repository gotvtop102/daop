import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getImagesRepoEnv,
  githubDeleteFile,
  githubListAllBlobPaths,
} from './lib/github-images-remote.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');

function toGithubContentPath(relKey) {
  const k = String(relKey || '').trim().replace(/^\/+/, '');
  if (!k || k.includes('..')) return '';
  if (k.startsWith('public/')) return k;
  return `public/${k}`;
}

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

function parseBool(v, dflt) {
  if (v == null) return dflt;
  const s = String(v).trim().toLowerCase();
  if (!s) return dflt;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return dflt;
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

function loadState(statePath) {
  try {
    if (!fs.existsSync(statePath)) return { version: 1, uploaded: {} };
    const raw = fs.readFileSync(statePath, 'utf-8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return { version: 1, uploaded: {} };
    if (!j.uploaded || typeof j.uploaded !== 'object') j.uploaded = {};
    if (!j.version) j.version = 1;
    return j;
  } catch {
    return { version: 1, uploaded: {} };
  }
}

function markDeletedInState(state, movieId, kind) {
  if (!state || !state.uploaded) return;
  const row = state.uploaded[movieId];
  if (!row) return;
  // v2 (bitmask) state: just clear bits for deleted kinds.
  if (typeof row === 'number') {
    const THUMB = 1;
    const POSTER = 2;
    const mask = kind === 'both'
      ? (THUMB | POSTER)
      : (kind === 'thumb' ? THUMB : POSTER);
    state.uploaded[movieId] = (row & (~mask));
    if (!state.uploaded[movieId]) delete state.uploaded[movieId];
    return;
  }
  if (typeof row !== 'object') return;
  const kinds = kind === 'both' ? ['thumb', 'poster'] : [kind];
  for (const k of kinds) {
    if (row[k] && typeof row[k] === 'object') {
      row[k] = { ok: false, at: Date.now(), reason: 'deleted' };
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const mode = String(args.mode || 'prefix').trim();
  const prefix = String(args.prefix || '').trim();
  const kindRaw = String(args.kind || 'both').trim().toLowerCase();
  const kind = kindRaw === 'thumb' || kindRaw === 'poster' ? kindRaw : 'both';
  const dryRun = parseBool(args.dry_run, true);
  const limit = Math.max(0, Number(args.limit || 0) || 0);

  const stateRel = String(args.state_file || 'public/data/repo_image_upload_state.json');
  const statePath = path.isAbsolute(stateRel) ? stateRel : path.join(ROOT, stateRel);
  const state = loadState(statePath);

  let keysToDelete = [];

  const { repo: ghRepo, branch: ghBranch, token: ghToken } = getImagesRepoEnv();
  const deleteOnAssetsRepo = !!(ghRepo && ghToken);

  if (mode === 'prefix') {
    if (!prefix) throw new Error('mode=prefix requires --prefix, e.g. thumbs/ or posters/');
    if (deleteOnAssetsRepo) {
      const pref = String(prefix || '').trim().replace(/^\/+/, '').replace(/\/$/, '');
      const remotePrefix = pref.startsWith('public/')
        ? `${pref.replace(/\/$/, '')}/`
        : `public/${pref}/`;
      const all = await githubListAllBlobPaths(ghRepo, ghBranch, ghToken);
      keysToDelete = all.filter(
        (p) => p.startsWith(remotePrefix) && !p.endsWith('.gitkeep')
      );
      if (limit) keysToDelete = keysToDelete.slice(0, limit);
    } else {
      keysToDelete = listAllKeysByPrefix(prefix, limit);
    }
  } else if (mode === 'keys') {
    const keys = parseList(args.keys);
    keysToDelete = limit ? keys.slice(0, limit) : keys;
  } else if (mode === 'movie_ids') {
    const ids = parseList(args.movie_ids);
    const out = [];
    for (const id of ids) {
      const row = state.uploaded && state.uploaded[id] ? state.uploaded[id] : null;
      if (!row) continue;
      const addKey = (k) => {
        // v2 state (bitmask): derive deterministic key
        if (typeof row === 'number') {
          const THUMB = 1;
          const POSTER = 2;
          const bit = k === 'thumb' ? THUMB : POSTER;
          if ((row & bit) === bit) {
            out.push((k === 'thumb' ? `thumbs/${id}.webp` : `posters/${id}.webp`));
          }
          return;
        }
        // v1 state: key may be absent in minimal/older runs; derive if ok==true but key missing
        const ok = !!(row && row[k] && row[k].ok);
        const v = row && row[k] && row[k].key ? String(row[k].key) : '';
        if (v) out.push(v);
        else if (ok) out.push((k === 'thumb' ? `thumbs/${id}.webp` : `posters/${id}.webp`));
      };
      if (kind === 'both') {
        addKey('thumb');
        addKey('poster');
      } else {
        addKey(kind);
      }
    }
    keysToDelete = Array.from(new Set(out));
    if (limit) keysToDelete = keysToDelete.slice(0, limit);
  } else {
    throw new Error('Invalid mode. Use prefix | keys | movie_ids');
  }

  console.log(
    'Repo delete mode=',
    mode,
    'target=',
    deleteOnAssetsRepo ? `remote:${ghRepo}` : 'local:public/',
    'kind=',
    kind,
    'dry_run=',
    dryRun,
    'limit=',
    limit || 'no'
  );
  console.log('Keys matched:', keysToDelete.length);
  if (keysToDelete.length) {
    console.log('Sample:', keysToDelete.slice(0, 10));
  }

  let deleted = 0;
  let errors = 0;

  if (!dryRun) {
    if (deleteOnAssetsRepo) {
      for (const key of keysToDelete) {
        const ghPath = mode === 'prefix' ? key : toGithubContentPath(key);
        if (!ghPath) {
          errors++;
          continue;
        }
        try {
          const r = await githubDeleteFile(ghRepo, ghPath, ghBranch, ghToken, `delete ${ghPath}`);
          if (r.deleted) deleted++;
        } catch {
          errors++;
        }
      }
    } else {
      for (const key of keysToDelete) {
        const abs = keyToAbsolutePath(key);
        if (!abs) {
          errors++;
          continue;
        }
        try {
          if (fs.existsSync(abs)) {
            await fs.remove(abs);
            deleted++;
          }
        } catch {
          errors++;
        }
      }
    }
  }

  if (dryRun) {
    console.log('Dry run: no files were deleted.');
    return;
  }

  if (mode === 'movie_ids') {
    const ids = parseList(args.movie_ids);
    for (const id of ids) markDeletedInState(state, id, kind);
    fs.ensureDirSync(path.dirname(statePath));
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log('State updated:', statePath);
  }

  console.log('Deleted files:', deleted, 'errors:', errors);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
