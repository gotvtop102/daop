/**
 * Định dạng gọn cho public/data/ver/*.json (mỗi slug):
 * - ref: một SHA khi pubjs JSON + ảnh cùng commit
 * - dataRef + imageRef: khi hai repo khác SHA (IMAGE_REPO_COMMIT ≠ PUBJS_REPO_COMMIT)
 * Không ghi thumbRef/posterRef trùng lặp (legacy vẫn đọc được).
 */

/**
 * @param {Record<string, unknown>} entry
 * @returns {string}
 */
export function extractDataShaFromVerEntry(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const d = entry.dataRef != null ? String(entry.dataRef).trim() : '';
  if (d) return d;
  const r = entry.ref != null ? String(entry.ref).trim() : '';
  if (r) return r;
  const t = entry.thumbRef != null ? String(entry.thumbRef).trim() : '';
  const p = entry.posterRef != null ? String(entry.posterRef).trim() : '';
  if (t && p && t === p) return t;
  return t || p || '';
}

/**
 * Gán ref cho ver entry; xoá field cũ thumbRef/posterRef/ref/dataRef/imageRef trước khi ghi mới.
 * @param {Record<string, unknown>} entry
 * @param {{ dataSha?: string, imageSha?: string }} opts
 */
export function applyVerEntryShas(entry, opts) {
  opts = opts || {};
  const d = String(opts.dataSha || '').trim();
  const iExplicit = opts.imageSha;
  const i =
    iExplicit != null && String(iExplicit).trim() !== ''
      ? String(iExplicit).trim()
      : d;
  delete entry.thumbRef;
  delete entry.posterRef;
  delete entry.ref;
  delete entry.dataRef;
  delete entry.imageRef;
  if (!d && !i) return;
  if (d && i && d === i) {
    entry.ref = d;
  } else {
    if (d) entry.dataRef = d;
    if (i) entry.imageRef = i;
  }
}
