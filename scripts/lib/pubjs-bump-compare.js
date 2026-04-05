/**
 * So sánh nội dung pubjs để bump (refresh ref) — ổn định trước thứ tự key / thứ tự phần tử mảng lồng nhau.
 */

/**
 * Chuẩn hoá đệ quy: sort key object; mảng primitive sort; mảng object sort theo JSON.stringify phần tử đã chuẩn hoá.
 * @param {unknown} value
 * @returns {unknown}
 */
function stableDeepForBump(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const mapped = value.map((x) => stableDeepForBump(x));
    if (!mapped.length) return mapped;
    const prim = mapped.every(
      (x) => x === null || ['string', 'number', 'boolean'].includes(typeof x)
    );
    if (prim) {
      return [...mapped].sort((a, b) => String(a).localeCompare(String(b)));
    }
    try {
      return [...mapped].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    } catch {
      return mapped;
    }
  }
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = stableDeepForBump(value[k]);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} merged
 * @returns {string}
 */
export function canonicalPubjsJsonForBump(merged) {
  if (!merged || typeof merged !== 'object') return '';
  try {
    const o = stableDeepForBump(merged);
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      delete o.pubjs_url;
      delete o.thumb;
      delete o.poster;
    }
    return JSON.stringify(o);
  } catch {
    return '';
  }
}

/**
 * @param {Record<string, unknown>} merged
 * @param {string} prevRaw utf-8 file cũ
 * @returns {boolean} true nếu payload logic giống
 */
export function isPubjsCanonicalUnchanged(merged, prevRaw) {
  const next = canonicalPubjsJsonForBump(merged);
  if (!next) return false;
  try {
    const old = JSON.parse(prevRaw);
    return canonicalPubjsJsonForBump(old) === next;
  } catch {
    return false;
  }
}
