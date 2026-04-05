/**
 * Ref jsDelivr (@ref): ưu tiên commit hash khi có, không thì "main".
 * Repo ảnh / JSON tách khỏi repo site: đặt IMAGE_REPO_COMMIT / PUBJS_REPO_COMMIT sau khi push lên đúng repo.
 */
import { execSync } from 'node:child_process';

const SHA_RE = /^[0-9a-f]{7,40}$/i;

export function normalizeCommitSha(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!SHA_RE.test(s)) return '';
  return s.toLowerCase();
}

/** Hai SHA (7 vs 40 ký tự, cùng commit) coi là trùng — dùng khi so ver vs URL jsDelivr. */
export function commitShasEquivalent(a, b) {
  const na = normalizeCommitSha(a);
  const nb = normalizeCommitSha(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length < 7) return false;
  return longer.startsWith(shorter);
}

/**
 * @param {{ explicitVar?: string, repoCommitVar?: string, fallback?: string }} opts
 * - explicitVar: nếu env có giá trị (vd. main, tag, hash) → dùng luôn (ghi đè).
 * - repoCommitVar: commit đúng repo đích (pjs102 / goimg102).
 * - Sau đó: CDN_JS_DELIVR_COMMIT, GITHUB_SHA, CF_PAGES_*, v.v. rồi git HEAD.
 */
export function resolveJsDelivrRef(opts = {}) {
  const { explicitVar, repoCommitVar, fallback = 'main' } = opts;

  if (explicitVar) {
    const ex = String(process.env[explicitVar] ?? '').trim();
    if (ex) return ex;
  }

  if (repoCommitVar) {
    const r = normalizeCommitSha(process.env[repoCommitVar]);
    if (r) return r;
  }

  const sharedKeys = [
    'CDN_JS_DELIVR_COMMIT',
    'GITHUB_SHA',
    'CF_PAGES_COMMIT_SHA',
    'VERCEL_GIT_COMMIT_SHA',
    'CI_COMMIT_SHA',
    'COMMIT_REF',
    'CIRCLE_SHA1',
  ];
  for (const k of sharedKeys) {
    const r = normalizeCommitSha(process.env[k]);
    if (r) return r;
  }

  try {
    const out = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 128,
    }).trim();
    const r = normalizeCommitSha(out);
    if (r) return r;
  } catch {
    /* not a git checkout */
  }

  return String(fallback || 'main').trim() || 'main';
}
