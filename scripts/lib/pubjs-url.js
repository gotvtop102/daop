/**
 * Pubjs (JSON phim trên repo ngoài pjs102): base, path, URL jsDelivr.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveJsDelivrRef, commitShasEquivalent, normalizeCommitSha } from './jsdelivr-ref.js';
import { buildJsDelivrFileUrl, stripTrailingSlash } from './repo-images.js';
import { getSlugShard2 } from './slug-shard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

export function getPubjsOutputDir() {
  const raw = String(process.env.PUBJS_OUTPUT_DIR || '').trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  return path.join(ROOT, 'pubjs-output');
}

/**
 * Base jsDelivr cho pubjs (không gồm @ref).
 * Ưu tiên PUBJS_CDN_BASE; nếu trống và có PUBJS_REPO dạng owner/repo → https://cdn.jsdelivr.net/gh/owner/repo
 */
export function getPubjsCdnBase() {
  let raw = stripTrailingSlash(String(process.env.PUBJS_CDN_BASE || '').trim());
  if (raw.includes('@')) {
    const i = raw.indexOf('@');
    raw = stripTrailingSlash(raw.slice(0, i));
  }
  if (raw) return raw;
  const repo = String(process.env.PUBJS_REPO || '').trim().replace(/\.git$/i, '');
  const m = repo.match(/^([^/]+)\/([^/]+)$/);
  if (m) {
    return `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}`;
  }
  return '';
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

/** Tham số `_dataVer` giữ chỗ tương thích, không dùng — URL = `base@ref/path` (ref = commit hex hoặc main). */
export function buildPubjsFileUrl(slug, _dataVer, dataRef) {
  const base = getPubjsCdnBase();
  const ref = String(dataRef || getPubjsCdnRef()).trim() || 'main';
  const prefix = getPubjsPathPrefix();
  const shard = getSlugShard2(slug);
  const safe = String(slug || '').trim();
  if (!base || !safe) return '';
  const rel = prefix ? `${prefix}/${shard}/${safe}.json` : `${shard}/${safe}.json`;
  return buildJsDelivrFileUrl(base, ref, rel);
}

/**
 * URL pubjs trên disk đã trỏ đúng commit (so lỏng: ref 7/40 hex, path sau @ref).
 * Dùng refresh sau push để không ghi lại khi chạy CI trùng SHA.
 */
export function pubjsDataUrlMatchesCommit(url, slug, commitSha) {
  const want = buildPubjsFileUrl(slug, null, commitSha);
  const u = String(url || '').trim();
  const w = String(want || '').trim();
  if (!w) return false;
  if (u === w) return true;
  const d = normalizeCommitSha(commitSha);
  if (!d) return false;
  const iu = u.indexOf('@');
  const iw = w.indexOf('@');
  if (iu < 0 || iw < 0) return false;
  const restU = u.slice(iu + 1);
  const restW = w.slice(iw + 1);
  const slashU = restU.indexOf('/');
  const slashW = restW.indexOf('/');
  if (slashU < 0 || slashW < 0) return false;
  const refU = restU.slice(0, slashU);
  const pathU = restU.slice(slashU + 1);
  const pathW = restW.slice(slashW + 1);
  if (pathU !== pathW) return false;
  return commitShasEquivalent(refU, d);
}
