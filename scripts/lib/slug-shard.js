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
