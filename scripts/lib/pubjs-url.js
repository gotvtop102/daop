/**
 * Pubjs (JSON phim trên repo ngoài pjs102): base, path, URL jsDelivr.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveJsDelivrRef } from './jsdelivr-ref.js';
import { buildJsDelivrFileUrl, stripTrailingSlash } from './repo-images.js';
import { getSlugShard2 } from './slug-shard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

export function getPubjsOutputDir() {
  const raw = String(process.env.PUBJS_OUTPUT_DIR || '').trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  return path.join(ROOT, 'pubjs-output');
}

export function getPubjsCdnBase() {
  let raw = stripTrailingSlash(String(process.env.PUBJS_CDN_BASE || '').trim());
  if (raw.includes('@')) {
    const i = raw.indexOf('@');
    raw = stripTrailingSlash(raw.slice(0, i));
  }
  return raw;
}

export function getPubjsCdnRef() {
  return resolveJsDelivrRef({
    explicitVar: 'PUBJS_CDN_REF',
    repoCommitVar: 'PUBJS_REPO_COMMIT',
  });
}

export function getPubjsPathPrefix() {
  return String(process.env.PUBJS_PATH_PREFIX || 'pubjs').replace(/^\/+|\/+$/g, '');
}

/** @param {string} dataRef jsDelivr @ref (commit, main, tag) */
export function buildPubjsFileUrl(slug, dataVer, dataRef) {
  const base = getPubjsCdnBase();
  const ref = String(dataRef || getPubjsCdnRef()).trim() || 'main';
  const prefix = getPubjsPathPrefix();
  const shard = getSlugShard2(slug);
  const safe = String(slug || '').trim();
  if (!base || !safe) return '';
  const rel = prefix ? `${prefix}/${shard}/${safe}.json` : `${shard}/${safe}.json`;
  let u = buildJsDelivrFileUrl(base, ref, rel);
  if (dataVer && u) u += (u.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(dataVer));
  return u;
}
