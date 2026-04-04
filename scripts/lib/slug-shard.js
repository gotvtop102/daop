/**
 * Thư mục con 2 ký tự đầu slug (a-z0-9), ký tự lạ → '_'
 */
export function getSlugShard2(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return '__';
  function ok(c) {
    return c && /[a-z0-9]/.test(c);
  }
  const a = s[0] || '_';
  const b = s[1] || '_';
  return (ok(a) ? a : '_') + (ok(b) ? b : '_');
}

/** Index theo id (Mongo…): 3 ký tự đầu a-z0-9, thiếu → '_' */
export function getIdShard3(id) {
  const s = String(id || '').trim().toLowerCase();
  if (!s) return '___';
  function ok(c) {
    return c && /[a-z0-9]/.test(c);
  }
  const a = s[0] || '_';
  const b = s[1] || '_';
  const c = s[2] || '_';
  return (ok(a) ? a : '_') + (ok(b) ? b : '_') + (ok(c) ? c : '_');
}
