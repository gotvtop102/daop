/**
 * So sánh nội dung pubjs để quyết định bump (refresh ref) — tránh mỗi lần build
 * coi là đổi vì JSON.stringify khác thứ tự key / thứ tự mảng tập.
 */

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sortKeysDeep(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((x) => sortKeysDeep(x));
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = sortKeysDeep(value[k]);
  }
  return out;
}

/**
 * Bỏ URL do build gắn (luôn tái tạo từ slug + env); chuẩn hoá episodes để so ổn định.
 * @param {Record<string, unknown>} merged
 * @returns {string}
 */
export function canonicalPubjsJsonForBump(merged) {
  if (!merged || typeof merged !== 'object') return '';
  try {
    const o = sortKeysDeep(merged);
    delete o.pubjs_url;
    delete o.thumb;
    delete o.poster;
    if (Array.isArray(o.episodes)) {
      o.episodes = o.episodes
        .map((g) => {
          if (!g || typeof g !== 'object') return g;
          const grp = sortKeysDeep(g);
          if (Array.isArray(grp.server_data)) {
            grp.server_data = [...grp.server_data]
              .map((x) => sortKeysDeep(x))
              .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
          }
          return grp;
        })
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return JSON.stringify(o);
  } catch {
    return '';
  }
}

/**
 * @param {Record<string, unknown>} merged
 * @param {string} prevRaw utf-8 file cũ
 * @returns {boolean} true nếu payload logic giống (bỏ qua thumb/poster/pubjs_url + chuẩn hoá tập)
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
