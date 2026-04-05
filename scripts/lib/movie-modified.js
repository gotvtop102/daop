/**
 * Thời điểm cập nhật thống nhất (OPhim API, pubjs, ver, Supabase):
 * OPhim: `modified: { time: "..." }` hoặc chuỗi; fallback `updated_at` / `updatedAt` / `createdAt`.
 */

/**
 * @param {Record<string, unknown> | null | undefined} m
 * @returns {string}
 */
export function extractMovieModifiedCanonical(m) {
  if (!m || typeof m !== 'object') return '';
  if (m.modified && typeof m.modified === 'object' && m.modified.time != null) {
    const t = m.modified.time;
    return String(t).trim();
  }
  if (m.modified != null && typeof m.modified !== 'object') {
    const s = String(m.modified).trim();
    if (s) return s;
  }
  const u = m.updated_at != null ? String(m.updated_at).trim() : '';
  if (u) return u;
  const ua = m.updatedAt != null ? String(m.updatedAt).trim() : '';
  if (ua) return ua;
  if (m.createdAt != null && String(m.createdAt).trim()) return String(m.createdAt).trim();
  if (m.created_at != null && String(m.created_at).trim()) return String(m.created_at).trim();
  return '';
}
